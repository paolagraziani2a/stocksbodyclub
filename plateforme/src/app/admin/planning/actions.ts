"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminRun, requireAdmin, type ActionResult } from "@/lib/auth";
import { notifySessionCancelled } from "@/lib/notify";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide");

const sessionSchema = z.object({
  title: z.string().trim().min(1, "Indiquez un nom de cours").max(80),
  date: day,
  start: time,
  duration: z.coerce.number().int().min(10).max(240),
  teacher: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  capacity: z.coerce.number().int().min(1, "Au moins 1 place").max(50),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
  class_type: z.string().uuid().or(z.literal("")).optional().transform((v) => v || null),
});

const fields = (form: FormData) => Object.fromEntries(form.entries());

export async function createSessions(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionSchema.extend({ repeat: z.coerce.number().int().min(1).max(52) }).safeParse(fields(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  const r = await adminRun((tx) => tx.many(
    "select id from public.admin_create_sessions($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [v.title, v.date, v.start, v.duration, v.teacher, v.capacity, v.class_type, v.repeat, v.notes]));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/planning");
  const n = r.data.length;
  return { ok: true, message: n > 1 ? `${n} cours créés (une fois par semaine).` : "Cours créé." };
}

export async function updateSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionSchema.extend({ id: z.string().uuid() }).safeParse(fields(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const r = await adminRun((tx) => tx.run(
    "select public.admin_update_session($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [v.id, v.title, v.date, v.start, v.duration, v.teacher, v.capacity, v.notes, v.class_type]));
  if (!r.ok) {
    return { ok: false, message: r.code === "CAPACITY_BELOW_BOOKINGS" ? "Il y a déjà plus d'inscrites que cette capacité." : r.message };
  }
  revalidatePath("/admin/planning");
  return { ok: true, message: "Modifications enregistrées." };
}

export async function copyWeek(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ source: day, weeks: z.coerce.number().int().min(1).max(12) }).safeParse(fields(form));
  if (!parsed.success) return { ok: false, message: "Paramètres invalides." };
  const { source, weeks } = parsed.data;
  const target = new Date(`${source}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 7);

  const r = await adminRun((tx) => tx.one<{ n: number }>(
    "select public.admin_copy_week($1, $2, $3) as n", [source, target.toISOString().slice(0, 10), weeks]));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/planning");
  return { ok: true, message: `${r.data?.n ?? 0} cours copiés sur ${weeks} semaine(s).` };
}

export async function cancelSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;
  const res = await adminRun((tx) => tx.one<{ r: { refunded_bookings: number; user_ids: string[] } }>(
    "select public.admin_cancel_session($1, $2) as r", [id, reason]));
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath("/admin/planning");
  const r = res.data!.r;
  const sms = await notifySessionCancelled(id, r.user_ids);
  // Le bloc d'annulation disparaît une fois le cours annulé : le bilan s'affiche en haut de la page
  const q = new URLSearchParams({
    annule: String(r.refunded_bookings), sms: String(sms.sent), simu: String(sms.simulated),
    ko: String(sms.failed + sms.skipped),
  });
  redirect(`/admin/planning/${id}?${q}`);
}

export async function deleteSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const r = await adminRun((tx) => tx.run("delete from public.class_sessions where id = $1", [id]));
  if (!r.ok) return { ok: false, message: r.message };
  if (r.data === 0) return { ok: false, message: "Ce cours a des réservations : annulez-le plutôt (les clientes seront recréditées)." };
  revalidatePath("/admin/planning");
  redirect("/admin/planning");
}

export async function setAttendance(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("booking"));
  const status = z.enum(["attended", "no_show", "booked"]).parse(form.get("status"));
  const r = await adminRun((tx) => tx.run("select public.set_attendance($1, $2)", [id, status]));
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/admin/planning");
  return { ok: true };
}
