import "server-only";

/**
 * Envoi de SMS via Brevo (ex-Sendinblue), prestataire français.
 * Sans clé BREVO_API_KEY, aucun SMS n'est envoyé : le message est seulement
 * journalisé avec le statut « simulated » (développement, tests, avant ouverture).
 */
export type SmsResult = { status: "sent" | "simulated" | "failed"; providerId?: string; error?: string };

const SENDER = (process.env.SMS_SENDER ?? "BodyClub").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "BodyClub";

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { status: "simulated" };
  try {
    const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: SENDER, recipient: to.replace(/^\+/, ""), content: body, type: "transactional" }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: number | string; message?: string };
    if (!res.ok) return { status: "failed", error: `${res.status} ${data.message ?? ""}`.trim() };
    return { status: "sent", providerId: data.messageId != null ? String(data.messageId) : undefined };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
