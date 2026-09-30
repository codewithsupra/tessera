import { setScopeUser } from './scopeName'

/**
 * Points all on-device storage at one user's databases. Call before rendering their data.
 * Cheap to import: storage modules follow the scope when (and if) they load.
 */
export function setDataScope(userId: string | null): void {
  setScopeUser(userId)
}
