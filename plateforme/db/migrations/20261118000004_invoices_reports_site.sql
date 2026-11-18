-- =============================================================================
-- THE BODY CLUB — Factures, planning admin, tableaux de bord, apparence du site
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FACTURES ET AVOIRS
-- Numérotation continue, sans trou, par année : F2026-00001, A2026-00001 (avoirs).
-- Le compteur est verrouillé dans la même transaction que le paiement : deux
-- paiements simultanés ne peuvent jamais obtenir le même numéro.
-- Les factures sont figées : vendeur, acheteuse et lignes sont copiés.
-- ---------------------------------------------------------------------------
create table public.invoice_counters (
  kind  text    not null check (kind in ('invoice', 'credit_note')),
  year  integer not null,
  last  integer not null default 0,
  primary key (kind, year)
);

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('invoice', 'credit_note')),
  number             text not null unique,
  year               integer not null,
  seq                integer not null,
  user_id            uuid not null references public.profiles (id) on delete restrict,
  order_id           uuid not null references public.orders (id) on delete restrict,
  refund_id          uuid unique references public.refunds (id) on delete restrict,
  related_invoice_id uuid references public.invoices (id),
  issued_at          timestamptz not null default now(),
  seller             jsonb not null,
  buyer              jsonb not null,
  lines              jsonb not null,
  vat_rate           numeric(5,2) not null,
  total_ht_cents     integer not null,
  total_vat_cents    integer not null,
  total_ttc_cents    integer not null,
  payment_method     text not null default 'Carte bancaire (Stripe)',
  footer             text,
  unique (kind, year, seq),
  check (total_ht_cents + total_vat_cents = total_ttc_cents)
);
create unique index invoices_one_per_order on public.invoices (order_id) where kind = 'invoice';
create index invoices_user_idx on public.invoices (user_id, issued_at desc);
create index invoices_issued_idx on public.invoices (issued_at desc);

create trigger invoices_immutable before update or delete on public.invoices
  for each row execute function public.tg_ledger_immutable();

create or replace function public._next_invoice_number(p_kind text, p_at timestamptz)
returns table (out_number text, out_year integer, out_seq integer)
language plpgsql security definer set search_path = public as $$
declare
  v_year integer := extract(year from p_at at time zone (public._settings()).timezone)::integer;
  v_seq  integer;
begin
  insert into public.invoice_counters (kind, year, last) values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last = public.invoice_counters.last + 1
  returning last into v_seq;
  return query select
    (case p_kind when 'invoice' then 'F' else 'A' end) || v_year::text || '-' || lpad(v_seq::text, 5, '0'),
    v_year, v_seq;
end $$;

create or replace function public._seller_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', legal_name, 'legal_form', legal_form, 'address', legal_address,
    'siret', siret, 'vat_number', vat_number, 'trade_name', studio_name)
  from public.studio_settings where id
$$;

-- Facture d'un paiement (appelée par process_checkout_completed). Idempotente.
create or replace function public._issue_invoice_for_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_buyer public.profiles;
  v_s     public.studio_settings := public._settings();
  v_num   record;
  v_ht    integer;
  v_lines jsonb;
  v_id    uuid;
begin
  select id into v_id from public.invoices where order_id = p_order_id and kind = 'invoice';
  if found then return v_id; end if;

  select * into v_order from public.orders where id = p_order_id;
  select * into v_buyer from public.profiles where id = v_order.user_id;
  select * into v_num from public._next_invoice_number('invoice', coalesce(v_order.paid_at, now()));

  v_ht := round(v_order.amount_total_cents / (1 + v_s.vat_rate / 100));
  v_lines := jsonb_build_array(jsonb_build_object(
    'label', v_order.product_name, 'quantity', 1,
    'unit_ttc_cents', v_order.amount_subtotal_cents));
  if v_order.amount_discount_cents > 0 then
    v_lines := v_lines || jsonb_build_object(
      'label', 'Remise' || coalesce(' (' || v_order.promotion_code || ')', ''), 'quantity', 1,
      'unit_ttc_cents', -v_order.amount_discount_cents);
  end if;

  insert into public.invoices (kind, number, year, seq, user_id, order_id, issued_at, seller, buyer, lines,
                               vat_rate, total_ht_cents, total_vat_cents, total_ttc_cents, footer)
  values ('invoice', v_num.out_number, v_num.out_year, v_num.out_seq, v_order.user_id, v_order.id, coalesce(v_order.paid_at, now()),
          public._seller_snapshot(),
          jsonb_build_object('name', trim(v_buyer.first_name || ' ' || v_buyer.last_name), 'email', v_buyer.email),
          v_lines, v_s.vat_rate, v_ht, v_order.amount_total_cents - v_ht, v_order.amount_total_cents, v_s.invoice_footer)
  returning id into v_id;
  return v_id;
end $$;

-- Avoir d'un remboursement (appelé par process_refund)
create or replace function public._issue_credit_note(p_refund_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_refund  public.refunds;
  v_order   public.orders;
  v_invoice public.invoices;
  v_s       public.studio_settings := public._settings();
  v_num     record;
  v_ht      integer;
  v_id      uuid;
begin
  select * into v_refund from public.refunds where id = p_refund_id;
  select * into v_order from public.orders where id = v_refund.order_id;
  select * into v_invoice from public.invoices where order_id = v_order.id and kind = 'invoice';
  select * into v_num from public._next_invoice_number('credit_note', v_refund.created_at);

  v_ht := round(v_refund.amount_cents / (1 + v_s.vat_rate / 100));
  insert into public.invoices (kind, number, year, seq, user_id, order_id, refund_id, related_invoice_id, issued_at,
                               seller, buyer, lines, vat_rate, total_ht_cents, total_vat_cents, total_ttc_cents, footer)
  values ('credit_note', v_num.out_number, v_num.out_year, v_num.out_seq, v_order.user_id, v_order.id, v_refund.id, v_invoice.id,
          v_refund.created_at, public._seller_snapshot(),
          coalesce(v_invoice.buyer, (select jsonb_build_object('name', trim(first_name || ' ' || last_name), 'email', email)
                                     from public.profiles where id = v_order.user_id)),
          jsonb_build_array(jsonb_build_object(
            'label', 'Remboursement — ' || v_order.product_name || coalesce(' (facture ' || v_invoice.number || ')', ''),
            'quantity', 1, 'unit_ttc_cents', -v_refund.amount_cents)),
          v_s.vat_rate, -v_ht, -(v_refund.amount_cents - v_ht), -v_refund.amount_cents, v_s.invoice_footer)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. PLANNING : création rapide, séries, copie de semaine
-- Les heures sont saisies en heure de Paris ; la conversion (été/hiver) est faite ici.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_sessions(
  p_title            text,
  p_date             date,
  p_start_time       time,
  p_duration_minutes integer,
  p_teacher_id       uuid,
  p_capacity         integer,
  p_class_type_id    uuid default null,
  p_repeat_weeks     integer default 1,
  p_notes            text default null
) returns setof public.class_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_tz     text := (public._settings()).timezone;
  v_series uuid := case when p_repeat_weeks > 1 then gen_random_uuid() end;
  v_start  timestamptz;
  i        integer;
begin
  perform public._require_admin();
  if coalesce(trim(p_title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  if p_repeat_weeks not between 1 and 52 then raise exception 'INVALID_REPEAT'; end if;
  if p_duration_minutes not between 10 and 240 then raise exception 'INVALID_DURATION'; end if;

  for i in 0 .. p_repeat_weeks - 1 loop
    v_start := ((p_date + i * 7) + p_start_time) at time zone v_tz;
    return query
    insert into public.class_sessions (class_type_id, title, starts_at, ends_at, teacher_id, capacity, series_id, notes)
    values (p_class_type_id, trim(p_title), v_start, v_start + make_interval(mins => p_duration_minutes),
            p_teacher_id, p_capacity, v_series, p_notes)
    returning *;
  end loop;
end $$;

create or replace function public.admin_update_session(
  p_session_id       uuid,
  p_title            text,
  p_date             date,
  p_start_time       time,
  p_duration_minutes integer,
  p_teacher_id       uuid,
  p_capacity         integer,
  p_notes            text default null
) returns public.class_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_tz      text := (public._settings()).timezone;
  v_start   timestamptz := (p_date + p_start_time) at time zone v_tz;
  v_session public.class_sessions;
begin
  perform public._require_admin();
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if p_capacity < v_session.booked_count then raise exception 'CAPACITY_BELOW_BOOKINGS'; end if;

  update public.class_sessions set
    title = trim(p_title), starts_at = v_start, ends_at = v_start + make_interval(mins => p_duration_minutes),
    teacher_id = p_teacher_id, capacity = p_capacity, notes = p_notes
  where id = p_session_id
  returning * into v_session;
  return v_session;
end $$;

-- Copie tous les cours d'une semaine (lundi → dimanche) vers les N semaines suivant p_target_monday.
-- Un cours identique (même titre, même heure) déjà présent n'est pas recopié.
create or replace function public.admin_copy_week(p_source_monday date, p_target_monday date, p_weeks integer default 1)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tz    text := (public._settings()).timezone;
  v_count integer := 0;
  v_n     integer;
  w       integer;
begin
  perform public._require_admin();
  if extract(isodow from p_source_monday) <> 1 or extract(isodow from p_target_monday) <> 1 then
    raise exception 'NOT_A_MONDAY';
  end if;
  if p_weeks not between 1 and 52 then raise exception 'INVALID_REPEAT'; end if;

  for w in 0 .. p_weeks - 1 loop
    insert into public.class_sessions (class_type_id, title, starts_at, ends_at, teacher_id, capacity, credit_cost, notes)
    select s.class_type_id, s.title, t.new_start, t.new_start + (s.ends_at - s.starts_at),
           s.teacher_id, s.capacity, s.credit_cost, s.notes
    from public.class_sessions s
    cross join lateral (
      select ((s.starts_at at time zone v_tz) + ((p_target_monday - p_source_monday) + 7 * w) * interval '1 day')
             at time zone v_tz as new_start
    ) t
    where s.status = 'scheduled'
      and s.starts_at >= (p_source_monday::timestamp at time zone v_tz)
      and s.starts_at <  ((p_source_monday + 7)::timestamp at time zone v_tz)
      and not exists (select 1 from public.class_sessions x where x.starts_at = t.new_start and x.title = s.title);
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RÉMUNÉRATION DES PROFESSEURS
-- Pour chaque cours terminé : base = somme des valeurs « prof » des réservations
-- comptées (présente, réservée non pointée, + annulation tardive / absence selon
-- les réglages), en HT ou TTC selon studio_settings.teacher_pay_base.
-- Une carte offerte compte au prix public (pay_value_cents).
-- ---------------------------------------------------------------------------
create or replace function public._teacher_pay_rows(p_from date, p_to date)
returns table (
  session_id uuid, teacher_id uuid, teacher_name text, starts_at timestamptz, title text,
  attendees integer, base_cents numeric, mode public.pay_mode, rate numeric, amount_cents numeric
)
language sql stable security definer set search_path = public as $$
  with st as (select * from public.studio_settings where id),
  sess as (
    select s.*
    from public.class_sessions s, st
    where s.status = 'scheduled'
      and s.teacher_id is not null
      and s.starts_at >= (p_from::timestamp at time zone st.timezone)
      and s.starts_at <  ((p_to + 1)::timestamp at time zone st.timezone)
      and s.starts_at <= now()
  ),
  counted as (
    select b.session_id, count(*)::integer as n, sum(b.pay_value_cents) as pay_value
    from public.bookings b, st
    where b.session_id in (select id from sess)
      and (b.status in ('booked', 'attended')
           or (b.status = 'late_cancelled' and st.late_cancel_counts_for_teacher)
           or (b.status = 'no_show' and st.no_show_counts_for_teacher))
    group by b.session_id
  )
  select
    s.id, s.teacher_id, t.display_name, s.starts_at, s.title,
    coalesce(c.n, 0),
    round(case when st.teacher_pay_base = 'ht'
               then coalesce(c.pay_value, 0) / (1 + st.vat_rate / 100)
               else coalesce(c.pay_value, 0) end, 2) as base,
    coalesce(r.mode, 'none'),
    case r.mode when 'percent' then r.percent when 'fixed_per_class' then r.fixed_cents
                when 'per_attendee' then r.per_attendee_cents else 0 end,
    round(case r.mode
      when 'percent' then
        (case when st.teacher_pay_base = 'ht' then coalesce(c.pay_value, 0) / (1 + st.vat_rate / 100)
              else coalesce(c.pay_value, 0) end) * r.percent / 100
      when 'fixed_per_class' then r.fixed_cents
      when 'per_attendee' then coalesce(c.n, 0) * r.per_attendee_cents
      else 0 end, 2)
  from sess s
  cross join st
  join public.teachers t on t.id = s.teacher_id
  left join counted c on c.session_id = s.id
  left join lateral (
    select * from public.teacher_pay_rules pr
    where pr.teacher_id = s.teacher_id and pr.valid_from <= (s.starts_at at time zone st.timezone)::date
    order by pr.valid_from desc limit 1
  ) r on true
  order by s.starts_at
$$;

-- Admin : détail par cours
create or replace function public.admin_teacher_pay_detail(p_from date, p_to date)
returns table (session_id uuid, teacher_id uuid, teacher_name text, starts_at timestamptz, title text,
               attendees integer, base_cents numeric, mode public.pay_mode, rate numeric, amount_cents numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query select * from public._teacher_pay_rows(p_from, p_to);
end $$;

create or replace function public.admin_teacher_pay(p_from date, p_to date)
returns table (teacher_id uuid, teacher_name text, sessions integer, attendees integer,
               base_cents numeric, amount_cents numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return query
  select r.teacher_id, r.teacher_name, count(*)::integer, sum(r.attendees)::integer,
         sum(r.base_cents), sum(r.amount_cents)
  from public._teacher_pay_rows(p_from, p_to) r
  group by r.teacher_id, r.teacher_name
  order by sum(r.amount_cents) desc, r.teacher_name;
end $$;

-- Professeur : uniquement ses propres cours et sa rémunération
create or replace function public.my_teacher_pay(p_from date, p_to date)
returns table (session_id uuid, starts_at timestamptz, title text, attendees integer, amount_cents numeric)
language sql stable security definer set search_path = public as $$
  select r.session_id, r.starts_at, r.title, r.attendees, r.amount_cents
  from public._teacher_pay_rows(p_from, p_to) r
  where r.teacher_id = public.current_teacher_id()
$$;

-- ---------------------------------------------------------------------------
-- 4. TABLEAU DE BORD
-- Encaissé (trésorerie) et valeur consommée sont deux vues distinctes : jamais additionnées.
-- ---------------------------------------------------------------------------
create or replace function public.admin_revenue_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_s    public.studio_settings := public._settings();
  v_from timestamptz := p_from::timestamp at time zone v_s.timezone;
  v_to   timestamptz := (p_to + 1)::timestamp at time zone v_s.timezone;
  v_r    jsonb;
begin
  perform public._require_admin();

  with paid as (
    select * from public.orders
    where paid_at >= v_from and paid_at < v_to and status in ('paid', 'partially_refunded', 'refunded')
  ),
  ref as (select coalesce(sum(amount_cents), 0) as total from public.refunds where created_at >= v_from and created_at < v_to),
  sess as (
    select * from public.class_sessions
    where status = 'scheduled' and starts_at >= v_from and starts_at < v_to
  ),
  bk as (
    select b.* from public.bookings b join sess s on s.id = b.session_id
    where b.status in ('booked', 'attended', 'no_show', 'late_cancelled')
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'gross_cents',   (select coalesce(sum(amount_total_cents), 0) from paid),
    'refunds_cents', (select total from ref),
    'fees_cents',    (select coalesce(sum(stripe_fee_cents), 0) from paid),
    'orders',        (select count(*) from paid),
    'discounts_cents', (select coalesce(sum(amount_discount_cents), 0) from paid),
    'products_sold', coalesce((select jsonb_agg(x order by x->>'name') from (
                        select jsonb_build_object('name', product_name, 'count', count(*),
                                                  'amount_cents', sum(amount_total_cents)) x
                        from paid group by product_name) q), '[]'::jsonb),
    'bookings',      (select count(*) from bk where status <> 'late_cancelled'),
    'late_cancellations', (select count(*) from bk where status = 'late_cancelled'),
    'no_shows',      (select count(*) from bk where status = 'no_show'),
    'active_clients', (select count(distinct user_id) from bk),
    'sessions',      (select count(*) from sess),
    'capacity',      (select coalesce(sum(capacity), 0) from sess),
    'credits_consumed', (select coalesce(sum(credits_used), 0) from bk),
    'consumed_value_cents', (select round(coalesce(sum(value_cents), 0)) from bk),
    'vat_rate',      v_s.vat_rate
  ) into v_r;

  return v_r
    || jsonb_build_object(
         'net_ttc_cents', (v_r->>'gross_cents')::int - (v_r->>'refunds_cents')::int,
         'net_ht_cents', round(((v_r->>'gross_cents')::int - (v_r->>'refunds_cents')::int) / (1 + v_s.vat_rate / 100)),
         'fill_rate', case when (v_r->>'capacity')::int > 0
                           then round((v_r->>'bookings')::numeric / (v_r->>'capacity')::int, 4) else 0 end);
end $$;

-- Jour, semaine (lundi → dimanche) et mois en cours, heure de Paris
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone (public._settings()).timezone)::date;
  v_week  date := v_today - (extract(isodow from v_today)::integer - 1);
  v_month date := date_trunc('month', v_today)::date;
begin
  perform public._require_admin();
  return jsonb_build_object(
    'today', public.admin_revenue_summary(v_today, v_today),
    'week',  public.admin_revenue_summary(v_week, v_week + 6),
    'month', public.admin_revenue_summary(v_month, (v_month + interval '1 month')::date - 1)
  );
end $$;

-- Meilleures clientes : montant payé (net des remboursements) et cours suivis
create or replace function public.admin_top_clients(p_from date, p_to date, p_limit integer default 10)
returns table (user_id uuid, full_name text, email text, paid_cents bigint, classes bigint, last_class timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz   text := (public._settings()).timezone;
  v_from timestamptz := p_from::timestamp at time zone v_tz;
  v_to   timestamptz := (p_to + 1)::timestamp at time zone v_tz;
begin
  perform public._require_admin();
  return query
  with pay as (
    select o.user_id, sum(o.amount_total_cents - o.amount_refunded_cents)::bigint as paid
    from public.orders o
    where o.paid_at >= v_from and o.paid_at < v_to
    group by o.user_id
  ),
  cls as (
    select b.user_id, count(*)::bigint as n, max(s.starts_at) as last_at
    from public.bookings b join public.class_sessions s on s.id = b.session_id
    where s.starts_at >= v_from and s.starts_at < v_to and s.starts_at <= now()
      and b.status in ('booked', 'attended')
    group by b.user_id
  )
  select p.id, trim(p.first_name || ' ' || p.last_name), p.email,
         coalesce(pay.paid, 0), coalesce(cls.n, 0), cls.last_at
  from public.profiles p
  left join pay on pay.user_id = p.id
  left join cls on cls.user_id = p.id
  where (pay.paid is not null or cls.n is not null) and p.anonymized_at is null
  order by coalesce(pay.paid, 0) desc, coalesce(cls.n, 0) desc
  limit p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- 5. APPARENCE DU SITE (modifiable depuis l'administration)
-- Couleurs strictement au format #RRGGBB : aucune injection CSS possible.
-- ---------------------------------------------------------------------------
create table public.site_appearance (
  id                boolean primary key default true check (id),
  color_background  text not null default '#faf7f2' check (color_background ~ '^#[0-9a-fA-F]{6}$'),
  color_surface     text not null default '#f1ebe3' check (color_surface    ~ '^#[0-9a-fA-F]{6}$'),
  color_text        text not null default '#2a2421' check (color_text       ~ '^#[0-9a-fA-F]{6}$'),
  color_muted       text not null default '#7b716b' check (color_muted      ~ '^#[0-9a-fA-F]{6}$'),
  color_accent      text not null default '#9c7f70' check (color_accent     ~ '^#[0-9a-fA-F]{6}$'),
  color_line        text not null default '#e4dcd2' check (color_line       ~ '^#[0-9a-fA-F]{6}$'),
  heading_font      text not null default 'cormorant' check (heading_font in ('cormorant', 'playfair', 'bodoni')),
  body_font         text not null default 'jost' check (body_font in ('jost', 'inter', 'montserrat')),
  button_shape      text not null default 'pill' check (button_shape in ('pill', 'rounded', 'square')),
  logo_url          text,
  hero_image_url    text,
  hero_kicker       text not null default 'Studio de Lagree',
  hero_title        text not null default 'The Body Club',
  hero_subtitle     text not null default 'Réservez votre prochain cours en quelques secondes.',
  about_title       text not null default 'Le studio',
  about_text        text not null default '',
  address           text not null default '',
  contact_email     text not null default '',
  contact_phone     text not null default '',
  instagram_url     text not null default '',
  updated_at        timestamptz not null default now()
);
insert into public.site_appearance (id) values (true);

create trigger set_updated_at before update on public.site_appearance for each row execute function public.tg_set_updated_at();
create trigger audit after update on public.site_appearance for each row execute function public.tg_audit();

-- Images du site (logo, photo d'accueil) : stockage Supabase public, écriture admin
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('site', 'site', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "site images admin insert" on storage.objects for insert to app_authenticated
      with check (bucket_id = 'site' and public.is_admin())$p$;
    execute $p$create policy "site images admin update" on storage.objects for update to app_authenticated
      using (bucket_id = 'site' and public.is_admin())$p$;
    execute $p$create policy "site images admin delete" on storage.objects for delete to app_authenticated
      using (bucket_id = 'site' and public.is_admin())$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Sécurité des nouveaux objets
-- ---------------------------------------------------------------------------
revoke all on public.invoice_counters, public.invoices, public.site_appearance from app_anon, app_authenticated;
revoke execute on all functions in schema public from public, app_anon, app_authenticated;
grant all on public.invoice_counters, public.invoices, public.site_appearance to app_service;
grant execute on all functions in schema public to app_service;

alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.site_appearance enable row level security;

grant select on public.invoices to app_authenticated;
create policy "own invoices" on public.invoices for select using (user_id = auth.uid() or public.is_admin());

grant select on public.site_appearance to app_anon, app_authenticated;
grant update (color_background, color_surface, color_text, color_muted, color_accent, color_line,
              heading_font, body_font, button_shape, logo_url, hero_image_url, hero_kicker, hero_title,
              hero_subtitle, about_title, about_text, address, contact_email, contact_phone, instagram_url)
  on public.site_appearance to app_authenticated;
create policy "appearance readable" on public.site_appearance for select using (true);
create policy "appearance admin update" on public.site_appearance for update using (public.is_admin()) with check (public.is_admin());

grant update (legal_name, legal_form, legal_address, siret, vat_number, invoice_footer, unlimited_late_cancel_limit)
  on public.studio_settings to app_authenticated;

-- (la révocation globale ci-dessus a retiré les droits accordés en 0003 : on les rétablit)
grant execute on function public.is_admin()            to app_anon, app_authenticated;
grant execute on function public.current_teacher_id()  to app_anon, app_authenticated;
grant execute on function public.current_app_role()    to app_authenticated;
grant execute on function public.compute_expiry(timestamptz, integer, public.validity_unit, text) to app_anon, app_authenticated;
grant execute on function public.book_session(uuid)          to app_authenticated;
grant execute on function public.cancel_booking(uuid)        to app_authenticated;
grant execute on function public.join_waitlist(uuid)         to app_authenticated;
grant execute on function public.leave_waitlist(uuid)        to app_authenticated;
grant execute on function public.create_pending_order(uuid)  to app_authenticated;
grant execute on function public.my_credit_balance()         to app_authenticated;
grant execute on function public.session_roster(uuid)                          to app_authenticated;
grant execute on function public.set_attendance(uuid, public.booking_status)   to app_authenticated;
grant execute on function public.admin_book_session(uuid, uuid)                to app_authenticated;
grant execute on function public.admin_cancel_booking(uuid, boolean)           to app_authenticated;
grant execute on function public.admin_cancel_session(uuid, text)              to app_authenticated;
grant execute on function public.admin_grant_pass(uuid, text, integer, integer, public.validity_unit, numeric, uuid, text, timestamptz, timestamptz, public.pass_source, integer, numeric) to app_authenticated;
grant execute on function public.admin_adjust_pass(uuid, integer, text)        to app_authenticated;
grant execute on function public.admin_set_pass_expiry(uuid, timestamptz, text) to app_authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role)         to app_authenticated;

grant execute on function public.admin_create_sessions(text, date, time, integer, uuid, integer, uuid, integer, text) to app_authenticated;
grant execute on function public.admin_update_session(uuid, text, date, time, integer, uuid, integer, text) to app_authenticated;
grant execute on function public.admin_copy_week(date, date, integer)  to app_authenticated;
grant execute on function public.admin_teacher_pay(date, date)         to app_authenticated;
grant execute on function public.admin_teacher_pay_detail(date, date)  to app_authenticated;
grant execute on function public.my_teacher_pay(date, date)            to app_authenticated;
grant execute on function public.admin_revenue_summary(date, date)     to app_authenticated;
grant execute on function public.admin_dashboard()                     to app_authenticated;
grant execute on function public.admin_top_clients(date, date, integer) to app_authenticated;
