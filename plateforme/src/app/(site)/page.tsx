import Link from "next/link";
import { CoachCard, Display, Intensity, Label, Marquee, Pill, PriceRow, Section } from "@/components/site";
import { DISCIPLINE_ORDER, DISCIPLINES } from "@/lib/format";
import { cn } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";
import { formatShortDay, formatTime } from "@/lib/dates";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getClassTypes, getCoaches, getPhotos, getProducts, getSessions, mapsLink } from "@/lib/site";

export default async function Home() {
  const now = new Date();
  const anon = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
  const [a, photos, coaches, products, sessions, { data: classType }, types] = await Promise.all([
    getAppearance(), getPhotos(), getCoaches(), getProducts(),
    getSessions(now.toISOString(), new Date(now.getTime() + 7 * 864e5).toISOString()),
    anon.from("class_types").select("duration_minutes, default_capacity").eq("discipline", "lagree").eq("active", true).limit(1).maybeSingle(),
    getClassTypes(),
  ]);
  const practices = DISCIPLINE_ORDER.map((d) => ({ d, list: types.filter((t) => t.discipline === d) })).filter((p) => p.list.length);
  const heroImage = a.hero_image_url ?? photos[0]?.url ?? null;
  const gallery = photos.filter((p) => p.url !== heroImage).slice(0, 6);
  const next = sessions.filter((s) => s.status === "scheduled" && s.booked_count < s.capacity).slice(0, 4);

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Accueil ---------- */}
      <section className="relative isolate -mt-16 flex min-h-[100svh] items-center justify-center overflow-hidden bg-ink pt-16 text-center text-ivory">
        {heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-ink/55" />
          </>
        )}
        <div className="px-5">
          <Label light>{a.hero_kicker}</Label>
          <h1 className="mt-6 text-[5.5rem] sm:text-[11rem]">
            {a.hero_title.split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}
            {a.hero_title_accent && <span className="accent -mt-2 block text-[0.62em] leading-[0.9] text-sage">{a.hero_title_accent}</span>}
          </h1>
          <div className="mx-auto mt-8 h-px w-56 bg-ivory/40" />
          <p className="mx-auto mt-8 max-w-md text-[15px] leading-relaxed text-ivory/80">{a.hero_subtitle}</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Pill href="/planning" tone="light">Réserver une séance</Pill>
            <Pill href="/tarifs" tone="ghostLight" arrow={null}>Les tarifs</Pill>
          </div>
        </div>
        <Link href="#studio" className="absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-ivory/70">
          Entrer ↓
        </Link>
      </section>

      <Marquee text={a.marquee_text} />

      {/* ---------- Le studio ---------- */}
      <Section id="studio" className="grid items-end gap-12 scroll-mt-16 md:grid-cols-2 md:gap-16">
        <div>
          <Label n="01">{a.welcome_title}</Label>
          <Display main={a.about_title} accent={`à ${a.hero_kicker.split("·")[0].trim()}.`} className="mt-6" />
          <p className="mt-8 max-w-md whitespace-pre-line leading-relaxed text-muted">
            {a.about_text || "Un lieu pensé comme une maison, dédié au mouvement et au bien-être."}
          </p>
        </div>
        {gallery[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gallery[0].url} alt={gallery[0].alt} loading="lazy" className="aspect-[4/5] w-full rounded-xl object-cover" />
        ) : <div className="aspect-[4/5] w-full rounded-xl bg-sage" aria-hidden />}
      </Section>

      {/* ---------- Les pratiques ---------- */}
      {practices.length > 0 && (
        <Section className="pt-4 sm:pt-8">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <Label n="02">Mouvement</Label>
              <Display main={["Une", "Deux", "Trois"][practices.length - 1] ?? String(practices.length)} accent={practices.length > 1 ? "pratiques." : "pratique."} className="mt-6" />
            </div>
            <p className="leading-relaxed text-muted">
              Du Lagree intense au yoga doux, nos cours sont pensés comme une progression. Choisissez selon votre énergie du jour : nos coachs adaptent toujours.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink bg-ink md:grid-cols-3">
            {practices.map(({ d, list }, i) => (
              <Link key={d} href={`/cours#${d}`} className="group flex flex-col bg-ivory p-6 transition hover:bg-sand sm:p-8">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">0{i + 1}</span>
                <span className="mt-3 font-serif text-5xl font-bold uppercase leading-none">{DISCIPLINES[d].label}</span>
                <span className="mt-3 text-sm text-muted">{DISCIPLINES[d].tagline}</span>
                <ul className="mt-6 flex-1 border-t border-line">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm">
                      <span>{t.name}</span><Intensity value={t.intensity} />
                    </li>
                  ))}
                </ul>
                <span className="mt-6 font-mono text-[11px] uppercase tracking-[0.15em] transition group-hover:translate-x-1">Découvrir →</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ---------- La méthode ---------- */}
      {a.method_text && (
        <section className="border-y border-line bg-sand">
          <Section>
            <div className="grid gap-12 md:grid-cols-[1.2fr_1fr] md:items-end">
              <div>
                <Label n="03">Force lente, intensité totale</Label>
                <Display main={a.method_title} className="mt-6" />
              </div>
              <p className="leading-relaxed text-muted">{a.method_text}</p>
            </div>
            <dl className="mt-14 grid grid-cols-3 border-t border-ink">
              {[
                ["Durée", `${classType?.duration_minutes ?? 50} min`],
                ["Capacité", `${classType?.default_capacity ?? 8} places`],
                ["Niveaux", "3 niveaux"],
              ].map(([k, v]) => (
                <div key={k} className="border-r border-line pr-4 pt-5 last:border-r-0 [&:not(:first-child)]:pl-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{k}</dt>
                  <dd className="mt-2 font-serif text-2xl uppercase sm:text-4xl">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </section>
      )}

      {/* ---------- Galerie ---------- */}
      {gallery.length > 1 && (() => {
        const items = gallery.slice(1, 7);
        const mosaic = items.length === 3 || items.length === 5;
        const cols = mosaic ? (items.length === 3 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3")
          : items.length === 1 ? "" : items.length === 4 || items.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
        return (
          <Section className="py-16 sm:py-20">
            <div className={cn("grid gap-3", cols)}>
              {items.map((p, i) => {
                const big = mosaic && i === 0;
                return (
                  <figure key={p.id} className={cn(big && "row-span-2 flex flex-col")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.alt} loading="lazy"
                      className={cn("w-full rounded-xl object-cover", big ? "min-h-64 flex-1" : "aspect-[4/3]")} />
                    <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                      F-{String(i + 1).padStart(3, "0")}{p.alt && ` / ${p.alt}`}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </Section>
        );
      })()}

      {/* ---------- Réserver ---------- */}
      <Section className="pt-8 sm:pt-12">
        <div className="grid gap-12 md:grid-cols-2 md:items-end">
          <div>
            <Label n="04">Réservation · en direct</Label>
            <Display main="Réserver" accent="un cours." className="mt-6" />
          </div>
          <p className="leading-relaxed text-muted">
            Consultez le planning de la semaine et réservez votre place en deux gestes. Annulation gratuite jusqu&apos;à 12 h avant le cours.
          </p>
        </div>
        {next.length > 0 && (
          <ul className="mt-12 border-t border-ink">
            {next.map((s) => (
              <li key={s.id}>
                <Link href="/planning" className="group flex items-center gap-4 border-b border-line py-5">
                  <span className="w-28 font-mono text-xs uppercase tracking-[0.15em] text-muted sm:w-40">{formatShortDay(s.starts_at)}</span>
                  <span className="font-serif text-4xl font-bold">{formatTime(s.starts_at)}</span>
                  <span className="hidden flex-1 sm:block">{s.title}{s.teachers && <span className="text-muted"> · {s.teachers.display_name}</span>}</span>
                  <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
                    {s.capacity - s.booked_count} pl.
                  </span>
                  <span aria-hidden className="transition group-hover:translate-x-1">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pill href="/planning" className="mt-10">Tout le planning</Pill>
      </Section>

      {/* ---------- Coachs (section vert profond) ---------- */}
      {coaches.length > 0 && (
        <section className="bg-feature text-ivory">
          <Section>
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <Label n="05" light>L&apos;équipe</Label>
                <Display main="L'équipe" accent="qui vous suit." className="mt-6" accentClassName="text-sage" />
              </div>
              <Pill href="/coachs" tone="ghostLight">Toute l&apos;équipe</Pill>
            </div>
            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {coaches.slice(0, 3).map((c, i) => <CoachCard key={c.id} coach={c} index={i} dark />)}
            </div>
          </Section>
        </section>
      )}

      {/* ---------- Tarifs ---------- */}
      {products.length > 0 && (
        <Section>
          <div className="grid gap-12 md:grid-cols-[1fr_1.3fr]">
            <div>
              <Label n="06">Tarifs</Label>
              <Display main="Votre" accent="rythme." className="mt-6" />
              <p className="mt-8 max-w-sm leading-relaxed text-muted">
                Des cartes sans engagement, valables à partir de votre premier cours. Ou l&apos;illimité, pour venir aussi souvent que vous le voulez.
              </p>
              <Pill href="/tarifs" className="mt-10">Voir les tarifs</Pill>
            </div>
            <ul className="border-t border-ink">{products.map((p) => <PriceRow key={p.id} product={p} />)}</ul>
          </div>
        </Section>
      )}

      {/* ---------- Infos pratiques ---------- */}
      <section id="infos" className="scroll-mt-16 border-t border-line bg-sand">
        <Section>
          <Label n="07">Nous trouver</Label>
          <Display main="Infos" accent="pratiques." className="mt-6" />
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            <Info title="Adresse">
              {a.address ? (
                <>
                  <p className="whitespace-pre-line">{a.address}</p>
                  <Pill href={mapsLink(a.address)} tone="outline" arrow="↗" className="mt-5">Itinéraire</Pill>
                </>
              ) : <p className="text-muted">Bientôt communiquée.</p>}
            </Info>
            <Info title="Horaires"><p className="whitespace-pre-line">{a.opening_hours || "Selon le planning des cours."}</p></Info>
            <Info title="Accès">
              <p className="whitespace-pre-line">{a.access_info || "—"}</p>
            </Info>
          </div>
        </Section>
      </section>
    </main>
  );
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink pt-5 text-[15px] leading-relaxed">
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{title}</p>
      {children}
    </div>
  );
}
