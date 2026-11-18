-- =============================================================================
-- THE BODY CLUB — Disciplines (Lagree, Yoga, Mat Pilates) et catalogue des cours
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Types de cours : discipline, niveau, intensité (1 à 3 « piments »)
-- ---------------------------------------------------------------------------
alter table public.class_types
  add column discipline text not null default 'lagree' check (discipline in ('lagree', 'yoga', 'mat_pilates')),
  add column level      text not null default 'tous' check (level in ('debutant', 'intermediaire', 'avance', 'tous')),
  add column intensity  smallint not null default 2 check (intensity between 1 and 3),
  add column slug       text,
  add column sort_order integer not null default 0;

create or replace function public.tg_class_type_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then new.slug := public.slugify(new.name); end if;
  return new;
end $$;
create trigger class_type_slug before insert or update of name, slug on public.class_types
  for each row execute function public.tg_class_type_slug();
update public.class_types set slug = null;
alter table public.class_types alter column slug set not null;
alter table public.class_types add constraint class_types_slug_unique unique (slug);
create trigger audit after insert or update or delete on public.class_types for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------------
-- 2. Professeurs : disciplines enseignées (une ou plusieurs)
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column disciplines text[] not null default '{lagree}'
    check (disciplines <@ array['lagree', 'yoga', 'mat_pilates']::text[] and cardinality(disciplines) >= 1);
grant select (disciplines) on public.teachers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Création de cours : le type fixe le nom, la durée et la capacité par défaut
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
  v_type   public.class_types;
  v_title  text;
  v_start  timestamptz;
  i        integer;
begin
  perform public._require_admin();
  if p_class_type_id is not null then
    select * into v_type from public.class_types where id = p_class_type_id;
    if not found then raise exception 'CLASS_TYPE_NOT_FOUND'; end if;
  end if;
  v_title := coalesce(nullif(trim(p_title), ''), v_type.name);
  if v_title is null then raise exception 'TITLE_REQUIRED'; end if;
  if p_repeat_weeks not between 1 and 52 then raise exception 'INVALID_REPEAT'; end if;
  if coalesce(p_duration_minutes, v_type.duration_minutes) not between 10 and 240 then raise exception 'INVALID_DURATION'; end if;

  for i in 0 .. p_repeat_weeks - 1 loop
    v_start := ((p_date + i * 7) + p_start_time) at time zone v_tz;
    return query
    insert into public.class_sessions (class_type_id, title, starts_at, ends_at, teacher_id, capacity, series_id, notes)
    values (p_class_type_id, v_title, v_start,
            v_start + make_interval(mins => coalesce(p_duration_minutes, v_type.duration_minutes)),
            p_teacher_id, coalesce(p_capacity, v_type.default_capacity), v_series, p_notes)
    returning *;
  end loop;
end $$;

-- Modification : le type de cours peut aussi changer
create or replace function public.admin_update_session(
  p_session_id       uuid,
  p_title            text,
  p_date             date,
  p_start_time       time,
  p_duration_minutes integer,
  p_teacher_id       uuid,
  p_capacity         integer,
  p_notes            text default null,
  p_class_type_id    uuid default null
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
    teacher_id = p_teacher_id, capacity = p_capacity, notes = p_notes,
    class_type_id = coalesce(p_class_type_id, class_type_id)
  where id = p_session_id
  returning * into v_session;
  return v_session;
end $$;

drop function if exists public.admin_update_session(uuid, text, date, time, integer, uuid, integer, text);
grant execute on function public.admin_update_session(uuid, text, date, time, integer, uuid, integer, text, uuid) to authenticated;
grant execute on function public.admin_create_sessions(text, date, time, integer, uuid, integer, uuid, integer, text) to authenticated;
