-- =============================================================================
-- THE BODY CLUB — Comptes Better Auth
-- =============================================================================

-- Profil créé à l'inscription : champs saisis (colonnes Better Auth), ou
-- raw_user_meta_data (import, scripts).
create or replace function public.tg_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, first_name, last_name, phone, terms_accepted_at, sms_opt_in)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.first_name, ''), m ->> 'first_name', ''),
    coalesce(nullif(new.last_name, ''), m ->> 'last_name', ''),
    coalesce(nullif(new.phone, ''), nullif(m ->> 'phone', '')),
    case when coalesce(new.terms_accepted, (m ->> 'terms_accepted') = 'true') then now() end,
    coalesce(new.sms_opt_in, (m ->> 'sms_opt_in')::boolean, true)
  );
  return new;
end $$;

-- Un compte supprimé : le profil est conservé (factures, historique) mais anonymisé
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete restrict;

-- Mot de passe temporaire donné par l'admin : drapeau levé quand la cliente choisit le sien
-- (déjà géré par public.clear_must_change_password)
