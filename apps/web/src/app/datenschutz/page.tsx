import type { Metadata } from "next";

export const metadata: Metadata = { title: "Datenschutz" };

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Datenschutz</h1>
      <p className="text-muted">Dieser Text wird vom Betreiber der Installation ergänzt.</p>
    </div>
  );
}
