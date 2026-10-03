"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setManagementKey } from "@/app/dashboard/server/actions";
import { SelectField } from "@/components/ui/select";

export function ManagementKeySelect({ serverId, current, options, defaultUser }: { serverId: string; current: string | null; options: { id: string; name: string }[]; defaultUser: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <SelectField
        id="mgmt-key"
        label="Verwaltungs-Key"
        value={current ?? ""}
        disabled={pending}
        hint={`Damit erledigt die Plattform Aufgaben ohne Rückfrage (Keys entziehen, Offboarding). Muss für ${defaultUser} hinterlegt sein.`}
        onChange={(e) =>
          start(async () => {
            const r = await setManagementKey(serverId, e.target.value || null);
            setError(r.ok ? null : r.error);
            router.refresh();
          })
        }
      >
        <option value="">Keiner</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
