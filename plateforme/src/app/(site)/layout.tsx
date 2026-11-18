import Link from "next/link";
import { Label, Wordmark, pillStyles } from "@/components/site";
import { cn } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";
import { mapsLink } from "@/lib/site";

const NAV = [
  { n: "01", href: "/planning", label: "Planning" },
  { n: "02", href: "/cours", label: "Cours" },
  { n: "03", href: "/coachs", label: "Coachs" },
  { n: "04", href: "/tarifs", label: "Tarifs" },
  { n: "05", href: "/#infos", label: "Le studio" },
];

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const a = await getAppearance();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-ivory/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Accueil"><Wordmark a={a} /></Link>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="group flex items-baseline gap-1.5 font-serif text-lg font-bold uppercase tracking-wide">
                <span className="font-mono text-[9px] font-normal text-muted">{n.n}</span>
                <span className="transition group-hover:text-taupe">{n.label}</span>
              </Link>
            ))}
            <Link href="/compte" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition hover:text-ink">Mon compte</Link>
            <Link href="/planning" className={cn(pillStyles.dark, "px-5 py-2.5")}>Réserver <span aria-hidden>↗</span></Link>
          </nav>
          {/* Menu mobile sans JavaScript */}
          <details className="group md:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-ink/20 [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <span className="flex w-4 flex-col gap-1.5">
                <span className="h-px bg-ink transition group-open:translate-y-[3.5px] group-open:rotate-45" />
                <span className="h-px bg-ink transition group-open:-translate-y-[3.5px] group-open:-rotate-45" />
              </span>
            </summary>
            <nav className="absolute inset-x-0 top-16 flex h-[calc(100svh-4rem)] flex-col bg-ivory px-5 pb-8 pt-4">
              {[...NAV, { n: "06", href: "/compte", label: "Mon compte" }].map((n) => (
                <Link key={n.href} href={n.href} className="flex items-baseline gap-3 border-b border-ink/10 py-4">
                  <span className="font-mono text-xs text-muted">{n.n}</span>
                  <span className="font-serif text-5xl font-bold uppercase leading-none">{n.label}</span>
                </Link>
              ))}
              <Link href="/planning" className={cn(pillStyles.dark, "mt-auto w-full py-4")}>Réserver un cours <span aria-hidden>↗</span></Link>
            </nav>
          </details>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="bg-ink text-ivory">
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-20 sm:px-8">
          <p className="font-serif text-7xl font-bold uppercase leading-[0.85] sm:text-9xl">
            Passez<br />quand <span className="accent text-sage">vous voulez.</span>
          </p>
          <div className="mt-16 grid gap-10 border-t border-ivory/15 pt-10 sm:grid-cols-3">
            <div className="text-sm leading-relaxed">
              <Label light className="mb-3">Adresse</Label>
              {a.address
                ? <a href={mapsLink(a.address)} target="_blank" rel="noopener" className="whitespace-pre-line hover:text-sage">{a.address}</a>
                : <p className="text-ivory/60">Bientôt communiquée</p>}
            </div>
            <div className="text-sm leading-relaxed">
              <Label light className="mb-3">Horaires</Label>
              <p className="whitespace-pre-line text-ivory/80">{a.opening_hours || "Selon le planning des cours"}</p>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <Label light className="mb-3">Contact</Label>
              {a.contact_phone && <a href={`tel:${a.contact_phone.replace(/\s/g, "")}`} className="hover:text-sage">{a.contact_phone}</a>}
              {a.contact_email && <a href={`mailto:${a.contact_email}`} className="hover:text-sage">{a.contact_email}</a>}
              {a.instagram_url && <a href={a.instagram_url} target="_blank" rel="noopener" className="hover:text-sage">Instagram ↗</a>}
            </div>
          </div>
          <div className="mt-16 flex flex-col justify-between gap-4 border-t border-ivory/15 pt-6 sm:flex-row sm:items-end">
            <Wordmark a={a} light className="[&>span:first-child]:text-5xl [&>span:last-child]:text-5xl" />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/50">
              © {new Date().getFullYear()} · {a.hero_kicker}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
