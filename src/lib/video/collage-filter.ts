import type { CollageSlot } from "../collage/layouts";

/**
 * Monta os argumentos do FFmpeg para uma montagem em grade (foto e/ou vídeo misturados) —
 * usado só quando pelo menos um espaço é vídeo (grade só de fotos usa `sharp`, mais leve, ver
 * `collage-actions.ts`). Função PURA (sem I/O, sem Prisma, sem alias `@/`) — usada pelo worker
 * do GitHub Actions.
 *
 * Cada espaço vira uma "tile" cortada (fit cover) do tamanho exato do slot; fotos ficam paradas
 * pela duração toda (`-loop 1`), vídeos mais curtos que o alvo repetem (`-stream_loop -1`) e o
 * resultado final é cortado em `targetDurationSec`. Sem áudio (mistura de fontes não tem como
 * sincronizar sem escolhas arbitrárias — mesma decisão do "Juntar vídeos").
 */

export type CollageInput = { path: string; kind: "IMAGE" | "VIDEO" };

const CANVAS_SIZE = 1080;
const FPS = 30;
const GAP = 10;

export function buildCollageArgs(
  inputs: CollageInput[],
  slots: CollageSlot[],
  targetDurationSec: number,
  outputPath: string,
): string[] {
  const args: string[] = ["-y"];
  for (const inp of inputs) {
    if (inp.kind === "IMAGE") {
      args.push("-loop", "1", "-t", String(targetDurationSec), "-i", inp.path);
    } else {
      args.push("-stream_loop", "-1", "-i", inp.path);
    }
  }

  const tileChains: string[] = [];
  const overlays: string[] = [];
  let prev = "bg0";
  tileChains.push(`color=c=white:s=${CANVAS_SIZE}x${CANVAS_SIZE}:r=${FPS}:d=${targetDurationSec}[bg0];`);

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const w = Math.max(2, Math.round(s.w * CANVAS_SIZE) - GAP);
    const h = Math.max(2, Math.round(s.h * CANVAS_SIZE) - GAP);
    const x = Math.round(s.x * CANVAS_SIZE) + Math.round(GAP / 2);
    const y = Math.round(s.y * CANVAS_SIZE) + Math.round(GAP / 2);

    tileChains.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
        `setsar=1,fps=${FPS},format=yuv420p[tile${i}];`,
    );

    const out = i === slots.length - 1 ? "outv" : `bg${i + 1}`;
    overlays.push(`[${prev}][tile${i}]overlay=x=${x}:y=${y}${i === slots.length - 1 ? ":shortest=1" : ""}[${out}];`);
    prev = out;
  }

  const filter = tileChains.join("") + overlays.join("");

  args.push(
    "-filter_complex",
    filter.replace(/;$/, ""),
    "-map",
    "[outv]",
    "-an",
    "-r",
    String(FPS),
    "-t",
    String(targetDurationSec),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-movflags",
    "+faststart",
    outputPath,
  );
  return args;
}
