-- Players who have already been eliminated may join another active game.
DROP INDEX IF EXISTS public.live_game_participants_active_key;

ALTER TABLE public.live_game_participants
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN is_eliminated boolean NOT NULL DEFAULT false;

ALTER TABLE public.live_game_participants
  ADD CONSTRAINT live_game_participants_status_check
  CHECK (status IN ('setup', 'active', 'ended', 'cancelled'));

UPDATE public.live_game_participants AS participant
SET status = game.status,
    is_eliminated = COALESCE((
      SELECT (player ->> 'isEliminated')::boolean
      FROM pg_catalog.jsonb_array_elements(COALESCE(game.state -> 'players', '[]'::jsonb)) AS player
      WHERE player ->> 'participantKey' = participant.participant_key
      LIMIT 1
    ), false)
FROM public.live_games AS game
WHERE game.id = participant.live_game_id;

CREATE OR REPLACE FUNCTION private.sync_live_game_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_keys jsonb;
  v_new_keys jsonb;
  v_elimination_changed boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.group_id IS DISTINCT FROM NEW.group_id
       OR OLD.created_by IS DISTINCT FROM NEW.created_by THEN
      RAISE EXCEPTION 'Live game ownership cannot be changed' USING ERRCODE = '22023';
    END IF;

    v_old_keys := pg_catalog.jsonb_path_query_array(OLD.state, '$.players[*].participantKey');
    v_new_keys := pg_catalog.jsonb_path_query_array(NEW.state, '$.players[*].participantKey');
    IF OLD.status = 'active' AND NEW.status = 'active' THEN
      IF v_old_keys <> v_new_keys THEN
        RAISE EXCEPTION 'An active live game pod cannot be changed' USING ERRCODE = '22023';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(OLD.state -> 'players') AS old_player("participantKey" text, "isEliminated" boolean)
        JOIN pg_catalog.jsonb_to_recordset(NEW.state -> 'players') AS new_player("participantKey" text, "isEliminated" boolean)
          ON new_player."participantKey" = old_player."participantKey"
        WHERE old_player."isEliminated" IS DISTINCT FROM new_player."isEliminated"
      ) INTO v_elimination_changed;
      IF NOT v_elimination_changed AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(OLD.state -> 'players') AS old_player("participantKey" text, "deckId" text, slot integer)
        JOIN pg_catalog.jsonb_to_recordset(NEW.state -> 'players') AS new_player("participantKey" text, "deckId" text, slot integer)
          ON new_player."participantKey" = old_player."participantKey"
        WHERE old_player."deckId" IS DISTINCT FROM new_player."deckId"
          OR old_player.slot IS DISTINCT FROM new_player.slot
      ) THEN
        RAISE EXCEPTION 'Active live game participants cannot be changed' USING ERRCODE = '22023';
      END IF;
      IF v_elimination_changed AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_to_recordset(OLD.state -> 'players') AS old_player("participantKey" text, "deckId" text, slot integer)
        JOIN pg_catalog.jsonb_to_recordset(NEW.state -> 'players') AS new_player("participantKey" text, "deckId" text, slot integer)
          ON new_player."participantKey" = old_player."participantKey"
        WHERE old_player."deckId" IS DISTINCT FROM new_player."deckId"
          OR old_player.slot IS DISTINCT FROM new_player.slot
      ) THEN
        RAISE EXCEPTION 'Decks and seats cannot change during elimination' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF OLD.status = NEW.status AND OLD.group_id = NEW.group_id
       AND v_old_keys = v_new_keys
       AND OLD.state = NEW.state THEN
      RETURN NEW;
    END IF;
  END IF;

  DELETE FROM public.live_game_participants WHERE live_game_id = NEW.id;

  INSERT INTO public.live_game_participants(live_game_id, group_id, participant_key, status, is_eliminated)
  SELECT NEW.id, NEW.group_id, player ->> 'participantKey', NEW.status,
         COALESCE((player ->> 'isEliminated')::boolean, false)
  FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.state -> 'players', '[]'::jsonb)) AS player
  WHERE pg_catalog.jsonb_typeof(player) = 'object'
    AND length(COALESCE(player ->> 'participantKey', '')) BETWEEN 6 AND 64;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_live_game_participants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS live_games_sync_participants ON public.live_games;
CREATE TRIGGER live_games_sync_participants
  AFTER INSERT OR UPDATE OF group_id, status, state ON public.live_games
  FOR EACH ROW EXECUTE FUNCTION private.sync_live_game_participants();

CREATE UNIQUE INDEX live_game_participants_active_key
  ON public.live_game_participants(group_id, participant_key)
  WHERE status = 'active' AND is_eliminated = false;
