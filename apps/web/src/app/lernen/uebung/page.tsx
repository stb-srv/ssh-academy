import type { Metadata } from "next";
import { PracticeTerminal } from "@/components/lernen/practice-terminal";

export const metadata: Metadata = {
  title: "Übungsterminal",
  description: "Benutzer anlegen, sudo vergeben, SSH-Keys hinterlegen und sshd absichern: gefahrlos in einem simulierten Linux im Browser.",
};

export default function PracticePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Übungsterminal</h1>
        <p className="max-w-3xl text-muted">
          Hier richtest du einen Server so ein, wie du es in den Lektionen gelernt hast: Key erzeugen, Benutzer anlegen, sudo vergeben, Key hinterlegen
          und den Passwort-Login abschalten. Die Aufgaben werden automatisch geprüft. Kaputt machen kannst du nichts: „Zurücksetzen“ startet neu.
        </p>
      </header>
      <PracticeTerminal />
    </div>
  );
}
