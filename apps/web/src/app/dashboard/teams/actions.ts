"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Der Name ist zu kurz.").max(80),
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "team"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createTeam(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireSession();
  const parsed = createTeamSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const org = await auth.api.createOrganization({
    body: { name: parsed.data.name, slug: slugify(parsed.data.name) },
    headers: await headers(),
  });
  if (org) {
    await audit({ action: "team.created", actorId: session.user.id, organizationId: org.id, targetType: "organization", targetId: org.id });
  }
  revalidatePath("/dashboard/teams");
  return {};
}
