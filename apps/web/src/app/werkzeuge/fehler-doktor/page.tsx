import type { Metadata } from "next";
import { ErrorDoctor } from "@/components/werkzeuge/error-doctor";
import { ToolPage } from "@/components/werkzeuge/tool-page";

export const metadata: Metadata = { title: "Fehler-Doktor" };

export default function Page() {
  return (
    <ToolPage slug="fehler-doktor" intro="Füge die Meldung aus deinem Terminal ein. Du bekommst die Ursache und konkrete nächste Schritte.">
      <ErrorDoctor />
    </ToolPage>
  );
}
