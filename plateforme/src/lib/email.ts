import "server-only";
import { asService } from "./db";

/**
 * Emails transactionnels via Brevo (même compte que les SMS).
 * Sans BREVO_API_KEY : rien n'est envoyé, l'email est journalisé (statut « simulated »)
 * et le lien est affiché dans les journaux du serveur — pratique en développement.
 */
const FROM_EMAIL = process.env.EMAIL_FROM ?? "";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "The Body Club";

function layout(title: string, intro: string, cta: string, url: string, outro: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<div style="background:#f0eadb;padding:40px 16px;font-family:Helvetica,Arial,sans-serif;color:#131512">
  <div style="max-width:480px;margin:0 auto;background:#faf6eb;padding:40px 32px;border-radius:16px">
    <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#4f544d;margin:0">The Body Club</p>
    <h1 style="font-size:28px;text-transform:uppercase;margin:16px 0 24px">${esc(title)}</h1>
    <p style="line-height:1.6">${esc(intro)}</p>
    <p style="margin:32px 0"><a href="${esc(url)}" style="background:#131512;color:#f0eadb;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block">${esc(cta)}</a></p>
    <p style="font-size:13px;color:#4f544d;line-height:1.6">${esc(outro)}</p>
  </div>
</div>`;
}

export const emails = {
  verify: (url: string) => ({
    subject: "Activez votre compte — The Body Club",
    html: layout("Bienvenue", "Merci pour votre inscription. Cliquez sur le bouton ci-dessous pour activer votre compte et réserver votre premier cours.",
      "Activer mon compte", url, "Si vous n'avez pas créé de compte, ignorez simplement cet email."),
  }),
  reset: (url: string) => ({
    subject: "Choisissez un nouveau mot de passe — The Body Club",
    html: layout("Nouveau mot de passe", "Vous avez demandé à changer votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien est valable une heure.",
      "Choisir mon mot de passe", url, "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste valable."),
  }),
};

export async function sendEmail(p: { to: string; userId?: string; kind: string; subject: string; html: string; link?: string }) {
  const key = process.env.BREVO_API_KEY;
  let status: "sent" | "simulated" | "failed" = "simulated";
  let providerId: string | null = null;
  let error: string | null = null;

  if (key && FROM_EMAIL) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM_EMAIL }, to: [{ email: p.to }], subject: p.subject, htmlContent: p.html }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
      if (res.ok) { status = "sent"; providerId = data.messageId ?? null; } else { status = "failed"; error = `${res.status} ${data.message ?? ""}`.trim(); }
    } catch (e) {
      status = "failed";
      error = (e as Error).message;
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info(`[email simulé] ${p.kind} → ${p.to} : ${p.link ?? p.subject}`);
  }

  // Le lien n'est conservé que pour un email simulé (développement) : jamais en production réelle
  await asService((tx) => tx.run(
    `insert into public.notification_log (user_id, channel, kind, recipient, body, status, provider_id, error)
     values ($1, 'email', $2, $3, $4, $5, $6, $7)`,
    [p.userId ?? null, p.kind, p.to, status === "simulated" && p.link ? `${p.subject} — ${p.link}` : p.subject, status, providerId, error],
  )).catch(() => {});
  if (status === "failed") throw new Error("EMAIL_FAILED");
}
