-- INSERT ... RETURNING on workspaces must pass the SELECT policy for the new row, which is
-- evaluated before the AFTER INSERT trigger adds the owner's membership. Create through an
-- invoker RPC that picks the id itself and returns it without RETURNING.
GRANT INSERT (id) ON public.workspaces TO authenticated;

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Workspace names must be 1–80 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workspaces (id, name, owner_id) VALUES (v_id, v_name, auth.uid());
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;
