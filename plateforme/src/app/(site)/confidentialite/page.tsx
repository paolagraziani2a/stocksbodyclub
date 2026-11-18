import type { Metadata } from "next";
import { getLegal, LegalPage } from "../legal";

export const metadata: Metadata = { title: "Politique de confidentialité" };
export const revalidate = 300;

export default async function PrivacyPage() {
  const l = await getLegal();
  return (
    <LegalPage n="00" main="Vos" accent="données.">
      <section><h2>Responsable du traitement</h2>
        <p>{l.studio}{l.address && <>, {l.address}</>}. Contact : {l.email || "voir la page d'accueil"}.</p></section>
      <section><h2>Données collectées</h2>
        <p>Nom, prénom, email, téléphone, historique de réservations et d&apos;achats. Les données de carte bancaire sont traitées exclusivement par Stripe et ne sont jamais stockées par le studio. Les mots de passe sont chiffrés de façon irréversible : personne, pas même le studio, ne peut les lire.</p></section>
      <section><h2>Finalités</h2>
        <p>Gestion de votre compte, de vos réservations et de vos cartes ; facturation ; envoi de messages de service (confirmation, annulation de cours par SMS si vous l&apos;avez accepté). Aucune donnée n&apos;est vendue ni utilisée à des fins publicitaires.</p></section>
      <section><h2>Hébergement et durée de conservation</h2>
        <p>Les données sont hébergées dans l&apos;Union européenne. Elles sont conservées tant que votre compte est actif, puis 3 ans après votre dernière activité ; les factures sont conservées 10 ans (obligation légale).</p></section>
      <section><h2>Vos droits</h2>
        <p>Vous pouvez accéder à vos données, les rectifier, demander leur suppression ou leur portabilité, et vous opposer aux SMS à tout moment depuis votre compte ou en écrivant au studio. Vous pouvez également saisir la CNIL (cnil.fr).</p></section>
    </LegalPage>
  );
}
