import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossar";

export const metadata: Metadata = { title: "Glossar" };

export default function GlossaryPage() {
  const letters = [...new Set(GLOSSARY.map((e) => e.term[0]!.toUpperCase().replace(/[^A-Z]/, "#")))];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Glossar</h1>
        <p className="text-muted">Die wichtigsten Begriffe rund um SSH, kurz erklärt.</p>
        <nav aria-label="Buchstaben" className="flex flex-wrap gap-1 pt-2 font-mono text-sm">
          {letters.map((l) => (
            <a key={l} href={`#buchstabe-${l}`} className="rounded px-2 py-0.5 hover:bg-border/40">
              {l}
            </a>
          ))}
        </nav>
      </header>
      <dl className="space-y-5">
        {GLOSSARY.map((e, i) => {
          const letter = e.term[0]!.toUpperCase().replace(/[^A-Z]/, "#");
          const first = i === 0 || GLOSSARY[i - 1]!.term[0]!.toUpperCase().replace(/[^A-Z]/, "#") !== letter;
          return (
            <div key={e.id} id={e.id} className="scroll-mt-20">
              {first && <span id={`buchstabe-${letter}`} className="block scroll-mt-20" />}
              <dt className="font-semibold">
                <a href={`#${e.id}`} className="hover:underline">
                  {e.term}
                </a>
              </dt>
              <dd className="mt-1 text-sm text-muted">
                {e.text}
                {e.lesson && (
                  <>
                    {" "}
                    <Link href={e.lesson} className="text-primary hover:underline">
                      Zur Lektion
                    </Link>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
