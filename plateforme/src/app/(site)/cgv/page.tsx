import type { Metadata } from "next";
import { getLegal, LegalPage } from "../legal";

export const metadata: Metadata = { title: "Conditions générales de vente" };
export const revalidate = 300;

export default async function CgvPage() {
  const l = await getLegal();
  return (
    <LegalPage n="00" main="Conditions" accent="générales.">
      <section><h2>Objet</h2>
        <p>Les présentes conditions régissent la vente de cartes de cours et d&apos;abonnements par {l.studio}, ainsi que la réservation des cours via ce site.</p></section>
      <section><h2>Cartes et abonnement</h2>
        <p>Une carte de cours donne droit au nombre de cours indiqué. Sa durée de validité démarre à la date de la première réservation effectuée avec cette carte. Les crédits non utilisés à l&apos;expiration sont perdus et ne sont pas remboursables.</p>
        <p className="mt-3">L&apos;abonnement illimité est valable un mois à compter du paiement. La séance d&apos;essai est limitée à une par personne.</p></section>
      <section><h2>Réservation et annulation</h2>
        <p>Toute réservation consomme un crédit. Une annulation effectuée au moins {l.cancelHours} heures avant le début du cours restitue le crédit. Passé ce délai, ou en cas d&apos;absence, le cours est dû.</p>
        <p className="mt-3">Abonnement illimité : au-delà de {l.lateLimit} annulations tardives consécutives, une réservation ne peut plus être annulée à moins de {l.cancelHours} heures du cours.</p>
        <p className="mt-3">Si le studio annule un cours, le crédit est restitué automatiquement et la cliente est prévenue par SMS.</p></section>
      <section><h2>Prix et paiement</h2>
        <p>Les prix sont indiqués en euros, toutes taxes comprises. Le paiement s&apos;effectue en ligne par carte bancaire (prestataire sécurisé Stripe) ou au studio. Une facture est émise pour chaque paiement.</p></section>
      <section><h2>Droit de rétractation</h2>
        <p>Conformément au Code de la consommation, la cliente dispose d&apos;un délai de 14 jours pour se rétracter d&apos;un achat en ligne, sauf si elle a demandé à bénéficier d&apos;un cours avant la fin de ce délai.</p></section>
      <section><h2>Contact</h2>
        <p>{l.studio}{l.address && <> — {l.address}</>}{l.email && <> — {l.email}</>}</p></section>
    </LegalPage>
  );
}
