"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { Appearance } from "@/lib/appearance";
import { saveAppearance } from "./actions";

const COLORS: { key: keyof Appearance; label: string }[] = [
  { key: "color_background", label: "Fond" },
  { key: "color_surface", label: "Fond secondaire" },
  { key: "color_text", label: "Texte" },
  { key: "color_muted", label: "Texte discret" },
  { key: "color_accent", label: "Accent" },
  { key: "color_line", label: "Bordures" },
];

const PRESETS: { name: string; colors: Partial<Appearance> }[] = [
  { name: "Sable (par défaut)", colors: { color_background: "#faf7f2", color_surface: "#f1ebe3", color_text: "#2a2421", color_muted: "#7b716b", color_accent: "#9c7f70", color_line: "#e4dcd2" } },
  { name: "Rose poudré", colors: { color_background: "#fbf6f4", color_surface: "#f4e7e3", color_text: "#2e2426", color_muted: "#80706f", color_accent: "#b98a86", color_line: "#ecdcd8" } },
  { name: "Sauge", colors: { color_background: "#f7f7f2", color_surface: "#e9ece2", color_text: "#232823", color_muted: "#6f766c", color_accent: "#7d8b74", color_line: "#dde1d5" } },
  { name: "Noir & or", colors: { color_background: "#fbfaf8", color_surface: "#efece6", color_text: "#151413", color_muted: "#6e6a64", color_accent: "#a8875a", color_line: "#e2ddd4" } },
];

const HEADING_CSS = { cormorant: "var(--font-cormorant)", playfair: "var(--font-playfair)", bodoni: "var(--font-bodoni)" };
const BODY_CSS = { jost: "var(--font-jost)", inter: "var(--font-inter)", montserrat: "var(--font-montserrat)" };
const RADIUS = { pill: "9999px", rounded: "0.75rem", square: "0" };

export function AppearanceEditor({ initial }: { initial: Appearance }) {
  const [a, setA] = useState(initial);
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setA((p) => ({ ...p, [k]: v }));

  return (
    <ActionForm action={saveAppearance} className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="text-2xl">Couleurs</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => setA((prev) => ({ ...prev, ...p.colors }))}
                className="btn flex items-center gap-2 border border-line bg-white px-3 py-1.5 text-xs hover:border-taupe">
                <span className="flex">
                  {[p.colors.color_background, p.colors.color_accent, p.colors.color_text].map((c) => (
                    <span key={c} className="-ml-1 h-4 w-4 rounded-full border border-white first:ml-0" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {COLORS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={label} value={a[key] as string} onChange={(e) => set(key, e.target.value as never)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" />
                  <Input name={key} value={a[key] as string} onChange={(e) => set(key, e.target.value as never)}
                    pattern="^#[0-9a-fA-F]{6}$" className="font-mono text-xs" />
                </div>
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-2xl">Typographie et boutons</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Field label="Titres">
              <Select name="heading_font" value={a.heading_font} onChange={(e) => set("heading_font", e.target.value as Appearance["heading_font"])}>
                <option value="cormorant">Cormorant Garamond</option>
                <option value="playfair">Playfair Display</option>
                <option value="bodoni">Bodoni Moda</option>
              </Select>
            </Field>
            <Field label="Texte">
              <Select name="body_font" value={a.body_font} onChange={(e) => set("body_font", e.target.value as Appearance["body_font"])}>
                <option value="jost">Jost</option>
                <option value="inter">Inter</option>
                <option value="montserrat">Montserrat</option>
              </Select>
            </Field>
            <Field label="Boutons">
              <Select name="button_shape" value={a.button_shape} onChange={(e) => set("button_shape", e.target.value as Appearance["button_shape"])}>
                <option value="pill">Arrondis</option>
                <option value="rounded">Légèrement arrondis</option>
                <option value="square">Droits</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="text-2xl">Page d&apos;accueil</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Sur-titre"><Input name="hero_kicker" value={a.hero_kicker} onChange={(e) => set("hero_kicker", e.target.value)} maxLength={60} /></Field>
            <Field label="Titre"><Input name="hero_title" value={a.hero_title} onChange={(e) => set("hero_title", e.target.value)} required maxLength={80} /></Field>
            <Field label="Phrase d'accroche" className="sm:col-span-2">
              <Input name="hero_subtitle" value={a.hero_subtitle} onChange={(e) => set("hero_subtitle", e.target.value)} maxLength={200} />
            </Field>
            <Field label="Titre de présentation"><Input name="about_title" defaultValue={a.about_title} maxLength={80} /></Field>
            <Field label="Texte de présentation" className="sm:col-span-2">
              <Textarea name="about_text" defaultValue={a.about_text} maxLength={2000} />
            </Field>
            <ImageField name="logo" label="Logo" url={a.logo_url} />
            <ImageField name="hero_image" label="Photo d'accueil" url={a.hero_image_url} />
          </div>
        </Card>

        <Card>
          <h2 className="text-2xl">Coordonnées</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Adresse" className="sm:col-span-2"><Input name="address" defaultValue={a.address} maxLength={200} /></Field>
            <Field label="Email"><Input type="email" name="contact_email" defaultValue={a.contact_email} /></Field>
            <Field label="Téléphone"><Input name="contact_phone" defaultValue={a.contact_phone} maxLength={30} /></Field>
            <Field label="Instagram" className="sm:col-span-2"><Input type="url" name="instagram_url" defaultValue={a.instagram_url} placeholder="https://instagram.com/…" /></Field>
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <p className="mb-3 text-xs uppercase tracking-[0.15em] text-muted">Aperçu</p>
        <div
          className="overflow-hidden rounded-2xl border px-6 py-14 text-center"
          style={{ background: a.color_background, color: a.color_text, borderColor: a.color_line, fontFamily: BODY_CSS[a.body_font] }}
        >
          <p className="text-[10px] uppercase tracking-[0.35em]" style={{ color: a.color_muted }}>{a.hero_kicker}</p>
          <p className="mt-4 text-4xl" style={{ fontFamily: HEADING_CSS[a.heading_font] }}>{a.hero_title}</p>
          <p className="mx-auto mt-4 max-w-xs text-sm font-light" style={{ color: a.color_muted }}>{a.hero_subtitle}</p>
          <div className="mt-8 flex justify-center gap-2 text-xs">
            <span className="px-5 py-2.5" style={{ background: a.color_text, color: a.color_background, borderRadius: RADIUS[a.button_shape] }}>Voir le planning</span>
            <span className="border px-5 py-2.5" style={{ borderColor: a.color_line, borderRadius: RADIUS[a.button_shape] }}>Les cartes</span>
          </div>
          <div className="mx-auto mt-8 max-w-[220px] rounded-xl border p-3 text-left text-xs"
            style={{ background: a.color_surface, borderColor: a.color_line }}>
            <div className="flex justify-between"><span className="font-medium">09h00</span><span style={{ color: a.color_accent }}>3 places</span></div>
            <div className="mt-1">Lagree</div>
            <div style={{ color: a.color_muted }}>avec Camille</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SubmitButton>Publier sur le site</SubmitButton>
          <a href="/" target="_blank" className="text-sm text-muted hover:text-ink">Voir le site ↗</a>
        </div>
      </div>
    </ActionForm>
  );
}

function ImageField({ name, label, url }: { name: string; label: string; url: string | null }) {
  return (
    <Field label={label} hint="JPG, PNG ou WebP, 5 Mo maximum">
      {url && (
        <span className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-12 w-auto rounded-lg border border-line object-cover" />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name={`${name}_remove`} /> Retirer
          </label>
        </span>
      )}
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp"
        className="text-xs file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs" />
    </Field>
  );
}
