import "server-only";
import { sessionCancelledSms } from "./messages";
import { isMobile } from "./phone";
import { sendSms } from "./sms";
import { asService } from "./db";

export type NotifySummary = { sent: number; simulated: number; failed: number; skipped: number };

/**
 * Prévient par SMS chaque cliente d'un cours annulé par le studio, et journalise
 * chaque envoi (notification_log). Ne lève jamais d'erreur : l'annulation et le
 * recrédit sont déjà enregistrés, un SMS en échec ne doit pas les remettre en cause.
 */
export async function notifySessionCancelled(sessionId: string, userIds: string[]): Promise<NotifySummary> {
  const summary: NotifySummary = { sent: 0, simulated: 0, failed: 0, skipped: 0 };
  if (userIds.length === 0) return summary;
  const { session, profiles, settings } = await asService(async (tx) => ({
    session: await tx.one<{ id: string; title: string; starts_at: string }>(
      "select id, title, starts_at from public.class_sessions where id = $1", [sessionId]),
    profiles: await tx.many<{ id: string; first_name: string; phone: string | null; sms_opt_in: boolean; anonymized_at: string | null }>(
      "select id, first_name, phone, sms_opt_in, anonymized_at from public.profiles where id = any($1::uuid[])", [userIds]),
    settings: await tx.one<{ studio_name: string }>("select studio_name from public.studio_settings"),
  }));
  const log = (row: Record<string, unknown>) => asService((tx) => tx.run(
    `insert into public.notification_log (user_id, session_id, channel, kind, recipient, body, status, provider_id, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [row.user_id, row.session_id, row.channel, row.kind, row.recipient, row.body, row.status, row.provider_id ?? null, row.error ?? null]));
  if (!session) return summary;

  for (const p of profiles) {
    const body = sessionCancelledSms({
      firstName: p.first_name, title: session.title, startsAt: session.starts_at,
      studio: settings?.studio_name ?? "The Body Club",
    });
    const base = { user_id: p.id, session_id: sessionId, channel: "sms", kind: "session_cancelled", body };

    if (!p.phone || !p.sms_opt_in || p.anonymized_at || !isMobile(p.phone)) {
      const reason = !p.phone ? "pas de numéro" : !p.sms_opt_in ? "SMS refusés par la cliente" : "numéro non mobile";
      await log({ ...base, recipient: p.phone ?? "—", status: "skipped", error: reason });
      summary.skipped++;
      continue;
    }

    const r = await sendSms(p.phone, body);
    await log({ ...base, recipient: p.phone, status: r.status, provider_id: r.providerId ?? null, error: r.error ?? null });
    summary[r.status]++;
  }
  return summary;
}
