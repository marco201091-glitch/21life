-- Dev only: isolated fixtures and assertions; all changes roll back.
BEGIN;
DO $$
DECLARE
  requester uuid := gen_random_uuid();
  target uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  arena uuid := gen_random_uuid();
  result jsonb;
  payload jsonb := '[{"name":"QA deck","commander":"Atraxa, Praetors'' Voice","source_url":"https://archidekt.com/decks/987654321","color_identity":["W","U","B","G"],"commander_cmc":4}]';
  invalid jsonb := '[{"name":"Must roll back","commander":"Atraxa","source_url":"https://archidekt.com/decks/987654322"},{"name":"Invalid","commander":"Atraxa","source_url":"https://invalid.example"}]';
BEGIN
  IF has_function_privilege('authenticated', 'public.sync_archidekt_decks_for_arena(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.sync_archidekt_decks_for_arena(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.sync_archidekt_decks_for_arena(uuid,uuid,uuid,text,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'app_private.sync_archidekt_decks_for_user(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('service_role', 'app_private.sync_archidekt_decks_for_user(uuid,jsonb)', 'EXECUTE')
  THEN RAISE EXCEPTION 'RPC privilege violation'; END IF;

  INSERT INTO auth.users(id,email,raw_user_meta_data)
    SELECT user_id, 'syncqa_' || user_id || '@example.invalid', jsonb_build_object('username','syncqa_' || replace(user_id::text,'-',''))
    FROM unnest(ARRAY[requester,target,outsider]) user_id;
  UPDATE public.profiles SET archidekt_auto_import=true, archidekt_username='qa_archidekt' WHERE id=target;
  INSERT INTO public.groups(id,name,created_by) VALUES(arena,'Archidekt sync QA',requester);
  INSERT INTO public.group_members(group_id,user_id) VALUES(arena,requester),(arena,target) ON CONFLICT DO NOTHING;

  result := public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',payload);
  IF result <> '{"inserted":1,"updated":0,"unchanged":0}'::jsonb THEN RAISE EXCEPTION 'Unexpected insert: %',result; END IF;
  result := public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',payload);
  IF result <> '{"inserted":0,"updated":0,"unchanged":1}'::jsonb THEN RAISE EXCEPTION 'Unexpected unchanged: %',result; END IF;
  payload := jsonb_set(payload,'{0,name}','"Updated QA deck"');
  result := public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',payload);
  IF result->>'updated' <> '1' THEN RAISE EXCEPTION 'Update failed'; END IF;

  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,target,outsider,'qa_archidekt',payload);
    RAISE EXCEPTION 'Outsider permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,outsider,requester,'qa_archidekt',payload);
    RAISE EXCEPTION 'Non-member target permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,target,requester,'changed_username',payload);
    RAISE EXCEPTION 'Changed username permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.profiles SET archidekt_auto_import=false WHERE id=target;
  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',payload);
    RAISE EXCEPTION 'Disabled sync permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.profiles SET archidekt_auto_import=true WHERE id=target;
  DELETE FROM public.group_members WHERE group_id=arena AND user_id=requester;
  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',payload);
    RAISE EXCEPTION 'Removed member permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.group_members(group_id,user_id) VALUES(arena,requester);
  BEGIN
    PERFORM public.sync_archidekt_decks_for_arena(arena,target,requester,'qa_archidekt',invalid);
    RAISE EXCEPTION 'Invalid payload permitted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.decks WHERE user_id=target AND name='Must roll back') THEN RAISE EXCEPTION 'Partial database write'; END IF;
  IF EXISTS(SELECT 1 FROM public.decks WHERE user_id=requester) THEN RAISE EXCEPTION 'Wrong deck owner'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND archidekt_last_sync_at IS NOT NULL) THEN RAISE EXCEPTION 'Missing sync timestamp'; END IF;

  PERFORM set_config('request.jwt.claim.sub', requester::text, true);
  result := public.sync_archidekt_decks(payload);
  IF result->>'inserted' <> '1' OR NOT EXISTS(SELECT 1 FROM public.decks WHERE user_id=requester) THEN RAISE EXCEPTION 'Owner RPC compatibility failed'; END IF;
  RAISE NOTICE 'PASS: arena sync permissions, atomicity, unchanged/updated results and owner compatibility';
END;
$$;
ROLLBACK;
