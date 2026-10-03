"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui/button";

export function PocketIdButton({ name, next, mode = "signin" }: { name: string; next: string; mode?: "signin" | "link" }) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const errorCallbackURL = mode === "link" ? "/dashboard/sicherheit" : "/anmelden";
    const { error } =
      mode === "link"
        ? await authClient.linkSocial({ provider: "pocket-id", callbackURL: next, errorCallbackURL })
        : await authClient.signIn.social({ provider: "pocket-id", callbackURL: next, errorCallbackURL });
    // Bei Erfolg leitet der Client zu Pocket ID weiter.
    if (error) setPending(false);
  }

  return (
    <Button type="button" variant="secondary" className="w-full" disabled={pending} onClick={start}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {mode === "link" ? `${name} verbinden` : `Mit ${name} anmelden`}
    </Button>
  );
}
