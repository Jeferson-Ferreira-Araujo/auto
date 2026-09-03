import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, toErrorResponse } from "@/lib/errors";
import { presignSchema } from "@/lib/validation/schemas";
import { buildKey, extFromMime, presignPut } from "@/lib/storage/r2";
import { IMAGE } from "@/lib/media/constraints";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { org } = await requireOrgContext();
    const input = presignSchema.parse(await req.json());

    // Limite de quantidade de mídias por organização.
    const count = await prisma.mediaAsset.count({ where: { organizationId: org.id } });
    if (count >= org.mediaLimit) {
      throw new AppError("RATE_LIMITED", `Limite de ${org.mediaLimit} mídias atingido para esta empresa.`);
    }

    const isImage = IMAGE.acceptedUploadMimes.includes(input.mimeType as (typeof IMAGE.acceptedUploadMimes)[number]);
    const maxBytes = org.uploadLimitMb * 1024 * 1024;
    if (input.fileSize > maxBytes) {
      throw new AppError("VALIDATION", `Arquivo acima do limite de ${org.uploadLimitMb} MB.`);
    }

    const key = buildKey(org.id, "media", extFromMime(input.mimeType));
    const url = await presignPut(key, input.mimeType, 600);

    return NextResponse.json({
      uploadUrl: url,
      storageKey: key,
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      kind: isImage ? "IMAGE" : "VIDEO",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
