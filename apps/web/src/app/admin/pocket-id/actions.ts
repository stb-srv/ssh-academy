"use server";
import { eq, schema } from "@ssh-academy/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { POCKET_ID_PROVIDER } from "@/lib/env";
import { PLATFORM_ADMIN_ROLE, TEAM_ROLES } from "@/lib/permissions";
import { requirePlatformAdmin } from "@/lib/session";

const mappingSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("team"),
    externalGroup: z.string().trim().min(1, "Bitte eine Gruppe angeben.").max(200),
    organizationId: z.string().min(1, "Bitte ein Team wählen."),
    role: z.enum(TEAM_ROLES as [string, ...string[]]),
  }),
  z.object({
    target: z.literal("platform_admin"),
    externalGroup: z.string().trim().min(1, "Bitte eine Gruppe angeben.").max(200),
  }),
]);

export async function addMapping(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requirePlatformAdmin();
  const parsed = mappingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const data = parsed.data;

  const [row] = await db
    .insert(schema.idpGroupMapping)
    .values({
      providerId: POCKET_ID_PROVIDER,
      externalGroup: data.externalGroup,
      organizationId: data.target === "team" ? data.organizationId : null,
      role: data.target === "team" ? data.role : null,
      platformRole: data.target === "platform_admin" ? PLATFORM_ADMIN_ROLE : null,
    })
    .returning();

  await audit({
    action: "pocket_id.mapping_created",
    actorId: session.user.id,
    targetType: "idp_group_mapping",
    targetId: row?.id,
    metadata: data,
  });
  revalidatePath("/admin/pocket-id");
  return {};
}

export async function deleteMapping(formData: FormData) {
  const session = await requirePlatformAdmin();
  const id = z.uuid().parse(formData.get("id"));
  await db.delete(schema.idpGroupMapping).where(eq(schema.idpGroupMapping.id, id));
  await audit({ action: "pocket_id.mapping_deleted", actorId: session.user.id, targetType: "idp_group_mapping", targetId: id });
  revalidatePath("/admin/pocket-id");
}
