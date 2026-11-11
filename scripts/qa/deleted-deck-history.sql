-- Dev/isolated database only. Requires an existing Archidekt deck with match history; all changes are rolled back.

BEGIN;
DO $$ DECLARE d public.decks%ROWTYPE; p public.match_participants%ROWTYPE; group_id uuid; stats jsonb; BEGIN
 SELECT decks.* INTO d FROM public.decks decks JOIN public.match_participants mp ON mp.deck_id=decks.id JOIN public.matches m ON m.id=mp.match_id JOIN public.group_members gm ON gm.group_id=m.group_id AND gm.user_id=decks.user_id WHERE decks.source_type='archidekt' AND decks.source_url ~ '^https://archidekt[.]com/decks/[0-9]+/?$' AND NOT EXISTS(SELECT 1 FROM public.live_games l WHERE l.status IN ('setup','active') AND l.state::text LIKE '%'||decks.id::text||'%') LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'No eligible Dev fixture'; END IF;
 SELECT mp.* INTO p FROM public.match_participants mp JOIN public.matches m ON m.id=mp.match_id JOIN public.group_members gm ON gm.group_id=m.group_id AND gm.user_id=d.user_id WHERE mp.deck_id=d.id LIMIT 1;
 SELECT m.group_id INTO group_id FROM public.matches m WHERE m.id=p.match_id;
 PERFORM set_config('request.jwt.claim.sub',d.user_id::text,true); PERFORM set_config('test.deck',d.id::text,true); PERFORM set_config('test.user',d.user_id::text,true); PERFORM set_config('test.match',p.match_id::text,true); PERFORM set_config('test.participant',p.id::text,true); PERFORM set_config('test.group',group_id::text,true);
 SELECT to_jsonb(s) INTO stats FROM public.get_arena_stats_participants(group_id,NULL) s WHERE s.match_id=p.match_id AND s.deck_id=d.id LIMIT 1;
 IF stats IS NULL THEN RAISE EXCEPTION 'No initial stats'; END IF; PERFORM set_config('test.stats',stats::text,true);
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL row_security=on;
DELETE FROM public.decks WHERE id=current_setting('test.deck')::uuid;
DO $$ DECLARE stats jsonb; BEGIN
 IF EXISTS(SELECT 1 FROM public.decks WHERE id=current_setting('test.deck')::uuid) THEN RAISE EXCEPTION 'Deleted deck visible in profile'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_arena_member_decks(current_setting('test.group')::uuid,ARRAY[current_setting('test.user')::uuid],120) WHERE id=current_setting('test.deck')::uuid) THEN RAISE EXCEPTION 'Deleted deck still playable'; END IF;
 SELECT to_jsonb(s) INTO stats FROM public.get_arena_stats_participants(current_setting('test.group')::uuid,NULL) s WHERE s.match_id=current_setting('test.match')::uuid AND s.deck_id=current_setting('test.deck')::uuid LIMIT 1;
 IF stats IS DISTINCT FROM current_setting('test.stats')::jsonb THEN RAISE EXCEPTION 'Stats changed'; END IF;
 PERFORM set_config('row_security','on',true); IF NOT EXISTS(SELECT 1 FROM public.match_participants WHERE id=current_setting('test.participant')::uuid AND deck_id=current_setting('test.deck')::uuid AND deck_name_snapshot IS NOT NULL AND commander_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'Match history lost'; END IF;
 RAISE NOTICE 'PASS legacy authenticated delete, hidden profile and selector, unchanged stats and history';
END $$;
RESET ROLE;






ROLLBACK;

BEGIN;
DO $$ DECLARE d public.decks%ROWTYPE; g uuid; payload jsonb; result jsonb; BEGIN
 SELECT decks.* INTO d FROM public.decks decks JOIN public.match_participants mp ON mp.deck_id=decks.id JOIN public.matches m ON m.id=mp.match_id JOIN public.group_members gm ON gm.group_id=m.group_id AND gm.user_id=decks.user_id WHERE decks.source_type='archidekt' AND decks.source_url ~ '^https://archidekt[.]com/decks/[0-9]+/?$' LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'No fixture'; END IF;
 SELECT m.group_id INTO g FROM public.match_participants mp JOIN public.matches m ON m.id=mp.match_id JOIN public.group_members gm ON gm.group_id=m.group_id AND gm.user_id=d.user_id WHERE mp.deck_id=d.id LIMIT 1;
 UPDATE public.profiles SET archidekt_username='history-test',archidekt_auto_import=true WHERE id=d.user_id;
 PERFORM set_config('request.jwt.claim.sub',d.user_id::text,true);
 payload:=jsonb_build_array(jsonb_build_object('name',d.name,'commander',d.commander,'source_url',d.source_url));
 result:=public.sync_archidekt_decks_for_arena(g,d.user_id,d.user_id,'history-test','[]'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM public.decks WHERE id=d.id) THEN RAISE EXCEPTION 'Absent Archidekt deck was removed'; END IF;
 DELETE FROM public.decks WHERE id=d.id;
 result:=public.sync_archidekt_decks_for_arena(g,d.user_id,d.user_id,'history-test',payload);
 IF EXISTS(SELECT 1 FROM public.decks WHERE user_id=d.user_id AND source_type='archidekt' AND source_url=d.source_url) THEN RAISE EXCEPTION 'Auto sync resurrected deck'; END IF;
 result:=public.sync_archidekt_decks(payload);
 IF NOT EXISTS(SELECT 1 FROM public.decks WHERE user_id=d.user_id AND source_type='archidekt' AND source_url=d.source_url AND id<>d.id) THEN RAISE EXCEPTION 'Explicit reimport failed'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.deleted_archidekt_sources WHERE user_id=d.user_id AND source_url=rtrim(d.source_url,'/')) THEN RAISE EXCEPTION 'Suppression not cleared'; END IF;
 RAISE NOTICE 'PASS auto sync keeps deletion and manual reimport works';
END $$;

ROLLBACK;

BEGIN;
DO $$ DECLARE d public.decks%ROWTYPE; group_id uuid; live_id uuid:=gen_random_uuid(); state jsonb; blocked boolean:=false; BEGIN
 SELECT decks.* INTO d FROM public.decks decks JOIN public.match_participants mp ON mp.deck_id=decks.id JOIN public.matches m ON m.id=mp.match_id JOIN public.group_members gm ON gm.group_id=m.group_id AND gm.user_id=decks.user_id WHERE decks.source_type='archidekt' AND decks.source_url ~ '^https://archidekt[.]com/decks/[0-9]+/?$' AND NOT EXISTS(SELECT 1 FROM public.live_games l WHERE l.status IN ('setup','active') AND l.state::text LIKE '%'||decks.id::text||'%') LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'No fixture'; END IF; PERFORM set_config('request.jwt.claim.sub',d.user_id::text,true);
 SELECT m.group_id INTO group_id FROM public.match_participants mp JOIN public.matches m ON m.id=mp.match_id WHERE mp.deck_id=d.id LIMIT 1;
 state:=jsonb_build_object('players',jsonb_build_array(jsonb_build_object('deckId',d.id::text,'participantKey','test:'||gen_random_uuid()::text,'slot',0,'isEliminated',false)),'events','[]'::jsonb,'version',1);
 INSERT INTO public.live_games(id,group_id,created_by,status,state) VALUES(live_id,group_id,d.user_id,'active',state);
 DELETE FROM public.decks WHERE id=d.id;
 IF NOT EXISTS(SELECT 1 FROM public.decks WHERE id=d.id AND source_type='historical') THEN RAISE EXCEPTION 'Missing history'; END IF;
 UPDATE public.live_games g SET state=jsonb_set(g.state,'{version}','2'::jsonb) WHERE g.id=live_id;
 BEGIN
  INSERT INTO public.live_games(id,group_id,created_by,status,state) VALUES(gen_random_uuid(),group_id,d.user_id,'active',state);
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Deleted deck selectable for a new game'; END IF;
 RAISE NOTICE 'PASS existing live game continues; new selection rejected';
END $$;



ROLLBACK;

BEGIN;
DO $$ DECLARE d public.decks%ROWTYPE; BEGIN
 SELECT decks.* INTO d FROM public.decks decks JOIN public.match_participants mp ON mp.deck_id=decks.id WHERE decks.source_type='archidekt' LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'No fixture'; END IF; PERFORM set_config('request.jwt.claim.sub',d.user_id::text,true);
 DELETE FROM public.decks WHERE id=d.id;
 IF NOT EXISTS(SELECT 1 FROM public.decks WHERE id=d.id AND source_type='historical') THEN RAISE EXCEPTION 'Historical record not retained'; END IF;
 DELETE FROM public.profiles WHERE id=d.user_id;
 IF EXISTS(SELECT 1 FROM public.decks WHERE id=d.id) THEN RAISE EXCEPTION 'Account deletion retained deck'; END IF;
 RAISE NOTICE 'PASS account cascade removes historical record';
END $$;


ROLLBACK;

BEGIN;
DO $$ DECLARE d public.decks%ROWTYPE; BEGIN
 SELECT decks.* INTO d FROM public.decks decks JOIN public.match_participants mp ON mp.deck_id=decks.id WHERE decks.source_type='archidekt' LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'No fixture'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 DELETE FROM public.decks WHERE id=d.id;
 IF EXISTS(SELECT 1 FROM public.decks WHERE id=d.id) THEN RAISE EXCEPTION 'Service maintenance delete blocked'; END IF;
 RAISE NOTICE 'PASS service maintenance can delete its data';
END $$;

ROLLBACK;
