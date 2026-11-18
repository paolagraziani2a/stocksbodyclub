-- =============================================================================
-- THE BODY CLUB — Comptes clientes, notifications SMS, séance d'essai, identité visuelle
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profil : SMS et mot de passe temporaire
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column sms_opt_in            boolean not null default true,   -- SMS de service (cours annulé)
  add column must_change_password  boolean not null default false;  -- mot de passe temporaire donné par l'admin

grant update (sms_opt_in) on public.profiles to app_authenticated;

-- La cliente renseigne son téléphone à l'inscription
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, terms_accepted_at, sms_opt_in)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when (new.raw_user_meta_data ->> 'terms_accepted') = 'true' then now() end,
    coalesce((new.raw_user_meta_data ->> 'sms_opt_in')::boolean, true)
  );
  return new;
end $$;

-- La cliente a choisi son propre mot de passe : on lève le drapeau
create or replace function public.clear_must_change_password() returns void
language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 2. Journal des notifications (SMS / email)
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  session_id  uuid references public.class_sessions (id) on delete set null,
  channel     text not null check (channel in ('sms', 'email')),
  kind        text not null,
  recipient   text not null,
  body        text not null,
  status      text not null check (status in ('sent', 'simulated', 'failed', 'skipped')),
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index notification_log_session_idx on public.notification_log (session_id);
create index notification_log_created_idx on public.notification_log (created_at desc);

revoke all on public.notification_log from app_anon, app_authenticated;
grant all on public.notification_log to app_service;
alter table public.notification_log enable row level security;
grant select on public.notification_log to app_authenticated;
create policy "notifications admin read" on public.notification_log for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Séance d'essai : produit limité à N achats par cliente
-- ---------------------------------------------------------------------------
alter table public.products
  add column max_per_client integer check (max_per_client is null or max_per_client > 0);

create or replace function public.create_pending_order(p_product_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_order   public.orders;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_product from public.products where id = p_product_id and active;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  if v_product.max_per_client is not null and (
    select count(*) from public.orders
    where user_id = auth.uid() and product_id = v_product.id and status in ('paid', 'partially_refunded')
  ) >= v_product.max_per_client then
    raise exception 'PRODUCT_LIMIT_REACHED';
  end if;

  insert into public.orders (user_id, product_id, product_name, credits, is_unlimited, class_value_cents,
                             validity_value, validity_unit, amount_subtotal_cents)
  values (auth.uid(), v_product.id, v_product.name, v_product.credits, v_product.is_unlimited,
          v_product.class_value_cents, v_product.validity_value, v_product.validity_unit, v_product.price_cents)
  returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Identité visuelle (inspirée du site thebodyclub-portovecchio.com)
-- ---------------------------------------------------------------------------
alter table public.site_appearance drop constraint site_appearance_heading_font_check;
alter table public.site_appearance drop constraint site_appearance_body_font_check;
alter table public.site_appearance
  add constraint site_appearance_heading_font_check
    check (heading_font in ('bigshoulders', 'cormorant', 'playfair', 'bodoni')),
  add constraint site_appearance_body_font_check
    check (body_font in ('geist', 'jost', 'inter', 'montserrat')),
  add column hero_title_accent text not null default 'club',
  add column color_feature     text not null default '#29362a' check (color_feature ~ '^#[0-9a-fA-F]{6}$'),
  add column marquee_text      text not null default 'The Body Club / Lagree / Mouvement / Porto-Vecchio / Est. 2026';

alter table public.site_appearance
  alter column color_background set default '#f0eadb',
  alter column color_surface    set default '#faf6eb',
  alter column color_text       set default '#131512',
  alter column color_muted      set default '#4f544d',
  alter column color_accent     set default '#4b5c4a',
  alter column color_line       set default '#d8d0bd',
  alter column heading_font     set default 'bigshoulders',
  alter column body_font        set default 'geist',
  alter column hero_kicker      set default 'Porto-Vecchio · Corse',
  alter column hero_title       set default 'The Body',
  alter column hero_subtitle    set default 'Bouger, se soigner, respirer. Réservez votre séance de Lagree en quelques secondes.';

update public.site_appearance set
  color_background = '#f0eadb', color_surface = '#faf6eb', color_text = '#131512', color_muted = '#4f544d',
  color_accent = '#4b5c4a', color_line = '#d8d0bd', heading_font = 'bigshoulders', body_font = 'geist',
  hero_kicker = 'Porto-Vecchio · Corse', hero_title = 'The Body', hero_title_accent = 'club',
  hero_subtitle = 'Bouger, se soigner, respirer. Réservez votre séance de Lagree en quelques secondes.'
where id;

grant update (hero_title_accent, color_feature, marquee_text) on public.site_appearance to app_authenticated;

grant execute on function public.clear_must_change_password() to app_authenticated;
grant execute on function public.create_pending_order(uuid) to app_authenticated;

-- ---------------------------------------------------------------------------
-- 5. Vente au studio (carte bancaire sur place, espèces…) : commande payée,
--    carte créditée et facture émise, comme un paiement en ligne.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column payment_method text not null default 'stripe'
    check (payment_method in ('stripe', 'studio_card', 'cash', 'transfer'));

create or replace function public._payment_label(p text) returns text
language sql immutable as $$
  select case p
    when 'stripe' then 'Carte bancaire (paiement en ligne)'
    when 'studio_card' then 'Carte bancaire (au studio)'
    when 'cash' then 'Espèces'
    when 'transfer' then 'Virement'
    else p end
$$;

-- La facture reprend le moyen de paiement de la commande
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
    'label', v_order.product_name, 'quantity', 1, 'unit_ttc_cents', v_order.amount_subtotal_cents));
  if v_order.amount_discount_cents > 0 then
    v_lines := v_lines || jsonb_build_object(
      'label', 'Remise' || coalesce(' (' || v_order.promotion_code || ')', ''), 'quantity', 1,
      'unit_ttc_cents', -v_order.amount_discount_cents);
  end if;

  insert into public.invoices (kind, number, year, seq, user_id, order_id, issued_at, seller, buyer, lines,
                               vat_rate, total_ht_cents, total_vat_cents, total_ttc_cents, payment_method, footer)
  values ('invoice', v_num.out_number, v_num.out_year, v_num.out_seq, v_order.user_id, v_order.id, coalesce(v_order.paid_at, now()),
          public._seller_snapshot(),
          jsonb_build_object('name', trim(v_buyer.first_name || ' ' || v_buyer.last_name), 'email', v_buyer.email),
          v_lines, v_s.vat_rate, v_ht, v_order.amount_total_cents - v_ht, v_order.amount_total_cents,
          public._payment_label(v_order.payment_method), v_s.invoice_footer)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_sell_product(
  p_user_id uuid, p_product_id uuid, p_payment_method text default 'studio_card', p_discount_cents integer default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products;
  v_order   public.orders;
  v_pass    public.passes;
  v_total   integer;
begin
  perform public._require_admin();
  if p_payment_method not in ('studio_card', 'cash', 'transfer') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into v_product from public.products where id = p_product_id;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if p_discount_cents < 0 or p_discount_cents > v_product.price_cents then raise exception 'INVALID_DISCOUNT'; end if;
  perform 1 from public.profiles where id = p_user_id and anonymized_at is null for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  v_total := v_product.price_cents - p_discount_cents;
  insert into public.orders (user_id, product_id, status, product_name, credits, is_unlimited, class_value_cents,
                             validity_value, validity_unit, amount_subtotal_cents, amount_discount_cents,
                             amount_total_cents, payment_method, paid_at, stripe_fee_cents)
  values (p_user_id, v_product.id, 'paid', v_product.name, v_product.credits, v_product.is_unlimited,
          v_product.class_value_cents, v_product.validity_value, v_product.validity_unit, v_product.price_cents,
          p_discount_cents, v_total, p_payment_method, now(), 0)
  returning * into v_order;

  if v_product.is_unlimited then
    insert into public.passes (user_id, product_id, order_id, source, name, is_unlimited, credits_total, credits_remaining,
                               unit_value_cents, pay_unit_value_cents, validity_value, validity_unit, activated_at, expires_at)
    values (p_user_id, v_product.id, v_order.id, 'admin', v_product.name, true, 0, 0,
            v_product.class_value_cents, v_product.class_value_cents, v_product.validity_value, v_product.validity_unit,
            now(), public.compute_expiry(now(), v_product.validity_value, v_product.validity_unit, (public._settings()).timezone))
    returning * into v_pass;
  else
    insert into public.passes (user_id, product_id, order_id, source, name, credits_total, credits_remaining,
                               unit_value_cents, pay_unit_value_cents, validity_value, validity_unit)
    values (p_user_id, v_product.id, v_order.id, 'admin', v_product.name, v_product.credits, v_product.credits,
            round(v_total::numeric / v_product.credits, 4), round(v_product.price_cents::numeric / v_product.credits, 4),
            v_product.validity_value, v_product.validity_unit)
    returning * into v_pass;
    insert into public.credit_ledger (user_id, pass_id, delta, reason, unit_value_cents, actor_id, note)
    values (p_user_id, v_pass.id, v_pass.credits_total, 'purchase', v_pass.unit_value_cents, auth.uid(),
            'Vente au studio : ' || public._payment_label(p_payment_method));
  end if;

  perform public._issue_invoice_for_order(v_order.id);
  return jsonb_build_object('order_id', v_order.id, 'pass_id', v_pass.id);
end $$;

revoke execute on function public._payment_label(text) from public, app_anon, app_authenticated;
grant execute on function public.admin_sell_product(uuid, uuid, text, integer) to app_authenticated;
