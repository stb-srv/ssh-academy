"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { COURSE, findLesson, lessonKey } from "@/lib/course";
import { markLessonDone, saveQuizScore, unmarkLesson } from "@/lib/progress";
import { getSession } from "@/lib/session";

export async function toggleLessonDone(moduleSlug: string, lessonSlug: string, done: boolean) {
  const session = await getSession();
  if (!session || !findLesson(moduleSlug, lessonSlug)) return;
  const key = lessonKey(moduleSlug, lessonSlug);
  if (done) await markLessonDone(session.user.id, key);
  else await unmarkLesson(session.user.id, key);
  revalidatePath("/lernen", "layout");
}

const answersSchema = z.array(z.number().int().min(0).max(10));

/** Wertet das Quiz serverseitig aus, damit niemand sein Ergebnis fälschen kann */
export async function submitQuiz(moduleSlug: string, answers: number[]) {
  const mod = COURSE.find((m) => m.slug === moduleSlug);
  const parsed = answersSchema.safeParse(answers);
  if (!mod || !parsed.success || parsed.data.length !== mod.quiz.length) return { error: "Ungültige Antworten" };
  const correct = mod.quiz.filter((q, i) => q.answer === parsed.data[i]).length;
  const score = Math.round((correct / mod.quiz.length) * 100);
  const session = await getSession();
  if (session) {
    await saveQuizScore(session.user.id, moduleSlug, score);
    revalidatePath("/lernen", "layout");
  }
  return {
    score,
    correct,
    total: mod.quiz.length,
    saved: Boolean(session),
    solutions: mod.quiz.map((q) => ({ answer: q.answer, explanation: q.explanation })),
  };
}
