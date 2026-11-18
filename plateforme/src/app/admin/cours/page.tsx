import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { DISCIPLINE_ORDER, DISCIPLINES, LEVELS, type Discipline, type Level } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { saveClassType } from "./actions";

export const metadata: Metadata = { title: "Cours proposés" };

type ClassType = {
  id: string; name: string; description: string | null; discipline: Discipline; level: Level; intensity: number;
  duration_minutes: number; default_capacity: number; color: string; active: boolean; sort_order: number;
};

function Fields({ t }: { t?: ClassType }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Nom" className="sm:col-span-2"><Input name="name" defaultValue={t?.name} required maxLength={80} /></Field>
      <Field label="Discipline">
        <Select name="discipline" defaultValue={t?.discipline ?? "lagree"}>
          {DISCIPLINE_ORDER.map((d) => <option key={d} value={d}>{DISCIPLINES[d].label}</option>)}
        </Select>
      </Field>
      <Field label="Niveau">
        <Select name="level" defaultValue={t?.level ?? "tous"}>
          {(Object.keys(LEVELS) as Level[]).map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}
        </Select>
      </Field>
      <Field label="Intensité">
        <Select name="intensity" defaultValue={String(t?.intensity ?? 2)}>
          <option value="1">1 — doux</option><option value="2">2 — modéré</option><option value="3">3 — intense</option>
        </Select>
      </Field>
      <Field label="Durée (min)"><Input name="duration_minutes" type="number" min={10} max={240} defaultValue={t?.duration_minutes ?? 50} /></Field>
      <Field label="Places"><Input name="default_capacity" type="number" min={1} max={50} defaultValue={t?.default_capacity ?? 8} /></Field>
      <Field label="Couleur (planning)">
        <input type="color" name="color" defaultValue={t?.color ?? "#4b5c4a"} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white p-1" />
      </Field>
      <Field label="Description (site)" className="sm:col-span-2 lg:col-span-3">
        <Textarea name="description" defaultValue={t?.description ?? ""} maxLength={600} className="min-h-20" />
      </Field>
      <div className="flex flex-col gap-3">
        <Field label="Ordre"><Input name="sort_order" type="number" min={0} max={99} defaultValue={t?.sort_order ?? 0} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="h-4 w-4" /> Proposé</label>
      </div>
    </div>
  );
}

export default async function ClassTypesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("class_types").select("*").order("sort_order").order("name").returns<ClassType[]>();
  const list = data ?? [];

  return (
    <>
      <PageHeader title="Cours proposés" subtitle="Les cours affichés sur le site (page « Les cours ») et proposés à la création d'un créneau dans le planning." />
      {DISCIPLINE_ORDER.map((d) => {
        const items = list.filter((t) => t.discipline === d);
        if (!items.length) return null;
        return (
          <section key={d} className="mb-8">
            <h2 className="mb-3 text-lg text-muted">{DISCIPLINES[d].label}</h2>
            <div className="flex flex-col gap-3">
              {items.map((t) => (
                <Card key={t.id} data-type={t.name} className={t.active ? "" : "opacity-60"}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: t.color }} aria-hidden />
                    <h3 className="text-xl">{t.name}</h3>
                    <span className="text-sm text-muted">{LEVELS[t.level]} · intensité {t.intensity}/3 · {t.duration_minutes} min · {t.default_capacity} places</span>
                    {!t.active && <Badge>Masqué</Badge>}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-taupe-deep">Modifier</summary>
                    <ActionForm action={saveClassType} className="mt-4">
                      <Fields t={t} />
                      <SubmitButton className="mt-4">Enregistrer</SubmitButton>
                    </ActionForm>
                  </details>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      <Card>
        <h2 className="text-xl">Ajouter un cours</h2>
        <ActionForm action={saveClassType} className="mt-4">
          <Fields />
          <SubmitButton className="mt-4">Ajouter</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
