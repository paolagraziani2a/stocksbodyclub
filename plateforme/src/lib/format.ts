import type { Product } from "./site";

export function validityLabel(p: Pick<Product, "validity_value" | "validity_unit">) {
  return p.validity_unit === "month"
    ? `${p.validity_value} mois`
    : `${p.validity_value} jour${p.validity_value > 1 ? "s" : ""}`;
}

/** Lien d'itinéraire sans clé d'API (ouvre Google Maps, ou Plans sur iPhone). */
export function mapsLink(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ---------------------------------------------------------------------------
// Disciplines, niveaux et intensité (utilisables côté client comme serveur)
// ---------------------------------------------------------------------------
export type Discipline = "lagree" | "yoga" | "mat_pilates";
export type Level = "debutant" | "intermediaire" | "avance" | "tous";

export const DISCIPLINES: Record<Discipline, { label: string; teachers: string; teachersAccent: string; tagline: string }> = {
  lagree: { label: "Lagree", teachers: "Coachs", teachersAccent: "Lagree.", tagline: "Force lente, intensité totale, sur Megaformer." },
  yoga: { label: "Yoga", teachers: "Professeurs", teachersAccent: "de yoga.", tagline: "Le souffle, la mobilité et l'ancrage." },
  mat_pilates: { label: "Mat Pilates", teachers: "Professeurs", teachersAccent: "de Pilates.", tagline: "Gainage et posture, au sol sur tapis." },
};
export const DISCIPLINE_ORDER: Discipline[] = ["lagree", "yoga", "mat_pilates"];

export const LEVELS: Record<Level, string> = {
  debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", tous: "Tous niveaux",
};

export function isDiscipline(v: unknown): v is Discipline {
  return typeof v === "string" && v in DISCIPLINES;
}
