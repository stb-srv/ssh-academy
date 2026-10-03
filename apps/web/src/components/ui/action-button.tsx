"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./button";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Knopf für eine Server-Action mit optionaler Rückfrage und Ergebnisanzeige */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  successMessage,
  onSuccess,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  successMessage?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMessage(null);
          start(async () => {
            const result = await action();
            if (result.ok) {
              const text = result.message ?? successMessage;
              if (text) setMessage({ ok: true, text });
              onSuccess?.();
              router.refresh();
            } else setMessage({ ok: false, text: result.error });
          });
        }}
      >
        {pending ? "Bitte warten …" : children}
      </Button>
      {message && <span className={`text-xs ${message.ok ? "text-primary" : "text-danger"}`}>{message.text}</span>}
    </span>
  );
}
