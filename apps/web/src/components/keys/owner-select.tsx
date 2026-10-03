import { SelectField } from "@/components/ui/select";

export type OwnerOption = { organizationId: string; name: string };

export function OwnerSelect({ teams, name = "owner", defaultValue, label = "Gehört" }: { teams: OwnerOption[]; name?: string; defaultValue?: string; label?: string }) {
  if (teams.length === 0) return <input type="hidden" name={name} value="personal" />;
  return (
    <SelectField id={`${name}-select`} name={name} label={label} defaultValue={defaultValue ?? "personal"}>
      <option value="personal">Mir persönlich</option>
      {teams.map((t) => (
        <option key={t.organizationId} value={t.organizationId}>
          Team {t.name}
        </option>
      ))}
    </SelectField>
  );
}
