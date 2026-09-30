-- Tie telemetry inserts to the caller's identity (stamped by the BEFORE INSERT triggers),
-- instead of checking a free-text column.
DROP POLICY errors_insert ON public.client_errors;
CREATE POLICY errors_insert_anon ON public.client_errors FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);
CREATE POLICY errors_insert_user ON public.client_errors FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY events_insert_user ON public.app_events
  WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY events_insert_anon ON public.app_events
  WITH CHECK (user_id IS NULL AND name IN ('landing_viewed', 'demo_interacted'));
