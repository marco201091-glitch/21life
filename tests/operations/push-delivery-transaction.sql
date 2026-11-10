-- Execute over the Dev SSH-backed psql connection. All fixtures roll back.
BEGIN;
DO $$ DECLARE actor uuid; arena uuid; game uuid; token uuid; notice uuid; claimed integer; BEGIN
 SELECT id,created_by INTO arena,actor FROM public.groups LIMIT 1;
 IF arena IS NULL THEN RAISE EXCEPTION 'Need Dev group fixture'; END IF;
 INSERT INTO public.notification_preferences(user_id,push_enabled,match_completed) VALUES(actor,true,true) ON CONFLICT(user_id) DO UPDATE SET push_enabled=true,match_completed=true;
 INSERT INTO public.push_tokens(user_id,expo_push_token,platform) VALUES(actor,'ExponentPushToken[regression_'||replace(gen_random_uuid()::text,'-','')||']','android') RETURNING id INTO token;
 INSERT INTO public.matches(group_id,created_by,winner_id) VALUES(arena,actor,actor) RETURNING id INTO game;
 INSERT INTO public.match_participants(match_id,user_id,is_winner) VALUES(game,actor,true);
 SELECT id INTO notice FROM public.app_notifications WHERE dedupe_key='match_completed:'||game||':'||actor;
 IF notice IS NULL THEN RAISE EXCEPTION 'Match notification missing'; END IF;
 IF (SELECT count(*) FROM public.push_delivery_queue WHERE notification_id=notice AND token_id=token)<>1 THEN RAISE EXCEPTION 'Queue notification missing'; END IF;
 INSERT INTO public.app_notifications(user_id,type,title,body,dedupe_key) VALUES(actor,'match_completed','x','x','match_completed:'||game||':'||actor) ON CONFLICT(dedupe_key) DO NOTHING;
 IF (SELECT count(*) FROM public.push_delivery_queue WHERE notification_id=notice AND token_id=token)<>1 THEN RAISE EXCEPTION 'Duplicate queue'; END IF;
 SELECT count(*) INTO claimed FROM public.claim_push_deliveries(50);
 IF claimed<1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_push_deliveries(50) WHERE notification_id=notice) THEN RAISE EXCEPTION 'Lease double claim'; END IF;
 IF has_table_privilege('authenticated','public.push_delivery_queue','SELECT') OR has_function_privilege('authenticated','public.claim_push_deliveries(integer)','EXECUTE') THEN RAISE EXCEPTION 'Queue exposed'; END IF;
 UPDATE public.notification_preferences SET match_completed=false WHERE user_id=actor;
 INSERT INTO public.matches(group_id,created_by,winner_id) VALUES(arena,actor,actor) RETURNING id INTO game;
 INSERT INTO public.match_participants(match_id,user_id,is_winner) VALUES(game,actor,true);
 IF EXISTS(SELECT 1 FROM public.app_notifications WHERE dedupe_key='match_completed:'||game||':'||actor) THEN RAISE EXCEPTION 'Disabled preference ignored'; END IF;
 RAISE NOTICE 'PASS transactional match inbox, queue, dedupe, leases, permissions and preferences';
END $$;

ROLLBACK;