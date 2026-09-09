/**
 * Monta os argumentos do FFmpeg para JUNTAR vários vídeos num único MP4 9:16 (Reels), SEM ÁUDIO,
 * com uma TRANSIÇÃO DE FADE entre cada clipe (sem cortes secos).
 * Função PURA (sem I/O, sem Prisma, sem alias `@/`) — usada pelo worker do GitHub Actions.
 *
 * Cada clipe é normalizado para 1080x1920: o conteúdo cabe inteiro (scale=decrease) sobre um
 * fundo da própria imagem ampliada e desfocada. Em seguida os clipes são encadeados com o filtro
 * `xfade` (crossfade), que sobrepõe o fim de um clipe ao começo do próximo.
 */

const TARGET_W = 1080;
const TARGET_H = 1920;
const FPS = 30;

/** Duração (em segundos) da transição entre clipes. Clampada a metade do menor clipe. */
const XFADE_MAX = 0.5;
const XFADE_MIN = 0.1;

/**
 * `inputPaths` e `durations` na ORDEM final (mesmo tamanho, ao menos 2 itens).
 * `durations[i]` = duração do clipe i em segundos (do ffprobe). Retorna os argumentos que vão
 * DEPOIS do binário `ffmpeg`.
 */
export function buildMergeArgs(inputPaths: string[], durations: number[], outputPath: string): string[] {
  const n = inputPaths.length;
  const chains: string[] = [];

  for (let i = 0; i < n; i++) {
    chains.push(
      `[${i}:v]split=2[bg${i}][fg${i}];` +
        `[bg${i}]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
        `crop=${TARGET_W}:${TARGET_H},gblur=sigma=24,eq=brightness=-0.12[bgb${i}];` +
        `[fg${i}]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease[fgs${i}];` +
        `[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${FPS},format=yuv420p,` +
        `setpts=PTS-STARTPTS,settb=AVTB[v${i}];`,
    );
  }

  const filter = chains.join("");
  const args: string[] = ["-y"];
  for (const p of inputPaths) args.push("-i", p);

  if (n === 1) {
    args.push(
      "-filter_complex",
      `${filter}[v0]copy[outv]`,
      ...outputArgs(outputPath),
    );
    return args;
  }

  // Transição: no máximo XFADE_MAX, mas nunca mais que metade do menor clipe.
  const minDur = Math.max(0, Math.min(...durations));
  const d = Math.max(XFADE_MIN, Math.min(XFADE_MAX, minDur / 2));

  // Encadeia os xfades: accum = clipe 0; para cada próximo clipe, cruza no fim do acumulado.
  let label = "v0";
  let accum = durations[0];
  const xchains: string[] = [];
  for (let i = 1; i < n; i++) {
    const out = i === n - 1 ? "outv" : `x${i}`;
    const offset = (accum - d).toFixed(3);
    xchains.push(`[${label}][v${i}]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${offset}[${out}];`);
    accum = accum + durations[i] - d;
    label = out;
  }

  args.push(
    "-filter_complex",
    filter + xchains.join("").replace(/;$/, ""),
    ...outputArgs(outputPath),
  );
  return args;
}

function outputArgs(outputPath: string): string[] {
  return [
    "-map",
    "[outv]",
    "-an",
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
    outputPath,
  ];
}
