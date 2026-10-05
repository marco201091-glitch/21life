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

  IF string_to_array(current_recommended, '.')::integer[] > ARRAY[9, 0, 5]::integer[] THEN
    RAISE EXCEPTION 'Runtime recommendation % is newer than 9.0.5; refusing to downgrade.', current_recommended;
  END IF;

  UPDATE public.app_runtime_configuration
  SET
    recommended_version = '9.0.5',
    release_notes = CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(release_notes, '[]'::jsonb)) AS entries(note)
        WHERE note ->> 'version' = '9.0.5'
      ) THEN COALESCE(release_notes, '[]'::jsonb)
      ELSE COALESCE(release_notes, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'version', '9.0.5',
          'it', 'Nel wizard puoi aggiornare i mazzi Archidekt di ogni membro dell’arena con sync abilitato, anche se il suo telefono è offline. Esito esplicito, aggiornamenti parziali segnalati e possibilità di riprovare. Aggiorna l’app per usare il nuovo flusso.',
          'en', 'In the wizard, update the Archidekt decks of any arena member who enabled sync, even when their phone is offline. Clear outcomes, partial-update warnings and retry. Update your app to use the new flow.'
        )
      )
    END,
    updated_at = now()
  WHERE id = true;
END;
$$;
