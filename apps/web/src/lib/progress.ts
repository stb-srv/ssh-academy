import "server-only";
import { and, eq, schema } from "@ssh-academy/db";
import { ALL_LESSONS, COURSE } from "./course";
import { db } from "./db";

export const QUIZ_PASS_PERCENT = 70;

export function quizKey(moduleSlug: string) {
  return `${moduleSlug}/quiz`;
}

export async function getProgress(userId: string) {
  const rows = await db.select().from(schema.courseProgress).where(eq(schema.courseProgress.userId, userId));
  const done = new Set(rows.map((r) => r.lessonSlug));
  const quizScores = new Map(
    rows.filter((r) => r.lessonSlug.endsWith("/quiz")).map((r) => [r.lessonSlug.replace(/\/quiz$/, ""), r.quizScore ?? 0]),
  );
  const lessonsDone = ALL_LESSONS.filter((l) => done.has(l.key)).length;
  const quizzesPassed = COURSE.filter((m) => (quizScores.get(m.slug) ?? 0) >= QUIZ_PASS_PERCENT).length;
  const completedAt = rows.reduce<Date | null>((max, r) => (!max || r.completedAt > max ? r.completedAt : max), null);
  return {
    done,
    quizScores,
    lessonsDone,
    lessonsTotal: ALL_LESSONS.length,
    quizzesPassed,
    quizzesTotal: COURSE.length,
    finished: lessonsDone === ALL_LESSONS.length && quizzesPassed === COURSE.length,
    lastActivity: completedAt,
  };
}

export async function markLessonDone(userId: string, key: string) {
  await db.insert(schema.courseProgress).values({ userId, lessonSlug: key }).onConflictDoNothing();
}

export async function unmarkLesson(userId: string, key: string) {
  await db
    .delete(schema.courseProgress)
    .where(and(eq(schema.courseProgress.userId, userId), eq(schema.courseProgress.lessonSlug, key)));
}

/** Speichert das beste Quiz-Ergebnis */
export async function saveQuizScore(userId: string, moduleSlug: string, score: number) {
  const key = quizKey(moduleSlug);
  const [existing] = await db
    .select()
    .from(schema.courseProgress)
    .where(and(eq(schema.courseProgress.userId, userId), eq(schema.courseProgress.lessonSlug, key)));
  if (!existing) {
    await db.insert(schema.courseProgress).values({ userId, lessonSlug: key, quizScore: score });
  } else if ((existing.quizScore ?? 0) < score) {
    await db
      .update(schema.courseProgress)
      .set({ quizScore: score, completedAt: new Date() })
      .where(and(eq(schema.courseProgress.userId, userId), eq(schema.courseProgress.lessonSlug, key)));
  }
}
