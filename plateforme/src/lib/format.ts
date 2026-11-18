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
