-- Advisor: evaluate auth.email() once per statement, and index columns used by policies.
ALTER POLICY invites_select ON public.workspace_invites
  USING (public.workspace_role(workspace_id) = 'owner' OR email = (SELECT lower(auth.email())));
ALTER POLICY invites_accept ON public.workspace_invites
  USING (email = (SELECT lower(auth.email())))
  WITH CHECK (email = (SELECT lower(auth.email())) AND accepted_by = (SELECT auth.uid()));
ALTER POLICY members_join_by_invite ON public.workspace_members
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND role IN ('editor', 'viewer')
    AND EXISTS (
      SELECT 1 FROM public.workspace_invites i
      WHERE i.workspace_id = workspace_members.workspace_id
        AND i.token_hash = workspace_members.invite_hash
        AND i.role = workspace_members.role
        AND i.email = (SELECT lower(auth.email()))
        AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    )
  );

CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON public.workspace_invites (email);
CREATE INDEX IF NOT EXISTS workspace_members_invite_hash_idx ON public.workspace_members (invite_hash) WHERE invite_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspace_members_role_idx ON public.workspace_members (workspace_id, role);
CREATE INDEX IF NOT EXISTS workspaces_is_personal_idx ON public.workspaces (is_personal);
