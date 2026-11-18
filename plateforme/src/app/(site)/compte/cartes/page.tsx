import type { Metadata } from "next";
import Link from "next/link";
import { Display, Label, PriceRow, Section } from "@/components/site";
import { getProducts } from "@/lib/site";

export const metadata: Metadata = { title: "Acheter une carte", robots: { index: false } };

/** Achat de cartes. Le paiement en ligne Stripe est branché à l'étape suivante (lot 3). */
export default async function BuyPage() {
  const products = await getProducts();
  return (
    <main>
      <Section>
        <Link href="/compte" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-ink">← Mon compte</Link>
        <div className="mt-8 grid gap-12 md:grid-cols-[1fr_1.3fr]">
          <div>
            <Label n="03">Cartes & abonnement</Label>
            <Display as="h1" main="Votre" accent="rythme." className="mt-6" />
            <p className="mt-8 max-w-sm rounded-xl border border-line bg-sand p-5 text-sm leading-relaxed">
              Le paiement en ligne arrive très bientôt. En attendant, réglez votre carte au studio : elle est créditée sur votre compte immédiatement.
            </p>
          </div>
          <ul className="border-t border-ink">{products.map((p) => <PriceRow key={p.id} product={p} />)}</ul>
        </div>
      </Section>
    </main>
  );
}
