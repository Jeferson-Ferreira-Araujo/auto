import type { PresetSpec, VideoProbe } from "./presets";

/**
 * Monta os argumentos do FFmpeg para gerar a versão "melhorada" de um vídeo (9:16, pronto p/ Reels).
 * Função PURA (sem I/O) — usada pelo worker do GitHub Actions.
 *
 * Retorna o array de argumentos que vai DEPOIS do binário `ffmpeg`.
 */
export type BuildOpts = {
  inputPath: string;
  outputPath: string;
  fontFile: string;
  titleText?: string | null;
  logoPath?: string | null;
};

const TARGET_W = 1080;
const TARGET_H = 1920;
const FPS = 30;

function esc(text: string): string {
  // escapes para drawtext
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ")
    .slice(0, 90);
}

export function buildFfmpegArgs(spec: PresetSpec, probe: VideoProbe, opts: BuildOpts): string[] {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const dur = Math.max(0.5, round(probe.durationSec - spec.trimSec * 2));
  const outDur = round(dur / spec.speed);
  const srcAspect = probe.height > 0 ? probe.width / probe.height : 0.5625;
  const usePad = srcAspect > 1.1; // fonte panorâmica → fundo desfocado em vez de cortar as laterais

  // ── velocidade (aplica no vídeo antes de tudo; áudio via atempo mais abaixo) ──
  const vspeed = spec.speed !== 1 ? `setpts=PTS/${spec.speed},` : "";

  // ── enquadramento 9:16 ──
  let frame: string;
  if (usePad) {
    frame =
      `[0:v]${vspeed}split=2[bg][fg];` +
      `[bg]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H},` +
      `gblur=sigma=24,eq=brightness=-0.12[bgb];` +
      `[fg]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease[fgs];` +
      `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1[framed];`;
  } else {
    frame = `[0:v]${vspeed}scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H},setsar=1[framed];`;
  }

  // ── zoom suave (zoompan: único filtro do ffmpeg com zoom por frame) ──
  const zRange = round(spec.zoomTo - spec.zoomFrom);
  const totalFrames = Math.max(2, Math.round(FPS * outDur));
  const zExpr = spec.zoomPulse
    ? `${spec.zoomFrom}+${zRange}*(0.5-0.5*cos(2*PI*on/${totalFrames}))`
    : `min(${spec.zoomFrom}+${zRange}*on/${totalFrames}\\,${spec.zoomTo})`;
  const zoom =
    `[framed]zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=1:s=${TARGET_W}x${TARGET_H}:fps=${FPS}[zoomed];`;

  // ── cor / vinheta ──
  const { saturation, contrast, brightness, gamma } = spec.eq;
  let color = `[zoomed]eq=saturation=${saturation}:contrast=${contrast}:brightness=${brightness}:gamma=${gamma}`;
  if (spec.vignette) color += `,vignette=PI/5`;
  color += `[colored];`;

  // ── fade in/out ──
  const f = spec.fadeSec;
  const fade =
    `[colored]fade=t=in:st=0:d=${f},fade=t=out:st=${round(Math.max(0, outDur - f))}:d=${f}[faded];`;

  const chains: string[] = [frame, zoom, color, fade];
  let vlabel = "faded";
  let extraInputs: string[] = [];
  let inputIdx = 1;

  // ── logo (canto inferior direito) ──
  if (opts.logoPath) {
    extraInputs = extraInputs.concat(["-i", opts.logoPath]);
    const logoIdx = inputIdx++;
    chains.push(
      `[${logoIdx}:v]scale=-1:120[logo];[${vlabel}][logo]overlay=W-w-48:H-h-64:format=auto[logoed];`,
    );
    vlabel = "logoed";
  }

  // ── título ──
  if (opts.titleText && opts.titleText.trim()) {
    const t = esc(opts.titleText.trim());
    const y =
      spec.title.position === "top"
        ? "120"
        : spec.title.position === "bottom"
          ? "h-text_h-200"
          : "(h-text_h)/2";
    const box = spec.title.box ? `:box=1:boxcolor=black@0.45:boxborderw=24` : `:shadowcolor=black@0.6:shadowx=2:shadowy=2`;
    chains.push(
      `[${vlabel}]drawtext=fontfile='${opts.fontFile}':text='${t}':fontsize=${spec.title.fontSize}:` +
        `fontcolor=white:x=(w-text_w)/2:y=${y}${box}[titled];`,
    );
    vlabel = "titled";
  }

  // ── áudio ──
  let aMap: string;
  if (probe.hasAudio) {
    const at = spec.speed !== 1 ? `atempo=${spec.speed},` : "";
    chains.push(`[0:a]${at}loudnorm=I=${spec.loudnessI}:TP=-1.5:LRA=11,aresample=44100[aout];`);
    aMap = "[aout]";
  } else {
    extraInputs = extraInputs.concat(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]);
    aMap = `${inputIdx}:a`;
  }

  const filterComplex = chains.join("");

  return [
    "-y",
    "-ss",
    spec.trimSec.toFixed(3),
    "-t",
    dur.toFixed(3),
    "-i",
    opts.inputPath,
    ...extraInputs,
    "-filter_complex",
    filterComplex.replace(/;$/, ""),
    "-map",
    `[${vlabel}]`,
    "-map",
    aMap,
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-t",
    String(outDur),
    opts.outputPath,
  ];
}

/** Argumentos para extrair a thumbnail (frame a ~1s). */
export function buildThumbArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-ss",
    "1",
    "-i",
    inputPath,
    "-vframes",
    "1",
    "-vf",
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H}`,
    "-q:v",
    "3",
    outputPath,
  ];
}
