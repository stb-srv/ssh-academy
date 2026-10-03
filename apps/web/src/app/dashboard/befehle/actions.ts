"use server";
import { customCommand } from "@ssh-academy/ssh/ops";
import { z } from "zod";
import { getServerAccess } from "@/lib/access";
import { audit } from "@/lib/audit";
import { ActionError, requireStrongSession, runAction } from "@/lib/guard";
import { requestMeta } from "@/lib/request";
import { runOnServer } from "@/lib/server-ops";

const input = z.object({
  serverIds: z.array(z.uuid()).min(1, "Bitte mindestens einen Server wählen.").max(50, "Höchstens 50 Server auf einmal."),
  command: z.string().trim().min(1, "Bitte einen Befehl eingeben.").max(4000),
  asRoot: z.boolean(),
  sudoPassword: z.string().max(200).optional(),
});

export type CommandResult = { serverId: string; name: string; ok: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string };

const clip = (s: string) => (s.length > 20_000 ? s.slice(0, 20_000) + "\n[… gekürzt]" : s);

/** Führt einen Befehl auf mehreren Servern aus, jeweils mit deren Verwaltungs-Key */
export async function runCommandAction(raw: z.input<typeof input>) {
  return runAction(async () => {
    const session = await requireStrongSession();
    const data = input.parse(raw);
    const meta = await requestMeta();
    const op = customCommand(data.command, data.asRoot);

    const runOne = async (serverId: string): Promise<CommandResult> => {
      const access = await getServerAccess(session.user.id, serverId);
      if (!access?.canManage) return { serverId, name: access?.server.name ?? "?", ok: false, exitCode: null, stdout: "", stderr: "", error: "Keine Verwaltungsrechte." };
      const s = access.server;
      if (!s.hostKeyConfirmedAt) return { serverId, name: s.name, ok: false, exitCode: null, stdout: "", stderr: "", error: "Fingerprint noch nicht bestätigt." };
      if (!s.managementKeyId) return { serverId, name: s.name, ok: false, exitCode: null, stdout: "", stderr: "", error: "Kein Verwaltungs-Key hinterlegt." };
      const r = await runOnServer(s, { method: "key", username: s.defaultUser, keyId: s.managementKeyId }, op, { sudoPassword: data.asRoot ? data.sudoPassword || undefined : undefined });
      await audit({
        action: "command.run",
        actorId: session.user.id,
        organizationId: s.organizationId,
        targetType: "server",
        targetId: s.id,
        ...meta,
        metadata: { command: data.command.slice(0, 500), asRoot: data.asRoot, exitCode: r.ok ? r.exitCode : null, error: r.ok ? undefined : r.error },
      });
      if (!r.ok) return { serverId, name: s.name, ok: false, exitCode: r.exitCode ?? null, stdout: clip(r.stdout ?? ""), stderr: clip(r.stderr ?? ""), error: r.message };
      return { serverId, name: s.name, ok: r.exitCode === 0, exitCode: r.exitCode, stdout: clip(r.stdout), stderr: clip(r.stderr) };
    };

    // Höchstens 5 Server gleichzeitig
    const results: CommandResult[] = [];
    const queue = [...new Set(data.serverIds)];
    await Promise.all(
      Array.from({ length: Math.min(5, queue.length) }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) results.push(await runOne(id));
      }),
    );
    if (!results.length) throw new ActionError("Keine Server ausgewählt.");
    const order = new Map(data.serverIds.map((id, i) => [id, i]));
    results.sort((a, b) => (order.get(a.serverId) ?? 0) - (order.get(b.serverId) ?? 0));
    return { results };
  });
}
