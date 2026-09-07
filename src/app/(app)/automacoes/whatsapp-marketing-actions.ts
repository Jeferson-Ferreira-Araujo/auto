"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { orgAction } from "@/lib/safe-action";

export const setWhatsappOutreach = orgAction(
  z.object({ enabled: z.boolean() }),
  async (input, { org }) => {
    await prisma.organization.update({
      where: { id: org.id },
      data: { whatsappOutreachEnabled: input.enabled },
    });
    revalidatePath("/automacoes");
    return { enabled: input.enabled };
  },
);

export const setWhatsappPromoMessage = orgAction(
  z.object({ message: z.string().trim().max(900) }),
  async (input, { org }) => {
    await prisma.organization.update({
      where: { id: org.id },
      data: { whatsappPromoMessage: input.message.length ? input.message : null },
    });
    revalidatePath("/automacoes");
    return { set: input.message.length > 0 };
  },
);
