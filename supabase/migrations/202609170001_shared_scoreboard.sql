create schema if not exists private;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  side_one_name text not null,
  side_two_name text not null,
  side_one_score bigint not null default 0,
  side_two_score bigint not null default 0,
  round_number integer not null default 1,
  version bigint not null default 1,
  status text not null default 'active',
  realtime_topic text not null unique,
  host_token_hash text not null,
  controller_one_invite_hash text not null unique,
  controller_two_invite_hash text not null unique,
  controller_one_session_hash text unique,
  controller_two_session_hash text unique,
  controller_one_claimed_at timestamptz,
  controller_two_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint games_public_code_format check (public_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
  constraint games_side_one_name_length check (char_length(side_one_name) between 1 and 80),
  constraint games_side_two_name_length check (char_length(side_two_name) between 1 and 80),
  constraint games_scores_nonnegative check (side_one_score >= 0 and side_two_score >= 0),
  constraint games_round_positive check (round_number > 0),
  constraint games_version_positive check (version > 0),
  constraint games_status_valid check (status in ('active', 'expired')),
  constraint games_realtime_topic_length check (char_length(realtime_topic) between 32 and 128),
  constraint games_host_hash_format check (host_token_hash ~ '^[a-f0-9]{64}$'),
  constraint games_invite_one_hash_format check (controller_one_invite_hash ~ '^[a-f0-9]{64}$'),
  constraint games_invite_two_hash_format check (controller_two_invite_hash ~ '^[a-f0-9]{64}$'),
  constraint games_session_one_hash_format check (controller_one_session_hash is null or controller_one_session_hash ~ '^[a-f0-9]{64}$'),
  constraint games_session_two_hash_format check (controller_two_session_hash is null or controller_two_session_hash ~ '^[a-f0-9]{64}$')
);

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  event_order bigint generated always as identity,
  game_id uuid not null references public.games(id) on delete cascade,
  side smallint not null,
  delta bigint not null,
  kind text not null,
  round_number integer not null,
  client_action_id uuid not null unique,
  undoes_event_id uuid references public.score_events(id),
  undone_by_event_id uuid references public.score_events(id),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  constraint score_events_side_valid check (side in (1, 2)),
  constraint score_events_delta_valid check (delta <> 0 and abs(delta) <= 999999),
  constraint score_events_kind_valid check (kind in ('add', 'subtract', 'undo')),
  constraint score_events_round_positive check (round_number > 0),
  constraint score_events_undo_shape check (
    (kind = 'undo' and undoes_event_id is not null)
    or (kind <> 'undo' and undoes_event_id is null)
  )
);

create index score_events_undo_lookup_idx
  on public.score_events (game_id, round_number, side, event_order desc)
  where kind <> 'undo' and undone_at is null;

create index score_events_game_id_idx on public.score_events (game_id);
create index score_events_undoes_event_id_idx on public.score_events (undoes_event_id);
create index score_events_undone_by_event_id_idx on public.score_events (undone_by_event_id);
create index games_cleanup_idx on public.games (updated_at);

alter table public.games enable row level security;
alter table public.score_events enable row level security;

create policy games_deny_direct_access
  on public.games for all to anon, authenticated
  using (false) with check (false);

create policy score_events_deny_direct_access
  on public.score_events for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.games from anon, authenticated;
revoke all on table public.score_events from anon, authenticated;

create or replace function public.get_scoreboard_game(p_public_code text)
returns table (
  public_code text,
  side_one_name text,
  side_two_name text,
  side_one_score bigint,
  side_two_score bigint,
  round_number integer,
  version bigint,
  status text,
  realtime_topic text,
  controller_one_claimed boolean,
  controller_two_claimed boolean,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    g.public_code,
    g.side_one_name,
    g.side_two_name,
    g.side_one_score,
    g.side_two_score,
    g.round_number,
    g.version,
    case when g.expires_at <= now() then 'expired' else g.status end,
    g.realtime_topic,
    g.controller_one_session_hash is not null,
    g.controller_two_session_hash is not null,
    g.expires_at
  from public.games as g
  where g.public_code = upper(p_public_code)
  limit 1;
$$;

create or replace function public.create_scoreboard_game(
  p_public_code text,
  p_side_one_name text,
  p_side_two_name text,
  p_realtime_topic text,
  p_host_hash text,
  p_controller_one_invite_hash text,
  p_controller_two_invite_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_public_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
    or char_length(trim(p_side_one_name)) not between 1 and 80
    or char_length(trim(p_side_two_name)) not between 1 and 80
    or char_length(p_realtime_topic) not between 32 and 128
    or p_host_hash !~ '^[a-f0-9]{64}$'
    or p_controller_one_invite_hash !~ '^[a-f0-9]{64}$'
    or p_controller_two_invite_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception using message = 'scoreboard:invalid', errcode = '22023';
  end if;

  delete from public.games
  where updated_at < now() - interval '7 days';

  insert into public.games (
    public_code,
    side_one_name,
    side_two_name,
    realtime_topic,
    host_token_hash,
    controller_one_invite_hash,
    controller_two_invite_hash,
    expires_at
  ) values (
    p_public_code,
    trim(p_side_one_name),
    trim(p_side_two_name),
    p_realtime_topic,
    p_host_hash,
    p_controller_one_invite_hash,
    p_controller_two_invite_hash,
    now() + interval '24 hours'
  );
end;
$$;

create or replace function public.claim_scoreboard_controller(
  p_invite_hash text,
  p_session_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_side smallint;
begin
  if p_invite_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  select g.* into v_game
  from public.games as g
  where g.controller_one_invite_hash = p_invite_hash
     or g.controller_two_invite_hash = p_invite_hash
  for update;

  if not found then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  if v_game.status <> 'active' or v_game.expires_at <= now() then
    raise exception using message = 'scoreboard:expired', errcode = 'P0001';
  end if;

  if v_game.controller_one_invite_hash = p_invite_hash then
    v_side := 1;
    if v_game.controller_one_session_hash is not null then
      raise exception using message = 'scoreboard:already_claimed', errcode = 'P0001';
    end if;

    update public.games
    set controller_one_session_hash = p_session_hash,
        controller_one_claimed_at = now(),
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  else
    v_side := 2;
    if v_game.controller_two_session_hash is not null then
      raise exception using message = 'scoreboard:already_claimed', errcode = 'P0001';
    end if;

    update public.games
    set controller_two_session_hash = p_session_hash,
        controller_two_claimed_at = now(),
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  end if;

  return jsonb_build_object('code', v_game.public_code, 'side', v_side);
end;
$$;

create or replace function public.apply_score_action(
  p_public_code text,
  p_controller_hash text,
  p_delta bigint,
  p_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_side smallint;
  v_current_score bigint;
begin
  if p_delta = 0 or abs(p_delta) > 999999 then
    raise exception using message = 'scoreboard:invalid', errcode = '22023';
  end if;

  select g.* into v_game
  from public.games as g
  where g.public_code = upper(p_public_code)
  for update;

  if not found then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  if v_game.status <> 'active' or v_game.expires_at <= now() then
    raise exception using message = 'scoreboard:expired', errcode = 'P0001';
  end if;

  if p_controller_hash = v_game.controller_one_session_hash then
    v_side := 1;
    v_current_score := v_game.side_one_score;
  elsif p_controller_hash = v_game.controller_two_session_hash then
    v_side := 2;
    v_current_score := v_game.side_two_score;
  else
    raise exception using message = 'scoreboard:forbidden', errcode = 'P0001';
  end if;

  if exists (select 1 from public.score_events where client_action_id = p_action_id) then
    return;
  end if;

  if v_current_score + p_delta < 0 then
    raise exception using message = 'scoreboard:below_zero', errcode = 'P0001';
  end if;

  insert into public.score_events (
    game_id, side, delta, kind, round_number, client_action_id
  ) values (
    v_game.id,
    v_side,
    p_delta,
    case when p_delta > 0 then 'add' else 'subtract' end,
    v_game.round_number,
    p_action_id
  );

  if v_side = 1 then
    update public.games
    set side_one_score = side_one_score + p_delta,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  else
    update public.games
    set side_two_score = side_two_score + p_delta,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  end if;
end;
$$;

create or replace function public.undo_score_action(
  p_public_code text,
  p_controller_hash text,
  p_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_event public.score_events%rowtype;
  v_side smallint;
  v_undo_id uuid := gen_random_uuid();
  v_inverse bigint;
begin
  select g.* into v_game
  from public.games as g
  where g.public_code = upper(p_public_code)
  for update;

  if not found then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  if v_game.status <> 'active' or v_game.expires_at <= now() then
    raise exception using message = 'scoreboard:expired', errcode = 'P0001';
  end if;

  if p_controller_hash = v_game.controller_one_session_hash then
    v_side := 1;
  elsif p_controller_hash = v_game.controller_two_session_hash then
    v_side := 2;
  else
    raise exception using message = 'scoreboard:forbidden', errcode = 'P0001';
  end if;

  if exists (select 1 from public.score_events where client_action_id = p_action_id) then
    return;
  end if;

  select e.* into v_event
  from public.score_events as e
  where e.game_id = v_game.id
    and e.side = v_side
    and e.round_number = v_game.round_number
    and e.kind <> 'undo'
    and e.undone_at is null
  order by e.event_order desc
  limit 1
  for update;

  if not found then
    raise exception using message = 'scoreboard:nothing_to_undo', errcode = 'P0001';
  end if;

  v_inverse := -v_event.delta;

  insert into public.score_events (
    id, game_id, side, delta, kind, round_number, client_action_id, undoes_event_id
  ) values (
    v_undo_id, v_game.id, v_side, v_inverse, 'undo', v_game.round_number, p_action_id, v_event.id
  );

  update public.score_events
  set undone_by_event_id = v_undo_id,
      undone_at = now()
  where id = v_event.id;

  if v_side = 1 then
    update public.games
    set side_one_score = side_one_score + v_inverse,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  else
    update public.games
    set side_two_score = side_two_score + v_inverse,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  end if;
end;
$$;

create or replace function public.start_scoreboard_rematch(
  p_public_code text,
  p_host_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  select g.* into v_game
  from public.games as g
  where g.public_code = upper(p_public_code)
  for update;

  if not found then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  if p_host_hash <> v_game.host_token_hash then
    raise exception using message = 'scoreboard:forbidden', errcode = 'P0001';
  end if;

  if v_game.status <> 'active' or v_game.expires_at <= now() then
    raise exception using message = 'scoreboard:expired', errcode = 'P0001';
  end if;

  update public.games
  set side_one_score = 0,
      side_two_score = 0,
      round_number = round_number + 1,
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '24 hours'
  where id = v_game.id;
end;
$$;

create or replace function public.replace_scoreboard_controller(
  p_public_code text,
  p_host_hash text,
  p_side smallint,
  p_invite_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  if p_side not in (1, 2) or p_invite_hash !~ '^[a-f0-9]{64}$' then
    raise exception using message = 'scoreboard:invalid', errcode = '22023';
  end if;

  select g.* into v_game
  from public.games as g
  where g.public_code = upper(p_public_code)
  for update;

  if not found then
    raise exception using message = 'scoreboard:not_found', errcode = 'P0001';
  end if;

  if p_host_hash <> v_game.host_token_hash then
    raise exception using message = 'scoreboard:forbidden', errcode = 'P0001';
  end if;

  if v_game.status <> 'active' or v_game.expires_at <= now() then
    raise exception using message = 'scoreboard:expired', errcode = 'P0001';
  end if;

  if p_side = 1 then
    update public.games
    set controller_one_invite_hash = p_invite_hash,
        controller_one_session_hash = null,
        controller_one_claimed_at = null,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  else
    update public.games
    set controller_two_invite_hash = p_invite_hash,
        controller_two_session_hash = null,
        controller_two_claimed_at = null,
        version = version + 1,
        updated_at = now(),
        expires_at = now() + interval '24 hours'
    where id = v_game.id;
  end if;
end;
$$;

create or replace function private.broadcast_scoreboard_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'code', new.public_code,
      'version', new.version,
      'roundNumber', new.round_number,
      'sideOneScore', new.side_one_score,
      'sideTwoScore', new.side_two_score
    ),
    'score_changed',
    new.realtime_topic,
    false
  );
  return new;
end;
$$;

create trigger broadcast_scoreboard_change
after update on public.games
for each row execute function private.broadcast_scoreboard_change();

revoke all on function public.get_scoreboard_game(text) from public;
revoke all on function public.create_scoreboard_game(text, text, text, text, text, text, text) from public;
revoke all on function public.claim_scoreboard_controller(text, text) from public;
revoke all on function public.apply_score_action(text, text, bigint, uuid) from public;
revoke all on function public.undo_score_action(text, text, uuid) from public;
revoke all on function public.start_scoreboard_rematch(text, text) from public;
revoke all on function public.replace_scoreboard_controller(text, text, smallint, text) from public;
revoke all on function private.broadcast_scoreboard_change() from public;

grant execute on function public.get_scoreboard_game(text) to anon, service_role;
grant execute on function public.create_scoreboard_game(text, text, text, text, text, text, text) to anon, service_role;
grant execute on function public.claim_scoreboard_controller(text, text) to anon, service_role;
grant execute on function public.apply_score_action(text, text, bigint, uuid) to anon, service_role;
grant execute on function public.undo_score_action(text, text, uuid) to anon, service_role;
grant execute on function public.start_scoreboard_rematch(text, text) to anon, service_role;
grant execute on function public.replace_scoreboard_controller(text, text, smallint, text) to anon, service_role;

revoke all on schema private from public, anon, authenticated;
