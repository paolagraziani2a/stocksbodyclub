-- =============================================================================
-- THE BODY CLUB — Sécurité : Row Level Security, droits et fonctions exposées
--
-- Principe : le navigateur (rôles anon / authenticated) LIT via RLS et
-- n'ÉCRIT que via des fonctions contrôlées. Le rôle service_role (serveur
-- uniquement, jamais dans le navigateur) traite les webhooks et tâches planifiées.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. On part de zéro : aucun droit implicite
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 2. Activation de la RLS sur toutes les tables
-- ---------------------------------------------------------------------------
alter table public.studio_settings   enable row level security;
alter table public.profiles          enable row level security;
alter table public.teachers          enable row level security;
alter table public.teacher_pay_rules enable row level security;
alter table public.class_types       enable row level security;
alter table public.class_sessions    enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.refunds           enable row level security;
alter table public.passes            enable row level security;
alter table public.bookings          enable row level security;
alter table public.waitlist_entries  enable row level security;
alter table public.credit_ledger     enable row level security;
alter table public.stripe_events     enable row level security;
alter table public.teacher_payouts   enable row level security;
alter table public.audit_log         enable row level security;
alter table public.import_batches    enable row level security;
alter table public.import_rows       enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Données publiques (planning, tarifs, règles d'annulation)
-- ---------------------------------------------------------------------------
grant select on public.studio_settings, public.class_types, public.class_sessions, public.products
  to anon, authenticated;
grant select (id, display_name, bio, active) on public.teachers to anon, authenticated;

create policy "settings readable" on public.studio_settings for select using (true);
create policy "class types readable" on public.class_types for select using (true);
create policy "sessions readable" on public.class_sessions for select using (true);
create policy "teachers readable" on public.teachers for select using (true);
create policy "active products readable" on public.products for select using (active or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Données personnelles : chacune voit les siennes, l'admin voit tout
-- ---------------------------------------------------------------------------
grant select on public.profiles, public.orders, public.refunds, public.passes, public.bookings,
  public.waitlist_entries, public.credit_ledger to authenticated;

create policy "own profile" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "own orders" on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own refunds" on public.refunds for select
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = refunds.order_id and o.user_id = auth.uid()));
create policy "own passes" on public.passes for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own bookings" on public.bookings for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own waitlist" on public.waitlist_entries for select
  using (user_id = auth.uid() or public.is_admin());
create policy "own ledger" on public.credit_ledger for select
  using (user_id = auth.uid() or public.is_admin());

-- Modification du profil : uniquement les champs personnels (jamais le rôle ni l'email)
grant update (first_name, last_name, phone, marketing_consent) on public.profiles to authenticated;
create policy "update own profile" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Administration (écritures directes réservées à l'admin)
-- ---------------------------------------------------------------------------
-- Planning : booked_count et status ne sont modifiables que par les fonctions
grant insert (class_type_id, title, starts_at, ends_at, teacher_id, capacity, credit_cost, series_id, notes)
  on public.class_sessions to authenticated;
grant update (class_type_id, title, starts_at, ends_at, teacher_id, capacity, credit_cost, series_id, notes)
  on public.class_sessions to authenticated;
grant delete on public.class_sessions to authenticated;
create policy "admin insert sessions" on public.class_sessions for insert with check (public.is_admin());
create policy "admin update sessions" on public.class_sessions for update using (public.is_admin()) with check (public.is_admin());
-- suppression uniquement d'un cours sans aucune réservation (sinon : l'annuler)
create policy "admin delete empty sessions" on public.class_sessions for delete
  using (public.is_admin() and not exists (select 1 from public.bookings b where b.session_id = class_sessions.id));

grant insert, update, delete on public.class_types to authenticated;
create policy "admin write class types" on public.class_types for all using (public.is_admin()) with check (public.is_admin());

grant insert, update on public.products to authenticated;
create policy "admin insert products" on public.products for insert with check (public.is_admin());
create policy "admin update products" on public.products for update using (public.is_admin()) with check (public.is_admin());

grant select (profile_id, created_at), insert, update, delete on public.teachers to authenticated;
create policy "admin write teachers" on public.teachers for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.teacher_pay_rules to authenticated;
create policy "admin pay rules" on public.teacher_pay_rules for all using (public.is_admin()) with check (public.is_admin());

grant update (cancel_window_hours, booking_horizon_days, vat_rate, teacher_pay_base,
              late_cancel_counts_for_teacher, no_show_counts_for_teacher, waitlist_enabled, studio_name)
  on public.studio_settings to authenticated;
create policy "admin update settings" on public.studio_settings for update using (public.is_admin()) with check (public.is_admin());

-- Rémunérations : l'admin gère, le professeur voit uniquement les siennes
grant select, insert, update on public.teacher_payouts to authenticated;
create policy "payouts read" on public.teacher_payouts for select
  using (public.is_admin() or teacher_id = public.current_teacher_id());
create policy "payouts admin insert" on public.teacher_payouts for insert with check (public.is_admin());
create policy "payouts admin update" on public.teacher_payouts for update using (public.is_admin()) with check (public.is_admin());

grant select on public.audit_log to authenticated;
create policy "audit admin" on public.audit_log for select using (public.is_admin());

grant select, insert, update, delete on public.import_batches, public.import_rows to authenticated;
create policy "import batches admin" on public.import_batches for all using (public.is_admin()) with check (public.is_admin());
create policy "import rows admin" on public.import_rows for all using (public.is_admin()) with check (public.is_admin());

-- stripe_events : aucune politique → inaccessible hors service_role

-- ---------------------------------------------------------------------------
-- 6. Fonctions appelables depuis l'application
-- ---------------------------------------------------------------------------
grant execute on function public.is_admin()            to anon, authenticated;
grant execute on function public.current_teacher_id()  to anon, authenticated;
grant execute on function public.current_app_role()    to authenticated;
grant execute on function public.compute_expiry(timestamptz, integer, public.validity_unit, text) to anon, authenticated;

-- Clientes
grant execute on function public.book_session(uuid)          to authenticated;
grant execute on function public.cancel_booking(uuid)        to authenticated;
grant execute on function public.join_waitlist(uuid)         to authenticated;
grant execute on function public.leave_waitlist(uuid)        to authenticated;
grant execute on function public.create_pending_order(uuid)  to authenticated;
grant execute on function public.my_credit_balance()         to authenticated;

-- Professeurs / admin (contrôle du rôle à l'intérieur de chaque fonction)
grant execute on function public.session_roster(uuid)                          to authenticated;
grant execute on function public.set_attendance(uuid, public.booking_status)   to authenticated;
grant execute on function public.admin_book_session(uuid, uuid)                to authenticated;
grant execute on function public.admin_cancel_booking(uuid, boolean)           to authenticated;
grant execute on function public.admin_cancel_session(uuid, text)              to authenticated;
grant execute on function public.admin_grant_pass(uuid, text, integer, integer, public.validity_unit, numeric, uuid, text, timestamptz, timestamptz, public.pass_source, integer, numeric) to authenticated;
grant execute on function public.admin_adjust_pass(uuid, integer, text)        to authenticated;
grant execute on function public.admin_set_pass_expiry(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role)         to authenticated;

-- process_checkout_completed, process_checkout_failed, process_refund,
-- claim_waitlist_notifications, expire_passes : service_role uniquement.

-- ---------------------------------------------------------------------------
-- 7. Temps réel : places restantes mises à jour en direct
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.class_sessions;
  end if;
end $$;
