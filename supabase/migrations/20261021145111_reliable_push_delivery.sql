BEGIN;
CREATE TABLE public.push_delivery_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES public.app_notifications(id) ON DELETE CASCADE,
 token_id uuid NOT NULL REFERENCES public.push_tokens(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','receipt','delivered','failed','skipped')),
 ticket_id text,
 attempts integer NOT NULL DEFAULT 0,
 receipt_checks integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid,
 lease_until timestamptz,
 provider_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,token_id)
);
ALTER TABLE public.push_delivery_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_queue FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.push_delivery_queue TO service_role;
CREATE INDEX push_delivery_queue_pending_idx ON public.push_delivery_queue(next_attempt_at) WHERE status IN ('pending','receipt');
CREATE INDEX push_delivery_queue_token_idx ON public.push_delivery_queue(token_id);
CREATE INDEX push_delivery_queue_user_idx ON public.push_delivery_queue(user_id);
CREATE OR REPLACE FUNCTION app_private.enqueue_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.push_delivery_queue(notification_id,token_id,user_id)
 SELECT NEW.id,t.id,NEW.user_id FROM public.push_tokens t
 LEFT JOIN public.notification_preferences p ON p.user_id=NEW.user_id
 WHERE t.user_id=NEW.user_id AND coalesce(p.push_enabled,true)
 AND coalesce((to_jsonb(p)->>NEW.type)::boolean,true);
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.enqueue_notification_push() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER app_notifications_enqueue_push AFTER INSERT ON public.app_notifications FOR EACH ROW EXECUTE FUNCTION app_private.enqueue_notification_push();
CREATE OR REPLACE FUNCTION app_private.notify_match_participant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m record; title_it text; title_en text; body_it text; body_en text;
BEGIN
 IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
 SELECT x.id,x.group_id,x.is_draw,g.name,coalesce(nullif(p.display_name,''),p.username,'un giocatore') winner
 INTO m FROM public.matches x JOIN public.groups g ON g.id=x.group_id LEFT JOIN public.profiles p ON p.id=x.winner_id WHERE x.id=NEW.match_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.notification_preferences WHERE user_id=NEW.user_id AND NOT match_completed) THEN RETURN NEW; END IF;
 title_it:=left('Partita salvata · '||m.name,120); title_en:=left('Match saved · '||m.name,120);
 body_it:=left(CASE WHEN m.is_draw THEN 'Hai partecipato a un pareggio' ELSE 'Hai partecipato · vince '||m.winner END,500);
 body_en:=left(CASE WHEN m.is_draw THEN 'You played in a draw' ELSE 'You played · '||m.winner||' wins' END,500);
 INSERT INTO public.app_notifications(user_id,type,title,body,data,dedupe_key)
 VALUES(NEW.user_id,'match_completed',title_it,body_it,jsonb_build_object('groupId',m.group_id,'matchId',m.id,'title_it',title_it,'body_it',body_it,'title_en',title_en,'body_en',body_en),'match_completed:'||m.id||':'||NEW.user_id)
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.notify_match_participant() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER match_participants_notify_saved AFTER INSERT ON public.match_participants FOR EACH ROW EXECUTE FUNCTION app_private.notify_match_participant();
CREATE OR REPLACE FUNCTION public.claim_push_deliveries(batch_size integer DEFAULT 50)
RETURNS SETOF public.push_delivery_queue LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.push_delivery_queue q SET lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 WHERE q.id IN (SELECT id FROM public.push_delivery_queue WHERE status IN ('pending','receipt') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at LIMIT greatest(1,least(batch_size,50)) FOR UPDATE SKIP LOCKED)
 RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_push_deliveries(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_deliveries(integer) TO service_role;
COMMIT;
