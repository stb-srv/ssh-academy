import type { Metadata } from "next";
import Link from "next/link";
import { KeyGenerator } from "@/components/werkzeuge/key-generator";
import { ToolPage } from "@/components/werkzeuge/tool-page";

export const metadata: Metadata = { title: "Key-Generator" };

export default function Page() {
  return (
    <ToolPage
      slug="key-generator"
      intro={
        <>
          Erzeugt ein Schlüsselpaar im OpenSSH-Format. Was die Typen unterscheidet, erklärt die Lektion{" "}
          <Link href="/lernen/keys-erstellen/key-typen" className="text-primary hover:underline">
            Key-Typen
          </Link>
          .
        </>
      }
    >
      <KeyGenerator />
    </ToolPage>
  );
}
