import { useSyncExternalStore } from 'react'

export type SyncPhase = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  lastSyncedAt?: string
  error?: string
}

let status: SyncStatus = { phase: 'disabled' }
const listeners = new Set<() => void>()

export function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status)
}
