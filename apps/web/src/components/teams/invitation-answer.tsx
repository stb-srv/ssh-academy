"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitation, rejectInvitation } from "@/app/einladung/[id]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function InvitationAnswer({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  if (rejected) return <Alert>Du hast die Einladung abgelehnt.</Alert>;
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await acceptInvitation(invitationId);
              if (r.ok) router.push(`/dashboard/teams/${r.organizationId}`);
              else setError(r.error);
            })
          }
        >
          Annehmen
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await rejectInvitation(invitationId);
              if (r.ok) setRejected(true);
              else setError(r.error);
            })
          }
        >
          Ablehnen
        </Button>
      </div>
    </div>
  );
}
