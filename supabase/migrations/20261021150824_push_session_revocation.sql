BEGIN;
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS session_id uuid;
REVOKE INSERT, UPDATE, DELETE ON public.push_tokens FROM PUBLIC, anon, authenticated;
CREATE TABLE app_private.push_session_revocations (
 session_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 revoked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.push_session_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.push_session_revocations FROM PUBLIC,anon,authenticated;
CREATE INDEX push_session_revocations_user_idx ON app_private.push_session_revocations(user_id);
CREATE FUNCTION public.register_push_device(p_user_id uuid,p_session_id uuid,p_token text,p_platform text,p_locale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user_id IS NULL OR p_session_id IS NULL OR p_token !~ '^(ExponentPushToken|ExpoPushToken)[[][A-Za-z0-9_-]+[]]$' OR p_platform NOT IN ('android','ios') OR p_locale NOT IN ('it','en') THEN RAISE EXCEPTION 'Invalid push device'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':'||p_session_id::text,913));
 IF EXISTS(SELECT 1 FROM app_private.push_session_revocations WHERE session_id=p_session_id) THEN RETURN false; END IF;
 INSERT INTO public.push_tokens(user_id,expo_push_token,platform,locale,session_id,updated_at)
 VALUES(p_user_id,p_token,p_platform,p_locale,p_session_id,now())
 ON CONFLICT(expo_push_token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,locale=excluded.locale,session_id=excluded.session_id,updated_at=excluded.updated_at;
 RETURN true;
END; $$;
CREATE FUNCTION public.revoke_push_device(p_user_id uuid,p_session_id uuid,p_token text,p_revoke_session boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_user_id IS NULL OR p_session_id IS NULL THEN RAISE EXCEPTION 'Invalid push session'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':'||p_session_id::text,913));
 IF p_revoke_session THEN
  INSERT INTO app_private.push_session_revocations(session_id,user_id) VALUES(p_session_id,p_user_id) ON CONFLICT(session_id) DO NOTHING;
 END IF;
 DELETE FROM public.push_tokens WHERE user_id=p_user_id AND ((p_revoke_session AND session_id=p_session_id) OR (expo_push_token=p_token AND (session_id=p_session_id OR session_id IS NULL)));
END; $$;
REVOKE ALL ON FUNCTION public.register_push_device(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_push_device(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_device(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_push_device(uuid,uuid,text,boolean) TO service_role;
COMMIT;
