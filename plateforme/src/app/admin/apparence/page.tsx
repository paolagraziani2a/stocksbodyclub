import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/appearance";
import { adminTx, requireAdmin } from "@/lib/auth";
import { AppearanceEditor } from "./editor";
import { PhotoManager } from "./photos";

export const metadata: Metadata = { title: "Site internet" };

export default async function AppearancePage() {
  await requireAdmin();
  const { data, photos } = await adminTx(async (tx) => ({
    data: await tx.one<Partial<Appearance>>("select * from public.site_appearance"),
    photos: await tx.many<{ id: string; url: string; alt: string }>("select id, url, alt from public.site_photos order by sort_order, created_at"),
  }));
  const initial: Appearance = { ...DEFAULT_APPEARANCE, ...(data ?? {}) };
  return (
    <>
      <PageHeader title="Site internet" subtitle="Couleurs, typographies, textes et photos. Les changements sont visibles immédiatement après publication." />
      <AppearanceEditor initial={initial} />
      <PhotoManager photos={photos ?? []} />
    </>
  );
}
