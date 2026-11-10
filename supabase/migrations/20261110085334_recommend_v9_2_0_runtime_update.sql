DO $$
DECLARE current_recommended text;
BEGIN
  SELECT recommended_version INTO current_recommended
  FROM public.app_runtime_configuration WHERE id = true FOR UPDATE;
  IF current_recommended IS NULL THEN
    RAISE EXCEPTION 'Runtime configuration row is missing';
  END IF;
  IF string_to_array(current_recommended, '.')::integer[] > ARRAY[9, 2, 0]::integer[] THEN
    RAISE EXCEPTION 'Refusing to downgrade runtime recommendation';
  END IF;
  UPDATE public.app_runtime_configuration
  SET recommended_version = '9.2.0',
      release_notes = CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(release_notes, '[]'::jsonb)) AS entries(note)
        WHERE note ->> 'version' = '9.2.0'
      ) THEN COALESCE(release_notes, '[]'::jsonb)
      ELSE COALESCE(release_notes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'version', '9.2.0',
        'it', 'Sincronizzazione Archidekt più affidabile, riconoscimento corretto dei companion e avvisi di aggiornamento.',
        'en', 'More reliable Archidekt sync, correct companion detection and update notifications.'
      )) END,
      updated_at = now()
  WHERE id = true;
END;
$$;
