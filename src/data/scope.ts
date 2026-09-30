import { scopeDb } from './db'
import { scopeDocs } from './docs'

/** Points all on-device storage at one user's databases. Call before rendering their data. */
export function setDataScope(userId: string | null): void {
  scopeDb(userId)
  scopeDocs(userId)
}
