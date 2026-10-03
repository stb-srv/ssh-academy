import Link from "next/link";
import type { ReactNode } from "react";
import { findTool } from "@/lib/tools";

/** Gemeinsamer Rahmen für alle Werkzeug-Seiten */
export function ToolPage({ slug, children, intro }: { slug: string; intro: ReactNode; children: ReactNode }) {
  const tool = findTool(slug)!;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <nav aria-label="Brotkrumen" className="text-sm text-muted">
        <Link href="/werkzeuge" className="hover:underline">
          Werkzeuge
        </Link>{" "}
        / {tool.title}
      </nav>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          <span aria-hidden>{tool.icon}</span> {tool.title}
        </h1>
        <div className="text-muted">{intro}</div>
      </header>
      {children}
    </div>
  );
}
