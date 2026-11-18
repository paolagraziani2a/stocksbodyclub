import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";

export default async function Home() {
  const a = await getAppearance();
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
        {a.hero_image_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.hero_image_url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-ivory/75" />
          </>
        )}
        {a.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.logo_url} alt={a.hero_title} className="mb-8 h-16 w-auto" />
        ) : null}
        <p className="text-xs uppercase tracking-[0.35em] text-muted">{a.hero_kicker}</p>
        <h1 className="mt-6 text-5xl sm:text-6xl">{a.hero_title}</h1>
        <p className="mt-6 max-w-sm font-light leading-relaxed text-muted">{a.hero_subtitle}</p>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link href="/planning" className={`${buttonStyles.primary} px-8 py-3`}>Voir le planning</Link>
          <Link href="/tarifs" className={`${buttonStyles.secondary} px-8 py-3`}>Les cartes</Link>
        </div>
      </section>

      {a.about_text && (
        <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
          <h2 className="text-3xl">{a.about_title}</h2>
          <p className="mt-6 whitespace-pre-line font-light leading-relaxed text-muted">{a.about_text}</p>
        </section>
      )}

      {(a.address || a.contact_email || a.contact_phone || a.instagram_url) && (
        <footer className="border-t border-line px-6 py-10 text-center text-sm text-muted">
          {a.address && <p>{a.address}</p>}
          <p className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1">
            {a.contact_phone && <a href={`tel:${a.contact_phone.replace(/\s/g, "")}`}>{a.contact_phone}</a>}
            {a.contact_email && <a href={`mailto:${a.contact_email}`}>{a.contact_email}</a>}
            {a.instagram_url && <a href={a.instagram_url} rel="noopener" target="_blank">Instagram</a>}
          </p>
        </footer>
      )}
    </main>
  );
}
