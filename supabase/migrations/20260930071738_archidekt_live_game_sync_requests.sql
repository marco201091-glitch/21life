-- Request a member's own authenticated client to sync Archidekt decks when
-- they are selected in a live-game setup. Deck import remains user-scoped.
CREATE TABLE public.archidekt_sync_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archidekt_sync_requests_group_user_key UNIQUE (group_id, user_id)
);

CREATE INDEX archidekt_sync_requests_user_requested_idx
  ON public.archidekt_sync_requests(user_id, requested_at);

ALTER TABLE public.archidekt_sync_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY archidekt_sync_requests_select_own
  ON public.archidekt_sync_requests FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY archidekt_sync_requests_delete_own
  ON public.archidekt_sync_requests FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY archidekt_sync_requests_insert_arena_member
  ON public.archidekt_sync_requests FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = requested_by
    AND public.is_group_member(group_id, (select auth.uid()))
    AND public.is_group_member(group_id, user_id)
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = user_id
        AND profile.archidekt_auto_import IS TRUE
        AND NULLIF(btrim(profile.archidekt_username), '') IS NOT NULL
    )
  );

GRANT SELECT, INSERT, DELETE ON public.archidekt_sync_requests TO authenticated;
GRANT ALL ON public.archidekt_sync_requests TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'archidekt_sync_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.archidekt_sync_requests';
  END IF;
END;
$$;
