import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

export type Appearance = {
  color_background: string;
  color_surface: string;
  color_text: string;
  color_muted: string;
  color_accent: string;
  color_line: string;
  heading_font: "bigshoulders" | "cormorant" | "playfair" | "bodoni";
  body_font: "geist" | "jost" | "inter" | "montserrat";
  hero_title_accent: string;
  color_feature: string;
  marquee_text: string;
  button_shape: "pill" | "rounded" | "square";
  logo_url: string | null;
  hero_image_url: string | null;
  hero_kicker: string;
  hero_title: string;
  hero_subtitle: string;
  about_title: string;
  about_text: string;
  welcome_title: string;
  method_title: string;
  method_text: string;
  opening_hours: string;
  access_info: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  color_background: "#f0eadb",
  color_surface: "#faf6eb",
  color_text: "#131512",
  color_muted: "#4f544d",
  color_accent: "#4b5c4a",
  color_line: "#d8d0bd",
  heading_font: "bigshoulders",
  body_font: "geist",
  hero_title_accent: "club",
  color_feature: "#29362a",
  marquee_text: "The Body Club / Lagree / Mouvement / Porto-Vecchio / Est. 2026",
  button_shape: "pill",
  logo_url: null,
  hero_image_url: null,
  hero_kicker: "Porto-Vecchio · Corse",
  hero_title: "The Body",
  hero_subtitle: "Bouger, se soigner, respirer. Réservez votre séance de Lagree en quelques secondes.",
  about_title: "Le studio",
  about_text: "",
  welcome_title: "Bienvenue au studio",
  method_title: "La méthode Lagree",
  method_text: "",
  opening_hours: "",
  access_info: "",
  address: "",
  contact_email: "",
  contact_phone: "",
  instagram_url: "",
};

export const HEADING_FONTS = { bigshoulders: "Big Shoulders Display", cormorant: "Cormorant Garamond", playfair: "Playfair Display", bodoni: "Bodoni Moda" } as const;
export const BODY_FONTS = { geist: "Geist", jost: "Jost", inter: "Inter", montserrat: "Montserrat" } as const;

/** Nom complet affiché (« The Body » + « club »). */
export const brandName = (a: Pick<Appearance, "hero_title" | "hero_title_accent">) =>
  [a.hero_title, a.hero_title_accent].filter(Boolean).join(" ");
export const BUTTON_SHAPES = { pill: "Arrondis (pilule)", rounded: "Légèrement arrondis", square: "Droits" } as const;

/** Lecture publique (clé anon, sans cookie) : la page reste rapide et cacheable. */
export async function getAppearance(): Promise<Appearance> {
  if (!publicEnv.supabaseUrl) return DEFAULT_APPEARANCE;
  try {
    const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
    const { data } = await supabase.from("site_appearance").select("*").single();
    return { ...DEFAULT_APPEARANCE, ...(data ?? {}) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);

/** Variables CSS du thème. Les couleurs sont revalidées (#RRGGBB) : aucune injection possible. */
export function themeCss(a: Appearance): string {
  const d = DEFAULT_APPEARANCE;
  const radius = { pill: "9999px", rounded: "0.75rem", square: "0" }[a.button_shape] ?? "9999px";
  const heading = { bigshoulders: "--font-bigshoulders", cormorant: "--font-cormorant", playfair: "--font-playfair", bodoni: "--font-bodoni" }[a.heading_font] ?? "--font-bigshoulders";
  const body = { geist: "--font-geist", jost: "--font-jost", inter: "--font-inter", montserrat: "--font-montserrat" }[a.body_font] ?? "--font-geist";
  // Titres condensés : capitales, interlignage serré ; titres à empattement : casse normale
  const condensed = a.heading_font === "bigshoulders";
  const headingStyle = condensed
    ? "--heading-transform:uppercase;--heading-weight:700;--heading-tracking:-0.015em;--heading-leading:0.88;"
    : "--heading-transform:none;--heading-weight:500;--heading-tracking:0.01em;--heading-leading:1.05;";
  return `:root{--ivory:${safe(a.color_background, d.color_background)};--sand:${safe(a.color_surface, d.color_surface)};--ink:${safe(a.color_text, d.color_text)};--muted:${safe(a.color_muted, d.color_muted)};--taupe:${safe(a.color_accent, d.color_accent)};--line:${safe(a.color_line, d.color_line)};--feature:${safe(a.color_feature, d.color_feature)};--btn-radius:${radius};--heading-font:var(${heading});--body-font:var(${body});${headingStyle}}`;
}
