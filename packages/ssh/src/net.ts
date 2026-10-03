/**
 * SSRF-Schutz: Welche Zieladressen das Gateway ansprechen darf (Projektkonzept 5.2).
 * Private und Sonder-Adressbereiche sind gesperrt, außer der Admin gibt Netze ausdrücklich frei.
 */

type Parsed = { version: 4 | 6; value: bigint };

export function parseIp(ip: string): Parsed | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return { version: 4, value: parts.reduce((acc, p) => (acc << 8n) | BigInt(p), 0n) };
  }
  if (!ip.includes(":")) return null;
  let addr = ip.replace(/%.*$/, "");
  // IPv4-Anhang (z. B. ::ffff:1.2.3.4) in zwei Hextets umwandeln
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (tail) {
    const p = parseIp(tail[1]!);
    if (!p) return null;
    addr = addr.slice(0, -tail[1]!.length) + `${(p.value >> 16n).toString(16)}:${(p.value & 0xffffn).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    value = (value << 16n) | BigInt(parseInt(g, 16));
  }
  return { version: 6, value };
}

export type Cidr = { version: 4 | 6; base: bigint; bits: number };

export function parseCidr(cidr: string): Cidr | null {
  const [addr, len] = cidr.trim().split("/");
  const ip = parseIp(addr ?? "");
  if (!ip) return null;
  const max = ip.version === 4 ? 32 : 128;
  const bits = len === undefined ? max : Number(len);
  if (!Number.isInteger(bits) || bits < 0 || bits > max) return null;
  const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(max - bits);
  return { version: ip.version, base: ip.value & mask, bits };
}

function contains(c: Cidr, ip: Parsed) {
  if (c.version !== ip.version) return false;
  const max = c.version === 4 ? 32 : 128;
  const mask = c.bits === 0 ? 0n : ((1n << BigInt(c.bits)) - 1n) << BigInt(max - c.bits);
  return (ip.value & mask) === c.base;
}

const BLOCKED = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
  "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
  "::/128", "::1/128", "64:ff9b::/96", "100::/64", "2001:db8::/32", "fc00::/7", "fe80::/10", "ff00::/8",
].map((c) => parseCidr(c)!);

export function parseCidrList(list: string | undefined) {
  return (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const c = parseCidr(s);
      if (!c) throw new Error(`Ungültiges Netz in der Freigabeliste: ${s}`);
      return c;
    });
}

/**
 * Darf das Gateway diese Adresse ansprechen?
 * Freigegebene Netze (SSH_ALLOWED_NETWORKS) gehen vor der Sperrliste.
 */
export function isAddressAllowed(ip: string, allowed: Cidr[] = []): { allowed: boolean; reason?: string } {
  let parsed = parseIp(ip);
  if (!parsed) return { allowed: false, reason: "Keine gültige IP-Adresse." };
  // IPv4-gemappte IPv6-Adressen wie IPv4 behandeln
  if (parsed.version === 6 && parsed.value >> 32n === 0xffffn) parsed = { version: 4, value: parsed.value & 0xffffffffn };
  if (allowed.some((c) => contains(c, parsed))) return { allowed: true };
  if (BLOCKED.some((c) => contains(c, parsed))) {
    return {
      allowed: false,
      reason: "Private und interne Adressen sind gesperrt. Der Admin kann Netze mit SSH_ALLOWED_NETWORKS freigeben.",
    };
  }
  return { allowed: true };
}

/** Hostname oder IP grob prüfen (vor dem Speichern) */
export function isValidHost(host: string) {
  if (parseIp(host)) return true;
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host);
}
