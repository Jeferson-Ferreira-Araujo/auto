/**
 * Monta os argumentos do FFmpeg para CONCATENAR vários vídeos num único MP4 9:16 (Reels), SEM ÁUDIO.
 * Função PURA (sem I/O, sem Prisma, sem alias `@/`) — usada pelo worker do GitHub Actions.
 *
 * Cada clipe é normalizado para 1080x1920: o conteúdo cabe inteiro (scale=decrease) sobre um
 * fundo da própria imagem ampliada e desfocada, então tudo é concatenado (concat filter, que
 * reencoda e tolera clipes com resoluções/fps/codecs diferentes).
 */

const TARGET_W = 1080;
const TARGET_H = 1920;
const FPS = 30;

/** `inputPaths` na ORDEM final. Retorna os argumentos que vão DEPOIS do binário `ffmpeg`. */
export function buildMergeArgs(inputPaths: string[], outputPath: string): string[] {
  const n = inputPaths.length;
  const chains: string[] = [];

  for (let i = 0; i < n; i++) {
    chains.push(
      `[${i}:v]split=2[bg${i}][fg${i}];` +
        `[bg${i}]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,` +
        `crop=${TARGET_W}:${TARGET_H},gblur=sigma=24,eq=brightness=-0.12[bgb${i}];` +
        `[fg${i}]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease[fgs${i}];` +
        `[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${FPS},format=yuv420p[v${i}];`,
    );
  }

  const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  chains.push(`${concatInputs}concat=n=${n}:v=1:a=0[outv]`);

  const args: string[] = ["-y"];
  for (const p of inputPaths) args.push("-i", p);

  args.push(
    "-filter_complex",
    chains.join(""),
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
  );
  return args;
}
