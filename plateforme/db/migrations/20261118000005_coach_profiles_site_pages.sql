-- =============================================================================
-- THE BODY CLUB — Profils des coachs et pages publiques du site
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profil public des coachs
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column slug           text,
  add column photo_url      text,
  add column headline       text not null default '',
  add column specialties    text[] not null default '{}',
  add column certifications text not null default '',
  add column instagram_url  text not null default '' check (instagram_url = '' or instagram_url ~ '^https://'),
  add column quote          text not null default '',
  add column show_on_site   boolean not null default true,
  add column sort_order     integer not null default 0;

-- Adresse de page lisible : « Léa Martin » → /coachs/lea-martin
create or replace function public.slugify(p text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(
    lower(translate(p,
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyoAAAAAACEEEEIIIINOOOOOUUUUY')),
    '[^a-z0-9]+', '-', 'g')), ''), 'coach')
$$;

create or replace function public.tg_teacher_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text := public.slugify(new.display_name);
  v_slug text := v_base;
  i integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := public.slugify(new.slug);
    return new;
  end if;
  while exists (select 1 from public.teachers where slug = v_slug and id <> new.id) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;
  new.slug := v_slug;
  return new;
end $$;

create trigger teacher_slug before insert or update of slug on public.teachers
  for each row execute function public.tg_teacher_slug();

update public.teachers set slug = null;  -- génère les adresses des coachs existants
alter table public.teachers alter column slug set not null;
alter table public.teachers add constraint teachers_slug_unique unique (slug);

-- Lecture publique des champs de présentation (jamais profile_id ni la rémunération)
grant select (slug, photo_url, headline, specialties, certifications, instagram_url, quote, show_on_site, sort_order)
  on public.teachers to app_anon, app_authenticated;

-- ---------------------------------------------------------------------------
-- 2. Page d'accueil : photos du studio, horaires, accès
-- ---------------------------------------------------------------------------
create table public.site_photos (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  alt        text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.site_appearance
  add column opening_hours text not null default '',
  add column access_info   text not null default '',
  add column welcome_title text not null default 'Bienvenue au studio',
  add column method_title  text not null default 'La méthode Lagree',
  add column method_text   text not null default 'Un entraînement à faible impact et haute intensité sur Megaformer : mouvements lents et contrôlés, muscles sollicités en continu, gainage profond. 50 minutes pour sculpter, renforcer et gagner en endurance.';

revoke all on public.site_photos from app_anon, app_authenticated;
grant all on public.site_photos to app_service;
alter table public.site_photos enable row level security;
grant select on public.site_photos to app_anon, app_authenticated;
grant insert, update, delete on public.site_photos to app_authenticated;
create policy "photos readable" on public.site_photos for select using (true);
create policy "photos admin write" on public.site_photos for all using (public.is_admin()) with check (public.is_admin());
create trigger audit after insert or delete on public.site_photos for each row execute function public.tg_audit();

grant update (opening_hours, access_info, welcome_title, method_title, method_text) on public.site_appearance to app_authenticated;

grant execute on function public.slugify(text) to app_anon, app_authenticated;

-- Liens externes : https uniquement (empêche les liens javascript:)
alter table public.site_appearance
  add constraint site_instagram_https check (instagram_url = '' or instagram_url ~ '^https://');
