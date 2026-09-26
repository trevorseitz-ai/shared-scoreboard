create or replace function public.apply_host_score_action(
  p_public_code text,
  p_host_hash text,
  p_side smallint,
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
  v_current_score bigint;
begin
  if p_host_hash is null
    or p_host_hash !~ '^[a-f0-9]{64}$'
    or p_side is null
    or p_side not in (1, 2)
    or p_delta is null
    or p_delta = 0
    or p_delta not between -999999 and 999999
    or p_action_id is null
  then
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

  if exists (
    select 1
    from public.score_events
    where client_action_id = p_action_id
  ) then
    return;
  end if;

  v_current_score := case
    when p_side = 1 then v_game.side_one_score
    else v_game.side_two_score
  end;

  if v_current_score + p_delta < 0 then
    raise exception using message = 'scoreboard:below_zero', errcode = 'P0001';
  end if;

  insert into public.score_events (
    game_id, side, delta, kind, round_number, client_action_id
  ) values (
    v_game.id,
    p_side,
    p_delta,
    case when p_delta > 0 then 'add' else 'subtract' end,
    v_game.round_number,
    p_action_id
  );

  if p_side = 1 then
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

create or replace function public.undo_host_score_action(
  p_public_code text,
  p_host_hash text,
  p_side smallint,
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
  v_undo_id uuid := gen_random_uuid();
  v_inverse bigint;
begin
  if p_host_hash is null
    or p_host_hash !~ '^[a-f0-9]{64}$'
    or p_side is null
    or p_side not in (1, 2)
    or p_action_id is null
  then
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

  if exists (
    select 1
    from public.score_events
    where client_action_id = p_action_id
  ) then
    return;
  end if;

  select e.* into v_event
  from public.score_events as e
  where e.game_id = v_game.id
    and e.side = p_side
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
    id, game_id, side, delta, kind, round_number, client_action_id,
    undoes_event_id
  ) values (
    v_undo_id,
    v_game.id,
    p_side,
    v_inverse,
    'undo',
    v_game.round_number,
    p_action_id,
    v_event.id
  );

  update public.score_events
  set undone_by_event_id = v_undo_id,
      undone_at = now()
  where id = v_event.id;

  if p_side = 1 then
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

revoke all on function public.apply_host_score_action(text, text, smallint, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.undo_host_score_action(text, text, smallint, uuid)
  from public, anon, authenticated;

grant execute on function public.apply_host_score_action(text, text, smallint, bigint, uuid)
  to anon, service_role;
grant execute on function public.undo_host_score_action(text, text, smallint, uuid)
  to anon, service_role;
