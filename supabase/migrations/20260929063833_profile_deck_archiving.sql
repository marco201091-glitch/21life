ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS decks_user_archived_created_idx
  ON public.decks (user_id, created_at DESC)
  WHERE group_id IS NULL AND is_archived;

COMMENT ON COLUMN public.decks.is_archived IS
  'Hides a personal deck from the active profile collection without deleting match history.';
