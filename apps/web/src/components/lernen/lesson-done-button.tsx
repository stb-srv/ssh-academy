"use client";
import { useTransition } from "react";
import { toggleLessonDone } from "@/app/lernen/actions";
import { Button } from "../ui/button";

export function LessonDoneButton({ modul, lektion, done }: { modul: string; lektion: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={done ? "secondary" : "primary"}
      disabled={pending}
      onClick={() => start(() => toggleLessonDone(modul, lektion, !done))}
    >
      {done ? "✓ Gelesen" : "Als gelesen markieren"}
    </Button>
  );
}
