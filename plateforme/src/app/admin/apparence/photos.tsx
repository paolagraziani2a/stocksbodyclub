import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Input } from "@/components/ui";
import { addPhotos, deletePhoto, movePhoto, updatePhoto } from "./photo-actions";

type Photo = { id: string; url: string; alt: string };

export function PhotoManager({ photos }: { photos: Photo[] }) {
  return (
    <Card className="mt-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl">Photos du studio</h2>
          <p className="mt-1 text-sm text-muted">
            Affichées sur la page d&apos;accueil, dans cet ordre. La première sert de grande photo si aucune photo d&apos;accueil n&apos;est choisie.
          </p>
        </div>
        <ActionForm action={addPhotos} className="flex flex-wrap items-center gap-3">
          <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp" required
            className="max-w-[220px] text-xs file:mr-3 file:rounded-full file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs" />
          <SubmitButton variant="secondary">Ajouter</SubmitButton>
        </ActionForm>
      </div>

      {photos.length === 0 ? <Empty>Aucune photo pour l&apos;instant.</Empty> : (
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-2">
              <div className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt} className="aspect-[4/3] w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-ivory/90 px-2 text-xs">{i + 1}</span>
              </div>
              <ActionForm action={updatePhoto} className="flex gap-1">
                <input type="hidden" name="id" value={p.id} />
                <Input name="alt" defaultValue={p.alt} placeholder="Légende (ex. la salle)" maxLength={150} className="px-2.5 py-1.5 text-xs" />
                <SubmitButton variant="ghost" className="px-2 py-1 text-xs">OK</SubmitButton>
              </ActionForm>
              <div className="flex items-center gap-1">
                {(["up", "down"] as const).map((dir) => (
                  <ActionForm key={dir} action={movePhoto}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="dir" value={dir} />
                    <SubmitButton variant="ghost" className="px-2.5 py-1 text-xs">{dir === "up" ? "←" : "→"}</SubmitButton>
                  </ActionForm>
                ))}
                <ActionForm action={deletePhoto} confirm="Supprimer cette photo ?" className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="ghost" className="px-2.5 py-1 text-xs text-danger">Supprimer</SubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
