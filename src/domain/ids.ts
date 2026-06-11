import type { ISO, SyncState, Tracked } from './types'

/** Stable, client-generated UUID so offline-created rows merge without collisions. */
export function uuid(): string {
  // crypto.randomUUID is available in all PWA-capable browsers (secure context).
  return crypto.randomUUID()
}

export function nowISO(): ISO {
  return new Date().toISOString()
}

/** Tracked defaults for a freshly created row. */
export function trackedNow(): Tracked {
  const t = nowISO()
  return { created_at: t, updated_at: t, sync_state: 'local_only' as SyncState }
}

/** Bump updated_at; sync layer (later) will flip sync_state back to local_only on change. */
export function touch<T extends Tracked>(row: T): T {
  return { ...row, updated_at: nowISO() }
}

/** Patch fields for any local mutation: new updated_at + re-mark dirty so sync re-pushes the row. */
export function dirtyFields(): { updated_at: ISO; sync_state: SyncState } {
  return { updated_at: nowISO(), sync_state: 'local_only' }
}
