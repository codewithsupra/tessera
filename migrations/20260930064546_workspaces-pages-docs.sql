-- M3: cloud workspaces, page metadata, and durable Yjs document storage.
--
-- Access model: a user can read everything in a workspace they belong to; owners and
-- editors can write. Document content is an append-only log of Yjs updates plus a
-- compacted snapshot. Inserting an update broadcasts it on realtime channel doc:<page_id>,
-- so every update a collaborator receives is already durable.

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_personal boolean NOT NULL DEFAULT false,
  is_encrypted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workspaces_one_personal_per_user ON public.workspaces (owner_id) WHERE is_personal;

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON public.workspace_members (user_id);

CREATE TABLE public.pages (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_id uuid,  -- no FK: offline clients may push a child before its parent
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 500),
  icon text CHECK (icon IS NULL OR char_length(icon) <= 64),
  kind text NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'database')),
  sort_order double precision NOT NULL DEFAULT 0,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),        -- client clock; last write wins
  deleted_at timestamptz,
  server_updated_at timestamptz NOT NULL DEFAULT now()  -- server clock; pull cursor
);
CREATE INDEX pages_workspace_sync_idx ON public.pages (workspace_id, server_updated_at);

CREATE TABLE public.doc_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  data text NOT NULL CHECK (char_length(data) BETWEEN 1 AND 8000000),  -- base64 Yjs update
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doc_updates_page_idx ON public.doc_updates (page_id, id);

CREATE TABLE public.doc_snapshots (
  page_id uuid PRIMARY KEY REFERENCES public.pages(id) ON DELETE CASCADE,
  data text NOT NULL,                 -- base64 merged Yjs update
  version bigint NOT NULL DEFAULT 1,  -- optimistic concurrency for compaction
  updated_at timestamptz NOT NULL DEFAULT now()
);

---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so policies don't recurse through RLS)
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_role(p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT m.role FROM public.workspace_members m
  WHERE m.workspace_id = p_workspace AND m.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_read_workspace(p_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.workspace_role(p_workspace) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.can_edit_workspace(p_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(public.workspace_role(p_workspace) IN ('owner', 'editor'), false)
$$;

CREATE OR REPLACE FUNCTION public.page_workspace(p_page uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.workspace_id FROM public.pages p WHERE p.id = p_page
$$;

-- Parses the uuid after "prefix:" in a channel name; NULL when malformed (never throws).
CREATE OR REPLACE FUNCTION public.channel_uuid(p_channel text, p_prefix text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_channel IS NULL OR left(p_channel, char_length(p_prefix) + 1) <> p_prefix || ':' THEN
    RETURN NULL;
  END IF;
  RETURN substr(p_channel, char_length(p_prefix) + 2)::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

---------------------------------------------------------------------------
-- Integrity triggers
---------------------------------------------------------------------------
-- Owner becomes a member automatically.
CREATE OR REPLACE FUNCTION public.workspaces_add_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspaces_add_owner AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.workspaces_add_owner();

-- Pages: server clock, immutable fields, and last-write-wins on the client clock.
CREATE OR REPLACE FUNCTION public.pages_before_write()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'id and workspace_id cannot be changed';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    -- A stale write (older client timestamp) is ignored rather than clobbering newer state.
    IF NEW.updated_at < OLD.updated_at THEN
      RETURN NULL;
    END IF;
  ELSE
    NEW.created_by := auth.uid();
  END IF;
  -- Clamp client clocks that run far ahead so one bad clock can't win every future conflict.
  IF NEW.updated_at > now() + interval '5 minutes' THEN
    NEW.updated_at := now();
  END IF;
  NEW.server_updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pages_before_write BEFORE INSERT OR UPDATE ON public.pages
FOR EACH ROW EXECUTE FUNCTION public.pages_before_write();

-- Broadcast page metadata changes to everyone in the workspace.
CREATE OR REPLACE FUNCTION public.pages_broadcast()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM realtime.publish(
    'ws:' || NEW.workspace_id::text,
    'page',
    jsonb_build_object(
      'id', NEW.id, 'workspace_id', NEW.workspace_id, 'parent_id', NEW.parent_id,
      'title', NEW.title, 'icon', NEW.icon, 'kind', NEW.kind, 'sort_order', NEW.sort_order,
      'properties', NEW.properties, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at,
      'deleted_at', NEW.deleted_at, 'server_updated_at', NEW.server_updated_at
    )
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER pages_broadcast AFTER INSERT OR UPDATE ON public.pages
FOR EACH ROW EXECUTE FUNCTION public.pages_broadcast();

-- Doc updates: stamp the author, then broadcast. Large updates are announced by id only.
CREATE OR REPLACE FUNCTION public.doc_updates_before_insert()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER doc_updates_before_insert BEFORE INSERT ON public.doc_updates
FOR EACH ROW EXECUTE FUNCTION public.doc_updates_before_insert();

CREATE OR REPLACE FUNCTION public.doc_updates_broadcast()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF char_length(NEW.data) <= 200000 THEN
    PERFORM realtime.publish('doc:' || NEW.page_id::text, 'y-update',
      jsonb_build_object('id', NEW.id, 'by', NEW.created_by, 'u', NEW.data));
  ELSE
    PERFORM realtime.publish('doc:' || NEW.page_id::text, 'y-fetch',
      jsonb_build_object('id', NEW.id, 'by', NEW.created_by));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER doc_updates_broadcast AFTER INSERT ON public.doc_updates
FOR EACH ROW EXECUTE FUNCTION public.doc_updates_broadcast();

---------------------------------------------------------------------------
-- RPCs
---------------------------------------------------------------------------
-- Returns the caller's personal workspace, creating it on first use.
CREATE OR REPLACE FUNCTION public.ensure_personal_workspace()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
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

-- Replaces a page's snapshot with a compacted one and deletes exactly the merged updates.
-- p_expected_version guards against a concurrent compaction (NULL = no snapshot yet).
CREATE OR REPLACE FUNCTION public.apply_compaction(
  p_page uuid, p_data text, p_merged_ids bigint[], p_expected_version bigint
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.apply_compaction(uuid, text, bigint[], bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_personal_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_compaction(uuid, text, bigint[], bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_personal_workspace() TO authenticated;

---------------------------------------------------------------------------
-- Row level security + privileges
---------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.workspaces, public.workspace_members, public.pages, public.doc_updates, public.doc_snapshots FROM anon, authenticated;

-- workspaces: members read; any user may create a team workspace they own; owner renames.
GRANT SELECT, INSERT ON public.workspaces TO authenticated;
GRANT UPDATE (name) ON public.workspaces TO authenticated;
CREATE POLICY workspaces_select ON public.workspaces FOR SELECT TO authenticated
  USING (public.can_read_workspace(id));
CREATE POLICY workspaces_insert ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND NOT is_personal AND NOT is_encrypted);
CREATE POLICY workspaces_update ON public.workspaces FOR UPDATE TO authenticated
  USING (public.workspace_role(id) = 'owner') WITH CHECK (public.workspace_role(id) = 'owner');

-- members: visible to co-members; changed only through RPCs (M4 invites).
GRANT SELECT ON public.workspace_members TO authenticated;
CREATE POLICY members_select ON public.workspace_members FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));

-- pages: members read; editors create and update; deletion is a soft delete (deleted_at).
GRANT SELECT ON public.pages TO authenticated;
GRANT INSERT (id, workspace_id, parent_id, title, icon, kind, sort_order, properties, created_at, updated_at, deleted_at) ON public.pages TO authenticated;
-- Upserts (ON CONFLICT DO UPDATE) touch every column; the trigger keeps id/workspace_id/created_* immutable.
GRANT UPDATE (id, workspace_id, parent_id, title, icon, kind, sort_order, properties, created_at, updated_at, deleted_at) ON public.pages TO authenticated;
CREATE POLICY pages_select ON public.pages FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));
CREATE POLICY pages_insert ON public.pages FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(workspace_id));
CREATE POLICY pages_update ON public.pages FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(workspace_id)) WITH CHECK (public.can_edit_workspace(workspace_id));

-- doc_updates: append-only; members read, editors append.
GRANT SELECT ON public.doc_updates TO authenticated;
GRANT INSERT (page_id, data) ON public.doc_updates TO authenticated;
CREATE POLICY doc_updates_select ON public.doc_updates FOR SELECT TO authenticated
  USING (public.can_read_workspace(public.page_workspace(page_id)));
CREATE POLICY doc_updates_insert ON public.doc_updates FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(public.page_workspace(page_id)));

-- doc_snapshots: members read; written only by apply_compaction().
GRANT SELECT ON public.doc_snapshots TO authenticated;
CREATE POLICY doc_snapshots_select ON public.doc_snapshots FOR SELECT TO authenticated
  USING (public.can_read_workspace(public.page_workspace(page_id)));

---------------------------------------------------------------------------
-- Realtime: doc:<page_id> and ws:<workspace_id> channels, members only
---------------------------------------------------------------------------
INSERT INTO realtime.channels (pattern, description, enabled) VALUES
  ('doc:%', 'Yjs updates and awareness for one page', true),
  ('ws:%', 'Page metadata changes for one workspace', true)
ON CONFLICT (pattern) DO UPDATE SET description = EXCLUDED.description, enabled = EXCLUDED.enabled;

-- The M0 spike channel is no longer needed.
DELETE FROM realtime.channels WHERE pattern = 'spike:%';

ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY members_subscribe ON realtime.channels FOR SELECT TO authenticated
USING (
  (pattern = 'doc:%' AND public.can_read_workspace(public.page_workspace(public.channel_uuid(realtime.channel_name(), 'doc'))))
  OR
  (pattern = 'ws:%' AND public.can_read_workspace(public.channel_uuid(realtime.channel_name(), 'ws')))
);

-- Clients publish only cursor/presence state. Document content flows through doc_updates.
CREATE POLICY members_publish_awareness ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  event_name = 'y-awareness'
  AND public.can_read_workspace(public.page_workspace(public.channel_uuid(channel_name, 'doc')))
);
