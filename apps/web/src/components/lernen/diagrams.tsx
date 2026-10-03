/** Einfache, barrierearme Diagramme für die Lektionen (passen sich Hell/Dunkel an) */

export function KeyDiagram() {
  return (
    <figure className="my-8">
      <svg viewBox="0 0 640 220" role="img" aria-labelledby="kd-title" className="w-full">
        <title id="kd-title">Der Private Key bleibt auf deinem Rechner, der Public Key liegt auf dem Server</title>
        <rect x="10" y="20" width="250" height="180" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <text x="135" y="50" textAnchor="middle" fill="var(--foreground)" fontSize="16" fontWeight="600">Dein Rechner</text>
        <g transform="translate(95 80)">
          <circle cx="20" cy="30" r="18" fill="none" stroke="var(--primary)" strokeWidth="6" />
          <rect x="36" y="25" width="50" height="10" rx="3" fill="var(--primary)" />
          <rect x="70" y="35" width="8" height="12" fill="var(--primary)" />
        </g>
        <text x="135" y="160" textAnchor="middle" fill="var(--foreground)" fontSize="14">Private Key (id_ed25519)</text>
        <text x="135" y="182" textAnchor="middle" fill="var(--muted)" fontSize="12">geheim, verlässt nie den Rechner</text>

        <rect x="380" y="20" width="250" height="180" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
        <text x="505" y="50" textAnchor="middle" fill="var(--foreground)" fontSize="16" fontWeight="600">Server</text>
        <g transform="translate(480 72)">
          <path d="M8 34 V22 a17 17 0 0 1 34 0 V34" fill="none" stroke="var(--primary)" strokeWidth="6" />
          <rect x="0" y="32" width="50" height="40" rx="6" fill="var(--primary)" />
        </g>
        <text x="505" y="160" textAnchor="middle" fill="var(--foreground)" fontSize="14">Public Key (authorized_keys)</text>
        <text x="505" y="182" textAnchor="middle" fill="var(--muted)" fontSize="12">darf jeder sehen</text>

        <path d="M270 110 H370" stroke="var(--muted)" strokeWidth="2" strokeDasharray="6 6" markerEnd="url(#kd-arrow)" />
        <text x="320" y="100" textAnchor="middle" fill="var(--muted)" fontSize="12">nur .pub kopieren</text>
        <defs>
          <marker id="kd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-muted">Schloss und Schlüssel: Das Schloss (Public Key) hängt am Server, den Schlüssel (Private Key) hast nur du.</figcaption>
    </figure>
  );
}

export function LoginFlowDiagram() {
  const steps = [
    { from: "c", text: "1. Hallo, ich bin anna und habe diesen Public Key" },
    { from: "s", text: "2. Der Key steht in authorized_keys. Unterschreib bitte diese Zufallszahl" },
    { from: "c", text: "3. Unterschrift mit dem Private Key" },
    { from: "s", text: "4. Unterschrift passt zum Public Key: willkommen!" },
  ];
  return (
    <figure className="my-8">
      <svg viewBox="0 0 640 260" role="img" aria-labelledby="lf-title" className="w-full">
        <title id="lf-title">Ablauf einer Anmeldung mit SSH-Key in vier Schritten</title>
        <text x="80" y="24" textAnchor="middle" fill="var(--foreground)" fontSize="15" fontWeight="600">Dein Rechner</text>
        <text x="560" y="24" textAnchor="middle" fill="var(--foreground)" fontSize="15" fontWeight="600">Server</text>
        <line x1="80" y1="36" x2="80" y2="250" stroke="var(--border)" strokeWidth="3" />
        <line x1="560" y1="36" x2="560" y2="250" stroke="var(--border)" strokeWidth="3" />
        {steps.map((s, i) => {
          const y = 70 + i * 50;
          const toRight = s.from === "c";
          return (
            <g key={i}>
              <line
                x1={toRight ? 90 : 550}
                y1={y}
                x2={toRight ? 550 : 90}
                y2={y}
                stroke="var(--primary)"
                strokeWidth="2"
                markerEnd="url(#lf-arrow)"
              />
              <text x="320" y={y - 8} textAnchor="middle" fill="var(--foreground)" fontSize="13">
                {s.text}
              </text>
            </g>
          );
        })}
        <defs>
          <marker id="lf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--primary)" />
          </marker>
        </defs>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-muted">Der Private Key wird nie übertragen, nur eine Unterschrift damit.</figcaption>
    </figure>
  );
}
