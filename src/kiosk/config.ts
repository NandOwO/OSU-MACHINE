/** Business rules of the machine. Mirrors `DISEÑO.md` §4; every value can be changed from the operator panel. */
export interface Prize { id: string; name: string; tickets: number }

export interface KioskConfig {
  credits: {
    /** Plays one deposit (coin or card) gives. */
    playsPerDeposit: number;
    /** A card tap starts a session with a deposit, like a coin. */
    cardGivesDeposit: boolean;
  };
  tickets: {
    maxPerPlay: number;
    curveExponent: number;
    /** Maps with fewer objects pay no tickets (their maximum score is not meaningful). */
    minObjectsForTickets: number;
    /** Without a card the tickets are lost. */
    cardRequired: boolean;
  };
  prizes: Prize[];
  leaderboard: { size: number; nameMaxLength: number; nameCharset: string };
  tutorial: { enabledFirstSession: boolean };
}

export const DEFAULT_CONFIG: KioskConfig = {
  credits: { playsPerDeposit: 3, cardGivesDeposit: true },
  tickets: { maxPerPlay: 100, curveExponent: 2, minObjectsForTickets: 50, cardRequired: true },
  prizes: [
    { id: "funko", name: "Funko Pop estándar", tickets: 3000 },
    { id: "peluche", name: "Peluche grande (~40 cm)", tickets: 3500 },
    { id: "audifonos", name: "Audífonos inalámbricos básicos", tickets: 4000 },
    { id: "parlante", name: "Parlante Bluetooth portátil", tickets: 5000 },
    { id: "mouse", name: "Mouse gamer + mousepad", tickets: 6000 },
    { id: "funko-especial", name: "Funko Pop edición especial", tickets: 8000 },
    { id: "gamepad", name: "Gamepad inalámbrico", tickets: 10000 },
  ],
  leaderboard: { size: 50, nameMaxLength: 8, nameCharset: "A-Z0-9 _-" },
  tutorial: { enabledFirstSession: true },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Merges a partial (possibly untrusted, e.g. from storage) config over the defaults, keeping only valid values. */
export function mergeConfig(partial: unknown, base: KioskConfig = DEFAULT_CONFIG): KioskConfig {
  const out: KioskConfig = JSON.parse(JSON.stringify(base));
  if (!isObj(partial)) return out;
  const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  if (isObj(partial.credits)) {
    const c = partial.credits;
    out.credits.playsPerDeposit = Math.round(num(c.playsPerDeposit, 1, 20, out.credits.playsPerDeposit));
    out.credits.cardGivesDeposit = bool(c.cardGivesDeposit, out.credits.cardGivesDeposit);
  }
  if (isObj(partial.tickets)) {
    const t = partial.tickets;
    out.tickets.maxPerPlay = Math.round(num(t.maxPerPlay, 0, 100000, out.tickets.maxPerPlay));
    out.tickets.curveExponent = num(t.curveExponent, 0.5, 6, out.tickets.curveExponent);
    out.tickets.minObjectsForTickets = Math.round(num(t.minObjectsForTickets, 0, 10000, out.tickets.minObjectsForTickets));
    out.tickets.cardRequired = bool(t.cardRequired, out.tickets.cardRequired);
  }
  if (Array.isArray(partial.prizes)) {
    const prizes = partial.prizes.filter(isObj).map((p) => ({ id: String(p.id ?? ""), name: String(p.name ?? ""), tickets: Math.round(num(p.tickets, 1, 10_000_000, 0)) }))
      .filter((p) => p.id && p.name && p.tickets > 0);
    if (prizes.length) out.prizes = prizes;
  }
  if (isObj(partial.leaderboard)) {
    const l = partial.leaderboard;
    out.leaderboard.size = Math.round(num(l.size, 1, 500, out.leaderboard.size));
    out.leaderboard.nameMaxLength = Math.round(num(l.nameMaxLength, 1, 16, out.leaderboard.nameMaxLength));
    if (typeof l.nameCharset === "string" && l.nameCharset.length > 0 && l.nameCharset.length < 80) out.leaderboard.nameCharset = l.nameCharset;
  }
  if (isObj(partial.tutorial)) out.tutorial.enabledFirstSession = bool(partial.tutorial.enabledFirstSession, out.tutorial.enabledFirstSession);
  return out;
}

/** Expands a charset like "A-Z0-9 _-" into the list of allowed characters. */
export function expandCharset(spec: string): string {
  let out = "";
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i]!;
    if (spec[i + 1] === "-" && i + 2 < spec.length) {
      const a = c.charCodeAt(0), b = spec.charCodeAt(i + 2);
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out += String.fromCharCode(k);
      i += 2;
    } else out += c;
  }
  return [...new Set(out)].join("");
}
