import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OsProvider } from "@/components/lernen/os-context";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "SSH-Academy: SSH-Keys verstehen und sicher nutzen", template: "%s · SSH-Academy" },
  description:
    "Lerne Schritt für Schritt, wie du SSH-Keys erstellst, auf Servern hinterlegst und Ubuntu- und Debian-Server sicher einrichtest. Mit Key-Verwaltung, Server-Zugriff und Teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#inhalt" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          Zum Inhalt springen
        </a>
        <OsProvider>
          <SiteHeader />
          <main id="inhalt" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </OsProvider>
      </body>
    </html>
  );
}
