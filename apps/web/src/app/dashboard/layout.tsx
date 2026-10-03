import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

const NAV = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/keys", label: "SSH-Keys" },
  { href: "/dashboard/server", label: "Server" },
  { href: "/dashboard/zertifikate", label: "Zertifikate" },
  { href: "/dashboard/befehle", label: "Mehrfach-Befehl" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/aktivitaet", label: "Aktivität" },
  { href: "/dashboard/api-tokens", label: "API-Tokens" },
  { href: "/dashboard/sicherheit", label: "Sicherheit" },
];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await requireSession();
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-4">
        <div className="text-sm">
          <p className="font-medium">{session.user.name}</p>
          <p className="truncate text-muted">{session.user.email}</p>
        </div>
        <nav aria-label="Dashboard" className="flex flex-row flex-wrap gap-1 md:flex-col">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm hover:bg-border/40">
              {item.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
