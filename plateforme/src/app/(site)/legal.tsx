import "server-only";
import type { ReactNode } from "react";
import { Display, Label, Section } from "@/components/site";
import { getAppearance } from "@/lib/appearance";
import { getPublicSettings } from "@/lib/site";

export async function getLegal() {
  const [s, a] = await Promise.all([getPublicSettings(), getAppearance()]);
  return {
    studio: s?.studio_name ?? "The Body Club",
    cancelHours: s?.cancel_window_hours ?? 12,
    lateLimit: s?.unlimited_late_cancel_limit ?? 2,
    address: a?.address ?? "",
    email: a?.contact_email ?? "",
  };
}

export function LegalPage({ n, main, accent, children }: { n: string; main: string; accent: string; children: ReactNode }) {
  return (
    <main>
      <Section className="pb-8">
        <Label n={n}>Informations légales</Label>
        <Display as="h1" main={main} accent={accent} className="mt-6" />
      </Section>
      <Section className="max-w-3xl pt-0 sm:pt-0">
        <div className="space-y-8 leading-relaxed text-muted [&_h2]:mb-3 [&_h2]:text-3xl [&_h2]:text-ink">{children}</div>
      </Section>
    </main>
  );
}
