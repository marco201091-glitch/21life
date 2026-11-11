-- Service maintenance and account cascades retain their original delete semantics.
CREATE OR REPLACE FUNCTION private.preserve_deleted_deck()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- A profile/group cascade must still remove its own data normally.
  IF pg_catalog.pg_trigger_depth()>1 OR auth.uid() IS NULL THEN RETURN OLD; END IF;
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
