import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/appearance";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppearanceEditor } from "./editor";
import { PhotoManager } from "./photos";

export const metadata: Metadata = { title: "Site internet" };

export default async function AppearancePage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: photos }] = await Promise.all([
    supabase.from("site_appearance").select("*").single(),
    supabase.from("site_photos").select("id, url, alt").order("sort_order").order("created_at"),
  ]);
  const initial: Appearance = { ...DEFAULT_APPEARANCE, ...(data ?? {}) };
  return (
    <>
      <PageHeader title="Site internet" subtitle="Couleurs, typographies, textes et photos. Les changements sont visibles immédiatement après publication." />
      <AppearanceEditor initial={initial} />
      <PhotoManager photos={photos ?? []} />
    </>
  );
}
