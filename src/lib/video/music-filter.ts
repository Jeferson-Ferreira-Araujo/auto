/**
 * Argumentos de ffmpeg para embutir uma trilha sonora num vídeo.
 * A música é repetida em loop e cortada no tamanho do vídeo (`-shortest`).
 *
 *  - MIX: áudio original bem baixo (0.18) + música (1.0), misturados.
 *  - MUSIC_ONLY: descarta o áudio original, só a música.
 *  - Se o vídeo não tem áudio, os dois modos viram "só a música".
 */
export type MusicMode = "MIX" | "MUSIC_ONLY";

export function buildMusicArgs(opts: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  mode: MusicMode;
  videoHasAudio: boolean;
}): string[] {
  const loopedMusic = "[1:a]aloop=loop=-1:size=2147483647,asetpts=N/SR/TB";

  const filter =
    opts.mode === "MIX" && opts.videoHasAudio
      ? `[0:a]volume=0.18[orig];${loopedMusic},volume=1.0[music];` +
        `[orig][music]amix=inputs=2:duration=first:dropout_transition=0,dynaudnorm[aout]`
      : `${loopedMusic},volume=1.0[aout]`;

  return [
    "-y",
    "-i",
    opts.videoPath,
    "-i",
    opts.audioPath,
    "-filter_complex",
    filter,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    opts.outputPath,
  ];
}
