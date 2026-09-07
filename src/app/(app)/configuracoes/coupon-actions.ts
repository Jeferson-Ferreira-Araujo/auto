"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";
import { conflict, notFound, validation } from "@/lib/errors";

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9._-]{3,24}$/, "Código: 3 a 24 caracteres (letras, números, . _ -)");

const couponInput = z
  .object({
    code: codeSchema,
    description: z.string().trim().max(120).nullish(),
    kind: z.enum(["PERCENT", "AMOUNT"]),
    value: z.number().int().positive(),
    minOrderReais: z.number().nonnegative().max(100000).nullish(),
    expiresOn: z.string().trim().nullish(), // yyyy-mm-dd
  })
  .refine((v) => (v.kind === "PERCENT" ? v.value >= 1 && v.value <= 100 : v.value >= 1), {
    message: "Percentual entre 1 e 100 (ou valor em reais maior que zero).",
    path: ["value"],
  });

function expiresAtFrom(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T23:59:59.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const createCoupon = orgAction(couponInput, async (input, { org, user }) => {
  const exists = await prisma.coupon.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: input.code } },
  });
  if (exists) throw conflict("Já existe um cupom com esse código.");

  const value =
    input.kind === "AMOUNT" ? Math.round(input.value * 100) : input.value; // AMOUNT em centavos
  await prisma.coupon.create({
    data: {
      organizationId: org.id,
      createdById: user.id,
      code: input.code,
      description: input.description?.trim() || null,
      kind: input.kind,
      value,
      minOrderCents: input.minOrderReais ? Math.round(input.minOrderReais * 100) : null,
      expiresAt: expiresAtFrom(input.expiresOn),
    },
  });
  revalidatePath("/configuracoes");
  return { code: input.code };
});

export const toggleCoupon = orgAction(
  z.object({ id: z.string().min(1), active: z.boolean() }),
  async (input, { org }) => {
    const c = await prisma.coupon.findFirst({ where: { id: input.id, organizationId: org.id } });
    if (!c) throw notFound("Cupom não encontrado.");
    await prisma.coupon.update({ where: { id: c.id }, data: { active: input.active } });
    revalidatePath("/configuracoes");
    return { id: c.id, active: input.active };
  },
);

export const deleteCoupon = orgAction(z.object({ id: z.string().min(1) }), async (input, { org }) => {
  const c = await prisma.coupon.findFirst({ where: { id: input.id, organizationId: org.id } });
  if (!c) throw notFound("Cupom não encontrado.");
  if (c.timesSent > 0 || c.timesRedeemed > 0) {
    // preserva o histórico — só desativa
    await prisma.coupon.update({ where: { id: c.id }, data: { active: false } });
    throw validation("Este cupom já foi usado; foi apenas desativado, não apagado.");
  }
  await prisma.coupon.delete({ where: { id: c.id } });
  revalidatePath("/configuracoes");
  return { id: c.id };
});
