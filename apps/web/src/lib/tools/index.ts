export const TOOLS = [
  {
    slug: "key-generator",
    title: "Key-Generator",
    description: "Ein SSH-Schlüsselpaar direkt im Browser erzeugen. Nichts verlässt deinen Rechner.",
    icon: "🔑",
  },
  {
    slug: "befehle",
    title: "Befehls-Baukasten",
    description: "ssh, scp, rsync, Tunnel und ~/.ssh/config-Einträge zum Kopieren zusammenstellen.",
    icon: "🧰",
  },
  {
    slug: "sshd-config",
    title: "sshd-Konfigurator",
    description: "Eine sichere Server-Konfiguration aus ein paar Antworten erzeugen.",
    icon: "🛡️",
  },
  {
    slug: "fehler-doktor",
    title: "Fehler-Doktor",
    description: "Fehlermeldung einfügen und erfahren, was sie bedeutet und wie du sie behebst.",
    icon: "🩺",
  },
  {
    slug: "rechte",
    title: "Rechte-Checker",
    description: "Prüft, ob die Dateirechte deines .ssh-Ordners stimmen, und schlägt chmod-Befehle vor.",
    icon: "🔒",
  },
] as const;

export function findTool(slug: string) {
  return TOOLS.find((t) => t.slug === slug);
}
