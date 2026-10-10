-- Registered players' one-off decks remain arena scoped and outside collections.
ALTER TABLE public.decks ADD CONSTRAINT decks_occasional_scope
  CHECK (source_type IS DISTINCT FROM 'occasional' OR (group_id IS NOT NULL AND user_id IS NOT NULL));

CREATE FUNCTION public.create_occasional_deck(
  p_id uuid, p_group_id uuid, p_user_id uuid, p_name text, p_commander text,
  p_commander_image text, p_color_identity text[], p_bracket text,
  p_commander_options jsonb DEFAULT '[]'::jsonb
)
RETURNS public.decks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_deck public.decks;
BEGIN
  IF v_actor IS NULL OR p_group_id IS NULL OR p_user_id IS NULL
     OR NOT public.is_group_member(p_group_id, v_actor)
     OR NOT public.is_group_member(p_group_id, p_user_id) THEN
    RAISE EXCEPTION 'Arena membership required' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_name IS NULL OR length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 120
     OR p_commander IS NULL OR length(pg_catalog.btrim(p_commander)) NOT BETWEEN 1 AND 300
     OR length(COALESCE(p_commander_image, '')) > 2048
     OR (p_bracket IS NOT NULL AND p_bracket NOT IN ('1', '2', '3', '4', '5'))
     OR p_color_identity IS NULL OR cardinality(p_color_identity) > 5
     OR NOT (p_color_identity <@ ARRAY['W','U','B','R','G']::text[])
     OR array_position(p_color_identity, NULL) IS NOT NULL
     OR p_commander_options IS NULL OR pg_catalog.jsonb_typeof(p_commander_options) <> 'array'
     OR pg_catalog.jsonb_array_length(p_commander_options) > 2
     OR pg_catalog.octet_length(p_commander_options::text) > 16384 THEN
    RAISE EXCEPTION 'Invalid occasional deck details' USING ERRCODE = '22023';
  END IF;
  -- ON CONFLICT waits for a concurrent same-ID insert; never overwrite it.
  INSERT INTO public.decks(id, group_id, user_id, name, commander, commander_image,
    color_identity, bracket, commander_options, source_type, is_favorite)
  VALUES(p_id, p_group_id, p_user_id, pg_catalog.btrim(p_name), pg_catalog.btrim(p_commander),
    p_commander_image, p_color_identity, p_bracket, p_commander_options, 'occasional', false)
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_deck FROM public.decks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_deck.source_type IS DISTINCT FROM 'occasional'
     OR v_deck.user_id IS DISTINCT FROM p_user_id OR v_deck.group_id IS DISTINCT FROM p_group_id
     OR v_deck.name IS DISTINCT FROM pg_catalog.btrim(p_name)
     OR v_deck.commander IS DISTINCT FROM pg_catalog.btrim(p_commander)
     OR v_deck.commander_image IS DISTINCT FROM p_commander_image
     OR v_deck.color_identity IS DISTINCT FROM p_color_identity
     OR v_deck.bracket IS DISTINCT FROM p_bracket
     OR v_deck.commander_options IS DISTINCT FROM p_commander_options THEN
    RAISE EXCEPTION 'Deck ID already belongs to different details' USING ERRCODE = '23505';
  END IF;
  RETURN v_deck;
END;
$$;
REVOKE ALL ON FUNCTION public.create_occasional_deck(uuid, uuid, uuid, text, text, text, text[], text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_occasional_deck(uuid, uuid, uuid, text, text, text, text[], text, jsonb) TO authenticated;

-- Guards are independent of the participant-release projection migration.
CREATE FUNCTION private.guard_occasional_match_deck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deck public.decks; v_group_id uuid;
BEGIN
  SELECT * INTO v_deck FROM public.decks WHERE id = NEW.deck_id;
  IF v_deck.source_type = 'occasional' THEN
    SELECT group_id INTO v_group_id FROM public.matches WHERE id = NEW.match_id;
    IF v_deck.group_id IS DISTINCT FROM v_group_id OR v_deck.user_id IS DISTINCT FROM NEW.user_id
       OR NEW.guest_id IS NOT NULL THEN
      RAISE EXCEPTION 'Occasional deck does not belong to this arena player' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_occasional_match_deck() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_occasional_match_deck BEFORE INSERT OR UPDATE OF deck_id, user_id, guest_id, match_id
  ON public.match_participants FOR EACH ROW EXECUTE FUNCTION private.guard_occasional_match_deck();

CREATE FUNCTION private.guard_occasional_live_decks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deck public.decks; player jsonb;
BEGIN
  FOR player IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.state -> 'players', '[]'::jsonb)) LOOP
    -- Preserve non-UUID guest IDs while keeping the primary-key lookup indexed.
    IF COALESCE(player ->> 'deckId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_deck FROM public.decks WHERE id = (player ->> 'deckId')::uuid;
    IF v_deck.source_type = 'occasional' AND (
       v_deck.group_id IS DISTINCT FROM NEW.group_id
       OR player ->> 'participantKey' IS DISTINCT FROM ('user:' || v_deck.user_id::text)
       ) THEN
      RAISE EXCEPTION 'Occasional deck does not belong to this arena player' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_occasional_live_decks() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_occasional_live_decks BEFORE INSERT OR UPDATE OF group_id, state
  ON public.live_games FOR EACH ROW EXECUTE FUNCTION private.guard_occasional_live_decks();

CREATE FUNCTION private.guard_occasional_deck_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_type = 'occasional' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Occasional deck scope cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_type = 'occasional' AND (TG_OP = 'INSERT' OR OLD.source_type IS DISTINCT FROM 'occasional') THEN
    IF auth.uid() IS NULL OR NEW.group_id IS NULL
       OR NOT public.is_group_member(NEW.group_id, auth.uid())
       OR NOT public.is_group_member(NEW.group_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Arena membership required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_occasional_deck_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_occasional_deck_scope BEFORE INSERT OR UPDATE OF id, source_type, group_id, user_id
  ON public.decks FOR EACH ROW EXECUTE FUNCTION private.guard_occasional_deck_scope();

CREATE FUNCTION private.guard_occasional_match_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.match_participants AS participant
    JOIN public.decks AS deck ON deck.id = participant.deck_id
    WHERE participant.match_id = NEW.id AND deck.source_type = 'occasional'
      AND deck.group_id IS DISTINCT FROM NEW.group_id) THEN
    RAISE EXCEPTION 'Occasional deck arena cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_occasional_match_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_occasional_match_scope BEFORE UPDATE OF group_id
  ON public.matches FOR EACH ROW EXECUTE FUNCTION private.guard_occasional_match_scope();
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
    WHERE deck.source_type IS DISTINCT FROM 'occasional'
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

REVOKE ALL ON FUNCTION public.get_arena_member_decks(uuid, uuid[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_arena_member_decks(uuid, uuid[], integer)
  TO authenticated;


NOTIFY pgrst, 'reload schema';
