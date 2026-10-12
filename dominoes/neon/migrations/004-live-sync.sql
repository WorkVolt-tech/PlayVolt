CREATE TABLE game_private.presence (
 client_id uuid NOT NULL, actor text NOT NULL, channel text NOT NULL, key text NOT NULL, meta jsonb NOT NULL,
 seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(client_id,channel)
);
CREATE INDEX presence_expiry ON game_private.presence(seen_at);
CREATE FUNCTION public.watch_room(p_room uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('room',to_jsonb(r)-'code'-'creator_actor'-'pile',
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'room_id',p.room_id,'seat',p.seat,'nickname',p.nickname,'is_ai',p.is_ai,'stand_in',p.stand_in,'left_at',p.left_at,'avatar',p.avatar,'tile_skin',p.tile_skin,'hand',(SELECT coalesce(jsonb_agg('[0,0]'::jsonb),'[]') FROM jsonb_array_elements(p.hand)))) FROM public.domino_players p WHERE p.room_id=r.id),'[]'),
 'board',(SELECT to_jsonb(b) FROM public.board b WHERE b.room_id=r.id),
 'events',coalesce((SELECT jsonb_agg(e) FROM public.game_events e WHERE e.room_id=r.id),'[]'))
 FROM public.domino_rooms r WHERE r.id=p_room AND r.status IN ('playing','round_end','finished');
$$;
CREATE FUNCTION public.sync_presence(p_client uuid,p_entries jsonb,p_channels jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; ch text; rid uuid; rows jsonb; pres jsonb:='{}'; actor_key text:=public.game_actor();
BEGIN
 IF actor_key IS NULL OR jsonb_array_length(p_entries)>8 OR jsonb_array_length(p_channels)>32 THEN RAISE EXCEPTION 'Invalid presence'; END IF;
 DELETE FROM game_private.presence WHERE client_id=p_client AND actor=actor_key
 AND channel NOT IN(SELECT value->>'channel' FROM jsonb_array_elements(p_entries));
 FOR s IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
  ch:=s->>'channel';
  IF ch !~ '^(game|watch)-[0-9a-f-]{36}$' OR length(s->>'key')>80 OR octet_length(s::text)>2048 THEN RAISE EXCEPTION 'Invalid presence'; END IF;
  rid:=substring(ch from position('-' in ch)+1)::uuid;
  IF ch LIKE 'game-%' AND NOT EXISTS(SELECT 1 FROM public.domino_players WHERE room_id=rid AND seat::text=s->>'key'
    AND (actor=actor_key OR (user_id=auth.uid() AND auth.uid() IS NOT NULL))) THEN RAISE EXCEPTION 'Seat access denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.domino_rooms WHERE id=rid) THEN CONTINUE; END IF;
  INSERT INTO game_private.presence(client_id,actor,channel,key,meta) VALUES(p_client,actor_key,ch,s->>'key',s->'meta')
  ON CONFLICT(client_id,channel) DO UPDATE SET key=excluded.key,meta=excluded.meta,seen_at=clock_timestamp()
  WHERE game_private.presence.actor=actor_key;
 END LOOP;
 DELETE FROM game_private.presence WHERE seen_at<clock_timestamp()-interval '35 seconds';
 FOR s IN SELECT value FROM jsonb_array_elements(p_channels) LOOP
  ch:=s#>>'{}';
  IF ch !~ '^(game|watch)-[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Invalid channel'; END IF;
  IF ch LIKE 'game-%' AND NOT public.can_play_room(substring(ch from 6)::uuid) THEN CONTINUE; END IF;
  SELECT coalesce(jsonb_object_agg(k,items),'{}') INTO rows FROM (
    SELECT key k,jsonb_agg(meta) items FROM game_private.presence WHERE channel=ch GROUP BY key) q;
  pres:=pres||jsonb_build_object(ch,rows);
 END LOOP;
 RETURN pres;
END; $$;
CREATE FUNCTION public.live_sync(p_client uuid,p_subscriptions jsonb,p_presence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s jsonb;t text;col text;val text;rows jsonb;snapshots jsonb:='{}';pres jsonb;channels jsonb;
BEGIN
 IF jsonb_typeof(p_subscriptions)<>'array' OR jsonb_array_length(p_subscriptions)>32 OR jsonb_typeof(p_presence)<>'array' THEN RAISE EXCEPTION 'Invalid subscriptions'; END IF;
 SELECT coalesce(jsonb_agg(value->>'channel'),'[]') INTO channels FROM jsonb_array_elements(p_subscriptions) WHERE value->>'kind'='presence';
 pres:=public.sync_presence(p_client,p_presence,channels);
 FOR s IN SELECT value FROM jsonb_array_elements(p_subscriptions) WHERE value->>'kind'='table' LOOP
  t:=s->>'table';col:=s->>'column';val:=s->>'value';
  IF t NOT IN ('domino_rooms','domino_players','board','game_events','queue','tournaments','tournament_sides','tournament_members','tournament_matches','friend_challenges') THEN RAISE EXCEPTION 'Invalid table'; END IF;
  IF col IS NOT NULL AND col NOT IN ('id','room_id','tournament_id','from_user','to_user') THEN RAISE EXCEPTION 'Invalid filter'; END IF;
  IF col IS NOT NULL AND val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid filter value'; END IF;
  IF coalesce((s->>'watch')::boolean,false) AND t IN ('domino_rooms','domino_players','board','game_events') AND col IN ('id','room_id') THEN
   rows:=public.watch_room(val::uuid);
   rows:=CASE t WHEN 'domino_rooms' THEN CASE WHEN rows->'room' IS NULL THEN '[]' ELSE jsonb_build_array(rows->'room') END
    WHEN 'board' THEN CASE WHEN rows->'board' IS NULL OR rows->'board'='null'::jsonb THEN '[]' ELSE jsonb_build_array(rows->'board') END
    WHEN 'domino_players' THEN coalesce(rows->'players','[]') ELSE coalesce(rows->'events','[]') END;
  ELSE
   EXECUTE format('SELECT coalesce(jsonb_agg(q),''[]''::jsonb) FROM (SELECT * FROM public.%I %s LIMIT 1000) q',t,
    CASE WHEN col IS NULL THEN '' ELSE format('WHERE %I = %L::uuid',col,val) END) INTO rows;
  END IF;
  snapshots:=snapshots||jsonb_build_object(s->>'id',rows);
 END LOOP;
 RETURN jsonb_build_object('snapshots',snapshots,'presence',pres);
END; $$;
REVOKE ALL ON FUNCTION public.watch_room(uuid),public.sync_presence(uuid,jsonb,jsonb),public.live_sync(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.watch_room(uuid),public.sync_presence(uuid,jsonb,jsonb),public.live_sync(uuid,jsonb,jsonb) TO anonymous,authenticated;
-- After COMMIT, refresh the schema using Neon's Data API update operation.
-- Neon does not refresh this cache through Postgres NOTIFY.
