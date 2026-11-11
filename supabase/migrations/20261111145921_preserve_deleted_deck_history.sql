-- Keep an unselectable historical identity for decks used in matches or live games.
CREATE TABLE app_private.deleted_archidekt_sources (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_url)
);
REVOKE ALL ON app_private.deleted_archidekt_sources FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.protect_historical_deck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_type='historical' THEN RAISE EXCEPTION 'Historical decks cannot be created directly' USING ERRCODE='42501'; END IF;
  ELSE
    IF OLD.source_type='historical' THEN RAISE EXCEPTION 'Historical decks cannot be modified' USING ERRCODE='42501'; END IF;
    IF NEW.source_type='historical' AND pg_catalog.pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Historical decks cannot be created directly' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_historical_deck() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_historical_deck BEFORE INSERT OR UPDATE ON public.decks
FOR EACH ROW EXECUTE FUNCTION private.protect_historical_deck();

-- Lock referenced decks when an active live game is saved, so deletion and
-- game creation cannot race into a live game with an unavailable deck.
CREATE OR REPLACE FUNCTION private.guard_deleted_deck_in_live_game()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deck record; v_old_players jsonb := '[]'::jsonb;
BEGIN
  IF NEW.status NOT IN ('setup','active') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN v_old_players:=COALESCE(OLD.state->'players','[]'::jsonb); END IF;
  FOR v_deck IN
    SELECT d.id,d.source_type FROM public.decks d
    WHERE d.id::text IN (SELECT p->>'deckId' FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.state->'players','[]'::jsonb)) p)
    ORDER BY d.id FOR SHARE
  LOOP
    IF v_deck.source_type='historical' AND (TG_OP='INSERT' OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_old_players) old_player
      JOIN pg_catalog.jsonb_array_elements(COALESCE(NEW.state->'players','[]'::jsonb)) new_player
        ON old_player->>'participantKey'=new_player->>'participantKey'
      WHERE old_player->>'deckId'=v_deck.id::text AND new_player->>'deckId'=v_deck.id::text
    )) THEN RAISE EXCEPTION 'A deleted deck cannot be selected for a new game' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.state->'players','[]'::jsonb)) p
    WHERE p->>'participantKey' LIKE 'user:%'
      AND COALESCE(p->>'deckId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND NOT EXISTS (SELECT 1 FROM public.decks d WHERE d.id::text=p->>'deckId')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_old_players) old_player
        WHERE old_player->>'deckId'=p->>'deckId' AND old_player->>'participantKey'=p->>'participantKey')
  ) THEN RAISE EXCEPTION 'Deck is no longer available' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_deleted_deck_in_live_game() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_deleted_deck_in_live_game BEFORE INSERT OR UPDATE OF state,status ON public.live_games
FOR EACH ROW EXECUTE FUNCTION private.guard_deleted_deck_in_live_game();

CREATE OR REPLACE FUNCTION private.preserve_deleted_deck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- A profile/group cascade must still remove its own data normally.
  IF pg_catalog.pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  IF OLD.source_type='historical' THEN RAISE EXCEPTION 'Historical decks cannot be deleted directly' USING ERRCODE='42501'; END IF;
  IF OLD.source_type='archidekt' AND NULLIF(pg_catalog.btrim(OLD.source_url),'') IS NOT NULL THEN
    INSERT INTO app_private.deleted_archidekt_sources(user_id,source_url)
    VALUES (OLD.user_id,pg_catalog.rtrim(pg_catalog.btrim(OLD.source_url),'/')) ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_participants p WHERE p.deck_id=OLD.id)
     OR EXISTS (SELECT 1 FROM public.live_games l WHERE EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(l.state->'players','[]'::jsonb)) p WHERE p->>'deckId'=OLD.id::text)) THEN
    UPDATE public.match_participants p SET
      deck_name_snapshot=COALESCE(NULLIF(pg_catalog.btrim(p.deck_name_snapshot),''),OLD.name),
      commander_snapshot=COALESCE(NULLIF(pg_catalog.btrim(p.commander_snapshot),''),OLD.commander),
      commander_image_snapshot=COALESCE(p.commander_image_snapshot,OLD.commander_image),
      deck_bracket_snapshot=COALESCE(p.deck_bracket_snapshot,OLD.bracket),
      color_identity_snapshot=COALESCE(p.color_identity_snapshot,OLD.color_identity)
    WHERE p.deck_id=OLD.id;
    UPDATE public.decks SET source_type='historical',source_url=NULL,is_archived=true,is_favorite=false WHERE id=OLD.id;
    RETURN NULL;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.preserve_deleted_deck() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_deleted_deck BEFORE DELETE ON public.decks
FOR EACH ROW EXECUTE FUNCTION private.preserve_deleted_deck();

-- A deliberate manual reimport permits subsequent automatic updates again.
CREATE OR REPLACE FUNCTION private.allow_explicit_archidekt_reimport()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.source_type='archidekt' AND auth.uid()=NEW.user_id AND NEW.source_url IS NOT NULL THEN
    DELETE FROM app_private.deleted_archidekt_sources WHERE user_id=NEW.user_id AND source_url=pg_catalog.rtrim(pg_catalog.btrim(NEW.source_url),'/');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.allow_explicit_archidekt_reimport() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER allow_explicit_archidekt_reimport AFTER INSERT ON public.decks FOR EACH ROW EXECUTE FUNCTION private.allow_explicit_archidekt_reimport();

ALTER POLICY decks_select ON public.decks USING (
  source_type IS DISTINCT FROM 'historical' AND
  (user_id=(SELECT auth.uid()) OR public.is_admin((SELECT auth.uid()))
   OR (group_id IS NOT NULL AND public.is_group_member(group_id,(SELECT auth.uid())))
   OR public.users_share_group((SELECT auth.uid()),user_id))
);

CREATE OR REPLACE FUNCTION public.get_arena_member_decks(
  p_group_id uuid,
  p_user_ids uuid[],
  p_limit_per_user integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  group_id uuid,
  name text,
  commander text,
  commander_image text,
  source_url text,
  source_type text,
  bracket text,
  color_identity text[],
  is_favorite boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT
      deck.*,
      row_number() OVER (
        PARTITION BY deck.user_id
        ORDER BY deck.is_favorite DESC, deck.created_at DESC, deck.id
      ) AS position
    FROM public.decks AS deck
    JOIN public.group_members AS member
      ON member.group_id = p_group_id
     AND member.user_id = deck.user_id
    WHERE deck.source_type IS DISTINCT FROM 'occasional' AND deck.source_type IS DISTINCT FROM 'historical'
      AND deck.user_id = ANY(COALESCE(p_user_ids, '{}'::uuid[]))
      AND (
        public.is_admin((SELECT auth.uid()))
        OR public.is_group_member(p_group_id, (SELECT auth.uid()))
      )
  )
  SELECT
    ranked.id,
    ranked.user_id,
    ranked.group_id,
    ranked.name,
    ranked.commander,
    ranked.commander_image,
    ranked.source_url,
    ranked.source_type,
    ranked.bracket,
    ranked.color_identity,
    ranked.is_favorite,
    ranked.created_at
  FROM ranked
  WHERE ranked.position <= LEAST(120, GREATEST(1, p_limit_per_user))
  ORDER BY ranked.user_id, ranked.is_favorite DESC, ranked.created_at DESC;
$$;


CREATE OR REPLACE FUNCTION public.sync_archidekt_decks_for_arena(
  p_group_id uuid, p_user_id uuid, p_requested_by uuid, p_username text, p_decks jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles%ROWTYPE; v_filtered jsonb;
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

  IF p_decks IS NULL OR pg_catalog.jsonb_typeof(p_decks) <> 'array' OR pg_catalog.jsonb_array_length(p_decks) > 5000 THEN
    RAISE EXCEPTION 'Invalid Archidekt sync payload' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(item), '[]'::jsonb) INTO v_filtered
  FROM pg_catalog.jsonb_array_elements(p_decks) item
  WHERE NOT EXISTS (SELECT 1 FROM app_private.deleted_archidekt_sources d
    WHERE d.user_id=p_user_id AND d.source_url=pg_catalog.rtrim(pg_catalog.btrim(item->>'source_url'),'/'));
  RETURN app_private.sync_archidekt_decks_for_user(p_user_id, v_filtered);
END;
$$;

