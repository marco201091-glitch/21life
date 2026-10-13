-- Keep favorite personal decks at the front of every Arena deck picker.
DROP FUNCTION IF EXISTS public.get_arena_member_decks(uuid, uuid[], integer);

CREATE FUNCTION public.get_arena_member_decks(
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
    WHERE deck.user_id = ANY(COALESCE(p_user_ids, '{}'::uuid[]))
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

CREATE INDEX IF NOT EXISTS idx_decks_user_favorite_created
  ON public.decks (user_id, is_favorite DESC, created_at DESC);

NOTIFY pgrst, 'reload schema';
