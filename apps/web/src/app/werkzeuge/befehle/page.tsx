import type { Metadata } from "next";
import { CommandBuilder } from "@/components/werkzeuge/command-builder";
import { ToolPage } from "@/components/werkzeuge/tool-page";

export const metadata: Metadata = { title: "Befehls-Baukasten" };

export default function Page() {
  return (
    <ToolPage slug="befehle" intro="Trag deine Daten links ein, wähle einen Befehl und kopiere das Ergebnis ins Terminal.">
      <CommandBuilder />
    </ToolPage>
  );
}
