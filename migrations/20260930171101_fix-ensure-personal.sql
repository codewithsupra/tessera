-- Bug fix: since ensure_personal_workspace became SECURITY INVOKER, its INSERT ... RETURNING
-- failed for brand-new users (the SELECT policy is checked before the AFTER INSERT trigger
-- adds the owner's membership). Pick the id up front and insert without RETURNING,
-- exactly like create_workspace().
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
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.workspaces (id, name, owner_id, is_personal)
  VALUES (v_id, 'Personal', v_uid, true)
  ON CONFLICT DO NOTHING;  -- a concurrent first call may have won the one-personal index
  SELECT id INTO v_id FROM public.workspaces WHERE owner_id = v_uid AND is_personal;
  RETURN v_id;
END;
$$;
