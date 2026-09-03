import { NextResponse, type NextRequest } from "next/server";
import { requireOrgContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toErrorResponse, notFound, validation } from "@/lib/errors";
import { presignGet } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

/**
 * Redireciona para uma URL pré-assinada da mídia no R2.
 * variant: "thumb" | "preview" | "original"
 * Protegido: só membros da organização dona da mídia.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variant: string }> },
) {
  try {
    const { id, variant } = await params;
    const { org } = await requireOrgContext();

    const asset = await prisma.mediaAsset.findFirst({
      where: { id, organizationId: org.id },
    });
    if (!asset) throw notFound("Mídia não encontrada");

    let key: string | null;
    switch (variant) {
      case "thumb":
        key = asset.thumbnailKey ?? asset.processedStorageKey ?? asset.storageKey;
        break;
      case "preview":
        key = asset.processedStorageKey ?? asset.storageKey;
        break;
      case "original":
        key = asset.storageKey;
        break;
      default:
        throw validation("variante inválida");
    }
    if (!key) throw notFound("Arquivo indisponível");

    const url = await presignGet(key, 900);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
