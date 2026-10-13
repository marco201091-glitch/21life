-- Shared atomic import, serialized per target. No authenticated cross-user RPC.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.sync_archidekt_decks_for_user(p_user_id uuid, p_decks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_item jsonb;
  v_source_url text;
  v_existing_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_existing jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown target profile' USING ERRCODE = '42501'; END IF;
  IF p_decks IS NULL OR jsonb_typeof(p_decks) <> 'array' OR jsonb_array_length(p_decks) > 5000 THEN
    RAISE EXCEPTION 'Invalid Archidekt sync payload' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_decks)
  LOOP
    v_source_url := NULLIF(trim(v_item->>'source_url'), '');
    IF v_source_url IS NULL
      OR v_source_url !~ '^https://archidekt[.]com/decks/[0-9]+/?$'
      OR NULLIF(trim(v_item->>'name'), '') IS NULL
      OR NULLIF(trim(v_item->>'commander'), '') IS NULL
    THEN
      RAISE EXCEPTION 'Invalid Archidekt deck' USING ERRCODE = '22023';
    END IF;

    SELECT id, to_jsonb(decks) INTO v_existing_id, v_existing
    FROM public.decks
    WHERE user_id = v_user_id
      AND group_id IS NULL
      AND source_type = 'archidekt'
      AND source_url = v_source_url
    FOR UPDATE;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.decks(
        user_id, group_id, name, commander, commander_image,
        source_url, source_type, bracket, color_identity,
        commander_options, commander_cmc
      ) VALUES (
        v_user_id,
        NULL,
        left(trim(v_item->>'name'), 160),
        left(trim(v_item->>'commander'), 240),
        NULLIF(left(v_item->>'commander_image', 500), ''),
        v_source_url,
        'archidekt',
        NULLIF(left(v_item->>'bracket', 20), ''),
        CASE WHEN jsonb_typeof(v_item->'color_identity') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'color_identity'))
          ELSE NULL END,
        CASE WHEN jsonb_typeof(v_item->'commander_options') = 'array'
          THEN v_item->'commander_options'
          ELSE NULL END,
        CASE WHEN (v_item->>'commander_cmc') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (v_item->>'commander_cmc')::numeric
          ELSE NULL END
      );
      v_inserted := v_inserted + 1;
    ELSE
      IF ROW(v_existing->>'name', v_existing->>'commander', v_existing->>'commander_image', v_existing->>'bracket', v_existing->'color_identity', v_existing->'commander_options', v_existing->'commander_cmc')
        IS NOT DISTINCT FROM ROW(
          left(trim(v_item->>'name'), 160), left(trim(v_item->>'commander'), 240),
          COALESCE(NULLIF(left(v_item->>'commander_image', 500), ''), v_existing->>'commander_image'),
          NULLIF(left(v_item->>'bracket', 20), ''),
          CASE WHEN jsonb_typeof(v_item->'color_identity') = 'array' THEN v_item->'color_identity' ELSE v_existing->'color_identity' END,
          CASE WHEN jsonb_typeof(v_item->'commander_options') = 'array' THEN v_item->'commander_options' ELSE v_existing->'commander_options' END,
          CASE WHEN (v_item->>'commander_cmc') ~ '^[0-9]+([.][0-9]+)?$' THEN to_jsonb((v_item->>'commander_cmc')::numeric) ELSE v_existing->'commander_cmc' END)
      THEN v_unchanged := v_unchanged + 1; CONTINUE; END IF;
      UPDATE public.decks
      SET
        name = left(trim(v_item->>'name'), 160),
        commander = left(trim(v_item->>'commander'), 240),
        commander_image = COALESCE(NULLIF(left(v_item->>'commander_image', 500), ''), commander_image),
        bracket = NULLIF(left(v_item->>'bracket', 20), ''),
        color_identity = CASE WHEN jsonb_typeof(v_item->'color_identity') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'color_identity'))
          ELSE color_identity END,
        commander_options = CASE WHEN jsonb_typeof(v_item->'commander_options') = 'array'
          THEN v_item->'commander_options'
          ELSE commander_options END,
        commander_cmc = CASE WHEN (v_item->>'commander_cmc') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (v_item->>'commander_cmc')::numeric
          ELSE commander_cmc END,
        updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET archidekt_last_sync_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged);
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_archidekt_decks_for_user(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Keep the existing self-service RPC compatible, sharing the same target lock.
CREATE OR REPLACE FUNCTION public.sync_archidekt_decks(p_decks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  RETURN app_private.sync_archidekt_decks_for_user(v_user_id, p_decks);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_archidekt_decks(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_archidekt_decks(jsonb) TO authenticated;

-- CREATE OR REPLACE preserves the existing RPC owner. The SSH runner may use
-- a different administrative role; grant only the wrapper's internal owner.
DO $$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner
  FROM pg_proc WHERE oid = 'public.sync_archidekt_decks(jsonb)'::regprocedure;
  IF v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Owner RPC must belong to an administrative role';
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA app_private TO %I', v_owner);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app_private.sync_archidekt_decks_for_user(uuid,jsonb) TO %I', v_owner);
END;
$$;

-- Only the backend may supply the authenticated requester's verified identity.
CREATE OR REPLACE FUNCTION public.sync_archidekt_decks_for_arena(
  p_group_id uuid, p_user_id uuid, p_requested_by uuid, p_username text, p_decks jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.archidekt_auto_import IS NOT TRUE
    OR NULLIF(btrim(v_profile.archidekt_username), '') IS NULL
    OR btrim(v_profile.archidekt_username) IS DISTINCT FROM p_username
  THEN RAISE EXCEPTION 'Sync permission changed' USING ERRCODE = '42501'; END IF;

  PERFORM 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id IN (p_user_id, p_requested_by) FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = p_requested_by)
    OR NOT EXISTS(SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_id)
  THEN RAISE EXCEPTION 'Arena membership required' USING ERRCODE = '42501'; END IF;

  RETURN app_private.sync_archidekt_decks_for_user(p_user_id, p_decks);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_archidekt_decks_for_arena(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_archidekt_decks_for_arena(uuid, uuid, uuid, text, jsonb) TO service_role;
