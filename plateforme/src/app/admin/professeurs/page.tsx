import type { Metadata } from "next";
import Link from "next/link";
import { CoachPortrait } from "@/components/site";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { adminTx, requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { DISCIPLINE_ORDER, DISCIPLINES, type Discipline } from "@/lib/format";
import { formatEuros } from "@/lib/money";
import { createTeacher, setPayRule, setTeacherActive } from "./actions";

export const metadata: Metadata = { title: "Professeurs" };

type Rule = { mode: "percent" | "fixed_per_class" | "per_attendee" | "none"; percent: number | null; fixed_cents: number | null; per_attendee_cents: number | null; valid_from: string };
type Teacher = { id: string; display_name: string; headline: string; photo_url: string | null; active: boolean; disciplines: Discipline[]; teacher_pay_rules: Rule[] };

function describe(r?: Rule) {
  if (!r) return "Aucune règle";
  switch (r.mode) {
    case "percent": return `${Number(r.percent)} % de la valeur des cours`;
    case "fixed_per_class": return `${formatEuros(r.fixed_cents ?? 0)} par cours`;
    case "per_attendee": return `${formatEuros(r.per_attendee_cents ?? 0)} par élève`;
    default: return "Non rémunéré(e) — le studio garde 100 %";
  }
}

function ModeFields({ rule }: { rule?: Rule }) {
  const value = rule?.mode === "percent" ? Number(rule.percent)
    : rule?.mode === "fixed_per_class" ? (rule.fixed_cents ?? 0) / 100
    : rule?.mode === "per_attendee" ? (rule.per_attendee_cents ?? 0) / 100 : 40;
  return (
    <>
      <Field label="Mode de calcul">
        <Select name="mode" defaultValue={rule?.mode ?? "percent"}>
          <option value="percent">Pourcentage de la valeur des cours</option>
          <option value="fixed_per_class">Montant fixe par cours (€)</option>
          <option value="per_attendee">Montant par élève (€)</option>
          <option value="none">Pas de rémunération (ex. gérante)</option>
        </Select>
      </Field>
      <Field label="Valeur" hint="40 = 40 % ou 40 €, selon le mode">
        <Input type="number" name="value" step="0.01" min={0} defaultValue={value} />
      </Field>
    </>
  );
}

export default async function TeachersPage() {
  await requireAdmin();
  const { teachers, settings } = await adminTx(async (tx) => ({
    teachers: await tx.many<Teacher>(
      `select t.id, t.display_name, t.headline, t.photo_url, t.active, t.disciplines,
              coalesce((select json_agg(json_build_object('mode', r.mode, 'percent', r.percent, 'fixed_cents', r.fixed_cents,
                         'per_attendee_cents', r.per_attendee_cents, 'valid_from', r.valid_from))
                        from public.teacher_pay_rules r where r.teacher_id = t.id), '[]') as teacher_pay_rules
       from public.teachers t order by t.active desc, t.display_name`),
    settings: await tx.one<{ teacher_pay_base: string; late_cancel_counts_for_teacher: boolean }>(
      "select teacher_pay_base, late_cancel_counts_for_teacher from public.studio_settings"),
  }));

  return (
    <>
      <PageHeader
        title="Professeurs"
        subtitle={`Pourcentage calculé sur la valeur ${settings?.teacher_pay_base === "ttc" ? "TTC" : "HT"} des cours. Les cartes offertes comptent au prix public.`}
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          {(teachers ?? []).length === 0 && <Card><Empty>Aucun professeur pour l&apos;instant.</Empty></Card>}
          {(teachers ?? []).map((t) => {
            const rules = [...t.teacher_pay_rules].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
            const current = rules[0];
            return (
              <Card key={t.id} className={t.active ? "" : "opacity-60"}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <CoachPortrait coach={t} small className="h-14 w-14 shrink-0 rounded-full" />
                    <div>
                      <h2 className="text-2xl">{t.display_name}</h2>
                      <p className="mt-0.5 text-sm text-muted">{t.disciplines.map((d) => DISCIPLINES[d].label).join(" · ")} — {describe(current)}</p>
                      <Link href={`/admin/professeurs/${t.id}`} className="mt-1 inline-block text-sm text-taupe-deep underline decoration-line underline-offset-4">
                        {t.headline || t.photo_url ? "Modifier le profil public" : "Créer son profil public (photo, présentation)"}
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!t.active && <Badge>Inactif</Badge>}
                    <ActionForm action={setTeacherActive}>
                      <input type="hidden" name="teacher" value={t.id} />
                      <input type="hidden" name="active" value={String(!t.active)} />
                      <SubmitButton variant="ghost" className="px-3 py-1.5 text-xs">{t.active ? "Désactiver" : "Réactiver"}</SubmitButton>
                    </ActionForm>
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-taupe-deep">Modifier la rémunération</summary>
                  <ActionForm action={setPayRule} className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="teacher" value={t.id} />
                    <ModeFields rule={current} />
                    <SubmitButton>Enregistrer</SubmitButton>
                  </ActionForm>
                  {rules.length > 1 && (
                    <ul className="mt-4 text-xs text-muted">
                      {rules.slice(1).map((r) => <li key={r.valid_from}>Avant : {describe(r)} (depuis le {formatDate(r.valid_from)})</li>)}
                    </ul>
                  )}
                </details>
              </Card>
            );
          })}
        </div>

        <Card className="self-start">
          <h2 className="text-2xl">Ajouter un professeur</h2>
          <ActionForm action={createTeacher} className="mt-6 flex flex-col gap-4">
            <Field label="Nom affiché"><Input name="name" required maxLength={60} placeholder="Ex. Camille" /></Field>
            <Field label="Discipline" hint="D'autres disciplines peuvent être ajoutées dans son profil">
              <Select name="discipline" defaultValue="lagree">
                {DISCIPLINE_ORDER.map((d) => <option key={d} value={d}>{d === "lagree" ? "Coach Lagree" : d === "yoga" ? "Professeur de yoga" : "Professeur de Mat Pilates"}</option>)}
              </Select>
            </Field>
            <ModeFields />
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
          <p className="mt-6 text-xs leading-relaxed text-muted">
            Pour vous-même (Pao), choisissez « Pas de rémunération » : le studio garde 100 % de vos cours.
          </p>
        </Card>
      </div>
    </>
  );
}
