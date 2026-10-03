import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { TOOLS } from "@/lib/tools";

export const metadata: Metadata = { title: "Werkzeuge" };

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Werkzeuge</h1>
        <p className="text-muted">
          Kleine Helfer für den Alltag mit SSH. Alle laufen komplett in deinem Browser und funktionieren ohne Anmeldung.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.slug} href={`/werkzeuge/${t.slug}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <p aria-hidden className="text-2xl">
                {t.icon}
              </p>
              <h2 className="mt-2 font-semibold">{t.title}</h2>
              <p className="mt-1 text-sm text-muted">{t.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
