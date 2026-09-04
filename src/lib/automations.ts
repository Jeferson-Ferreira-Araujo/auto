import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { runGenerate } from "@/lib/scheduler/generate";

/**
 * Liga/desliga uma automação (compartilhado pela Server Action e pelo WhatsApp).
 * Ao desligar, limpa ocorrências futuras ainda não publicadas; ao ligar, regenera.
 */
export async function setAutomationActive(organizationId: string, automationId: string, isActive: boolean) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, organizationId } });
  if (!automation) throw notFound("Automação não encontrada");

  await prisma.automation.update({ where: { id: automation.id }, data: { isActive } });

  if (!isActive) {
    await prisma.scheduledPost.deleteMany({
      where: { automationId: automation.id, status: "SCHEDULED", scheduledAt: { gt: new Date() } },
    });
  } else {
    await runGenerate(new Date(), organizationId).catch(() => {});
  }
  return automation;
}

/** Acha uma automação pelo nome (parcial, sem acento). */
export async function findAutomationByName(organizationId: string, name: string) {
  const q = name.trim();
  if (!q) return null;
  return prisma.automation.findFirst({
    where: { organizationId, name: { contains: q, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
  });
}
