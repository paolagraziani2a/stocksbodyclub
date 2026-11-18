import type { Metadata } from "next";
import { Kicker, ProductCard, Section } from "@/components/site";
import { getProducts } from "@/lib/site";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

// Régénérée au plus toutes les 60 s (et immédiatement après une modification depuis l'admin)
export const revalidate = 60;

export const metadata: Metadata = { title: "Tarifs", description: "Cartes de cours et abonnement illimité." };

export default async function PricesPage() {
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
  const [products, { data: rules }] = await Promise.all([
    getProducts(),
    supabase.from("studio_settings").select("cancel_window_hours, unlimited_late_cancel_limit").single(),
  ]);
  const hours = rules?.cancel_window_hours ?? 12;

  return (
    <main>
      <Section className="pb-10 text-center sm:pb-14">
        <Kicker>Tarifs</Kicker>
        <h1 className="mt-4 text-6xl sm:text-7xl">Choisissez votre rythme</h1>
        <p className="mx-auto mt-6 max-w-lg text-lg font-light leading-relaxed text-muted">
          Des cartes sans engagement, valables à partir de votre premier cours, ou l&apos;illimité pour venir aussi souvent que vous le souhaitez.
        </p>
      </Section>
      <Section className="pt-0 sm:pt-0">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => <ProductCard key={p.id} product={p} highlight={p.is_unlimited} />)}
        </div>
      </Section>
      <section className="bg-sand/60">
        <Section className="grid gap-10 md:grid-cols-3">
          <Rule title="Validité">
            La durée de validité d&apos;une carte démarre le jour de votre première réservation, pas le jour de l&apos;achat.
          </Rule>
          <Rule title="Annulation">
            Annulation gratuite jusqu&apos;à {hours} h avant le cours : votre crédit vous est rendu. Au-delà, le cours est dû.
          </Rule>
          <Rule title="Illimité">
            Cours illimités pendant 1 mois à compter de l&apos;achat. Au-delà de {rules?.unlimited_late_cancel_limit ?? 2} annulations
            tardives d&apos;affilée, une réservation ne peut plus être annulée à moins de {hours} h.
          </Rule>
        </Section>
      </section>
    </main>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink pt-6">
      <h2 className="text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
