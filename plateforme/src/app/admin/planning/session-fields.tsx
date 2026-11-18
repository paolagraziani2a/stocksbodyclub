import { Field, Input, Select, Textarea } from "@/components/ui";

export type TeacherOption = { id: string; display_name: string };

/** Champs communs à la création et à la modification d'un cours. */
export function SessionFields({
  teachers,
  defaults,
}: {
  teachers: TeacherOption[];
  defaults: { title?: string; date: string; start?: string; duration?: number; teacher?: string | null; capacity?: number; notes?: string | null };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Cours" className="sm:col-span-2">
        <Input name="title" defaultValue={defaults.title ?? "Lagree"} required maxLength={80} />
      </Field>
      <Field label="Date"><Input type="date" name="date" defaultValue={defaults.date} required /></Field>
      <Field label="Heure de début"><Input type="time" name="start" defaultValue={defaults.start ?? "09:00"} step={300} required /></Field>
      <Field label="Durée (minutes)"><Input type="number" name="duration" defaultValue={defaults.duration ?? 50} min={10} max={240} required /></Field>
      <Field label="Places"><Input type="number" name="capacity" defaultValue={defaults.capacity ?? 8} min={1} max={50} required /></Field>
      <Field label="Professeur" className="sm:col-span-2">
        <Select name="teacher" defaultValue={defaults.teacher ?? ""}>
          <option value="">— À définir —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </Select>
      </Field>
      <Field label="Note interne (facultatif)" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={defaults.notes ?? ""} maxLength={500} className="min-h-16" />
      </Field>
    </div>
  );
}
