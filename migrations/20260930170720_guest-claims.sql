-- Neo N2: one-click guest workspaces that can be kept ("Save my workspace"),
-- plus a once-per-workspace onboarding flag (first-run sample pages).

---------------------------------------------------------------------------
-- Guests are ordinary accounts with a reserved email shape.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_guest_email(p_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(lower(p_email) ~ '^guest-[0-9a-f-]{36}@guest\.tessera-notes\.app$', false)
$$;
REVOKE ALL ON FUNCTION public.is_guest_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_guest_email(text) TO authenticated;

---------------------------------------------------------------------------
-- Claims: a guest proves "this is my data" with a single-use, 30-minute token.
-- Only the token's SHA-256 is stored; redemption happens server-side (claim-guest).
---------------------------------------------------------------------------
CREATE TABLE public.guest_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX guest_claims_guest_idx ON public.guest_claims (guest_id);
CREATE INDEX guest_claims_used_by_idx ON public.guest_claims (used_by);

CREATE OR REPLACE FUNCTION public.guest_claims_stamp()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.guest_id := auth.uid();
  NEW.created_at := now();
  NEW.expires_at := now() + interval '30 minutes';
  NEW.used_at := NULL;
  NEW.used_by := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guest_claims_stamp BEFORE INSERT ON public.guest_claims
FOR EACH ROW EXECUTE FUNCTION public.guest_claims_stamp();
REVOKE ALL ON FUNCTION public.guest_claims_stamp() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.guest_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_claims FROM anon, authenticated;
GRANT INSERT (token_hash) ON public.guest_claims TO authenticated;
GRANT SELECT ON public.guest_claims TO authenticated;
CREATE POLICY claims_insert_by_guest ON public.guest_claims FOR INSERT TO authenticated
  WITH CHECK (guest_id = (SELECT auth.uid()) AND public.is_guest_email((SELECT auth.email())));
CREATE POLICY claims_select_own ON public.guest_claims FOR SELECT TO authenticated
  USING (guest_id = (SELECT auth.uid()));

---------------------------------------------------------------------------
-- The transfer itself: one transaction, callable only by the project admin
-- (the claim-guest edge function). Not executable by anon/authenticated.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_guest(p_token_hash text, p_new_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  c public.guest_claims%ROWTYPE;
  guest_email text;
  new_email text;
  m record;
  new_has_personal boolean;
BEGIN
  SELECT * INTO c FROM public.guest_claims WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found' USING ERRCODE = 'P0002'; END IF;
  IF c.used_at IS NOT NULL THEN RAISE EXCEPTION 'claim already used' USING ERRCODE = 'P0003'; END IF;
  IF c.expires_at <= now() THEN RAISE EXCEPTION 'claim expired' USING ERRCODE = 'P0005'; END IF;

  SELECT email INTO guest_email FROM auth.users WHERE id = c.guest_id;
  SELECT email INTO new_email FROM auth.users WHERE id = p_new_user;
  IF NOT public.is_guest_email(guest_email) THEN RAISE EXCEPTION 'not a guest account' USING ERRCODE = '42501'; END IF;
  IF new_email IS NULL THEN RAISE EXCEPTION 'unknown account' USING ERRCODE = 'P0002'; END IF;
  IF public.is_guest_email(new_email) THEN RAISE EXCEPTION 'cannot save into another guest' USING ERRCODE = '42501'; END IF;
  IF p_new_user = c.guest_id THEN RAISE EXCEPTION 'same account' USING ERRCODE = '22023'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.workspaces WHERE owner_id = p_new_user AND is_personal) INTO new_has_personal;

  FOR m IN SELECT workspace_id, role FROM public.workspace_members WHERE user_id = c.guest_id LOOP
    IF m.role = 'owner' THEN
      -- A second personal workspace isn't allowed; keep the guest's one as a named team space.
      UPDATE public.workspaces
      SET owner_id = p_new_user,
          is_personal = is_personal AND NOT new_has_personal,
          name = CASE WHEN is_personal AND new_has_personal THEN 'Guest workspace' ELSE name END
      WHERE id = m.workspace_id;
    END IF;
    DELETE FROM public.workspace_members WHERE workspace_id = m.workspace_id AND user_id = c.guest_id;
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (m.workspace_id, p_new_user, m.role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET role = CASE WHEN EXCLUDED.role = 'owner' THEN 'owner' ELSE public.workspace_members.role END;
  END LOOP;

  UPDATE public.guest_claims SET used_at = now(), used_by = p_new_user WHERE id = c.id;
  RETURN c.guest_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_guest(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_guest(text, uuid) TO project_admin;

-- Guests older than a week (for the janitor). Admin only.
CREATE OR REPLACE FUNCTION public.stale_guest_ids(p_older_than interval DEFAULT interval '7 days', p_limit int DEFAULT 100)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT id FROM auth.users
  WHERE public.is_guest_email(email) AND created_at < now() - p_older_than
  ORDER BY created_at
  LIMIT greatest(1, least(p_limit, 500))
$$;
REVOKE ALL ON FUNCTION public.stale_guest_ids(interval, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_guest_ids(interval, int) TO project_admin;

---------------------------------------------------------------------------
-- Onboarding: sample pages are added once per workspace, from whichever device gets there first.
---------------------------------------------------------------------------
ALTER TABLE public.workspaces ADD COLUMN onboarded_at timestamptz;
UPDATE public.workspaces SET onboarded_at = now();  -- existing workspaces already have content

-- Claims onboarding for a personal workspace; true only for the single caller that wins.
CREATE OR REPLACE FUNCTION public.claim_onboarding(p_workspace uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.workspaces SET onboarded_at = now()
  WHERE id = p_workspace AND onboarded_at IS NULL AND owner_id = auth.uid();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_onboarding(uuid) TO authenticated;
GRANT UPDATE (onboarded_at) ON public.workspaces TO authenticated;
