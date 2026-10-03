import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/lernen/print-button";
import { Alert } from "@/components/ui/alert";
import { getProgress } from "@/lib/progress";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Zertifikat" };

export default async function CertificatePage() {
  const session = await requireSession();
  const progress = await getProgress(session.user.id);

  if (!progress.finished) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <h1 className="text-3xl font-bold">Zertifikat</h1>
        <Alert>
          Noch nicht ganz: {progress.lessonsDone} von {progress.lessonsTotal} Lektionen gelesen und{" "}
          {progress.quizzesPassed} von {progress.quizzesTotal} Quiz bestanden.{" "}
          <Link href="/lernen" className="underline">
            Zurück zum Lernpfad
          </Link>
        </Alert>
      </div>
    );
  }

  const date = (progress.lastActivity ?? new Date()).toLocaleDateString("de-DE", { dateStyle: "long" });
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border-4 border-primary bg-card p-10 text-center shadow-lg print:shadow-none">
        <p className="font-mono text-sm text-primary">~$ ssh-academy --zertifikat</p>
        <h1 className="mt-6 text-4xl font-bold">Zertifikat</h1>
        <p className="mt-2 text-lg">SSH-Grundlagen</p>
        <p className="mt-10 text-muted">Hiermit wird bestätigt, dass</p>
        <p className="mt-2 text-3xl font-semibold">{session.user.name}</p>
        <p className="mt-6 text-muted">
          alle {progress.lessonsTotal} Lektionen der SSH-Academy durchgearbeitet und alle {progress.quizzesTotal} Modul-Quiz
          bestanden hat.
        </p>
        <p className="mt-10 text-sm text-muted">{date}</p>
      </div>
      <div className="mt-6 text-center print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}
