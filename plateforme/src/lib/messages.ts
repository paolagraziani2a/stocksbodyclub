import { formatTime } from "./dates";

const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "2-digit" });

/**
 * Remplace les caractères absents de l'alphabet SMS standard (GSM 03.38) : un seul
 * caractère hors alphabet ferait passer le SMS en Unicode (70 caractères au lieu de 160,
 * donc facturé double ou triple).
 */
export function toGsm(text: string): string {
  return text
    .replace(/[âä]/g, "a").replace(/[êë]/g, "e").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ûü]/g, "u")
    .replace(/[ÂÄ]/g, "A").replace(/[ÊË]/g, "E").replace(/[ÎÏ]/g, "I").replace(/[ÔÖ]/g, "O").replace(/[ÛÜ]/g, "U")
    .replace(/ç/g, "c").replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/[«»“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/ | /g, " ");
}

/** SMS envoyé quand le studio annule un cours. Une seule partie SMS (≤ 160 caractères). */
export function sessionCancelledSms(p: { firstName: string; title: string; startsAt: string; studio: string }): string {
  const when = `${shortDate.format(new Date(p.startsAt)).replace(".", "")} a ${formatTime(p.startsAt)}`;
  const hello = p.firstName ? `${p.firstName}, ` : "";
  const msg = `${p.studio} : ${hello}votre cours ${p.title} du ${when} est annule. Votre credit vous a ete rendu. Desolees pour ce changement.`;
  const gsm = toGsm(msg);
  return gsm.length <= 160 ? gsm : toGsm(`${p.studio} : votre cours du ${when} est annule. Votre credit vous a ete rendu.`);
}
