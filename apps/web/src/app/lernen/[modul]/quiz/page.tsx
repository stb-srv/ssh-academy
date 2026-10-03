import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Quiz } from "@/components/lernen/quiz";
import { COURSE, findModule } from "@/lib/course";
import { getProgress, QUIZ_PASS_PERCENT } from "@/lib/progress";
import { getSession } from "@/lib/session";

export function generateStaticParams() {
  return COURSE.map((m) => ({ modul: m.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/lernen/[modul]/quiz">): Promise<Metadata> {
  const mod = findModule((await params).modul);
  return { title: `Quiz: ${mod?.title ?? ""}` };
}

export default async function QuizPage({ params }: PageProps<"/lernen/[modul]/quiz">) {
  const mod = findModule((await params).modul);
  if (!mod) notFound();
  const session = await getSession();
  const best = session ? (await getProgress(session.user.id)).quizScores.get(mod.slug) : undefined;
  const nextModule = COURSE[COURSE.indexOf(mod) + 1];

  // Nur Fragen und Antworten an den Browser geben, die Lösungen bleiben auf dem Server
  const questions = mod.quiz.map((q) => ({ question: q.question, options: q.options }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <p className="text-sm text-muted">
        <Link href="/lernen" className="hover:underline">
          Lernen
        </Link>{" "}
        / {mod.title}
      </p>
      <h1 className="text-3xl font-bold">Quiz: {mod.title}</h1>
      <p className="text-muted">
        Ab {QUIZ_PASS_PERCENT} % richtigen Antworten gilt das Modul als bestanden.
        {best !== undefined && ` Dein bestes Ergebnis bisher: ${best} %.`}
      </p>
      <Quiz
        modul={mod.slug}
        questions={questions}
        passPercent={QUIZ_PASS_PERCENT}
        loggedIn={Boolean(session)}
        next={nextModule ? { href: `/lernen/${nextModule.slug}/${nextModule.lessons[0]!.slug}`, title: nextModule.title } : null}
      />
    </div>
  );
}
