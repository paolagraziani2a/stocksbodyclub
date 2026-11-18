import Link from "next/link";
import { CoachCard, Kicker, ProductCard, Section } from "@/components/site";
import { buttonBase, buttonStyles, cn } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";
import { getCoaches, getPhotos, getProducts, mapsLink } from "@/lib/site";

export default async function Home() {
  const [a, photos, coaches, products] = await Promise.all([getAppearance(), getPhotos(), getCoaches(), getProducts()]);
  const heroImage = a.hero_image_url ?? photos[0]?.url ?? null;
  const gallery = photos.filter((p) => p.url !== heroImage).slice(0, 6);
  const featured = products.filter((p) => p.credits === 10 || p.is_unlimited).length >= 2
    ? products.filter((p) => p.credits === 1 || p.credits === 10 || p.is_unlimited)
    : products.slice(0, 3);

  return (
    <main className="flex flex-1 flex-col">
      {/* Accueil */}
      <section className="relative isolate flex min-h-[86svh] items-end overflow-hidden">
        {heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/70 via-ink/25 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sand via-ivory to-blush" />
        )}
        <div className={cn("mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24", heroImage && "text-ivory")}>
          <p className={cn("text-xs uppercase tracking-[0.3em]", heroImage ? "text-ivory/85" : "text-muted")}>{a.hero_kicker}</p>
          <h1 className="mt-5 max-w-3xl text-6xl leading-[0.95] sm:text-8xl">{a.hero_title}</h1>
          <p className={cn("mt-6 max-w-md text-lg font-light leading-relaxed", heroImage ? "text-ivory/85" : "text-muted")}>{a.hero_subtitle}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/planning" className={cn(heroImage ? `${buttonBase} bg-ivory text-ink hover:bg-sand` : buttonStyles.primary, "px-8 py-3.5")}>
              Réserver un cours
            </Link>
            <Link href="/tarifs" className={cn(heroImage ? `${buttonBase} border border-ivory/50 text-ivory hover:border-ivory` : buttonStyles.secondary, "px-8 py-3.5")}>
              Découvrir les cartes
            </Link>
          </div>
        </div>
      </section>

      {/* Le studio */}
      <Section className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
        <div>
          <Kicker>{a.welcome_title}</Kicker>
          <h2 className="mt-4 text-5xl leading-tight">{a.about_title}</h2>
          <p className="mt-8 whitespace-pre-line text-lg font-light leading-relaxed text-muted">
            {a.about_text || "Un studio intimiste dédié au Lagree, pensé pour que chaque cours soit un moment pour vous."}
          </p>
        </div>
        {gallery[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gallery[0].url} alt={gallery[0].alt} loading="lazy" className="aspect-[4/5] w-full rounded-2xl object-cover" />
        ) : <div className="aspect-[4/5] w-full rounded-2xl bg-gradient-to-b from-blush to-sand" aria-hidden />}
      </Section>

      {/* La méthode */}
      {a.method_text && (
        <section className="bg-sand/60">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
            <Kicker>Notre discipline</Kicker>
            <h2 className="mt-4 text-5xl">{a.method_title}</h2>
            <p className="mt-8 whitespace-pre-line text-lg font-light leading-relaxed text-muted">{a.method_text}</p>
          </div>
        </section>
      )}

      {/* Galerie */}
      {gallery.length > 1 && (
        <Section className="py-16 sm:py-20">
          {gallery.length > 3 ? (
            <div className="grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[240px] md:grid-cols-3">
              {gallery.slice(1).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={p.alt} loading="lazy"
                  className={cn("h-full w-full rounded-2xl object-cover", i === 0 && "row-span-2", i === 3 && "md:col-span-2")} />
              ))}
            </div>
          ) : (
            <div className={cn("grid gap-3", gallery.length === 3 ? "sm:grid-cols-2" : "")}>
              {gallery.slice(1).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={p.alt} loading="lazy" className="aspect-[3/2] w-full rounded-2xl object-cover" />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Les coachs */}
      {coaches.length > 0 && (
        <Section>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <Kicker>L&apos;équipe</Kicker>
              <h2 className="mt-4 text-5xl">Les coachs</h2>
            </div>
            <Link href="/coachs" className="text-sm text-muted underline decoration-line underline-offset-8 hover:text-ink">Toute l&apos;équipe</Link>
          </div>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.slice(0, 3).map((c) => <CoachCard key={c.id} coach={c} />)}
          </div>
        </Section>
      )}

      {/* Tarifs */}
      {featured.length > 0 && (
        <section className="bg-sand/60">
          <Section>
            <div className="text-center">
              <Kicker>Tarifs</Kicker>
              <h2 className="mt-4 text-5xl">Choisissez votre rythme</h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
              {featured.map((p) => <ProductCard key={p.id} product={p} highlight={p.is_unlimited} />)}
            </div>
            <p className="mt-8 text-center">
              <Link href="/tarifs" className="text-sm text-muted underline decoration-line underline-offset-8 hover:text-ink">Toutes les cartes</Link>
            </p>
          </Section>
        </section>
      )}

      {/* Infos pratiques */}
      <Section id="infos" className="scroll-mt-16">
        <Kicker>Nous trouver</Kicker>
        <h2 className="mt-4 text-5xl">Infos pratiques</h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          <Info title="Adresse">
            {a.address ? (
              <>
                <p className="whitespace-pre-line">{a.address}</p>
                <a href={mapsLink(a.address)} target="_blank" rel="noopener" className={cn(buttonStyles.secondary, "mt-5")}>Itinéraire ↗</a>
              </>
            ) : <p className="text-muted">Bientôt communiquée.</p>}
          </Info>
          <Info title="Horaires">
            <p className="whitespace-pre-line">{a.opening_hours || "Selon le planning des cours."}</p>
          </Info>
          <Info title="Accès & contact">
            {a.access_info && <p className="whitespace-pre-line">{a.access_info}</p>}
            <p className={cn("flex flex-col gap-1", a.access_info && "mt-4")}>
              {a.contact_phone && <a href={`tel:${a.contact_phone.replace(/\s/g, "")}`} className="hover:text-taupe-deep">{a.contact_phone}</a>}
              {a.contact_email && <a href={`mailto:${a.contact_email}`} className="hover:text-taupe-deep">{a.contact_email}</a>}
              {a.instagram_url && <a href={a.instagram_url} target="_blank" rel="noopener" className="hover:text-taupe-deep">Instagram ↗</a>}
            </p>
          </Info>
        </div>
      </Section>
    </main>
  );
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink pt-6 text-[15px] leading-relaxed">
      <h3 className="mb-4 font-sans text-xs uppercase tracking-[0.2em] text-muted">{title}</h3>
      {children}
    </div>
  );
}
