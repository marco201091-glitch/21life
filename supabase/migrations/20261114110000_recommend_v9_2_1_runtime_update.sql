DO $$
DECLARE current_recommended text;
BEGIN
  SELECT recommended_version INTO current_recommended
  FROM public.app_runtime_configuration WHERE id = true FOR UPDATE;
  IF current_recommended IS NULL THEN
    RAISE EXCEPTION 'Runtime configuration row is missing';
  END IF;
  IF string_to_array(current_recommended, '.')::integer[] > ARRAY[9, 2, 1]::integer[] THEN
    RAISE EXCEPTION 'Refusing to downgrade runtime recommendation';
  END IF;
  UPDATE public.app_runtime_configuration
  SET recommended_version = '9.2.1',
      release_notes = CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(release_notes, '[]'::jsonb)) AS entries(note)
        WHERE note ->> 'version' = '9.2.1'
      ) THEN COALESCE(release_notes, '[]'::jsonb)
      ELSE COALESCE(release_notes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'version', '9.2.1',
        'it', 'Ripresa della partita corretta per i giocatori eliminati e dopo un aggiornamento di sessione; il tracker non torna più alla playgroup durante il gioco. Wizard del tracker web adattato agli schermi mobili.',
        'en', 'Fixed game resume for eliminated players and after a session refresh; the tracker no longer returns to the playgroup mid-game. The web tracker setup wizard now fits mobile screens.'
      )) END,
      updated_at = now()
  WHERE id = true;
END;
$$;
