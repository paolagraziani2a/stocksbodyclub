-- =============================================================================
-- THE BODY CLUB — Socle PostgreSQL (Neon)
--
-- Prépare une base PostgreSQL standard pour l'application :
--   • rôles « app_anon », « app_authenticated », « app_service » utilisés par la
--     Row Level Security (le serveur prend le rôle de la cliente connectée) ;
--   • schéma « auth » : comptes et sessions gérés par Better Auth ;
--   • auth.uid() : identifiant de la personne connectée dans la transaction.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Rôles applicatifs (sans connexion : le serveur les endosse avec SET ROLE)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_anon') then create role app_anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'app_authenticated') then create role app_authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    begin
      create role app_service nologin noinherit bypassrls;
    exception when insufficient_privilege then
      create role app_service nologin noinherit; -- hébergeurs qui refusent BYPASSRLS
    end;
  end if;
  -- le rôle de connexion doit pouvoir endosser ces rôles
  execute format('grant app_anon, app_authenticated, app_service to %I', current_user);
end $$;

-- ---------------------------------------------------------------------------
-- Comptes (Better Auth) — schéma « auth »
-- Noms de colonnes en snake_case (correspondance déclarée dans src/lib/auth-server.ts)
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  name               text not null default '',
  email_verified     boolean not null default false,
  image              text,
  -- champs saisis à l'inscription (repris dans public.profiles par déclencheur)
  first_name         text,
  last_name          text,
  phone              text,
  sms_opt_in         boolean,
  terms_accepted     boolean,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists auth.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on auth.sessions (user_id);

create table if not exists auth.accounts (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade,
  account_id                text not null,
  provider_id               text not null,
  -- empreinte du mot de passe (scrypt) : jamais le mot de passe lui-même
  password                  text,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists accounts_user_idx on auth.accounts (user_id);

create table if not exists auth.verifications (
  id          uuid primary key default gen_random_uuid(),
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists verifications_identifier_idx on auth.verifications (identifier);

-- Les comptes ne sont jamais lisibles par les rôles applicatifs
revoke all on all tables in schema auth from public, app_anon, app_authenticated;
grant usage on schema auth to app_anon, app_authenticated, app_service;

-- ---------------------------------------------------------------------------
-- Identité de la personne connectée, posée par le serveur dans chaque transaction
-- (set_config('request.jwt.claims', '{"sub": "<uuid>"}', true))
-- ---------------------------------------------------------------------------
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;
grant execute on function auth.uid() to app_anon, app_authenticated, app_service;
