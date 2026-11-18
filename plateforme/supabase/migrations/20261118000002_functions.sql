-- =============================================================================
-- THE BODY CLUB — Règles métier (fonctions transactionnelles)
--
-- Chaque fonction s'exécute dans UNE transaction : soit tout est enregistré,
-- soit rien. Ordre des verrous, toujours le même pour éviter les interblocages :
--   1. class_sessions  2. profiles (la cliente)  3. bookings  4. passes
--
-- Les erreurs métier sont levées avec un code lisible (ex. 'SESSION_FULL'),
-- traduit en français côté application (src/lib/errors.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Aides
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and anonymized_at is null
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.current_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select t.id from public.teachers t where t.profile_id = auth.uid()
$$;

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

create or replace function public._settings() returns public.studio_settings
language sql stable security definer set search_path = public as $$
  select * from public.studio_settings where id
$$;

-- Fin de validité : début du jour qui suit (date d'activation + durée), heure de Paris.
-- Ex. activée le 18/11 à 10h, 1 mois → expire le 19/12 à 00:00 (valable tout le 18/12).
create or replace function public.compute_expiry(
  p_from timestamptz, p_value integer, p_unit public.validity_unit, p_tz text default 'Europe/Paris'
) returns timestamptz
language sql immutable as $$
  select (
    date_trunc('day', p_from at time zone p_tz)
    + case p_unit when 'day' then make_interval(days => p_value) else make_interval(months => p_value) end
    + interval '1 day'
  ) at time zone p_tz
$$;

-- ---------------------------------------------------------------------------
-- RÉSERVATION
-- ---------------------------------------------------------------------------
create or replace function public._book_session(
  p_session_id uuid, p_user_id uuid, p_actor_id uuid, p_is_admin boolean
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_session  public.class_sessions;
  v_settings public.studio_settings := public._settings();
  v_pass     public.passes;
  v_booking  public.bookings;
begin
  if p_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- 1. verrou du cours : sérialise toutes les réservations de ce cours
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status <> 'scheduled' then raise exception 'SESSION_CANCELLED'; end if;
  if not p_is_admin then
    if v_session.starts_at <= now() then raise exception 'SESSION_STARTED'; end if;
    if v_session.starts_at > now() + make_interval(days => v_settings.booking_horizon_days) then
      raise exception 'BOOKING_NOT_OPEN';
    end if;
  end if;

  -- 2. verrou de la cliente : sérialise ses mouvements de crédits
  perform 1 from public.profiles where id = p_user_id and anonymized_at is null for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if exists (
    select 1 from public.bookings
    where session_id = p_session_id and user_id = p_user_id
      and status in ('booked', 'attended', 'no_show')
  ) then
    raise exception 'ALREADY_BOOKED';
  end if;

  if v_session.booked_count >= v_session.capacity then
    raise exception 'SESSION_FULL';
  end if;

  -- 3. choix de la carte : d'abord une carte active qui expire le plus tôt…
  select * into v_pass from public.passes
  where user_id = p_user_id
    and revoked_at is null
    and activated_at is not null
    and expires_at > now()
    and credits_remaining >= v_session.credit_cost
  order by expires_at asc, created_at asc
  limit 1
  for update;

  -- …sinon la plus ancienne carte pas encore activée (sa validité démarre maintenant)
  if not found then
    select * into v_pass from public.passes
    where user_id = p_user_id
      and revoked_at is null
      and activated_at is null
      and credits_remaining >= v_session.credit_cost
    order by created_at asc
    limit 1
    for update;

    if not found then raise exception 'NO_CREDITS'; end if;

    update public.passes
    set activated_at = now(),
        expires_at   = public.compute_expiry(now(), validity_value, validity_unit, v_settings.timezone)
    where id = v_pass.id
    returning * into v_pass;
  end if;

  -- 4. écritures
  update public.passes set credits_remaining = credits_remaining - v_session.credit_cost
  where id = v_pass.id;

  insert into public.bookings (session_id, user_id, pass_id, status, credits_used, created_by)
  values (p_session_id, p_user_id, v_pass.id, 'booked', v_session.credit_cost, p_actor_id)
  returning * into v_booking;

  insert into public.credit_ledger (user_id, pass_id, booking_id, delta, reason, unit_value_cents, actor_id)
  values (p_user_id, v_pass.id, v_booking.id, -v_session.credit_cost, 'booking', v_pass.unit_value_cents, p_actor_id);

  update public.class_sessions set booked_count = booked_count + 1 where id = p_session_id;

  update public.waitlist_entries set status = 'booked'
  where session_id = p_session_id and user_id = p_user_id and status = 'waiting';

  return v_booking;
end $$;

-- Cliente : réserve pour elle-même
create or replace function public.book_session(p_session_id uuid) returns public.bookings
language plpgsql security definer set search_path = public as $$
begin
  return public._book_session(p_session_id, auth.uid(), auth.uid(), false);
end $$;

-- Admin : réserve pour une cliente (ignore l'horizon de réservation et l'heure de début)
create or replace function public.admin_book_session(p_session_id uuid, p_user_id uuid) returns public.bookings
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._book_session(p_session_id, p_user_id, auth.uid(), true);
end $$;

-- ---------------------------------------------------------------------------
-- ANNULATION D'UNE RÉSERVATION
--   ≥ délai (12 h)  → 'cancelled', crédit rendu sur la même carte
--   < délai         → 'late_cancelled', crédit perdu (place libérée)
--   admin           → peut forcer le remboursement (p_force_refund)
-- La carte reste activée même si c'était sa première réservation.
-- ---------------------------------------------------------------------------
create or replace function public._cancel_booking(
  p_booking_id uuid, p_actor_id uuid, p_is_admin boolean, p_force_refund boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_settings public.studio_settings := public._settings();
  v_session_id uuid;
  v_session  public.class_sessions;
  v_booking  public.bookings;
  v_pass     public.passes;
  v_in_time  boolean;
  v_refund   boolean;
  v_waiting  integer;
begin
  select session_id into v_session_id from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  select * into v_session from public.class_sessions where id = v_session_id for update;

  select * into v_booking from public.bookings where id = p_booking_id;
  perform 1 from public.profiles where id = v_booking.user_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if not p_is_admin and v_booking.user_id is distinct from p_actor_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status <> 'booked' then raise exception 'BOOKING_NOT_ACTIVE'; end if;
  if not p_is_admin and v_session.starts_at <= now() then raise exception 'SESSION_STARTED'; end if;

  v_in_time := now() <= v_session.starts_at - make_interval(hours => v_settings.cancel_window_hours);
  v_refund  := coalesce(p_force_refund, v_in_time);

  update public.bookings
  set status = case when v_refund then 'cancelled'::public.booking_status else 'late_cancelled'::public.booking_status end,
      cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  if v_refund and v_booking.pass_id is not null and v_booking.credits_used > 0 then
    select * into v_pass from public.passes where id = v_booking.pass_id for update;
    update public.passes
    set credits_remaining = credits_remaining + v_booking.credits_used
    where id = v_pass.id;
    insert into public.credit_ledger (user_id, pass_id, booking_id, delta, reason, unit_value_cents, actor_id)
    values (v_booking.user_id, v_pass.id, v_booking.id, v_booking.credits_used, 'cancel_refund', v_pass.unit_value_cents, p_actor_id);
  end if;

  update public.class_sessions set booked_count = booked_count - 1 where id = v_session.id;

  select count(*) into v_waiting from public.waitlist_entries
  where session_id = v_session.id and status = 'waiting';

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'session_id', v_session.id,
    'status', v_booking.status,
    'credit_refunded', v_refund,
    'in_time', v_in_time,
    'waitlist_waiting', v_waiting
  );
end $$;

create or replace function public.cancel_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  return public._cancel_booking(p_booking_id, auth.uid(), false, null);
end $$;

create or replace function public.admin_cancel_booking(p_booking_id uuid, p_refund boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._cancel_booking(p_booking_id, auth.uid(), true, p_refund);
end $$;

-- ---------------------------------------------------------------------------
-- ANNULATION D'UN COURS PAR LE STUDIO : toutes les inscrites sont recréditées
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_session(p_session_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session public.class_sessions;
  v_b       record;
  v_count   integer := 0;
  v_users   uuid[] := '{}';
begin
  perform public._require_admin();

  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status = 'cancelled' then raise exception 'SESSION_CANCELLED'; end if;

  for v_b in
    select b.id, b.user_id, b.pass_id, b.credits_used
    from public.bookings b
    where b.session_id = p_session_id and b.status = 'booked'
    order by b.user_id
  loop
    perform 1 from public.profiles where id = v_b.user_id for update;
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_b.id;
    if v_b.pass_id is not null and v_b.credits_used > 0 then
      update public.passes set credits_remaining = credits_remaining + v_b.credits_used where id = v_b.pass_id;
      insert into public.credit_ledger (user_id, pass_id, booking_id, delta, reason, unit_value_cents, actor_id, note)
      select v_b.user_id, p.id, v_b.id, v_b.credits_used, 'session_cancelled', p.unit_value_cents, auth.uid(), p_reason
      from public.passes p where p.id = v_b.pass_id;
    end if;
    v_count := v_count + 1;
    v_users := v_users || v_b.user_id;
  end loop;

  update public.class_sessions
  set status = 'cancelled', cancelled_at = now(), booked_count = 0,
      notes = coalesce(nullif(p_reason, ''), notes)
  where id = p_session_id;

  update public.waitlist_entries set status = 'expired'
  where session_id = p_session_id and status = 'waiting';

  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (auth.uid(), 'cancel_session', 'class_sessions', p_session_id::text,
          jsonb_build_object('refunded_bookings', v_count, 'reason', p_reason));

  return jsonb_build_object('session_id', p_session_id, 'refunded_bookings', v_count, 'user_ids', to_jsonb(v_users));
end $$;

-- ---------------------------------------------------------------------------
-- PRÉSENCES (professeur du cours ou admin, à partir d'1 h avant le cours)
-- ---------------------------------------------------------------------------
create or replace function public.set_attendance(p_booking_id uuid, p_status public.booking_status) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.bookings;
  v_session public.class_sessions;
begin
  if p_status not in ('booked', 'attended', 'no_show') then raise exception 'INVALID_STATUS'; end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into v_session from public.class_sessions where id = v_booking.session_id;

  -- coalesce : sans professeur lié, la comparaison vaut NULL et ne doit jamais autoriser
  if not coalesce(public.is_admin() or v_session.teacher_id = public.current_teacher_id(), false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status not in ('booked', 'attended', 'no_show') then raise exception 'BOOKING_NOT_ACTIVE'; end if;
  if now() < v_session.starts_at - interval '1 hour' then raise exception 'TOO_EARLY'; end if;

  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end $$;

-- ---------------------------------------------------------------------------
-- LISTE D'ATTENTE (notification simple : la première qui réserve a la place)
-- ---------------------------------------------------------------------------
create or replace function public.join_waitlist(p_session_id uuid) returns public.waitlist_entries
language plpgsql security definer set search_path = public as $$
declare
  v_session public.class_sessions;
  v_entry   public.waitlist_entries;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not (public._settings()).waitlist_enabled then raise exception 'WAITLIST_DISABLED'; end if;

  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status <> 'scheduled' then raise exception 'SESSION_CANCELLED'; end if;
  if v_session.starts_at <= now() then raise exception 'SESSION_STARTED'; end if;
  if v_session.booked_count < v_session.capacity then raise exception 'SESSION_NOT_FULL'; end if;
  if exists (select 1 from public.bookings where session_id = p_session_id and user_id = auth.uid()
             and status in ('booked', 'attended', 'no_show')) then
    raise exception 'ALREADY_BOOKED';
  end if;
  if exists (select 1 from public.waitlist_entries where session_id = p_session_id and user_id = auth.uid()
             and status = 'waiting') then
    raise exception 'ALREADY_ON_WAITLIST';
  end if;

  insert into public.waitlist_entries (session_id, user_id) values (p_session_id, auth.uid())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.leave_waitlist(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.waitlist_entries set status = 'left'
  where session_id = p_session_id and user_id = auth.uid() and status = 'waiting';
end $$;

-- Serveur uniquement : liste des personnes à prévenir quand une place se libère
create or replace function public.claim_waitlist_notifications(p_session_id uuid)
returns table (user_id uuid, email text, first_name text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.waitlist_entries w
  set notified_at = now()
  from public.profiles p, public.class_sessions s
  where w.session_id = p_session_id and w.status = 'waiting'
    and p.id = w.user_id and p.anonymized_at is null
    and s.id = w.session_id and s.status = 'scheduled'
    and s.starts_at > now() and s.booked_count < s.capacity
  returning w.user_id, p.email, p.first_name;
end $$;

-- ---------------------------------------------------------------------------
-- ACHATS (Stripe)
-- ---------------------------------------------------------------------------

-- Étape 1 : la cliente choisit une carte → commande « pending » (instantané du produit)
create or replace function public.create_pending_order(p_product_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_order   public.orders;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_product from public.products where id = p_product_id and active;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  insert into public.orders (user_id, product_id, product_name, credits, validity_value, validity_unit, amount_subtotal_cents)
  values (auth.uid(), v_product.id, v_product.name, v_product.credits, v_product.validity_value,
          v_product.validity_unit, v_product.price_cents)
  returning * into v_order;
  return v_order;
end $$;

-- Étape 2 (webhook vérifié) : paiement confirmé → carte créditée, une seule fois
create or replace function public.process_checkout_completed(
  p_event_id              text,
  p_event_type            text,
  p_order_id              uuid,
  p_checkout_session_id   text,
  p_payment_intent_id     text,
  p_amount_subtotal_cents integer,
  p_amount_discount_cents integer,
  p_amount_total_cents    integer,
  p_promotion_code        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_pass  public.passes;
  v_inserted integer;
begin
  -- idempotence : un même événement Stripe n'est traité qu'une fois
  insert into public.stripe_events (id, type) values (p_event_id, p_event_type)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'duplicate_event');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.stripe_checkout_session_id is not null
     and v_order.stripe_checkout_session_id <> p_checkout_session_id then
    raise exception 'ORDER_SESSION_MISMATCH';
  end if;

  -- un autre événement (ex. async_payment_succeeded) a déjà crédité cette commande
  if exists (select 1 from public.passes where order_id = v_order.id) then
    update public.stripe_events set processed_at = now() where id = p_event_id;
    return jsonb_build_object('status', 'already_paid', 'order_id', v_order.id);
  end if;

  perform 1 from public.profiles where id = v_order.user_id for update;

  update public.orders set
    status = 'paid',
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = p_payment_intent_id,
    amount_subtotal_cents = p_amount_subtotal_cents,
    amount_discount_cents = coalesce(p_amount_discount_cents, 0),
    amount_total_cents = p_amount_total_cents,
    promotion_code = p_promotion_code,
    paid_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.passes (user_id, product_id, order_id, source, name, credits_total, credits_remaining,
                             unit_value_cents, validity_value, validity_unit)
  values (v_order.user_id, v_order.product_id, v_order.id, 'stripe', v_order.product_name, v_order.credits,
          v_order.credits, round(p_amount_total_cents::numeric / v_order.credits, 4),
          v_order.validity_value, v_order.validity_unit)
  returning * into v_pass;

  insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents)
  values (v_order.user_id, v_pass.id, v_pass.credits_total, 'purchase', v_pass.unit_value_cents);

  update public.stripe_events set processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'credited', 'order_id', v_order.id, 'pass_id', v_pass.id);
end $$;

-- Session Checkout expirée / paiement échoué
create or replace function public.process_checkout_failed(
  p_event_id text, p_event_type text, p_order_id uuid, p_status public.order_status
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_inserted integer;
begin
  if p_status not in ('failed', 'expired') then raise exception 'INVALID_STATUS'; end if;
  insert into public.stripe_events (id, type) values (p_event_id, p_event_type) on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('status', 'duplicate_event'); end if;

  update public.orders set status = p_status where id = p_order_id and status = 'pending';
  update public.stripe_events set processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'recorded');
end $$;

-- Remboursement (déclenché par l'admin ou reçu par webhook) — idempotent par stripe_refund_id
--   p_credits_to_remove NULL → remboursement total : tous les crédits restants sont retirés
--                              remboursement partiel : aucun crédit retiré
create or replace function public.process_refund(
  p_order_id          uuid,
  p_stripe_refund_id  text,
  p_amount_cents      integer,
  p_credits_to_remove integer default null,
  p_reason            text default null,
  p_actor_id          uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order   public.orders;
  v_pass    public.passes;
  v_full    boolean;
  v_remove  integer := 0;
  v_refund_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('paid', 'partially_refunded') then raise exception 'ORDER_NOT_REFUNDABLE'; end if;

  if p_stripe_refund_id is not null and exists (select 1 from public.refunds where stripe_refund_id = p_stripe_refund_id) then
    return jsonb_build_object('status', 'duplicate_refund');
  end if;
  if v_order.amount_refunded_cents + p_amount_cents > v_order.amount_total_cents then
    raise exception 'REFUND_EXCEEDS_PAYMENT';
  end if;

  perform 1 from public.profiles where id = v_order.user_id for update;
  v_full := v_order.amount_refunded_cents + p_amount_cents = v_order.amount_total_cents;

  select * into v_pass from public.passes where order_id = v_order.id for update;
  if found then
    v_remove := least(v_pass.credits_remaining, coalesce(p_credits_to_remove, case when v_full then v_pass.credits_remaining else 0 end));
    if v_remove > 0 then
      update public.passes set credits_remaining = credits_remaining - v_remove where id = v_pass.id;
      insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents, actor_id, note)
      values (v_order.user_id, v_pass.id, -v_remove, 'refund', v_pass.unit_value_cents, p_actor_id, p_reason);
    end if;
    if v_full then
      update public.passes set revoked_at = now() where id = v_pass.id;
    end if;
  end if;

  insert into public.refunds (order_id, stripe_refund_id, amount_cents, credits_removed, reason, created_by)
  values (v_order.id, p_stripe_refund_id, p_amount_cents, v_remove, p_reason, p_actor_id)
  returning id into v_refund_id;

  update public.orders set
    amount_refunded_cents = amount_refunded_cents + p_amount_cents,
    status = case when v_full then 'refunded'::public.order_status else 'partially_refunded'::public.order_status end
  where id = v_order.id;

  return jsonb_build_object('status', 'refunded', 'refund_id', v_refund_id, 'credits_removed', v_remove, 'full', v_full);
end $$;

-- ---------------------------------------------------------------------------
-- EXPIRATION (tâche planifiée quotidienne)
-- ---------------------------------------------------------------------------
create or replace function public.expire_passes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_p     record;
  v_pass  public.passes;
  v_count integer := 0;
begin
  for v_p in
    select id, user_id from public.passes
    where expires_at <= now() and credits_remaining > 0 and revoked_at is null
    order by user_id
  loop
    perform 1 from public.profiles where id = v_p.user_id for update;
    select * into v_pass from public.passes where id = v_p.id for update;
    -- revérifié sous verrou (une prolongation a pu arriver entre-temps)
    if v_pass.credits_remaining > 0 and v_pass.expires_at <= now() and v_pass.revoked_at is null then
      update public.passes set credits_remaining = 0 where id = v_pass.id;
      insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents)
      values (v_pass.user_id, v_pass.id, -v_pass.credits_remaining, 'expiry', v_pass.unit_value_cents);
      v_count := v_count + 1;
    end if;
  end loop;

  update public.waitlist_entries w set status = 'expired'
  from public.class_sessions s
  where s.id = w.session_id and w.status = 'waiting' and s.starts_at <= now();

  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- ADMINISTRATION DES CRÉDITS
-- ---------------------------------------------------------------------------

-- Ajouter une carte manuellement (geste commercial, paiement sur place, migration bsport)
create or replace function public.admin_grant_pass(
  p_user_id          uuid,
  p_name             text,
  p_credits          integer,
  p_validity_value   integer,
  p_validity_unit    public.validity_unit,
  p_unit_value_cents numeric default 0,
  p_product_id       uuid default null,
  p_note             text default null,
  p_activated_at     timestamptz default null,
  p_expires_at       timestamptz default null,
  p_source           public.pass_source default 'admin',
  p_credits_remaining integer default null
) returns public.passes
language plpgsql security definer set search_path = public as $$
declare
  v_pass public.passes;
  v_remaining integer := coalesce(p_credits_remaining, p_credits);
begin
  perform public._require_admin();
  if p_source = 'stripe' then raise exception 'INVALID_SOURCE'; end if;
  if (p_activated_at is null) <> (p_expires_at is null) then raise exception 'INVALID_DATES'; end if;
  if v_remaining < 0 or v_remaining > p_credits then raise exception 'INVALID_CREDITS'; end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.passes (user_id, product_id, source, name, credits_total, credits_remaining, unit_value_cents,
                             validity_value, validity_unit, activated_at, expires_at, note)
  values (p_user_id, p_product_id, p_source, p_name, p_credits, v_remaining, coalesce(p_unit_value_cents, 0),
          p_validity_value, p_validity_unit, p_activated_at, p_expires_at, p_note)
  returning * into v_pass;

  if v_remaining > 0 then
    insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents, actor_id, note)
    values (p_user_id, v_pass.id, v_remaining,
            case when p_source = 'migration' then 'migration'::public.ledger_reason else 'admin_grant'::public.ledger_reason end,
            v_pass.unit_value_cents, auth.uid(), p_note);
  end if;
  return v_pass;
end $$;

-- Correction de crédits (+/-) avec motif obligatoire
create or replace function public.admin_adjust_pass(p_pass_id uuid, p_delta integer, p_note text) returns public.passes
language plpgsql security definer set search_path = public as $$
declare
  v_pass public.passes;
begin
  perform public._require_admin();
  if p_delta = 0 then raise exception 'INVALID_CREDITS'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;

  select * into v_pass from public.passes where id = p_pass_id;
  if not found then raise exception 'PASS_NOT_FOUND'; end if;
  perform 1 from public.profiles where id = v_pass.user_id for update;
  select * into v_pass from public.passes where id = p_pass_id for update;

  if v_pass.credits_remaining + p_delta < 0 then raise exception 'INVALID_CREDITS'; end if;

  update public.passes set
    credits_remaining = credits_remaining + p_delta,
    credits_total = greatest(credits_total, credits_remaining + p_delta)
  where id = p_pass_id
  returning * into v_pass;

  insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents, actor_id, note)
  values (v_pass.user_id, v_pass.id, p_delta, 'admin_adjust', v_pass.unit_value_cents, auth.uid(), p_note);
  return v_pass;
end $$;

-- Modifier la date d'expiration d'une carte (prolongation, gel…)
create or replace function public.admin_set_pass_expiry(p_pass_id uuid, p_expires_at timestamptz, p_note text) returns public.passes
language plpgsql security definer set search_path = public as $$
declare
  v_old  public.passes;
  v_pass public.passes;
begin
  perform public._require_admin();
  if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;
  select * into v_old from public.passes where id = p_pass_id for update;
  if not found then raise exception 'PASS_NOT_FOUND'; end if;

  update public.passes
  set expires_at = p_expires_at,
      activated_at = coalesce(activated_at, now())
  where id = p_pass_id
  returning * into v_pass;

  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (auth.uid(), 'set_pass_expiry', 'passes', p_pass_id::text,
          jsonb_build_object('old_expires_at', v_old.expires_at, 'new_expires_at', p_expires_at, 'note', p_note));
  return v_pass;
end $$;

-- Changer le rôle d'un compte (client / teacher / admin)
create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'CANNOT_DEMOTE_SELF'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Vues de lecture pratiques
-- ---------------------------------------------------------------------------

-- Solde de crédits utilisable maintenant, par cliente
create or replace function public.my_credit_balance() returns table (
  usable_credits integer, next_expiry timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(credits_remaining) filter (where expires_at is null or expires_at > now()), 0)::integer,
    min(expires_at) filter (where expires_at > now() and credits_remaining > 0)
  from public.passes
  where user_id = auth.uid() and revoked_at is null
$$;

-- Liste des inscrites d'un cours (prof du cours ou admin) — prénom + initiale, sans donnée financière
create or replace function public.session_roster(p_session_id uuid) returns table (
  booking_id uuid, user_id uuid, first_name text, last_initial text, status public.booking_status, booked_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (
    select 1 from public.class_sessions s
    where s.id = p_session_id and s.teacher_id is not null and s.teacher_id = public.current_teacher_id()
  )) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select b.id, b.user_id, p.first_name, left(p.last_name, 1), b.status, b.created_at
  from public.bookings b join public.profiles p on p.id = b.user_id
  where b.session_id = p_session_id and b.status in ('booked', 'attended', 'no_show')
  order by p.first_name;
end $$;
