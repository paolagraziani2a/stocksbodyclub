import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CoachPortrait } from "@/components/site";
import { Card, Field, Input, PageHeader, Textarea, buttonStyles } from "@/components/ui";
import { adminTx, requireAdmin } from "@/lib/auth";
import { DISCIPLINE_ORDER, DISCIPLINES } from "@/lib/format";
import { saveTeacherProfile } from "./actions";

export const metadata: Metadata = { title: "Profil du coach" };

export default async function TeacherProfilePage({ params }: PageProps<"/admin/professeurs/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await adminTx((tx) => tx.one<{
    id: string; slug: string; display_name: string; headline: string; quote: string; bio: string | null; photo_url: string | null;
    specialties: string[]; certifications: string; instagram_url: string; show_on_site: boolean; sort_order: number;
    active: boolean; disciplines: string[];
  }>(
    `select id, slug, display_name, headline, quote, bio, photo_url, specialties, certifications, instagram_url,
            show_on_site, sort_order, active, disciplines from public.teachers where id = $1`, [id]));
  if (!t) notFound();

  return (
    <>
      <Link href="/admin/professeurs" className="text-sm text-muted hover:text-ink">← Professeurs</Link>
      <PageHeader
        title={t.display_name}
        subtitle="Profil affiché sur la page « Les coachs » du site."
        actions={<a href={`/coachs/${t.slug}`} target="_blank" className={buttonStyles.secondary}>Voir la page ↗</a>}
      />

      <ActionForm action={saveTeacherProfile} className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <input type="hidden" name="id" value={t.id} />
        <Card className="self-start">
          <div className="overflow-hidden rounded-2xl">
            <CoachPortrait coach={t} className="aspect-[4/5] w-full" />
          </div>
          <Field label="Photo" hint="Portrait vertical de préférence. JPG, PNG ou WebP, 5 Mo max." className="mt-5">
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"
              className="text-xs file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs" />
          </Field>
          {t.photo_url && (
            <label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="photo_remove" /> Retirer la photo</label>
          )}
          <label className="mt-6 flex items-center gap-3 text-sm">
            <input type="checkbox" name="show_on_site" defaultChecked={t.show_on_site} className="h-4 w-4" />
            Afficher sur le site
          </label>
          {!t.active && <p className="mt-2 text-xs text-danger">Ce professeur est désactivé : il n&apos;apparaît pas sur le site.</p>}
          <Field label="Ordre d'affichage" hint="0 = en premier" className="mt-5">
            <Input type="number" name="sort_order" defaultValue={t.sort_order} min={0} max={999} />
          </Field>
        </Card>

        <Card>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nom affiché"><Input name="display_name" defaultValue={t.display_name} required maxLength={60} /></Field>
            <Field label="Titre" hint="Ex. Coach Lagree certifiée, Professeure de yoga"><Input name="headline" defaultValue={t.headline} maxLength={80} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-xs uppercase tracking-[0.15em] text-muted">Disciplines enseignées</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {DISCIPLINE_ORDER.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="disciplines" value={d} defaultChecked={(t.disciplines as string[]).includes(d)} className="h-4 w-4" />
                    {DISCIPLINES[d].label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Citation" hint="Une phrase qui lui ressemble" className="sm:col-span-2">
              <Input name="quote" defaultValue={t.quote} maxLength={200} />
            </Field>
            <Field label="Présentation" className="sm:col-span-2">
              <Textarea name="bio" defaultValue={t.bio ?? ""} maxLength={3000} className="min-h-48"
                placeholder="Son parcours, sa façon de coacher, ce que les élèves aiment dans ses cours…" />
            </Field>
            <Field label="Spécialités" hint="Séparées par des virgules : Sculpt, Core, Débutantes" className="sm:col-span-2">
              <Input name="specialties" defaultValue={(t.specialties as string[]).join(", ")} maxLength={300} />
            </Field>
            <Field label="Formation et certifications" className="sm:col-span-2">
              <Textarea name="certifications" defaultValue={t.certifications} maxLength={500} className="min-h-20" />
            </Field>
            <Field label="Instagram" className="sm:col-span-2">
              <Input type="url" name="instagram_url" defaultValue={t.instagram_url} placeholder="https://instagram.com/…" />
            </Field>
          </div>
          <SubmitButton className="mt-6">Enregistrer le profil</SubmitButton>
        </Card>
      </ActionForm>
    </>
  );
}
