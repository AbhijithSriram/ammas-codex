/* Device-local sync configuration (NOT domain data, never pushed). The server URL + shared token
 * live here; the pull cursor tracks how far this device has hydrated. */

export interface SyncSettings {
  serverUrl: string
  token: string
  enabled: boolean
}

const KEY = 'amma_sync_settings'
const CURSOR_KEY = 'amma_sync_cursor'

const DEFAULTS: SyncSettings = {
  serverUrl: 'https://ammas-codex.abhijith-sriram.in',
  token: '',
  enabled: false,
}

let cache: SyncSettings = load()
const listeners = new Set<() => void>()

function load(): SyncSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

export function getSettings(): SyncSettings {
  return cache
}

export function setSettings(patch: Partial<SyncSettings>): void {
  cache = { ...cache, ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach((l) => l())
}

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** True only when sync is switched on AND configured enough to try. */
export function isSyncConfigured(): boolean {
  return cache.enabled && cache.serverUrl.trim().length > 0 && cache.token.trim().length > 0
}

export function getCursor(): string {
  return localStorage.getItem(CURSOR_KEY) || ''
}

export function setCursor(c: string): void {
  if (c) localStorage.setItem(CURSOR_KEY, c)
}

/** Build an absolute API URL + the auth header. */
export function api(path: string): { url: string; headers: Record<string, string> } {
  const base = cache.serverUrl.replace(/\/+$/, '')
  return { url: base + path, headers: { Authorization: `Bearer ${cache.token}` } }
}
