import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonDoneButton } from "@/components/lernen/lesson-done-button";
import { ALL_LESSONS, COURSE, findLesson, lessonKey } from "@/lib/course";
import { getProgress } from "@/lib/progress";
import { getSession } from "@/lib/session";

export function generateStaticParams() {
  return COURSE.flatMap((m) => m.lessons.map((l) => ({ modul: m.slug, lektion: l.slug })));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/lernen/[modul]/[lektion]">): Promise<Metadata> {
  const { modul, lektion } = await params;
  const found = findLesson(modul, lektion);
  return { title: found ? `${found.lesson.title} · ${found.module.title}` : "Lektion" };
}

export default async function LessonPage({ params }: PageProps<"/lernen/[modul]/[lektion]">) {
  const { modul, lektion } = await params;
  const found = findLesson(modul, lektion);
  if (!found) notFound();
  const { module: mod, lesson, index } = found;

  const { default: Content } = await import(`@/content/lernen/${modul}/${lektion}.mdx`);
  const session = await getSession();
  const progress = session ? await getProgress(session.user.id) : null;
  const key = lessonKey(modul, lektion);

  const pos = ALL_LESSONS.findIndex((l) => l.key === key);
  const prev = ALL_LESSONS[pos - 1];
  const next = ALL_LESSONS[pos + 1];
  const isLastInModule = index === mod.lessons.length - 1;
  const moduleNumber = COURSE.indexOf(mod) + 1;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[240px_1fr]">
      <nav aria-label={`Lektionen in ${mod.title}`} className="hidden lg:block">
        <p className="mb-2 font-mono text-xs text-primary">Modul {moduleNumber}</p>
        <p className="mb-3 font-semibold">{mod.title}</p>
        <ol className="space-y-1 text-sm">
          {mod.lessons.map((l) => {
            const k = lessonKey(mod.slug, l.slug);
            const active = l.slug === lesson.slug;
            return (
              <li key={l.slug}>
                <Link
                  href={`/lernen/${mod.slug}/${l.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex gap-2 rounded-md px-2 py-1 ${active ? "bg-primary/10 font-medium text-primary" : "hover:bg-border/40"}`}
                >
                  <span aria-hidden>{progress?.done.has(k) ? "✓" : "○"}</span>
                  {l.title}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href={`/lernen/${mod.slug}/quiz`} className="flex gap-2 rounded-md px-2 py-1 hover:bg-border/40">
              <span aria-hidden>?</span> Quiz
            </Link>
          </li>
        </ol>
      </nav>

      <article className="min-w-0 max-w-3xl">
        <p className="text-sm text-muted">
          <Link href="/lernen" className="hover:underline">
            Lernen
          </Link>{" "}
          / <Link href={`/lernen#${mod.slug}`} className="hover:underline">{mod.title}</Link> · {lesson.minutes} Min.
        </p>
        <h1 className="mt-2 text-3xl font-bold">{lesson.title}</h1>
        <div className="lesson mt-6">
          <Content />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          {session ? (
            <LessonDoneButton modul={modul} lektion={lektion} done={progress?.done.has(key) ?? false} />
          ) : (
            <p className="text-sm text-muted">
              <Link href={`/anmelden?weiter=/lernen/${modul}/${lektion}`} className="text-primary hover:underline">
                Melde dich an
              </Link>
              , um deinen Fortschritt zu speichern.
            </p>
          )}
        </div>

        <nav aria-label="Weiter und zurück" className="mt-6 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={`/lernen/${prev.module.slug}/${prev.lesson.slug}`} className="rounded-lg border border-border p-3 text-sm hover:border-primary">
              <span className="text-muted">Zurück</span>
              <br />
              {prev.lesson.title}
            </Link>
          ) : (
            <span />
          )}
          {isLastInModule ? (
            <Link href={`/lernen/${mod.slug}/quiz`} className="rounded-lg border border-primary bg-primary/10 p-3 text-right text-sm">
              <span className="text-muted">Weiter</span>
              <br />
              Quiz: {mod.title}
            </Link>
          ) : next ? (
            <Link href={`/lernen/${next.module.slug}/${next.lesson.slug}`} className="rounded-lg border border-border p-3 text-right text-sm hover:border-primary">
              <span className="text-muted">Weiter</span>
              <br />
              {next.lesson.title}
            </Link>
          ) : null}
        </nav>
      </article>
    </div>
  );
}
