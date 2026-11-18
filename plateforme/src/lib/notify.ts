import "server-only";
import { sessionCancelledSms } from "./messages";
import { isMobile } from "./phone";
import { sendSms } from "./sms";
import { createServiceClient } from "./supabase/admin";

export type NotifySummary = { sent: number; simulated: number; failed: number; skipped: number };

/**
 * Prévient par SMS chaque cliente d'un cours annulé par le studio, et journalise
 * chaque envoi (notification_log). Ne lève jamais d'erreur : l'annulation et le
 * recrédit sont déjà enregistrés, un SMS en échec ne doit pas les remettre en cause.
 */
export async function notifySessionCancelled(sessionId: string, userIds: string[]): Promise<NotifySummary> {
  const summary: NotifySummary = { sent: 0, simulated: 0, failed: 0, skipped: 0 };
  if (userIds.length === 0) return summary;
  const db = createServiceClient();

  const [{ data: session }, { data: profiles }, { data: settings }] = await Promise.all([
    db.from("class_sessions").select("id, title, starts_at").eq("id", sessionId).single(),
    db.from("profiles").select("id, first_name, phone, sms_opt_in, anonymized_at").in("id", userIds),
    db.from("studio_settings").select("studio_name").single(),
  ]);
  if (!session) return summary;

  for (const p of profiles ?? []) {
    const body = sessionCancelledSms({
      firstName: p.first_name, title: session.title, startsAt: session.starts_at,
      studio: settings?.studio_name ?? "The Body Club",
    });
    const base = { user_id: p.id, session_id: sessionId, channel: "sms", kind: "session_cancelled", body };

    if (!p.phone || !p.sms_opt_in || p.anonymized_at || !isMobile(p.phone)) {
      const reason = !p.phone ? "pas de numéro" : !p.sms_opt_in ? "SMS refusés par la cliente" : "numéro non mobile";
      await db.from("notification_log").insert({ ...base, recipient: p.phone ?? "—", status: "skipped", error: reason });
      summary.skipped++;
      continue;
    }

    const r = await sendSms(p.phone, body);
    await db.from("notification_log").insert({
      ...base, recipient: p.phone, status: r.status, provider_id: r.providerId ?? null, error: r.error ?? null,
    });
    summary[r.status]++;
  }
  return summary;
}
