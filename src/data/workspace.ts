import { useAuth } from '../auth/context'

/** Until cloud workspaces arrive (M4), each user gets one personal, on-device workspace. */
export function localWorkspaceId(userId: string): string {
  return `local:${userId}`
}

export function useWorkspaceId(): string {
  const { user } = useAuth()
  if (!user) throw new Error('useWorkspaceId requires a signed-in user')
  return localWorkspaceId(user.id)
}
