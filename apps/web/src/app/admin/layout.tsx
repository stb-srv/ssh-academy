import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePlatformAdmin();
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <nav aria-label="Administration" className="flex gap-2 text-sm">
        <Link href="/admin" className="rounded-md px-3 py-2 hover:bg-border/40">
          Nutzer
        </Link>
        <Link href="/admin/pocket-id" className="rounded-md px-3 py-2 hover:bg-border/40">
          Pocket ID
        </Link>
      </nav>
      {children}
    </div>
  );
}
