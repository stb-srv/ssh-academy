import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { COURSE } from "@/lib/course";

export const metadata: Metadata = { title: "Lernen" };

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Lernpfad</h1>
        <p className="text-muted">Acht Module, jede Lektion dauert 5 bis 10 Minuten.</p>
      </header>
      <Alert>Die Lektionen werden gerade geschrieben und erscheinen hier nach und nach.</Alert>
      {COURSE.map((m, i) => (
        <Card key={m.slug} id={m.slug} className="scroll-mt-20">
          <p className="font-mono text-xs text-primary">Modul {i + 1}</p>
          <h2 className="mt-1 text-xl font-semibold">{m.title}</h2>
          <p className="mt-1 text-sm text-muted">{m.summary}</p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
            {m.lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}
