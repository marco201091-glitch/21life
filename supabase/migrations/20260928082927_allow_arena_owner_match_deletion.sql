-- Arena owners can manage all records in their arena, including records
-- submitted by another member. The browser deletes participants first, so both
-- policies must grant the same arena-owner capability.
BEGIN;

DROP POLICY IF EXISTS "matches_delete" ON public.matches;
CREATE POLICY "matches_delete" ON public.matches
  FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
    OR public.is_group_owner(group_id, (SELECT auth.uid()))
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

COMMIT;
