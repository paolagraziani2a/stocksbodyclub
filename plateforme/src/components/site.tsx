import Link from "next/link";
import type { ReactNode } from "react";
import { formatEuros } from "@/lib/money";
import { type Coach, type Product, validityLabel } from "@/lib/site";
import { buttonBase, buttonStyles, cn } from "./ui";

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs uppercase tracking-[0.3em] text-muted", className)}>{children}</p>;
}

export function Section({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28", className)}>{children}</section>;
}

/** Portrait du coach ; sans photo, ses initiales sur un fond doux. */
export function CoachPortrait({
  coach, className, small = false,
}: { coach: Pick<Coach, "display_name" | "photo_url">; className?: string; small?: boolean }) {
  if (coach.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coach.photo_url} alt={coach.display_name} loading="lazy" className={cn("object-cover", className)} />;
  }
  const initials = coach.display_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn("flex items-center justify-center bg-blush font-serif text-taupe-deep", small ? "text-base" : "text-5xl", className)} aria-hidden>
      {initials}
    </div>
  );
}

export function CoachCard({ coach }: { coach: Coach }) {
  return (
    <Link href={`/coachs/${coach.slug}`} className="group block">
      <div className="overflow-hidden rounded-2xl">
        <CoachPortrait coach={coach} className="aspect-[4/5] w-full transition duration-700 group-hover:scale-[1.03]" />
      </div>
      <h3 className="mt-5 text-2xl">{coach.display_name}</h3>
      {coach.headline && <p className="mt-1 text-sm text-muted">{coach.headline}</p>}
      {coach.specialties.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {coach.specialties.slice(0, 3).map((s) => (
            <span key={s} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{s}</span>
          ))}
        </p>
      )}
    </Link>
  );
}

export function ProductCard({ product, highlight = false }: { product: Product; highlight?: boolean }) {
  const perClass = !product.is_unlimited && product.credits > 1 ? product.price_cents / product.credits : null;
  return (
    <div className={cn(
      "flex flex-col rounded-2xl border p-7",
      highlight ? "border-ink bg-ink text-ivory" : "border-line bg-white/60",
    )}>
      <p className={cn("text-xs uppercase tracking-[0.25em]", highlight ? "text-ivory/70" : "text-muted")}>
        {product.is_unlimited ? "Abonnement" : product.credits === 1 ? "À l'unité" : `${product.credits} cours`}
      </p>
      <h3 className="mt-3 text-3xl">{product.name}</h3>
      <p className="mt-6 font-serif text-5xl">{formatEuros(product.price_cents).replace(",00", "")}</p>
      <p className={cn("mt-2 text-sm", highlight ? "text-ivory/70" : "text-muted")}>
        {product.is_unlimited ? "Cours illimités pendant 1 mois" : perClass ? `soit ${formatEuros(perClass)} le cours` : "Un cours"}
      </p>
      <p className={cn("mt-6 flex-1 text-sm leading-relaxed", highlight ? "text-ivory/80" : "text-muted")}>
        {product.is_unlimited
          ? "Valable dès l'achat."
          : `Valable ${validityLabel(product)} à partir de votre premier cours.`}
      </p>
      <Link href={`/connexion?suite=/tarifs`}
        className={cn("mt-8", highlight ? `${buttonBase} bg-ivory text-ink hover:bg-sand` : buttonStyles.primary)}>
        Choisir
      </Link>
    </div>
  );
}
