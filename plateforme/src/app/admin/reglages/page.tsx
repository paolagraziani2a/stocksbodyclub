import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { adminTx, requireAdmin } from "@/lib/auth";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "Réglages" };

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 accent-[var(--ink)]" />
      <span>{label}</span>
    </label>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const s = await adminTx((tx) => tx.one<{
    studio_name: string; legal_name: string; legal_form: string; legal_address: string; siret: string; vat_number: string;
    invoice_footer: string; vat_rate: number; cancel_window_hours: number; booking_horizon_days: number;
    unlimited_late_cancel_limit: number; waitlist_enabled: boolean; teacher_pay_base: string;
    late_cancel_counts_for_teacher: boolean; no_show_counts_for_teacher: boolean;
  }>("select * from public.studio_settings"));
  if (!s) return null;
  const missingLegal = !s.siret || !s.legal_address;

  return (
    <>
      <PageHeader title="Réglages" subtitle="Règles du studio et mentions obligatoires des factures." />
      <ActionForm action={saveSettings} className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-2xl">Factures</h2>
          {missingLegal && (
            <p className="mt-3 rounded-xl bg-blush/60 px-4 py-3 text-sm">
              À compléter avant la mise en ligne : une facture doit mentionner l&apos;adresse et le SIRET du studio.
            </p>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Nom commercial"><Input name="studio_name" defaultValue={s.studio_name} required /></Field>
            <Field label="Raison sociale"><Input name="legal_name" defaultValue={s.legal_name} required /></Field>
            <Field label="Forme juridique et capital" hint="Ex. SAS au capital de 1 000 €"><Input name="legal_form" defaultValue={s.legal_form} /></Field>
            <Field label="SIRET"><Input name="siret" defaultValue={s.siret} inputMode="numeric" /></Field>
            <Field label="Adresse du siège" className="sm:col-span-2"><Textarea name="legal_address" defaultValue={s.legal_address} className="min-h-16" /></Field>
            <Field label="N° TVA intracommunautaire"><Input name="vat_number" defaultValue={s.vat_number} /></Field>
            <Field label="Taux de TVA (%)"><Input type="number" step="0.1" name="vat_rate" defaultValue={Number(s.vat_rate)} /></Field>
            <Field label="Pied de facture" className="sm:col-span-2"><Textarea name="invoice_footer" defaultValue={s.invoice_footer} className="min-h-16" /></Field>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-2xl">Réservations</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Annulation gratuite jusqu'à (heures avant)"><Input type="number" name="cancel_window_hours" defaultValue={s.cancel_window_hours} min={0} max={168} /></Field>
              <Field label="Réservation ouverte (jours à l'avance)"><Input type="number" name="booking_horizon_days" defaultValue={s.booking_horizon_days} min={1} max={365} /></Field>
              <Field label="Illimité : annulations tardives d'affilée autorisées" className="sm:col-span-2">
                <Input type="number" name="unlimited_late_cancel_limit" defaultValue={s.unlimited_late_cancel_limit} min={0} max={20} />
              </Field>
            </div>
            <div className="mt-5"><Check name="waitlist_enabled" label="Liste d'attente activée" checked={s.waitlist_enabled} /></div>
          </Card>

          <Card>
            <h2 className="text-2xl">Rémunération des professeurs</h2>
            <div className="mt-6 flex flex-col gap-4">
              <Field label="Le pourcentage s'applique au prix">
                <Select name="teacher_pay_base" defaultValue={s.teacher_pay_base}>
                  <option value="ht">HT (hors TVA) — recommandé</option>
                  <option value="ttc">TTC (TVA comprise)</option>
                </Select>
              </Field>
              <Check name="late_cancel_counts_for_teacher" label="Une annulation tardive est rémunérée au professeur" checked={s.late_cancel_counts_for_teacher} />
              <Check name="no_show_counts_for_teacher" label="Une absence (non venue) est rémunérée au professeur" checked={s.no_show_counts_for_teacher} />
            </div>
          </Card>
          <SubmitButton className="self-start">Enregistrer les réglages</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
