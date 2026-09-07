"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { conflict, validation } from "@/lib/errors";
import { generateLinkCode, toE164, LINK_CODE_TTL_MS } from "@/lib/whatsapp/link";

export const linkWhatsApp = orgAction(
  z.object({ phone: z.string().min(6).max(20) }),
  async (input, { org, user }) => {
    const phoneE164 = toE164(input.phone);
    if (!phoneE164) throw validation("Número inválido. Informe com DDD, ex.: (11) 99999-8888.");

    const existing = await prisma.whatsAppContact.findUnique({ where: { phoneE164 } });
    if (existing && existing.organizationId !== org.id) {
      throw conflict("Este número já está vinculado a outra empresa.");
    }

    const code = generateLinkCode();
    const verificationExpiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    // Um contato por organização (MVP): remove qualquer vínculo anterior desta org.
    await prisma.whatsAppContact.deleteMany({
      where: { organizationId: org.id, phoneE164: { not: phoneE164 } },
    });

    await prisma.whatsAppContact.upsert({
      where: { phoneE164 },
      create: {
        phoneE164,
        userId: user.id,
        organizationId: org.id,
        verificationCode: code,
        verificationExpiresAt,
      },
      update: {
        userId: user.id,
        organizationId: org.id,
        verifiedAt: null,
        verificationCode: code,
        verificationExpiresAt,
      },
    });

    revalidatePath("/configuracoes");
    return { phoneE164, code, expiresAt: verificationExpiresAt.toISOString() };
  },
);

export const regenerateWhatsAppCode = orgAction(z.object({}), async (_input, { org }) => {
  const contact = await prisma.whatsAppContact.findFirst({ where: { organizationId: org.id } });
  if (!contact) throw validation("Nenhum número em processo de vínculo.");
  const code = generateLinkCode();
  await prisma.whatsAppContact.update({
    where: { id: contact.id },
    data: {
      verificationCode: code,
      verificationExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      verifiedAt: null,
    },
  });
  revalidatePath("/configuracoes");
  return { code };
});

export const unlinkWhatsApp = orgAction(z.object({}), async (_input, { org }) => {
  await prisma.whatsAppContact.deleteMany({ where: { organizationId: org.id } });
  revalidatePath("/configuracoes");
  return { unlinked: true };
});
