import Link from "next/link";
import { getSession } from "@/lib/session";
import { PLATFORM_ADMIN_ROLE } from "@/lib/permissions";
import { ButtonLink } from "./ui/button";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="rounded-md bg-terminal px-2 py-0.5 font-mono text-sm text-primary">
            ~$
          </span>
          SSH-Academy
        </Link>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/lernen" className="rounded-md px-2 py-1 hover:bg-border/40">
            Lernen
          </Link>
          <Link href="/werkzeuge" className="rounded-md px-2 py-1 hover:bg-border/40">
            Werkzeuge
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="rounded-md px-2 py-1 hover:bg-border/40">
                Dashboard
              </Link>
              {session.user.role === PLATFORM_ADMIN_ROLE && (
                <Link href="/admin" className="rounded-md px-2 py-1 hover:bg-border/40">
                  Admin
                </Link>
              )}
            </>
          ) : (
            <ButtonLink href="/anmelden" className="py-1.5">
              Anmelden
            </ButtonLink>
          )}
        </nav>
      </div>
    </header>
  );
}
