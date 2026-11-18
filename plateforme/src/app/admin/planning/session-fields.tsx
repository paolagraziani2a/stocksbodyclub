"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { DISCIPLINE_ORDER, DISCIPLINES, type Discipline } from "@/lib/format";

export type TeacherOption = { id: string; display_name: string; disciplines: Discipline[] };
export type TypeOption = { id: string; name: string; discipline: Discipline; duration_minutes: number; default_capacity: number };

/**
 * Champs communs à la création et à la modification d'un cours.
 * Choisir un type de cours remplit automatiquement le nom, la durée et le nombre de places.
 */
export function SessionFields({
  teachers, types, defaults,
}: {
  teachers: TeacherOption[];
  types: TypeOption[];
  defaults: { typeId?: string | null; title?: string; date: string; start?: string; duration?: number; teacher?: string | null; capacity?: number; notes?: string | null };
}) {
  const initialType = types.find((t) => t.id === defaults.typeId) ?? (defaults.title ? undefined : types[0]);
  const [typeId, setTypeId] = useState(initialType?.id ?? "");
  const [title, setTitle] = useState(defaults.title ?? initialType?.name ?? "");
  const [duration, setDuration] = useState(defaults.duration ?? initialType?.duration_minutes ?? 50);
  const [capacity, setCapacity] = useState(defaults.capacity ?? initialType?.default_capacity ?? 8);
  const discipline = types.find((t) => t.id === typeId)?.discipline;

  const pickType = (id: string) => {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t) { setTitle(t.name); setDuration(t.duration_minutes); setCapacity(t.default_capacity); }
  };

  // Professeurs de la discipline du cours d'abord, puis les autres
  const sorted = [...teachers].sort((a, b) =>
    Number(!!discipline && b.disciplines.includes(discipline)) - Number(!!discipline && a.disciplines.includes(discipline)));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="class_type" value={typeId} />
      <Field label="Type de cours" className="sm:col-span-2">
        <Select value={typeId} onChange={(e) => pickType(e.target.value)}>
          <option value="">— Autre (nom libre) —</option>
          {DISCIPLINE_ORDER.map((d) => {
            const list = types.filter((t) => t.discipline === d);
            return list.length ? (
              <optgroup key={d} label={DISCIPLINES[d].label}>
                {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            ) : null;
          })}
        </Select>
      </Field>
      <Field label="Nom affiché" className="sm:col-span-2">
        <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
      </Field>
      <Field label="Date"><Input type="date" name="date" defaultValue={defaults.date} required /></Field>
      <Field label="Heure de début"><Input type="time" name="start" defaultValue={defaults.start ?? "09:00"} step={300} required /></Field>
      <Field label="Durée (minutes)">
        <Input type="number" name="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={10} max={240} required />
      </Field>
      <Field label="Places">
        <Input type="number" name="capacity" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} min={1} max={50} required />
      </Field>
      <Field label="Professeur" className="sm:col-span-2">
        <Select name="teacher" defaultValue={defaults.teacher ?? ""}>
          <option value="">— À définir —</option>
          {sorted.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name} ({t.disciplines.map((d) => DISCIPLINES[d].label).join(", ")})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note interne (facultatif)" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={defaults.notes ?? ""} maxLength={500} className="min-h-16" />
      </Field>
    </div>
  );
}
