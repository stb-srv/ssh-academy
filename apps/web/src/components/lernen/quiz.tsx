"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { submitQuiz } from "@/app/lernen/actions";
import { Alert } from "../ui/alert";
import { Button, ButtonLink } from "../ui/button";
import { Card } from "../ui/card";

type Props = {
  modul: string;
  questions: { question: string; options: string[] }[];
  passPercent: number;
  loggedIn: boolean;
  next: { href: string; title: string } | null;
};

export function Quiz({ modul, questions, passPercent, loggedIn, next }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [result, setResult] = useState<{
    score: number;
    correct: number;
    total: number;
    solutions: { answer: number; explanation: string }[];
  } | null>(null);
  const [pending, start] = useTransition();
  // Lösungen und Erklärungen kommen erst nach dem Absenden vom Server
  const explanations = result?.solutions ?? [];

  function submit() {
    start(async () => {
      const res = await submitQuiz(modul, answers.map((a) => a ?? -1));
      if (!("error" in res)) setResult(res);
    });
  }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <Card key={qi}>
          <fieldset>
            <legend className="font-medium">
              {qi + 1}. {q.question}
            </legend>
            <div className="mt-3 space-y-2">
              {q.options.map((o, oi) => {
                const chosen = answers[qi] === oi;
                const correct = result && explanations[qi]?.answer === oi;
                const wrong = result && chosen && !correct;
                return (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                      correct ? "border-primary bg-primary/10" : wrong ? "border-danger bg-danger/10" : chosen ? "border-primary" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q${qi}`}
                      checked={chosen}
                      disabled={Boolean(result)}
                      onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                      className="mt-1"
                    />
                    {o}
                  </label>
                );
              })}
            </div>
            {result && <p className="mt-3 text-sm text-muted">{explanations[qi]?.explanation}</p>}
          </fieldset>
        </Card>
      ))}

      {!result ? (
        <Button onClick={submit} disabled={pending || answers.some((a) => a === null)}>
          Auswerten
        </Button>
      ) : (
        <div className="space-y-4">
          <Alert tone={result.score >= passPercent ? "info" : "warning"}>
            {result.correct} von {result.total} richtig ({result.score} %).{" "}
            {result.score >= passPercent ? "Bestanden!" : "Lies die Lektionen noch einmal und versuch es erneut."}
            {!loggedIn && (
              <>
                {" "}
                <Link href="/anmelden" className="underline">
                  Melde dich an
                </Link>
                , damit dein Ergebnis gespeichert wird.
              </>
            )}
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setAnswers(questions.map(() => null));
              }}
            >
              Nochmal versuchen
            </Button>
            {next ? (
              <ButtonLink href={next.href}>Weiter mit {next.title}</ButtonLink>
            ) : (
              <ButtonLink href="/lernen/zertifikat">Zum Zertifikat</ButtonLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
