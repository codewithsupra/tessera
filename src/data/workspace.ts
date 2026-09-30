import { useAuth } from '../auth/context'
import { useSyncStore } from '../sync/syncStore'

/** The on-device workspace used before the cloud workspace is known (first launch offline). */
export function localWorkspaceId(userId: string): string {
  return `local:${userId}`
}

export function useWorkspaceId(): string {
  const { user } = useAuth()
  const cloud = useSyncStore((s) => s.workspaceId)
  if (!user) throw new Error('useWorkspaceId requires a signed-in user')
  return cloud ?? localWorkspaceId(user.id)
}
