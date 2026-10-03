import type { Metadata } from "next";
import Link from "next/link";
import { LessonSearch } from "@/components/lernen/lesson-search";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ALL_LESSONS, COURSE, lessonKey } from "@/lib/course";
import { getProgress, QUIZ_PASS_PERCENT } from "@/lib/progress";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Lernen" };

export default async function LearnPage() {
  const session = await getSession();
  const progress = session ? await getProgress(session.user.id) : null;
  const nextLesson = progress ? ALL_LESSONS.find((l) => !progress.done.has(l.key)) : ALL_LESSONS[0];
  const percent = progress ? Math.round((progress.lessonsDone / progress.lessonsTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">Lernpfad</h1>
        <p className="text-muted">
          {COURSE.length} Module mit {ALL_LESSONS.length} Lektionen. Jede Lektion dauert 5 bis 10 Minuten. Am Ende jedes
          Moduls wartet ein kurzes Quiz.
        </p>
        <div className="flex flex-wrap gap-3">
          {nextLesson && (
            <ButtonLink href={`/lernen/${nextLesson.module.slug}/${nextLesson.lesson.slug}`}>
              {progress && progress.lessonsDone > 0 ? "Weiterlernen" : "Mit Lektion 1 starten"}
            </ButtonLink>
          )}
          <ButtonLink href="/werkzeuge" variant="secondary">
            Werkzeuge
          </ButtonLink>
          <ButtonLink href="/glossar" variant="secondary">
            Glossar
          </ButtonLink>
        </div>
      </header>

      {progress ? (
        <Card className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {progress.lessonsDone} von {progress.lessonsTotal} Lektionen gelesen, {progress.quizzesPassed} von{" "}
              {progress.quizzesTotal} Quiz bestanden
            </span>
            <span className="font-medium">{percent} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          {progress.finished && (
            <p className="text-sm">
              Geschafft! <Link href="/lernen/zertifikat" className="text-primary underline">Dein Zertifikat ansehen</Link>
            </p>
          )}
        </Card>
      ) : (
        <p className="text-sm text-muted">
          <Link href="/anmelden?weiter=/lernen" className="text-primary hover:underline">
            Melde dich an
          </Link>
          , um deinen Fortschritt zu speichern und am Ende ein Zertifikat zu erhalten.
        </p>
      )}

      <LessonSearch
        lessons={ALL_LESSONS.map((l) => ({ href: `/lernen/${l.module.slug}/${l.lesson.slug}`, title: l.lesson.title, module: l.module.title }))}
      />

      {COURSE.map((m, i) => {
        const score = progress?.quizScores.get(m.slug);
        return (
          <Card key={m.slug} id={m.slug} className="scroll-mt-20">
            <p className="font-mono text-xs text-primary">Modul {i + 1}</p>
            <h2 className="mt-1 text-xl font-semibold">{m.title}</h2>
            <p className="mt-1 text-sm text-muted">{m.summary}</p>
            <ol className="mt-4 space-y-1 text-sm">
              {m.lessons.map((l) => (
                <li key={l.slug}>
                  <Link href={`/lernen/${m.slug}/${l.slug}`} className="flex gap-2 rounded px-1 py-0.5 hover:bg-border/40">
                    <span aria-hidden className="w-4 text-primary">
                      {progress?.done.has(lessonKey(m.slug, l.slug)) ? "✓" : "○"}
                    </span>
                    <span className="flex-1">{l.title}</span>
                    <span className="text-muted">{l.minutes} Min.</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/lernen/${m.slug}/quiz`} className="flex gap-2 rounded px-1 py-0.5 font-medium hover:bg-border/40">
                  <span aria-hidden className="w-4 text-primary">
                    {score !== undefined && score >= QUIZ_PASS_PERCENT ? "✓" : "?"}
                  </span>
                  <span className="flex-1">Quiz</span>
                  {score !== undefined && <span className="text-muted">{score} %</span>}
                </Link>
              </li>
            </ol>
          </Card>
        );
      })}
    </div>
  );
}
