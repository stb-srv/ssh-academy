import type { Metadata } from "next";
import Link from "next/link";
import { SshdConfigurator } from "@/components/werkzeuge/sshd-configurator";
import { ToolPage } from "@/components/werkzeuge/tool-page";

export const metadata: Metadata = { title: "sshd-Konfigurator" };

export default function Page() {
  return (
    <ToolPage
      slug="sshd-config"
      intro={
        <>
          Erzeugt eine Drop-in-Datei für Ubuntu und Debian. Hintergründe stehen im Modul{" "}
          <Link href="/lernen/server-absichern/sshd-config-und-drop-ins" className="text-primary hover:underline">
            Server absichern
          </Link>
          .
        </>
      }
    >
      <SshdConfigurator />
    </ToolPage>
  );
}
