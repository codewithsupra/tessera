-- Tiny public table the /api/health cron reads, keeping the free-tier project awake
-- and proving DB + PostgREST are reachable.
CREATE TABLE IF NOT EXISTS public.app_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_meta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_meta FROM anon, authenticated;
GRANT SELECT ON public.app_meta TO anon, authenticated;

DROP POLICY IF EXISTS app_meta_read ON public.app_meta;
CREATE POLICY app_meta_read ON public.app_meta FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.app_meta (key, value) VALUES ('schema_version', '1')
ON CONFLICT (key) DO NOTHING;
