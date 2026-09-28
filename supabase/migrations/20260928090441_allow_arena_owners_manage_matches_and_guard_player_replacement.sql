BEGIN;

DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR public.is_group_member(group_id, (SELECT auth.uid()))
    OR public.is_group_owner(group_id, (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.groups AS arena
      WHERE arena.id = matches.group_id
        AND arena.is_public = true
    )
  );

DROP POLICY IF EXISTS "matches_update" ON public.matches;
CREATE POLICY "matches_update" ON public.matches
  FOR UPDATE TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR public.is_group_member(group_id, (SELECT auth.uid()))
    OR public.is_group_owner(group_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR public.is_group_member(group_id, (SELECT auth.uid()))
    OR public.is_group_owner(group_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "matches_delete" ON public.matches;
CREATE POLICY "matches_delete" ON public.matches
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
    OR public.is_group_owner(group_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "match_participants_select" ON public.match_participants;
CREATE POLICY "match_participants_select" ON public.match_participants
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.matches AS match_record
      WHERE match_record.id = match_participants.match_id
        AND (
          public.is_group_member(match_record.group_id, (SELECT auth.uid()))
          OR public.is_group_owner(match_record.group_id, (SELECT auth.uid()))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.matches AS match_record
      JOIN public.groups AS arena ON arena.id = match_record.group_id
      WHERE match_record.id = match_participants.match_id
        AND arena.is_public = true
    )
  );

DROP POLICY IF EXISTS "match_participants_update" ON public.match_participants;
CREATE POLICY "match_participants_update" ON public.match_participants
  FOR UPDATE TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.matches AS match_record
      WHERE match_record.id = match_participants.match_id
        AND (
          public.is_group_member(match_record.group_id, (SELECT auth.uid()))
          OR public.is_group_owner(match_record.group_id, (SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.matches AS match_record
      WHERE match_record.id = match_participants.match_id
        AND (
          public.is_group_member(match_record.group_id, (SELECT auth.uid()))
          OR public.is_group_owner(match_record.group_id, (SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "match_participants_delete" ON public.match_participants;
CREATE POLICY "match_participants_delete" ON public.match_participants
  FOR DELETE TO authenticated
  USING (
    public.is_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.matches AS match_record
      WHERE match_record.id = match_participants.match_id
        AND (
          match_record.created_by = (SELECT auth.uid())
          OR public.is_group_owner(match_record.group_id, (SELECT auth.uid()))
        )
    )
  );

CREATE OR REPLACE FUNCTION private.guard_match_participant_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_participant_name text;
BEGIN
  IF OLD.match_id IS DISTINCT FROM NEW.match_id THEN
    RAISE EXCEPTION 'A match participant cannot be moved to another match'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.guest_id IS NOT DISTINCT FROM NEW.guest_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     AND current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  SELECT match_record.group_id
  INTO v_group_id
  FROM public.matches AS match_record
  WHERE match_record.id = OLD.match_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Match not found' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NULL
     OR NOT (
       public.is_admin(auth.uid())
       OR public.is_group_owner(v_group_id, auth.uid())
     ) THEN
    RAISE EXCEPTION 'Only the arena owner can replace a match participant'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    IF NOT public.is_group_member(v_group_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Replacement player is not a member of this arena'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(NULLIF(profile.display_name, ''), profile.username)
    INTO v_participant_name
    FROM public.profiles AS profile
    WHERE profile.id = NEW.user_id;
  ELSE
    SELECT guest.display_name
    INTO v_participant_name
    FROM public.arena_guests AS guest
    WHERE guest.id = NEW.guest_id
      AND guest.group_id = v_group_id;
  END IF;

  IF v_participant_name IS NULL THEN
    RAISE EXCEPTION 'Replacement player is not part of this arena'
      USING ERRCODE = '23514';
  END IF;

  NEW.participant_name_snapshot := v_participant_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_match_participant_identity_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_match_participant_identity_update
  ON public.match_participants;
CREATE TRIGGER guard_match_participant_identity_update
  BEFORE UPDATE OF match_id, user_id, guest_id
  ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_match_participant_identity_update();

COMMIT;
