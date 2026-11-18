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
  heading_font: "cormorant" | "playfair" | "bodoni";
  body_font: "jost" | "inter" | "montserrat";
  button_shape: "pill" | "rounded" | "square";
  logo_url: string | null;
  hero_image_url: string | null;
  hero_kicker: string;
  hero_title: string;
  hero_subtitle: string;
  about_title: string;
  about_text: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  instagram_url: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  color_background: "#faf7f2",
  color_surface: "#f1ebe3",
  color_text: "#2a2421",
  color_muted: "#7b716b",
  color_accent: "#9c7f70",
  color_line: "#e4dcd2",
  heading_font: "cormorant",
  body_font: "jost",
  button_shape: "pill",
  logo_url: null,
  hero_image_url: null,
  hero_kicker: "Studio de Lagree",
  hero_title: "The Body Club",
  hero_subtitle: "Réservez votre prochain cours en quelques secondes.",
  about_title: "Le studio",
  about_text: "",
  address: "",
  contact_email: "",
  contact_phone: "",
  instagram_url: "",
};

export const HEADING_FONTS = { cormorant: "Cormorant Garamond", playfair: "Playfair Display", bodoni: "Bodoni Moda" } as const;
export const BODY_FONTS = { jost: "Jost", inter: "Inter", montserrat: "Montserrat" } as const;
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
  const heading = { cormorant: "--font-cormorant", playfair: "--font-playfair", bodoni: "--font-bodoni" }[a.heading_font] ?? "--font-cormorant";
  const body = { jost: "--font-jost", inter: "--font-inter", montserrat: "--font-montserrat" }[a.body_font] ?? "--font-jost";
  return `:root{--ivory:${safe(a.color_background, d.color_background)};--sand:${safe(a.color_surface, d.color_surface)};--ink:${safe(a.color_text, d.color_text)};--muted:${safe(a.color_muted, d.color_muted)};--taupe:${safe(a.color_accent, d.color_accent)};--line:${safe(a.color_line, d.color_line)};--btn-radius:${radius};--heading-font:var(${heading});--body-font:var(${body});}`;
}
