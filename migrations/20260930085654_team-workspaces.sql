-- M4: team workspaces — co-member directory, invites, role management.
--
-- Recursion-free access: role lookups read workspace_access (own rows only, trigger-maintained),
-- so policies on workspace_members itself can use the role helpers.

---------------------------------------------------------------------------
-- workspace_access: private mirror of the caller's own memberships
---------------------------------------------------------------------------
CREATE TABLE public.workspace_access (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE INDEX workspace_access_workspace_idx ON public.workspace_access (workspace_id);
ALTER TABLE public.workspace_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_access FROM anon, authenticated;
GRANT SELECT ON public.workspace_access TO authenticated;
CREATE POLICY access_select_own ON public.workspace_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

INSERT INTO public.workspace_access (workspace_id, user_id, role)
SELECT workspace_id, user_id, role FROM public.workspace_members
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.workspace_members_mirror()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.workspace_access WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  INSERT INTO public.workspace_access (workspace_id, user_id, role)
  VALUES (NEW.workspace_id, NEW.user_id, NEW.role)
  ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_members_mirror AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.workspace_members_mirror();
REVOKE ALL ON FUNCTION public.workspace_members_mirror() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workspace_role(p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT a.role FROM public.workspace_access a
  WHERE a.workspace_id = p_workspace AND a.user_id = auth.uid()
$$;

---------------------------------------------------------------------------
-- workspace_members: co-member directory with display snapshot
---------------------------------------------------------------------------
ALTER TABLE public.workspace_members
  ADD COLUMN display_name text NOT NULL DEFAULT '',
  ADD COLUMN email text NOT NULL DEFAULT '',
  -- SHA-256 of the (single-use, now spent) invite token this member joined with.
  ADD COLUMN invite_hash text CHECK (invite_hash IS NULL OR invite_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.workspace_members_fill_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  u record;
BEGIN
  SELECT email, coalesce(nullif(profile->>'name', ''), split_part(email, '@', 1)) AS name
  INTO u FROM auth.users WHERE id = NEW.user_id;
  NEW.email := coalesce(u.email, '');
  NEW.display_name := coalesce(u.name, '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_members_fill_identity BEFORE INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.workspace_members_fill_identity();
REVOKE ALL ON FUNCTION public.workspace_members_fill_identity() FROM PUBLIC, anon, authenticated;

UPDATE public.workspace_members m
SET email = u.email, display_name = coalesce(nullif(u.profile->>'name', ''), split_part(u.email, '@', 1))
FROM auth.users u WHERE u.id = m.user_id;

-- Roles and memberships: owners manage non-owners; anyone but the owner can leave.
CREATE OR REPLACE FUNCTION public.workspace_members_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'membership identity cannot change';
    END IF;
    IF OLD.role = 'owner' OR NEW.role = 'owner' THEN
      RAISE EXCEPTION 'ownership cannot be changed here';
    END IF;
    NEW.email := OLD.email;
    NEW.display_name := OLD.display_name;
    NEW.invite_hash := OLD.invite_hash;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_members_guard BEFORE UPDATE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.workspace_members_guard();

DROP POLICY members_select_own ON public.workspace_members;
CREATE POLICY members_select ON public.workspace_members FOR SELECT TO authenticated
  USING (public.can_read_workspace(workspace_id));

GRANT UPDATE (role) ON public.workspace_members TO authenticated;
CREATE POLICY members_update_by_owner ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.workspace_role(workspace_id) = 'owner' AND role <> 'owner')
  WITH CHECK (public.workspace_role(workspace_id) = 'owner' AND role IN ('editor', 'viewer'));

GRANT DELETE ON public.workspace_members TO authenticated;
CREATE POLICY members_delete ON public.workspace_members FOR DELETE TO authenticated
  USING (
    role <> 'owner'
    AND (public.workspace_role(workspace_id) = 'owner' OR user_id = (SELECT auth.uid()))
  );

---------------------------------------------------------------------------
-- Invites: single-use, email-bound, 7-day links. Only the token's SHA-256 is stored.
---------------------------------------------------------------------------
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX workspace_invites_workspace_idx ON public.workspace_invites (workspace_id);
CREATE INDEX workspace_invites_invited_by_idx ON public.workspace_invites (invited_by);
CREATE INDEX workspace_invites_accepted_by_idx ON public.workspace_invites (accepted_by);

CREATE OR REPLACE FUNCTION public.workspace_invites_before_write()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.invited_by := auth.uid();
    NEW.created_at := now();
    NEW.expires_at := now() + interval '7 days';
    NEW.accepted_at := NULL;
    NEW.accepted_by := NULL;
    NEW.revoked_at := NULL;
    IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = NEW.workspace_id AND w.is_personal) THEN
      RAISE EXCEPTION 'personal workspaces cannot be shared' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role OR NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
      RAISE EXCEPTION 'invite details cannot change';
    END IF;
    IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by AND NEW.accepted_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'only the invitee can accept';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspace_invites_before_write BEFORE INSERT OR UPDATE ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.workspace_invites_before_write();

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_invites FROM anon, authenticated;
GRANT SELECT, DELETE ON public.workspace_invites TO authenticated;
GRANT INSERT (workspace_id, email, role, token_hash) ON public.workspace_invites TO authenticated;
GRANT UPDATE (accepted_at, accepted_by, revoked_at) ON public.workspace_invites TO authenticated;

-- Owners see their workspace's invites; a user sees invites addressed to their own email.
CREATE POLICY invites_select ON public.workspace_invites FOR SELECT TO authenticated
  USING (
    public.workspace_role(workspace_id) = 'owner'
    OR email = lower(auth.email())
  );
CREATE POLICY invites_insert ON public.workspace_invites FOR INSERT TO authenticated
  WITH CHECK (public.workspace_role(workspace_id) = 'owner');
CREATE POLICY invites_revoke ON public.workspace_invites FOR UPDATE TO authenticated
  USING (public.workspace_role(workspace_id) = 'owner')
  WITH CHECK (public.workspace_role(workspace_id) = 'owner');
CREATE POLICY invites_accept ON public.workspace_invites FOR UPDATE TO authenticated
  USING (email = lower(auth.email()))
  WITH CHECK (email = lower(auth.email()) AND accepted_by = (SELECT auth.uid()));
CREATE POLICY invites_delete ON public.workspace_invites FOR DELETE TO authenticated
  USING (public.workspace_role(workspace_id) = 'owner');

-- Joining requires the secret token (its hash on the new row) AND the invited email.
GRANT INSERT (workspace_id, user_id, role, invite_hash) ON public.workspace_members TO authenticated;
CREATE POLICY members_join_by_invite ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND role IN ('editor', 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.workspace_invites i
      WHERE i.workspace_id = workspace_members.workspace_id
        AND i.token_hash = workspace_members.invite_hash
        AND i.role = workspace_members.role
        AND i.email = lower(auth.email())
        AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    )
  );

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_hash text;
  inv public.workspace_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept this invite' USING ERRCODE = '28000';
  END IF;
  IF p_token IS NULL OR char_length(p_token) < 20 OR char_length(p_token) > 200 THEN
    RAISE EXCEPTION 'This invite link is not valid' USING ERRCODE = 'P0002';
  END IF;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  -- Visible only if it was addressed to the caller's email (or they own the workspace).
  SELECT * INTO inv FROM public.workspace_invites WHERE token_hash = v_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link isn''t valid for %. Sign in with the email address it was sent to.', coalesce(auth.email(), 'this account') USING ERRCODE = 'P0002';
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    IF inv.accepted_by = auth.uid() THEN
      RETURN inv.workspace_id;  -- clicking the link again is harmless
    END IF;
    RAISE EXCEPTION 'This invite has already been used' USING ERRCODE = 'P0003';
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite was withdrawn' USING ERRCODE = 'P0004';
  END IF;
  IF inv.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite has expired — ask for a new one' USING ERRCODE = 'P0005';
  END IF;
  IF inv.email <> lower(coalesce(auth.email(), '')) THEN
    RAISE EXCEPTION 'This invite was sent to %. Sign in with that email to accept it.', inv.email USING ERRCODE = 'P0006';
  END IF;

  IF public.workspace_role(inv.workspace_id) IS NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role, invite_hash)
    VALUES (inv.workspace_id, auth.uid(), inv.role, v_hash);
  END IF;
  UPDATE public.workspace_invites SET accepted_at = now(), accepted_by = auth.uid() WHERE id = inv.id;
  RETURN inv.workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;

---------------------------------------------------------------------------
-- Workspaces: owners may delete team workspaces
---------------------------------------------------------------------------
GRANT DELETE ON public.workspaces TO authenticated;
CREATE POLICY workspaces_delete ON public.workspaces FOR DELETE TO authenticated
  USING (public.workspace_role(id) = 'owner' AND NOT is_personal);

REVOKE ALL ON FUNCTION public.workspace_members_guard(), public.workspace_invites_before_write() FROM PUBLIC, anon, authenticated;
