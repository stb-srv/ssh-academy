import type { Metadata } from "next";
import { PermissionChecker } from "@/components/werkzeuge/permission-checker";
import { ToolPage } from "@/components/werkzeuge/tool-page";

export const metadata: Metadata = { title: "Rechte-Checker" };

export default function Page() {
  return (
    <ToolPage
      slug="rechte"
      intro="Zu offene Dateirechte sind einer der häufigsten Gründe, warum der Key-Login nicht klappt. Dieser Checker findet sie."
    >
      <PermissionChecker />
    </ToolPage>
  );
}
