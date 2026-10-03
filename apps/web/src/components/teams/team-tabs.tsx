"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function TeamTabs({ base, tabs }: { base: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Team" className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-primary font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
