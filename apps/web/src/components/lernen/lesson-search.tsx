"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type Item = { href: string; title: string; module: string };

export function LessonSearch({ lessons }: { lessons: Item[] }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return lessons.filter((l) => `${l.title} ${l.module}`.toLowerCase().includes(term)).slice(0, 8);
  }, [q, lessons]);

  return (
    <div className="relative">
      <label htmlFor="lesson-search" className="sr-only">
        Lektionen durchsuchen
      </label>
      <input
        id="lesson-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Lektion suchen, z. B. sudo, Passphrase, Windows …"
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
      />
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {hits.map((h) => (
            <li key={h.href}>
              <Link href={h.href} className="block px-4 py-2 text-sm hover:bg-border/40">
                {h.title} <span className="text-muted">· {h.module}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
