import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";
import { mapsLink } from "@/lib/site";

const NAV = [
  { href: "/planning", label: "Planning" },
  { href: "/coachs", label: "Les coachs" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/#infos", label: "Le studio" },
];

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const a = await getAppearance();
  const brand = a.logo_url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={a.logo_url} alt={a.hero_title} className="h-9 w-auto" />
    : <span className="font-serif text-2xl tracking-wide">{a.hero_title}</span>;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Accueil">{brand}</Link>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="text-muted transition hover:text-ink">{n.label}</Link>)}
            <Link href="/connexion" className="text-muted transition hover:text-ink">Mon compte</Link>
            <Link href="/planning" className={`${buttonStyles.primary} px-5 py-2`}>Réserver</Link>
          </nav>
          {/* Menu mobile sans JavaScript */}
          <details className="group md:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-sand [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <span className="flex w-5 flex-col gap-1.5">
                <span className="h-px bg-ink transition group-open:translate-y-[3.5px] group-open:rotate-45" />
                <span className="h-px bg-ink transition group-open:-translate-y-[3.5px] group-open:-rotate-45" />
              </span>
            </summary>
            <nav className="absolute inset-x-0 top-16 flex flex-col border-b border-line bg-ivory px-5 pb-6 pt-2 shadow-sm">
              {[...NAV, { href: "/connexion", label: "Mon compte" }].map((n) => (
                <Link key={n.href} href={n.href} className="border-b border-line py-4 font-serif text-2xl">{n.label}</Link>
              ))}
              <Link href="/planning" className={`${buttonStyles.primary} mt-6 py-3`}>Réserver un cours</Link>
            </nav>
          </details>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="border-t border-line bg-sand/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-serif text-3xl">{a.hero_title}</p>
            <p className="mt-2 text-sm text-muted">{a.hero_kicker}</p>
          </div>
          <div className="text-sm leading-relaxed">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Le studio</p>
            {a.address ? (
              <a href={mapsLink(a.address)} target="_blank" rel="noopener" className="whitespace-pre-line hover:text-taupe-deep">{a.address}</a>
            ) : <p className="text-muted">Adresse à venir</p>}
            {a.opening_hours && <p className="mt-3 whitespace-pre-line text-muted">{a.opening_hours}</p>}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Contact</p>
            {a.contact_phone && <a href={`tel:${a.contact_phone.replace(/\s/g, "")}`} className="hover:text-taupe-deep">{a.contact_phone}</a>}
            {a.contact_email && <a href={`mailto:${a.contact_email}`} className="hover:text-taupe-deep">{a.contact_email}</a>}
            {a.instagram_url && <a href={a.instagram_url} target="_blank" rel="noopener" className="hover:text-taupe-deep">Instagram</a>}
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted sm:px-8">
            © {new Date().getFullYear()} {a.hero_title}
          </p>
        </div>
      </footer>
    </>
  );
}
