import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppError, notFound, toErrorResponse, validation } from "@/lib/errors";
import { presignSchema } from "@/lib/validation/schemas";
import { buildKey, extFromMime, presignGet, presignPut } from "@/lib/storage/r2";
import { IMAGE } from "@/lib/media/constraints";

export const dynamic = "force-dynamic";

/**
 * GET  /api/media?id=<assetId>&variant=thumb|preview|original
 *   → redireciona para uma URL pré-assinada do R2 (bucket privado). Protegido por org.
 * POST /api/media  { fileName, mimeType, fileSize }
 *   → gera uma URL pré-assinada de upload (PUT direto no R2).
 *
 * (Consolidado numa rota só por causa do limite de 12 Serverless Functions no plano Hobby.)
 */
export async function GET(req: NextRequest) {
  try {
    const { org } = await requireOrgContext();
    const id = req.nextUrl.searchParams.get("id");
    const variant = req.nextUrl.searchParams.get("variant") ?? "thumb";
    if (!id) throw validation("id ausente");

    const asset = await prisma.mediaAsset.findFirst({ where: { id, organizationId: org.id } });
    if (!asset) throw notFound("Mídia não encontrada");

    let key: string | null;
    if (variant === "preview") key = asset.processedStorageKey ?? asset.storageKey;
    else if (variant === "original") key = asset.storageKey;
    else key = asset.thumbnailKey ?? asset.processedStorageKey ?? asset.storageKey;
    if (!key) throw notFound("Arquivo indisponível");

    return NextResponse.redirect(await presignGet(key, 900), { status: 302 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { org } = await requireOrgContext();
    const input = presignSchema.parse(await req.json());

    const count = await prisma.mediaAsset.count({ where: { organizationId: org.id } });
    if (count >= org.mediaLimit) {
      throw new AppError("RATE_LIMITED", `Limite de ${org.mediaLimit} mídias atingido para esta empresa.`);
    }
    if (input.fileSize > org.uploadLimitMb * 1024 * 1024) {
      throw validation(`Arquivo acima do limite de ${org.uploadLimitMb} MB.`);
    }

    const isImage = (IMAGE.acceptedUploadMimes as readonly string[]).includes(input.mimeType);
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
