import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TerminalView } from "@/components/server/terminal-view";
import { connectableKeys, getServerAccess, mayConnectAs } from "@/lib/access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Terminal" };

export default async function TerminalPage({ params }: PageProps<"/dashboard/server/[id]/terminal">) {
  const { id } = await params;
  const session = await requireSession();
  const access = await getServerAccess(session.user.id, id);
  if (!access) notFound();
  if (!access.canConnect || !access.server.hostKeyConfirmedAt) redirect(`/dashboard/server/${id}`);
  const keys = (await connectableKeys(session.user.id, id)).filter((k) => mayConnectAs(access, k.linuxUser));
  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted">
        <Link href="/dashboard/server" className="hover:underline">
          Server
        </Link>{" "}
        /{" "}
        <Link href={`/dashboard/server/${id}`} className="hover:underline">
          {access.server.name}
        </Link>{" "}
        / Terminal
      </nav>
      <TerminalView
        serverId={id}
        options={keys.map((k) => ({ value: `${k.key.id}:${k.linuxUser}`, label: `${k.linuxUser} mit Key „${k.key.name}“`, linuxUser: k.linuxUser, keyId: k.key.id }))}
        passwordUsers={access.linuxUsers}
      />
    </div>
  );
}
