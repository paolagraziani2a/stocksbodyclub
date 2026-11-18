"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, type ActionResult } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { notifySessionCancelled } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

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
});

const fields = (form: FormData) => Object.fromEntries(form.entries());

export async function createSessions(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionSchema.extend({ repeat: z.coerce.number().int().min(1).max(52) }).safeParse(fields(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_sessions", {
    p_title: v.title, p_date: v.date, p_start_time: v.start, p_duration_minutes: v.duration,
    p_teacher_id: v.teacher, p_capacity: v.capacity, p_repeat_weeks: v.repeat, p_notes: v.notes,
  });
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/planning");
  const n = (data as unknown[]).length;
  return { ok: true, message: n > 1 ? `${n} cours créés (une fois par semaine).` : "Cours créé." };
}

export async function updateSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionSchema.extend({ id: z.string().uuid() }).safeParse(fields(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_session", {
    p_session_id: v.id, p_title: v.title, p_date: v.date, p_start_time: v.start, p_duration_minutes: v.duration,
    p_teacher_id: v.teacher, p_capacity: v.capacity, p_notes: v.notes,
  });
  if (error) {
    if (error.message.startsWith("CAPACITY_BELOW_BOOKINGS"))
      return { ok: false, message: "Il y a déjà plus d'inscrites que cette capacité." };
    return { ok: false, message: errorMessage(error) };
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_copy_week", {
    p_source_monday: source, p_target_monday: target.toISOString().slice(0, 10), p_weeks: weeks,
  });
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/planning");
  return { ok: true, message: `${data} cours copiés sur ${weeks} semaine(s).` };
}

export async function cancelSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_session", { p_session_id: id, p_reason: reason });
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/planning");
  const r = data as { refunded_bookings: number; user_ids: string[] };
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("class_sessions").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: errorMessage(error) };
  if (!data?.length) return { ok: false, message: "Ce cours a des réservations : annulez-le plutôt (les clientes seront recréditées)." };
  revalidatePath("/admin/planning");
  redirect("/admin/planning");
}

export async function setAttendance(_p: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().parse(form.get("booking"));
  const status = z.enum(["attended", "no_show", "booked"]).parse(form.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance", { p_booking_id: id, p_status: status });
  if (error) return { ok: false, message: errorMessage(error) };
  revalidatePath("/admin/planning");
  return { ok: true };
}
