-- Neo N6: owner metrics. Aggregates only — no page content, titles or emails leave this
-- function (except error messages, which are the app's own). Executable only by the project
-- admin role; the admin-metrics edge function calls it after checking app_admins.
CREATE OR REPLACE FUNCTION public.admin_metrics(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  d int := greatest(7, least(coalesce(p_days, 30), 180));
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  result jsonb;
BEGIN
  WITH days AS (
    SELECT generate_series(since, date_trunc('day', now()), interval '1 day')::date AS day
  ),
  users AS (
    SELECT id, created_at, public.is_guest_email(email) AS guest FROM auth.users WHERE NOT is_project_admin
  ),
  signups AS (
    SELECT days.day,
      count(u.id) FILTER (WHERE NOT u.guest) AS real,
      count(u.id) FILTER (WHERE u.guest) AS guest
    FROM days LEFT JOIN users u ON u.created_at::date = days.day
    GROUP BY days.day
  ),
  activity AS (
    SELECT created_by AS user_id, created_at FROM public.doc_updates WHERE created_at >= since AND created_by IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM public.app_events WHERE created_at >= since AND user_id IS NOT NULL
  ),
  dau AS (
    SELECT days.day, count(DISTINCT a.user_id) AS users
    FROM days LEFT JOIN activity a ON a.created_at::date = days.day
    GROUP BY days.day
  ),
  pages_daily AS (
    SELECT days.day, count(p.id) AS pages
    FROM days LEFT JOIN public.pages p ON p.created_at::date = days.day
    GROUP BY days.day
  ),
  new_real AS (
    SELECT id, created_at FROM users WHERE NOT guest AND created_at >= since
  ),
  activated AS (
    SELECT count(*) AS n FROM new_real u
    WHERE EXISTS (SELECT 1 FROM public.pages p WHERE p.created_by = u.id AND p.created_at < u.created_at + interval '24 hours')
  ),
  team_sizes AS (
    SELECT w.id, count(m.user_id) AS members
    FROM public.workspaces w JOIN public.workspace_members m ON m.workspace_id = w.id
    WHERE NOT w.is_personal GROUP BY w.id
  ),
  events AS (
    SELECT name, count(*) AS n FROM public.app_events WHERE created_at >= since GROUP BY name
  ),
  errors AS (
    SELECT left(message, 160) AS message, count(*) AS n, max(created_at) AS last_seen
    FROM public.client_errors WHERE created_at >= now() - interval '7 days'
    GROUP BY left(message, 160) ORDER BY n DESC LIMIT 8
  )
  SELECT jsonb_build_object(
    'days', d,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'users_real', (SELECT count(*) FROM users WHERE NOT guest),
      'users_guest', (SELECT count(*) FROM users WHERE guest),
      'new_real', (SELECT count(*) FROM new_real),
      'activated', (SELECT n FROM activated),
      'team_workspaces', (SELECT count(*) FROM team_sizes),
      'collaborative_workspaces', (SELECT count(*) FROM team_sizes WHERE members >= 2),
      'pages', (SELECT count(*) FROM public.pages WHERE deleted_at IS NULL),
      'doc_updates', (SELECT count(*) FROM public.doc_updates WHERE created_at >= since),
      'invites_sent', (SELECT count(*) FROM public.workspace_invites WHERE created_at >= since),
      'invites_accepted', (SELECT count(*) FROM public.workspace_invites WHERE accepted_at >= since),
      'errors_7d', (SELECT count(*) FROM public.client_errors WHERE created_at >= now() - interval '7 days')
    ),
    'signups', (SELECT jsonb_agg(jsonb_build_object('day', day, 'real', real, 'guest', guest) ORDER BY day) FROM signups),
    'dau', (SELECT jsonb_agg(jsonb_build_object('day', day, 'users', users) ORDER BY day) FROM dau),
    'pages_daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'pages', pages) ORDER BY day) FROM pages_daily),
    'funnel', jsonb_build_object(
      'landing_viewed', coalesce((SELECT n FROM events WHERE name = 'landing_viewed'), 0),
      'demo_interacted', coalesce((SELECT n FROM events WHERE name = 'demo_interacted'), 0),
      'guest_started', coalesce((SELECT n FROM events WHERE name = 'guest_started'), 0),
      'signed_up', coalesce((SELECT n FROM events WHERE name = 'signed_up'), 0),
      'page_created', coalesce((SELECT n FROM events WHERE name = 'page_created'), 0),
      'invite_created', coalesce((SELECT n FROM events WHERE name = 'invite_created'), 0),
      'guest_saved', coalesce((SELECT n FROM events WHERE name = 'guest_saved'), 0),
      'export_downloaded', coalesce((SELECT n FROM events WHERE name = 'export_downloaded'), 0)
    ),
    'errors', coalesce((SELECT jsonb_agg(jsonb_build_object('message', message, 'count', n, 'last_seen', last_seen)) FROM errors), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_metrics(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics(int) TO project_admin;

CREATE INDEX IF NOT EXISTS pages_created_at_idx ON public.pages (created_at);
CREATE INDEX IF NOT EXISTS doc_updates_created_at_idx ON public.doc_updates (created_at);
CREATE INDEX IF NOT EXISTS workspace_invites_created_idx ON public.workspace_invites (created_at);
