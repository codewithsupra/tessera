-- Neo N1: first-party, privacy-friendly product analytics and client error reports.
-- No third-party trackers; only allow-listed event names; readable only by app admins.

---------------------------------------------------------------------------
-- Admin allow-list
---------------------------------------------------------------------------
CREATE TABLE public.app_admins (
  email text PRIMARY KEY CHECK (email = lower(email))
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_admins FROM anon, authenticated;
GRANT SELECT ON public.app_admins TO authenticated;
CREATE POLICY admins_select_self ON public.app_admins FOR SELECT TO authenticated
  USING (email = lower((SELECT auth.email())));

INSERT INTO public.app_admins (email) VALUES ('supratim347@gmail.com') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.email = lower((SELECT auth.email())))
$$;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

---------------------------------------------------------------------------
-- Product events
---------------------------------------------------------------------------
CREATE TABLE public.app_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (name IN (
    'signed_up', 'signed_in', 'guest_started', 'guest_saved', 'page_created', 'workspace_created',
    'invite_created', 'invite_accepted', 'export_downloaded', 'demo_interacted', 'landing_viewed'
  )),
  props jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(props) = 'object' AND pg_column_size(props) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_events_created_idx ON public.app_events (created_at);
CREATE INDEX app_events_user_idx ON public.app_events (user_id);
CREATE INDEX app_events_name_created_idx ON public.app_events (name, created_at);

-- The server decides who and when; clients only say what.
CREATE OR REPLACE FUNCTION public.app_events_stamp()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER app_events_stamp BEFORE INSERT ON public.app_events
FOR EACH ROW EXECUTE FUNCTION public.app_events_stamp();
REVOKE ALL ON FUNCTION public.app_events_stamp() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_events FROM anon, authenticated;
GRANT INSERT (name, props) ON public.app_events TO anon, authenticated;
GRANT SELECT ON public.app_events TO authenticated;
-- Signed-out visitors may only report landing-page events.
CREATE POLICY events_insert_anon ON public.app_events FOR INSERT TO anon
  WITH CHECK (name IN ('landing_viewed', 'demo_interacted'));
CREATE POLICY events_insert_user ON public.app_events FOR INSERT TO authenticated
  WITH CHECK (name IS NOT NULL);
CREATE POLICY events_select_admin ON public.app_events FOR SELECT TO authenticated
  USING (public.is_app_admin());

---------------------------------------------------------------------------
-- Client error reports
---------------------------------------------------------------------------
CREATE TABLE public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  stack text CHECK (stack IS NULL OR char_length(stack) <= 4000),
  url text CHECK (url IS NULL OR char_length(url) <= 500),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_errors_created_idx ON public.client_errors (created_at);
CREATE INDEX client_errors_user_idx ON public.client_errors (user_id);

CREATE OR REPLACE FUNCTION public.client_errors_stamp()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER client_errors_stamp BEFORE INSERT ON public.client_errors
FOR EACH ROW EXECUTE FUNCTION public.client_errors_stamp();
REVOKE ALL ON FUNCTION public.client_errors_stamp() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT INSERT (message, stack, url, user_agent) ON public.client_errors TO anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
CREATE POLICY errors_insert ON public.client_errors FOR INSERT TO anon, authenticated
  WITH CHECK (message IS NOT NULL);
CREATE POLICY errors_select_admin ON public.client_errors FOR SELECT TO authenticated
  USING (public.is_app_admin());
