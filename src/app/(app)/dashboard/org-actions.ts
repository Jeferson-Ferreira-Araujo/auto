"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, ACTIVE_ORG_COOKIE } from "@/lib/auth";
import { actionError, actionOk, conflict, type ActionResult } from "@/lib/errors";
import { createOrganizationSchema } from "@/lib/validation/schemas";
import { slugify } from "@/lib/utils";

export async function createOrganization(
  raw: z.input<typeof createOrganizationSchema>,
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const user = await requireUser();
    const input = createOrganizationSchema.parse(raw);

    const existing = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
    if (existing) return actionOk({ organizationId: existing.organizationId });

    let slug = slugify(input.name) || "empresa";
    if (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const org = await prisma.organization.create({
      data: {
        name: input.name,
        slug,
        timezone: input.timezone,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    const jar = await cookies();
    jar.set(ACTIVE_ORG_COOKIE, org.id, { path: "/", httpOnly: false, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });

    return actionOk({ organizationId: org.id });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return actionError(conflict("Já existe uma empresa com esse nome."));
    return actionError(err);
  }
}
