/**
 * Dates du studio — toujours affichées en heure de Paris.
 * Les « jours » sont manipulés en chaînes AAAA-MM-JJ (sans fuseau) pour éviter
 * les décalages : la conversion vers l'instant UTC est faite par PostgreSQL.
 */
export const STUDIO_TZ = "Europe/Paris";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: STUDIO_TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: STUDIO_TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: STUDIO_TZ, hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: STUDIO_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const formatDay = (d: Date | string) => dayFmt.format(new Date(d));
export const formatShortDay = (d: Date | string) => shortDayFmt.format(new Date(d));
export const formatTime = (d: Date | string) => timeFmt.format(new Date(d)).replace(":", "h");
export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));

/** Jour calendaire à Paris d'un instant, au format AAAA-MM-JJ. */
export function parisDay(d: Date | string = new Date()): string {
  return isoDayFmt.format(new Date(d));
}

/** Heure HH:MM à Paris d'un instant (pour pré-remplir un formulaire). */
export function parisTime(d: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: STUDIO_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(d));
}

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Lundi de la semaine contenant ce jour. */
export function mondayOf(day: string): string {
  const dow = (parse(day).getUTCDay() + 6) % 7; // lundi = 0
  return addDays(day, -dow);
}

export function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function lastOfMonth(day: string): string {
  const d = parse(firstOfMonth(day));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fmt(d);
}

export function isValidDay(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
}

/** Libellé « jour » d'une date AAAA-MM-JJ, sans risque de décalage de fuseau. */
export function labelOfDay(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(parse(day));
}

/** Le cours n'a pas encore commencé. */
export function isUpcoming(iso: string): boolean {
  return new Date(iso).getTime() > Date.now();
}

/** Heures restantes avant un instant (négatif s'il est passé). */
export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3600_000;
}
