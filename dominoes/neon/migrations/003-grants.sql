-- Room-scoped access. A random browser secret identifies guests; only its hash is stored.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS game_private;
REVOKE ALL ON SCHEMA game_private FROM PUBLIC;
CREATE FUNCTION public.game_actor() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN length(k)>=32 THEN encode(digest(k,'sha256'),'hex') END
 FROM (SELECT coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-player-key' AS k) h;
$$;
ALTER TABLE public.domino_rooms ADD COLUMN creator_actor text DEFAULT public.game_actor();
ALTER TABLE public.domino_players ADD COLUMN actor text DEFAULT public.game_actor();
ALTER TABLE public.queue ADD COLUMN actor text DEFAULT public.game_actor();
CREATE FUNCTION public.can_play_room(p_room uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.game_actor() IS NOT NULL AND (
 EXISTS(SELECT 1 FROM public.domino_rooms WHERE id=p_room AND creator_actor=public.game_actor()) OR
 EXISTS(SELECT 1 FROM public.domino_players WHERE room_id=p_room AND (actor=public.game_actor() OR (user_id=auth.uid() AND auth.uid() IS NOT NULL)))
 );
$$;
CREATE FUNCTION public.owns_room(p_room uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.domino_rooms WHERE id=p_room AND creator_actor=public.game_actor())
 OR EXISTS(SELECT 1 FROM public.domino_players WHERE room_id=p_room AND seat=0
 AND (actor=public.game_actor() OR (user_id=auth.uid() AND auth.uid() IS NOT NULL)));
$$;
CREATE FUNCTION public.join_room(p_code text,p_nickname text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room public.domino_rooms; player public.domino_players; pos integer;
BEGIN
 IF public.game_actor() IS NULL THEN RAISE EXCEPTION 'Browser session is required'; END IF;
 IF length(trim(p_nickname)) NOT BETWEEN 2 AND 32 THEN RAISE EXCEPTION 'Nickname must be 2–32 characters'; END IF;
 SELECT * INTO room FROM public.domino_rooms WHERE code=upper(p_code) FOR UPDATE;
 IF room.id IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
 SELECT * INTO player FROM public.domino_players WHERE room_id=room.id
 AND (actor=public.game_actor() OR (auth.uid() IS NOT NULL AND user_id=auth.uid())) LIMIT 1;
 IF player.id IS NULL THEN
  IF room.status<>'waiting' THEN RAISE EXCEPTION 'That game has already started'; END IF;
  IF room.game_mode IN ('solo','duo') THEN RAISE EXCEPTION 'This table is a solo game vs AI'; END IF;
  SELECT s INTO pos FROM generate_series(0,3) s WHERE NOT EXISTS(SELECT 1 FROM public.domino_players WHERE room_id=room.id AND seat=s) ORDER BY s LIMIT 1;
  IF pos IS NULL THEN RAISE EXCEPTION 'Room is full'; END IF;
  INSERT INTO public.domino_players(room_id,seat,nickname,user_id,actor) VALUES(room.id,pos,trim(p_nickname),auth.uid(),public.game_actor()) RETURNING * INTO player;
 END IF;
 RETURN jsonb_build_object('room',to_jsonb(room),'player',to_jsonb(player));
END; $$;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_color text DEFAULT '#c9a84c';
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_read ON public.profiles FOR SELECT USING(id=auth.uid());
CREATE POLICY profile_update ON public.profiles FOR UPDATE USING(id=auth.uid()) WITH CHECK(id=auth.uid());
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE(nickname,avatar,avatar_color,updated_at) ON public.profiles TO authenticated;
ALTER TABLE public.domino_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_read ON public.domino_rooms FOR SELECT USING(creator_actor=public.game_actor() OR public.can_play_room(id));
CREATE POLICY room_create ON public.domino_rooms FOR INSERT WITH CHECK(creator_actor=public.game_actor() AND public.game_actor() IS NOT NULL);
CREATE POLICY room_update ON public.domino_rooms FOR UPDATE USING(public.can_play_room(id)) WITH CHECK(public.can_play_room(id));
CREATE POLICY room_delete ON public.domino_rooms FOR DELETE USING(public.can_play_room(id));
GRANT SELECT,INSERT,DELETE ON public.domino_rooms TO anonymous,authenticated;
GRANT UPDATE(code,status,game_mode,ai_difficulty,current_turn,round,scores,streak,match_winner,pending_point,blocked,tournament_match_id,side_by_seat,stats_recorded,updated_at,practice,table_skin,tile_skin,seat_count,deal_variant,pile,opening_tile,deal_no,deal_decided) ON public.domino_rooms TO anonymous,authenticated;
ALTER TABLE public.domino_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY players_room ON public.domino_players FOR SELECT USING(public.can_play_room(room_id));
CREATE POLICY players_insert ON public.domino_players FOR INSERT WITH CHECK(public.owns_room(room_id));
CREATE POLICY players_update ON public.domino_players FOR UPDATE USING(public.can_play_room(room_id)) WITH CHECK(public.can_play_room(room_id));
CREATE POLICY players_delete ON public.domino_players FOR DELETE USING(public.can_play_room(room_id));
GRANT SELECT,INSERT,DELETE ON public.domino_players TO anonymous,authenticated;
GRANT UPDATE(seat,nickname,hand,is_connected,is_ai,user_id,stand_in,left_at,tile_skin,avatar) ON public.domino_players TO anonymous,authenticated;
ALTER TABLE public.board ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_room ON public.board FOR ALL USING(public.can_play_room(room_id)) WITH CHECK(public.can_play_room(room_id));
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_room ON public.game_events FOR ALL USING(public.can_play_room(room_id)) WITH CHECK(public.can_play_room(room_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.board,public.game_events TO anonymous,authenticated;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY queue_read ON public.queue FOR SELECT USING(true);
CREATE POLICY queue_insert ON public.queue FOR INSERT WITH CHECK(actor=public.game_actor() AND public.game_actor() IS NOT NULL AND user_id IS NOT DISTINCT FROM auth.uid());
CREATE POLICY queue_update ON public.queue FOR UPDATE USING(actor=public.game_actor() OR status='waiting') WITH CHECK(actor=public.game_actor() OR (status='matched' AND public.owns_room(room_id)));
CREATE POLICY queue_delete ON public.queue FOR DELETE USING(actor=public.game_actor());
GRANT SELECT,INSERT,DELETE ON public.queue TO anonymous,authenticated;
GRANT UPDATE(status,room_id) ON public.queue TO anonymous,authenticated;
GRANT SELECT ON public.tournaments,public.tournament_sides,public.tournament_members,public.tournament_matches TO anonymous,authenticated;
GRANT SELECT ON public.story_progress,public.table_unlocks,public.friendships,public.blocks,public.friend_challenges TO authenticated;
ALTER TABLE public.wa_tab_la ENABLE ROW LEVEL SECURITY;
CREATE POLICY leaderboard_read ON public.wa_tab_la FOR SELECT USING(true);
GRANT SELECT ON public.wa_tab_la TO anonymous,authenticated;
GRANT USAGE ON SCHEMA public TO anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.game_actor(),public.can_play_room(uuid),public.owns_room(uuid),public.join_room(text,text) TO anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

grant execute on function public.increment_profile_stats(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.play_move(uuid, integer, text, jsonb, jsonb, jsonb, boolean, boolean)
  to anonymous, authenticated;
grant execute on function public.ensure_story_progress() to authenticated;
grant execute on function public.record_challenge(integer, integer, integer, boolean, text) to authenticated;
grant execute on function public.forfeit_match(uuid, uuid) to authenticated;
grant execute on function public.create_tournament(text, text)          to authenticated;
grant execute on function public.create_side(uuid, text, text)          to authenticated;
grant execute on function public.join_side(text, text)                  to authenticated;
grant execute on function public.fill_missing_partner(uuid, text)       to authenticated;
grant execute on function public.start_tournament(uuid)                 to authenticated;
grant execute on function public.advance_bracket(uuid)                  to authenticated;
grant execute on function public.start_tournament_match(uuid) to authenticated;
grant execute on function public.record_round_stats(jsonb) to authenticated;
grant execute on function public.start_partner_practice(uuid) to authenticated;
grant execute on function public.resolve_bot_matches(uuid) to authenticated;
grant execute on function public.tournament_champion(uuid) to authenticated;
grant execute on function public.bot_rating(text)        to authenticated;
grant execute on function public.side_rating(uuid)       to authenticated;
grant execute on function public.name_bot_sides(uuid) to authenticated;
grant execute on function public.cleanup_tournaments() to authenticated;
grant execute on function public.add_bot_side(uuid, text, text) to authenticated;
grant execute on function public.remove_bot_side(uuid)          to authenticated;
grant execute on function public.report_round(uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_tournament(uuid) to authenticated;
grant execute on function public.fill_missing_partner(uuid, text) to authenticated;
grant execute on function public.remove_ai_partner(uuid)          to authenticated;
grant execute on function public.organiser_bot_pool(uuid) to authenticated;
grant execute on function public.record_feat(text) to authenticated;
grant execute on function public.draw_tile(uuid, integer) to authenticated, anonymous;
grant execute on function public.reshuffle_round(uuid, integer) to authenticated, anonymous;
grant execute on function public.keep_deal(uuid) to authenticated, anonymous;
grant execute on function public.wa_tab_la_win(text, text, text, date) to authenticated, anonymous;
grant execute on function public.settle_wa_tab_la() to authenticated, anonymous;
grant execute on function public.heartbeat(text) to authenticated;
grant execute on function public.my_friend_code() to authenticated;
grant execute on function public.friend_request_to(uuid) to authenticated;
grant execute on function public.friend_request_by_nickname(text) to authenticated;
grant execute on function public.friend_request_by_code(text) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friend_block(uuid) to authenticated;
grant execute on function public.friend_unblock(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.challenge_friend(uuid, uuid, text, text) to authenticated;
grant execute on function public.my_challenges() to authenticated;
grant execute on function public.challenge_respond(uuid, boolean) to authenticated;
