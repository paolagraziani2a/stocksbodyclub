import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AuthField, Check } from "@/components/auth-shell";
import { FormPill } from "@/components/form-button";
import { Display, Label, Pill, Section } from "@/components/site";
import { cn } from "@/components/ui";
import { cancelMyBooking, leaveWaitlist, signOut, updateProfile } from "@/lib/account-actions";
import { formatDate, formatShortDay, formatTime, hoursUntil, isUpcoming } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

type BookingRow = {
  id: string; status: string; credits_used: number;
  class_sessions: { id: string; title: string; starts_at: string; status: string; teachers: { display_name: string } | null };
};
type PassRow = {
  id: string; name: string; is_unlimited: boolean; credits_total: number; credits_remaining: number;
  activated_at: string | null; expires_at: string | null; revoked_at: string | null;
};

const PAST_STATUS: Record<string, string> = {
  booked: "Cours suivi", attended: "Cours suivi", no_show: "Absente", late_cancelled: "Annulation tardive", cancelled: "Annulé",
};

export default async function AccountPage({ searchParams }: PageProps<"/compte">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/compte");

  const [{ data: profile }, { data: balance }, { data: bookings }, { data: waitlist }, { data: passes }, { data: invoices }, { data: settings }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.rpc("my_credit_balance").single<{ usable_credits: number; next_expiry: string | null; unlimited_until: string | null }>(),
      supabase.from("bookings")
        .select("id, status, credits_used, class_sessions(id, title, starts_at, status, teachers(display_name))")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(60).returns<BookingRow[]>(),
      supabase.from("waitlist_entries").select("id, session_id, class_sessions(title, starts_at)")
        .eq("user_id", user.id).eq("status", "waiting")
        .returns<{ id: string; session_id: string; class_sessions: { title: string; starts_at: string } }[]>(),
      supabase.from("passes").select("id, name, is_unlimited, credits_total, credits_remaining, activated_at, expires_at, revoked_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).returns<PassRow[]>(),
      supabase.from("invoices").select("id, number, kind, issued_at, total_ttc_cents").eq("user_id", user.id).order("issued_at", { ascending: false }),
      supabase.from("studio_settings").select("cancel_window_hours").single(),
    ]);
  if (profile?.must_change_password) redirect("/reinitialiser?temporaire=1");
  if (profile?.role === "admin") redirect("/admin");

  const windowH = settings?.cancel_window_hours ?? 12;
  const all = bookings ?? [];
  const upcoming = all
    .filter((b) => b.status === "booked" && isUpcoming(b.class_sessions.starts_at))
    .sort((a, b) => a.class_sessions.starts_at.localeCompare(b.class_sessions.starts_at));
  const past = all
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.class_sessions.starts_at.localeCompare(a.class_sessions.starts_at))
    .slice(0, 10);
  const activePasses = (passes ?? []).filter((p) => !p.revoked_at && (p.is_unlimited
    ? p.expires_at && isUpcoming(p.expires_at)
    : p.credits_remaining > 0 && (!p.expires_at || isUpcoming(p.expires_at))));
  const credits = balance?.usable_credits ?? 0;

  return (
    <main>
      <Section className="pb-10 sm:pb-14">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <Label n="00">Mon compte</Label>
            <Display as="h1" main="Bonjour" accent={`${profile?.first_name || ""}.`} className="mt-6" />
          </div>
          <Pill href="/planning">Réserver un cours</Pill>
        </div>
        {(sp.bienvenue || sp.mdp || sp.annulation) && (
          <p role="status" className="mt-8 rounded-xl bg-blush px-4 py-3 text-sm">
            {sp.bienvenue ? "Bienvenue au club ! Votre compte est créé."
              : sp.mdp ? "Votre nouveau mot de passe est enregistré."
              : sp.annulation === "remboursee" ? "Réservation annulée : votre crédit vous a été rendu."
              : "Réservation annulée. Annulation tardive : le cours est dû."}
          </p>
        )}

        {/* Solde */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-ink p-6 text-ivory">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/60">{balance?.unlimited_until ? "Abonnement" : "Crédits disponibles"}</p>
            <p className="mt-3 font-serif text-7xl font-bold leading-none">{balance?.unlimited_until ? "∞" : credits}</p>
            <p className="mt-3 text-sm text-ivory/70">
              {balance?.unlimited_until ? `Illimité jusqu'au ${formatDate(new Date(new Date(balance.unlimited_until).getTime() - 1000))}`
                : balance?.next_expiry ? `Expiration la plus proche : ${formatDate(new Date(new Date(balance.next_expiry).getTime() - 1000))}`
                : credits > 0 ? "Validité dès votre premier cours" : "Aucun crédit pour l'instant"}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-sand p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Prochains cours</p>
            <p className="mt-3 font-serif text-7xl font-bold leading-none">{upcoming.length}</p>
            <p className="mt-3 text-sm text-muted">{upcoming[0] ? `Le prochain : ${formatShortDay(upcoming[0].class_sessions.starts_at)} à ${formatTime(upcoming[0].class_sessions.starts_at)}` : "Aucun cours réservé"}</p>
          </div>
          <Link href="/compte/cartes" className="group flex flex-col justify-between rounded-2xl border border-line bg-sand p-6 transition hover:border-ink">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Cartes & abonnement</p>
            <p className="mt-3 font-serif text-4xl font-bold uppercase leading-none">Acheter <span className="accent font-normal text-taupe">une carte</span></p>
            <p className="mt-3 text-sm text-muted transition group-hover:text-ink">Voir les formules →</p>
          </Link>
        </div>
      </Section>

      {/* Prochains cours */}
      <Section className="pt-0 sm:pt-0">
        <h2 className="text-5xl">Mes <span className="accent text-taupe">prochains cours.</span></h2>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-muted">Aucun cours à venir. <Link href="/planning" className="text-ink underline underline-offset-4">Voir le planning</Link></p>
        ) : (
          <ul className="mt-8 border-t border-ink">
            {upcoming.map((b) => {
              const late = hoursUntil(b.class_sessions.starts_at) < windowH;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line py-5">
                  <span className="w-24 font-mono text-xs uppercase tracking-[0.12em] text-muted sm:w-32">{formatShortDay(b.class_sessions.starts_at)}</span>
                  <span className="font-serif text-4xl font-bold">{formatTime(b.class_sessions.starts_at)}</span>
                  <span className="min-w-0 flex-1">
                    {b.class_sessions.title}
                    {b.class_sessions.teachers && <span className="text-muted"> · {b.class_sessions.teachers.display_name}</span>}
                  </span>
                  <ActionForm
                    action={cancelMyBooking}
                    confirm={late
                      ? `Moins de ${settings?.cancel_window_hours ?? 12} h avant le cours : votre crédit ne sera pas rendu. Annuler quand même ?`
                      : "Annuler cette réservation ? Votre crédit vous sera rendu."}
                    className="flex flex-col items-end"
                  >
                    <input type="hidden" name="booking" value={b.id} />
                    <input type="hidden" name="from" value="compte" />
                    <FormPill tone="outline" className="px-4 py-2.5">{late ? "Annuler (tardif)" : "Annuler"}</FormPill>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Annulation gratuite jusqu&apos;à {settings?.cancel_window_hours ?? 12} h avant le cours
        </p>

        {(waitlist ?? []).length > 0 && (
          <div className="mt-12">
            <Label>Liste d&apos;attente</Label>
            <ul className="mt-4 border-t border-line">
              {(waitlist ?? []).map((w) => (
                <li key={w.id} className="flex items-center gap-4 border-b border-line py-4 text-sm">
                  <span className="flex-1">{w.class_sessions.title} · {formatShortDay(w.class_sessions.starts_at)} à {formatTime(w.class_sessions.starts_at)}</span>
                  <ActionForm action={leaveWaitlist}>
                    <input type="hidden" name="session" value={w.session_id} />
                    <FormPill tone="outline" className="px-4 py-2">Quitter</FormPill>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <section className="border-y border-line bg-sand">
        <Section className="grid gap-16 md:grid-cols-2">
          {/* Cartes */}
          <div>
            <h2 className="text-5xl">Mes <span className="accent text-taupe">cartes.</span></h2>
            {activePasses.length === 0 ? <p className="mt-6 text-muted">Aucune carte active.</p> : (
              <ul className="mt-8 border-t border-ink">
                {activePasses.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-4 border-b border-line py-4">
                    <div>
                      <p>{p.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
                        {p.expires_at ? `Valable jusqu'au ${formatDate(new Date(new Date(p.expires_at).getTime() - 1000))}` : "Pas encore utilisée"}
                      </p>
                    </div>
                    <span className="font-serif text-3xl font-bold">{p.is_unlimited ? "∞" : `${p.credits_remaining}/${p.credits_total}`}</span>
                  </li>
                ))}
              </ul>
            )}

            {past.length > 0 && (
              <>
                <h3 className="mt-14 text-3xl">Historique</h3>
                <ul className="mt-4 border-t border-line text-sm">
                  {past.map((b) => (
                    <li key={b.id} className="flex justify-between gap-4 border-b border-line py-3">
                      <span>{formatShortDay(b.class_sessions.starts_at)} · {formatTime(b.class_sessions.starts_at)} · {b.class_sessions.title}</span>
                      <span className={cn("font-mono text-[10px] uppercase tracking-[0.15em]", b.status === "late_cancelled" || b.status === "no_show" ? "text-danger" : "text-muted")}>
                        {PAST_STATUS[b.status] ?? b.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {(invoices ?? []).length > 0 && (
              <>
                <h3 className="mt-14 text-3xl">Factures</h3>
                <ul className="mt-4 border-t border-line text-sm">
                  {(invoices ?? []).map((i) => (
                    <li key={i.id} className="border-b border-line">
                      <Link href={`/factures/${i.id}`} className="flex justify-between gap-4 py-3 hover:text-taupe">
                        <span>{i.kind === "credit_note" ? "Avoir" : "Facture"} {i.number} · {formatDate(i.issued_at)}</span>
                        <span className="tabular-nums">{formatEuros(i.total_ttc_cents)} ↓</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Profil */}
          <div>
            <h2 className="text-5xl">Mes <span className="accent text-taupe">informations.</span></h2>
            <ActionForm action={updateProfile} className="mt-8 grid gap-5 sm:grid-cols-2">
              <AuthField label="Prénom" name="first_name" defaultValue={profile?.first_name} required maxLength={60} />
              <AuthField label="Nom" name="last_name" defaultValue={profile?.last_name} required maxLength={60} />
              <AuthField label="Téléphone mobile" name="phone" type="tel" defaultValue={formatPhone(profile?.phone)} required className="sm:col-span-2" />
              <AuthField label="Email" name="email_display" value={profile?.email ?? ""} disabled className="sm:col-span-2" hint="Pour changer d'email, contactez le studio." />
              <div className="sm:col-span-2">
                <Check name="sms_opt_in" defaultChecked={profile?.sms_opt_in}>Me prévenir par SMS si un de mes cours est annulé.</Check>
              </div>
              <FormPill className="sm:col-span-2">Enregistrer</FormPill>
            </ActionForm>
            <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-8">
              <Pill href="/reinitialiser" tone="outline" arrow={null}>Changer mon mot de passe</Pill>
              <form action={signOut}><FormPill tone="outline">Se déconnecter</FormPill></form>
            </div>
          </div>
        </Section>
      </section>
    </main>
  );
}
