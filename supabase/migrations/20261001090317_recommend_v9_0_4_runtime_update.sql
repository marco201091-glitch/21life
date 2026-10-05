DO $$
DECLARE
  current_recommended text;
BEGIN
  SELECT recommended_version
  INTO current_recommended
  FROM public.app_runtime_configuration
  WHERE id = true
  FOR UPDATE;

  IF current_recommended IS NULL THEN
    RAISE EXCEPTION 'Runtime configuration row is missing; refusing to publish an update recommendation.';
  END IF;

  IF string_to_array(current_recommended, '.')::integer[] > ARRAY[9, 0, 4]::integer[] THEN
    RAISE EXCEPTION 'Runtime recommendation % is newer than 9.0.4; refusing to downgrade.', current_recommended;
  END IF;

  UPDATE public.app_runtime_configuration
  SET
    recommended_version = '9.0.4',
    release_notes = CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(release_notes, '[]'::jsonb)) AS entries(note)
        WHERE note ->> 'version' = '9.0.4'
      ) THEN COALESCE(release_notes, '[]'::jsonb)
      ELSE COALESCE(release_notes, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'version', '9.0.4',
          'it', 'Nel wizard di una partita live, la selezione di un giocatore può richiedere la sincronizzazione dei mazzi Archidekt se attiva. Le versioni precedenti continuano a funzionare; l’aggiornamento serve per elaborare le nuove richieste.',
          'en', 'In the live-game wizard, selecting a player can request an Archidekt deck sync when enabled. Older versions continue to work; update to process the new requests.'
        )
      )
    END,
    updated_at = now()
  WHERE id = true;
END;
$$;
