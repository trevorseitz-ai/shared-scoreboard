alter table public.score_events
  add column event_order bigint generated always as identity;

drop index public.score_events_undo_lookup_idx;

create index score_events_undo_lookup_idx
  on public.score_events (game_id, round_number, side, event_order desc)
  where kind <> 'undo' and undone_at is null;

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
