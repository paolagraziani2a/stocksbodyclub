-- =============================================================================
-- THE BODY CLUB — Schéma principal
-- Montants en centimes (entiers), dates en timestamptz (fuseau studio : Europe/Paris).
-- Les tables ne sont jamais modifiées directement par le navigateur :
-- lecture via RLS, écriture via les fonctions de 20261118000002_functions.sql.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('client', 'teacher', 'admin');
create type public.session_status as enum ('scheduled', 'cancelled');
create type public.booking_status as enum ('booked', 'cancelled', 'late_cancelled', 'attended', 'no_show');
create type public.order_status as enum ('pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'expired');
create type public.pass_source as enum ('stripe', 'admin', 'migration');
create type public.validity_unit as enum ('day', 'month');
create type public.waitlist_status as enum ('waiting', 'booked', 'left', 'expired');
create type public.pay_mode as enum ('percent', 'fixed_per_class', 'per_attendee', 'none');
create type public.ledger_reason as enum (
  'purchase',           -- carte achetée (Stripe)
  'booking',            -- réservation : -1
  'cancel_refund',      -- annulation dans le délai : +1
  'session_cancelled',  -- cours annulé par le studio : +1
  'expiry',             -- crédits expirés : -n
  'refund',             -- remboursement Stripe : crédits retirés
  'admin_grant',        -- carte offerte / ajoutée manuellement
  'admin_adjust',       -- correction manuelle (+/-)
  'migration'           -- import bsport
);

-- ---------------------------------------------------------------------------
-- Paramètres du studio (une seule ligne)
-- ---------------------------------------------------------------------------
create table public.studio_settings (
  id                             boolean primary key default true check (id),
  studio_name                    text    not null default 'The Body Club',
  timezone                       text    not null default 'Europe/Paris',
  cancel_window_hours            integer not null default 12 check (cancel_window_hours between 0 and 168),
  booking_horizon_days           integer not null default 28 check (booking_horizon_days between 1 and 365),
  vat_rate                       numeric(5,2) not null default 20.00 check (vat_rate >= 0 and vat_rate < 100),
  -- Base de calcul de la rémunération des professeurs : 'ht' ou 'ttc'
  teacher_pay_base               text    not null default 'ht' check (teacher_pay_base in ('ht', 'ttc')),
  late_cancel_counts_for_teacher boolean not null default true,
  no_show_counts_for_teacher     boolean not null default true,
  waitlist_enabled               boolean not null default true,
  -- abonnement illimité : nombre max d'annulations tardives consécutives
  unlimited_late_cancel_limit    integer not null default 2 check (unlimited_late_cancel_limit >= 0),
  -- mentions obligatoires des factures
  legal_name                     text    not null default 'The Body Club',
  legal_form                     text    not null default '',
  legal_address                  text    not null default '',
  siret                          text    not null default '',
  vat_number                     text    not null default '',
  invoice_footer                 text    not null default 'Paiement reçu par carte bancaire. Pas d''escompte pour paiement anticipé.',
  updated_at                     timestamptz not null default now()
);
insert into public.studio_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Profils (1 ligne par compte Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               public.app_role not null default 'client',
  email              text not null,
  first_name         text not null default '',
  last_name          text not null default '',
  phone              text,
  stripe_customer_id text unique,
  marketing_consent  boolean not null default false,
  terms_accepted_at  timestamptz,
  anonymized_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Professeurs et règles de rémunération (historisées)
-- ---------------------------------------------------------------------------
create table public.teachers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles (id) on delete set null,
  display_name text not null,
  bio          text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.teacher_pay_rules (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null references public.teachers (id) on delete cascade,
  mode               public.pay_mode not null,
  percent            numeric(5,2) check (percent is null or (percent >= 0 and percent <= 100)),
  fixed_cents        integer check (fixed_cents is null or fixed_cents >= 0),
  per_attendee_cents integer check (per_attendee_cents is null or per_attendee_cents >= 0),
  valid_from         date not null,
  note               text,
  created_at         timestamptz not null default now(),
  unique (teacher_id, valid_from),
  check (
    (mode = 'percent'         and percent is not null) or
    (mode = 'fixed_per_class' and fixed_cents is not null) or
    (mode = 'per_attendee'    and per_attendee_cents is not null) or
    (mode = 'none')
  )
);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------
create table public.class_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  duration_minutes integer not null default 50 check (duration_minutes > 0),
  default_capacity integer not null default 8 check (default_capacity > 0),
  color            text not null default '#C9A99A',
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  class_type_id uuid references public.class_types (id) on delete set null,
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  teacher_id    uuid references public.teachers (id) on delete set null,
  capacity      integer not null check (capacity > 0),
  booked_count  integer not null default 0,
  credit_cost   integer not null default 1 check (credit_cost > 0),
  status        public.session_status not null default 'scheduled',
  series_id     uuid,
  notes         text,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  -- garde-fou ultime contre la surréservation
  constraint booked_within_capacity check (booked_count >= 0 and booked_count <= capacity)
);
create index class_sessions_starts_idx on public.class_sessions (starts_at);
create index class_sessions_teacher_idx on public.class_sessions (teacher_id, starts_at);
create index class_sessions_series_idx on public.class_sessions (series_id);

-- ---------------------------------------------------------------------------
-- Produits (cartes de cours) et commandes Stripe
-- ---------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  credits        integer not null check (credits >= 0),
  price_cents    integer not null check (price_cents >= 0),
  validity_value integer not null check (validity_value > 0),
  validity_unit  public.validity_unit not null default 'month',
  -- abonnement illimité : pas de crédits, validité dès l'achat
  is_unlimited   boolean not null default false,
  -- illimité : valeur d'un cours (CA consommé et rémunération des professeurs)
  class_value_cents integer check (class_value_cents is null or class_value_cents >= 0),
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (is_unlimited or credits > 0),
  check (not is_unlimited or class_value_cents is not null)
);

create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.profiles (id) on delete restrict,
  product_id                 uuid not null references public.products (id) on delete restrict,
  status                     public.order_status not null default 'pending',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  -- instantané du produit au moment de l'achat
  product_name               text not null,
  credits                    integer not null check (credits >= 0),
  is_unlimited               boolean not null default false,
  class_value_cents          integer,
  validity_value             integer not null check (validity_value > 0),
  validity_unit              public.validity_unit not null,
  amount_subtotal_cents      integer not null check (amount_subtotal_cents >= 0),
  amount_discount_cents      integer not null default 0 check (amount_discount_cents >= 0),
  amount_total_cents         integer check (amount_total_cents >= 0),
  amount_refunded_cents      integer not null default 0 check (amount_refunded_cents >= 0),
  stripe_fee_cents           integer check (stripe_fee_cents >= 0),
  promotion_code             text,
  currency                   text not null default 'eur',
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_paid_idx on public.orders (paid_at) where paid_at is not null;

create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete restrict,
  stripe_refund_id text unique,
  amount_cents     integer not null check (amount_cents > 0),
  credits_removed  integer not null default 0 check (credits_removed >= 0),
  reason           text,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index refunds_created_idx on public.refunds (created_at);

-- ---------------------------------------------------------------------------
-- Cartes détenues par les clientes
-- ---------------------------------------------------------------------------
create table public.passes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete restrict,
  product_id        uuid references public.products (id) on delete set null,
  order_id          uuid unique references public.orders (id) on delete restrict,
  source            public.pass_source not null,
  name              text not null,
  is_unlimited      boolean not null default false,
  credits_total     integer not null check (credits_total >= 0),
  credits_remaining integer not null check (credits_remaining >= 0),
  -- valeur TTC d'un crédit = prix payé / nombre de crédits (après remise)
  unit_value_cents  numeric(12,4) not null default 0 check (unit_value_cents >= 0),
  -- valeur d'un crédit pour la rémunération des professeurs : prix public,
  -- même si la carte est offerte ou remisée
  pay_unit_value_cents numeric(12,4) not null default 0 check (pay_unit_value_cents >= 0),
  validity_value    integer not null check (validity_value > 0),
  validity_unit     public.validity_unit not null,
  -- la validité démarre à la première réservation (réglage studio)
  activated_at      timestamptz,
  expires_at        timestamptz,
  revoked_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  check (credits_remaining <= credits_total),
  check (is_unlimited or credits_total > 0),
  check ((activated_at is null) = (expires_at is null))
);
create index passes_user_idx on public.passes (user_id, created_at);
create index passes_expiry_idx on public.passes (expires_at) where credits_remaining > 0;

-- ---------------------------------------------------------------------------
-- Réservations et liste d'attente
-- ---------------------------------------------------------------------------
create table public.bookings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.class_sessions (id) on delete restrict,
  user_id      uuid not null references public.profiles (id) on delete restrict,
  pass_id      uuid references public.passes (id) on delete restrict,
  status       public.booking_status not null default 'booked',
  credits_used integer not null default 1 check (credits_used >= 0),
  -- valeur réellement payée (CA consommé) et valeur pour la rémunération du professeur
  value_cents     numeric(12,4) not null default 0,
  pay_value_cents numeric(12,4) not null default 0,
  created_by   uuid references public.profiles (id),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- une seule réservation active (réservée / présente / absente) par cliente et par cours
create unique index bookings_one_active_per_user
  on public.bookings (session_id, user_id)
  where status in ('booked', 'attended', 'no_show');
create index bookings_user_idx on public.bookings (user_id, created_at desc);
create index bookings_session_idx on public.bookings (session_id);

create table public.waitlist_entries (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.class_sessions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.waitlist_status not null default 'waiting',
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index waitlist_one_waiting_per_user
  on public.waitlist_entries (session_id, user_id) where status = 'waiting';

-- ---------------------------------------------------------------------------
-- Historique des crédits : ajout seul, jamais modifié ni supprimé
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles (id) on delete restrict,
  pass_id          uuid not null references public.passes (id) on delete restrict,
  booking_id       uuid references public.bookings (id) on delete restrict,
  delta            integer not null check (delta <> 0),
  reason           public.ledger_reason not null,
  unit_value_cents numeric(12,4) not null default 0,
  actor_id         uuid references public.profiles (id),
  note             text,
  created_at       timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_pass_idx on public.credit_ledger (pass_id);

-- ---------------------------------------------------------------------------
-- Stripe : idempotence des webhooks
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  id           text primary key, -- evt_...
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Rémunérations figées (validées par l'admin)
-- ---------------------------------------------------------------------------
create table public.teacher_payouts (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete restrict,
  period_start date not null,
  period_end   date not null,
  amount_cents integer not null check (amount_cents >= 0),
  details      jsonb not null default '[]'::jsonb,
  status       text not null default 'validated' check (status in ('validated', 'paid')),
  paid_at      timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  unique (teacher_id, period_start, period_end),
  check (period_end >= period_start)
);

-- ---------------------------------------------------------------------------
-- Journal des opérations sensibles
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Import bsport (zone tampon)
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('clients', 'passes', 'bookings', 'teachers')),
  filename    text,
  status      text not null default 'staged' check (status in ('staged', 'validated', 'committed', 'discarded')),
  summary     jsonb,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  committed_at timestamptz
);

create table public.import_rows (
  id        bigint generated always as identity primary key,
  batch_id  uuid not null references public.import_batches (id) on delete cascade,
  line_no   integer not null,
  raw       jsonb not null,
  status    text not null default 'pending' check (status in ('pending', 'valid', 'error', 'imported', 'skipped')),
  errors    text[],
  target_id uuid
);
create index import_rows_batch_idx on public.import_rows (batch_id, line_no);

-- =============================================================================
-- Déclencheurs génériques
-- =============================================================================

-- updated_at automatique
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at before update on public.profiles       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.class_sessions for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.products       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.orders         for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.bookings       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.studio_settings for each row execute function public.tg_set_updated_at();

-- L'historique des crédits est immuable
create or replace function public.tg_ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'LEDGER_IMMUTABLE: credit_ledger is append-only';
end $$;

create trigger ledger_no_update before update or delete on public.credit_ledger
  for each row execute function public.tg_ledger_immutable();
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function public.tg_ledger_immutable();

-- Journal d'audit pour les tables de configuration sensibles
create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_diff jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old) ->> 'id');
    v_diff := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    v_id := (to_jsonb(new) ->> 'id');
    v_diff := jsonb_build_object('new', to_jsonb(new));
  else
    v_id := (to_jsonb(new) ->> 'id');
    v_diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_diff);
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.products          for each row execute function public.tg_audit();
create trigger audit after insert or update or delete on public.teacher_pay_rules for each row execute function public.tg_audit();
create trigger audit after insert or update or delete on public.teachers          for each row execute function public.tg_audit();
create trigger audit after update on public.studio_settings                       for each row execute function public.tg_audit();
create trigger audit after update of role on public.profiles                      for each row execute function public.tg_audit();
create trigger audit after insert or update or delete on public.teacher_payouts   for each row execute function public.tg_audit();

-- Création automatique du profil à l'inscription
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, terms_accepted_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_handle_new_user();
