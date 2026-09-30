-- Advisor hardening: no callable SECURITY DEFINER functions, no always-true policies.
--
-- Membership rows are visible only to their own user, so the access helpers can run with
-- the caller's privileges without recursing through RLS:
--   pages RLS -> can_read_workspace -> workspace_role -> workspace_members (user_id = uid)
-- Showing co-members (M4) will go through its own non-recursive path.

---------------------------------------------------------------------------
-- Helpers become SECURITY INVOKER
---------------------------------------------------------------------------
DROP POLICY members_select ON public.workspace_members;
CREATE POLICY members_select_own ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.workspace_role(p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT m.role FROM public.workspace_members m
  WHERE m.workspace_id = p_workspace AND m.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_read_workspace(p_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.workspace_role(p_workspace) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.can_edit_workspace(p_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(public.workspace_role(p_workspace) IN ('owner', 'editor'), false)
$$;

-- Runs under pages RLS, so it only resolves pages the caller can already read.
CREATE OR REPLACE FUNCTION public.page_workspace(p_page uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.workspace_id FROM public.pages p WHERE p.id = p_page
$$;

---------------------------------------------------------------------------
-- ensure_personal_workspace: invoker; the unique index enforces one per user
---------------------------------------------------------------------------
DROP POLICY workspaces_insert ON public.workspaces;
REVOKE INSERT ON public.workspaces FROM authenticated;
GRANT INSERT (name, owner_id, is_personal) ON public.workspaces TO authenticated;  -- is_encrypted stays default false (M7)
CREATE POLICY workspaces_insert ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_personal_workspace()
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT id INTO v_id FROM public.workspaces WHERE owner_id = v_uid AND is_personal;
  IF v_id IS NULL THEN
    INSERT INTO public.workspaces (name, owner_id, is_personal)
    VALUES ('Personal', v_uid, true)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN  -- lost a race with a concurrent first call
      SELECT id INTO v_id FROM public.workspaces WHERE owner_id = v_uid AND is_personal;
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

---------------------------------------------------------------------------
-- apply_compaction: invoker, backed by explicit editor policies
---------------------------------------------------------------------------
GRANT INSERT (page_id, data) ON public.doc_snapshots TO authenticated;
GRANT UPDATE (data, version, updated_at) ON public.doc_snapshots TO authenticated;
CREATE POLICY doc_snapshots_insert ON public.doc_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(public.page_workspace(page_id)));
CREATE POLICY doc_snapshots_update ON public.doc_snapshots FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(public.page_workspace(page_id)))
  WITH CHECK (public.can_edit_workspace(public.page_workspace(page_id)));

GRANT DELETE ON public.doc_updates TO authenticated;
CREATE POLICY doc_updates_delete ON public.doc_updates FOR DELETE TO authenticated
  USING (public.can_edit_workspace(public.page_workspace(page_id)));

CREATE OR REPLACE FUNCTION public.apply_compaction(
  p_page uuid, p_data text, p_merged_ids bigint[], p_expected_version bigint
)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_rows int;
BEGIN
  IF NOT public.can_edit_workspace(public.page_workspace(p_page)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL THEN
    INSERT INTO public.doc_snapshots (page_id, data) VALUES (p_page, p_data)
    ON CONFLICT (page_id) DO NOTHING;
  ELSE
    UPDATE public.doc_snapshots
    SET data = p_data, version = version + 1, updated_at = now()
    WHERE page_id = p_page AND version = p_expected_version;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;  -- someone else compacted first; nothing deleted
  END IF;
  DELETE FROM public.doc_updates WHERE page_id = p_page AND id = ANY (p_merged_ids);
  RETURN true;
END;
$$;

---------------------------------------------------------------------------
-- Execute privileges: signed-in users only
---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.workspace_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.page_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.channel_uuid(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_role(uuid), public.can_read_workspace(uuid),
  public.can_edit_workspace(uuid), public.page_workspace(uuid), public.channel_uuid(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.workspaces_add_owner(), public.pages_broadcast(), public.doc_updates_broadcast(),
  public.pages_before_write(), public.doc_updates_before_insert() FROM PUBLIC, anon, authenticated;

---------------------------------------------------------------------------
-- Health check: a trivial invoker function instead of a world-readable table
---------------------------------------------------------------------------
DROP TABLE public.app_meta;
CREATE OR REPLACE FUNCTION public.ping()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$ SELECT 'ok'::text $$;
REVOKE ALL ON FUNCTION public.ping() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;

---------------------------------------------------------------------------
-- Indexes the advisor asked for
---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS pages_created_by_idx ON public.pages (created_by);
CREATE INDEX IF NOT EXISTS doc_updates_created_by_idx ON public.doc_updates (created_by);
CREATE INDEX IF NOT EXISTS workspaces_owner_idx ON public.workspaces (owner_id);
