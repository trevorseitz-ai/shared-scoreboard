create index score_events_undoes_event_id_idx on public.score_events (undoes_event_id);
create index score_events_undone_by_event_id_idx on public.score_events (undone_by_event_id);

create policy games_deny_direct_access
  on public.games for all to anon, authenticated
  using (false) with check (false);

create policy score_events_deny_direct_access
  on public.score_events for all to anon, authenticated
  using (false) with check (false);

revoke execute on function public.get_scoreboard_game(text) from authenticated;
revoke execute on function public.create_scoreboard_game(text, text, text, text, text, text, text) from authenticated;
revoke execute on function public.claim_scoreboard_controller(text, text) from authenticated;
revoke execute on function public.apply_score_action(text, text, bigint, uuid) from authenticated;
revoke execute on function public.undo_score_action(text, text, uuid) from authenticated;
revoke execute on function public.start_scoreboard_rematch(text, text) from authenticated;
revoke execute on function public.replace_scoreboard_controller(text, text, smallint, text) from authenticated;
