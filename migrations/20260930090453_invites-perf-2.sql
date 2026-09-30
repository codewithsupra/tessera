-- Same policies as invites-perf, rewritten as lower((SELECT auth.email())) so the advisor recognizes the initplan.
ALTER POLICY invites_select ON public.workspace_invites
  USING (public.workspace_role(workspace_id) = 'owner' OR email = lower((SELECT auth.email())));
ALTER POLICY invites_accept ON public.workspace_invites
  USING (email = lower((SELECT auth.email())))
  WITH CHECK (email = lower((SELECT auth.email())) AND accepted_by = (SELECT auth.uid()));
ALTER POLICY members_join_by_invite ON public.workspace_members
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND role IN ('editor', 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.workspace_invites i
      WHERE i.workspace_id = workspace_members.workspace_id
        AND i.token_hash = workspace_members.invite_hash
        AND i.role = workspace_members.role
        AND i.email = lower((SELECT auth.email()))
        AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    )
  );
