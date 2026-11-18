import Link from "next/link";
import type { ReactNode } from "react";
import type { Appearance } from "@/lib/appearance";
import { formatEuros } from "@/lib/money";
import { DISCIPLINES, type Discipline, validityLabel } from "@/lib/format";
import type { Coach, Product } from "@/lib/site";
import { pillStyles } from "./pill";
import { cn } from "./ui";

/* ---------------------------------------------------------------------------
 * Briques de l'interface cliente, dans l'esprit du site du club :
 * étiquettes numérotées en chasse fixe, grands titres condensés + mot en italique,
 * boutons-pilules en capitales avec flèche, bandeau défilant.
 * ------------------------------------------------------------------------- */

/** Étiquette en chasse fixe : « 01 / LE STUDIO ». */
export function Label({ n, children, className, light = false }: { n?: string; children: ReactNode; className?: string; light?: boolean }) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.22em]", light ? "text-ivory/75" : "text-muted", className)}>
      {n && <span className="mr-2 opacity-60">{n} /</span>}
      {children}
    </p>
  );
}
/** Compatibilité : ancien nom. */
export const Kicker = Label;

/** Grand titre condensé, avec un mot d'accent en italique à la ligne. */
export function Display({
  main, accent, as: Tag = "h2", className, accentClassName,
}: { main: ReactNode; accent?: ReactNode; as?: "h1" | "h2" | "h3"; className?: string; accentClassName?: string }) {
  return (
    <Tag className={cn("text-6xl sm:text-8xl", className)}>
      <span className="block">{main}</span>
      {accent && <span className={cn("accent block text-[0.82em]", accentClassName ?? "text-taupe")}>{accent}</span>}
    </Tag>
  );
}

export function Section({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28", className)}>{children}</section>;
}

export { pillStyles } from "./pill";

export function Pill({ href, children, tone = "dark", className, arrow = "→" }: {
  href: string; children: ReactNode; tone?: keyof typeof pillStyles; className?: string; arrow?: string | null;
}) {
  const content = <>{children}{arrow && <span aria-hidden>{arrow}</span>}</>;
  return /^https?:\/\//.test(href)
    ? <a href={href} target="_blank" rel="noopener" className={cn(pillStyles[tone], className)}>{content}</a>
    : <Link href={href} className={cn(pillStyles[tone], className)}>{content}</Link>;
}

/** Bandeau défilant « THE BODY CLUB / LAGREE / … ». */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const items = text.split("/").map((t) => t.trim()).filter(Boolean);
  const row = (
    <div className="flex shrink-0 items-center gap-6 pr-6">
      {Array.from({ length: 4 }).flatMap((_, k) =>
        items.map((t, i) => (
          <span key={`${k}-${i}`} className="flex items-center gap-6">
            <span>{t}</span><span aria-hidden className="text-taupe">/</span>
          </span>
        )))}
    </div>
  );
  return (
    <div className={cn("overflow-hidden border-y border-ink bg-ink py-3 font-serif text-2xl uppercase tracking-wide text-ivory", className)}
      aria-label={items.join(", ")}>
      <div className="marquee-track flex w-max" aria-hidden>{row}{row}</div>
    </div>
  );
}

/** Portrait du coach ; sans photo, ses initiales sur un fond sauge. */
export function CoachPortrait({
  coach, className, small = false,
}: { coach: Pick<Coach, "display_name" | "photo_url">; className?: string; small?: boolean }) {
  if (coach.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coach.photo_url} alt={coach.display_name} loading="lazy" className={cn("object-cover", className)} />;
  }
  const initials = coach.display_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn("flex items-center justify-center bg-sage font-serif text-ivory", small ? "text-lg" : "text-7xl", className)} aria-hidden>
      {initials}
    </div>
  );
}

export function CoachCard({ coach, index, dark = false }: { coach: Coach; index?: number; dark?: boolean }) {
  return (
    <Link href={`/coachs/${coach.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-xl">
        <CoachPortrait coach={coach} className="aspect-[4/5] w-full transition duration-700 group-hover:scale-[1.03]" />
        {index !== undefined && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-ivory">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <h3 className="text-4xl">{coach.display_name}</h3>
        <span aria-hidden className={cn("pb-1 transition group-hover:translate-x-1", dark ? "text-ivory/70" : "text-muted")}>→</span>
      </div>
      {coach.headline && <p className={cn("mt-1 text-sm", dark ? "text-ivory/70" : "text-muted")}>{coach.headline}</p>}
      {coach.disciplines?.length > 1 && (
        <p className="mt-2 flex flex-wrap gap-1.5">{coach.disciplines.map((d) => <DisciplineTag key={d} d={d} light={dark} />)}</p>
      )}
      {coach.specialties.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {coach.specialties.slice(0, 3).map((s) => (
            <span key={s} className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]",
              dark ? "border-ivory/25 text-ivory/80" : "border-line text-muted")}>{s}</span>
          ))}
        </p>
      )}
    </Link>
  );
}

/** Ligne de tarif, comme une carte de restaurant : nom ……… prix. */
export function PriceRow({ product }: { product: Product }) {
  const perClass = !product.is_unlimited && product.credits > 1 ? product.price_cents / product.credits : null;
  return (
    <li className="flex items-baseline gap-4 border-b border-line py-4">
      <div className="min-w-0">
        <p className="text-[15px]">{product.name}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {product.is_unlimited ? "1 mois · dès l'achat" : `${validityLabel(product)} · dès le 1er cours`}
          {perClass ? ` · ${formatEuros(perClass).replace(",00", "")} le cours` : ""}
        </p>
      </div>
      <span className="flex-1 translate-y-[-4px] border-b border-dotted border-ink/30" aria-hidden />
      <span className="font-serif text-3xl">{formatEuros(product.price_cents).replace(",00", "")}</span>
    </li>
  );
}

/** Carte produit (page Tarifs). */
export function ProductCard({ product, highlight = false }: { product: Product; highlight?: boolean }) {
  const perClass = !product.is_unlimited && product.credits > 1 ? product.price_cents / product.credits : null;
  return (
    <div className={cn("flex flex-col rounded-2xl border p-7", highlight ? "border-feature bg-feature text-ivory" : "border-line bg-sand")}>
      <Label className={highlight ? "text-ivory/70" : ""}>
        {product.is_unlimited ? "Abonnement" : product.max_per_client ? "Découverte" : product.credits === 1 ? "À l'unité" : `${product.credits} cours`}
      </Label>
      <h3 className="mt-4 text-4xl">{product.name}</h3>
      <p className="mt-6 font-serif text-7xl leading-none">{formatEuros(product.price_cents).replace(",00", "")}</p>
      <p className={cn("mt-3 text-sm", highlight ? "text-ivory/75" : "text-muted")}>
        {product.is_unlimited ? "Cours illimités pendant 1 mois" : perClass ? `soit ${formatEuros(perClass)} le cours` : product.max_per_client ? "Une seule fois par personne" : "Un cours"}
      </p>
      <p className={cn("mt-6 flex-1 text-sm leading-relaxed", highlight ? "text-ivory/75" : "text-muted")}>
        {product.is_unlimited ? "Valable dès l'achat." : `Valable ${validityLabel(product)} à partir de votre premier cours.`}
      </p>
      <Link href="/compte/cartes" className={cn("mt-8", highlight ? pillStyles.light : pillStyles.dark)}>
        Choisir <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/** Logotype texte « THE BODY club » (ou le logo envoyé dans l'admin). */
export function Wordmark({ a, className, light = false }: { a: Appearance; className?: string; light?: boolean }) {
  if (a.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.logo_url} alt={`${a.hero_title} ${a.hero_title_accent}`} className={cn("h-9 w-auto", className)} />;
  }
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 leading-none", className)}>
      <span className="font-serif text-2xl font-bold uppercase tracking-tight">{a.hero_title}</span>
      {a.hero_title_accent && <span className={cn("accent text-2xl", light ? "text-sage" : "text-taupe")}>{a.hero_title_accent}</span>}
    </span>
  );
}


/** Intensité d'un cours : 1 à 3 « piments » (comme sur le site du club). */
export function Intensity({ value, light = false }: { value: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Intensité ${value}/3`} aria-label={`Intensité ${value} sur 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("h-2.5 w-1.5 rounded-full", i <= value ? (light ? "bg-ivory" : "bg-ink") : light ? "bg-ivory/25" : "bg-ink/15")} />
      ))}
    </span>
  );
}

/** Étiquette de discipline (Lagree / Yoga / Mat Pilates). */
export function DisciplineTag({ d, light = false }: { d: Discipline; light?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]",
      light ? "border-ivory/30 text-ivory/80" : "border-ink/20 text-muted")}>
      {DISCIPLINES[d].label}
    </span>
  );
}
