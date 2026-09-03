import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ulid } from "ulid";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);

export type VideoProbe = {
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
};

/**
 * Lê os metadados de um vídeo com ffprobe (binário estático, leve — apenas leitura,
 * nenhum transcode). Recebe os bytes já baixados do R2.
 */
export async function probeVideo(bytes: Buffer): Promise<VideoProbe> {
  const path = join(tmpdir(), `probe-${ulid()}.tmp`);
  await writeFile(path, bytes);
  try {
    const { stdout } = await execFileAsync(ffprobeStatic.path, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      path,
    ]);
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
    };
    const video = parsed.streams?.find((s) => s.codec_type === "video");
    const audio = parsed.streams?.find((s) => s.codec_type === "audio");
    return {
      durationSec: Number(parsed.format?.duration ?? 0),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      container: parsed.format?.format_name ?? null,
    };
  } finally {
    await unlink(path).catch(() => {});
  }
}
