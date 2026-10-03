import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COURSE } from "@/lib/course";

const FEATURES = [
  {
    title: "Verständlich erklärt",
    text: "Schritt für Schritt, ohne Fachchinesisch. Mit Befehlen für Windows, macOS und Linux zum Kopieren.",
  },
  {
    title: "Keys sicher verwalten",
    text: "Keys im Browser erzeugen, Fingerprints prüfen, auf Server verteilen und bei Bedarf überall entziehen.",
  },
  {
    title: "Server direkt im Browser",
    text: "Server hinzufügen, Host-Key bestätigen und per Web-Terminal verbinden. Inklusive Assistent für neue Benutzer.",
  },
  {
    title: "Gemeinsam im Team",
    text: "Teams, Rollen und Gruppen, Anmeldung mit Pocket ID und ein Audit-Log, das zeigt, wer wann wo war.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div className="space-y-6">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            SSH-Keys verstehen.
            <br />
            <span className="text-primary">Server sicher nutzen.</span>
          </h1>
          <p className="text-lg text-muted">
            Lerne, wie du SSH-Keys erstellst, richtig auf deinen Servern hinterlegst und Ubuntu- oder
            Debian-Server sicher einrichtest. Danach verwaltest du Keys und Server direkt hier, allein
            oder im Team.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/lernen">Jetzt lernen</ButtonLink>
            <ButtonLink href="/anmelden" variant="secondary">
              Zum Dashboard
            </ButtonLink>
          </div>
        </div>
        <pre
          aria-label="Beispiel: SSH-Key erstellen und auf den Server kopieren"
          className="overflow-x-auto rounded-xl bg-terminal p-6 font-mono text-sm leading-relaxed text-slate-200 shadow-xl"
        >
          <code>
            <span className="text-slate-500"># 1. Key erzeugen</span>
            {"\n"}
            <span className="text-primary">$</span> ssh-keygen -t ed25519 -C &quot;laptop&quot;
            {"\n\n"}
            <span className="text-slate-500"># 2. Public Key auf den Server bringen</span>
            {"\n"}
            <span className="text-primary">$</span> ssh-copy-id anna@203.0.113.10
            {"\n\n"}
            <span className="text-slate-500"># 3. Ohne Passwort anmelden</span>
            {"\n"}
            <span className="text-primary">$</span> ssh anna@203.0.113.10
            {"\n"}
            Welcome to Ubuntu 24.04 LTS
          </code>
        </pre>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h2 className="mb-2 font-semibold">{f.title}</h2>
              <p className="text-sm text-muted">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="mb-6 text-2xl font-bold">Der Kurs</h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {COURSE.map((m, i) => (
            <li key={m.slug}>
              <Link href={`/lernen#${m.slug}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-primary">
                  <p className="font-mono text-xs text-primary">Modul {i + 1}</p>
                  <h3 className="mt-1 font-semibold">{m.title}</h3>
                  <p className="mt-1 text-sm text-muted">{m.summary}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
