import { SYNC_ENTITIES, db, entityTable, type SyncEntity } from '../db/db'
import { deleteMedia, getMediaBlob, parseLocalUri } from '../media/store'
import { api, getCursor, isSyncConfigured, setCursor, subscribeSettings } from './settings'
import { setStatus } from './status'
import type { Media, MediaType } from '../domain/types'

/* The background sync engine. It is never on the critical path of cooking: it runs on a timer,
 * on reconnect, and on demand, and any failure simply leaves rows dirty for the next pass
 * (resumable). Conflict policy is last-write-wins by `updated_at`. */

interface ServerRecord {
  entity: SyncEntity
  id: string
  updated_at: string
  deleted: boolean
  payload: Record<string, unknown>
}

type Row = { id: string; updated_at: string; sync_state: string }

function mimeForUpload(mediaType: MediaType, ext: string): string {
  if (mediaType === 'image') return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  if (mediaType === 'audio') return ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/webm'
  if (mediaType === 'video') return ext === 'mp4' ? 'video/mp4' : 'video/webm'
  return 'application/octet-stream'
}

/** Count rows that still need pushing (for the live badge). */
export async function countPending(): Promise<number> {
  let n = 0
  for (const entity of SYNC_ENTITIES) {
    const rows = (await entityTable(entity).toArray()) as Row[]
    n += rows.filter((r) => r.sync_state !== 'synced').length
  }
  n += await db.tombstones.count()
  return n
}

async function collectDirty(): Promise<{ records: ServerRecord[]; tombstones: { entity: SyncEntity; id: string; updated_at: string }[] }> {
  const records: ServerRecord[] = []
  for (const entity of SYNC_ENTITIES) {
    const rows = (await entityTable(entity).toArray()) as Row[]
    for (const row of rows) {
      if (row.sync_state !== 'synced') {
        records.push({ entity, id: row.id, updated_at: row.updated_at, deleted: false, payload: row as unknown as Record<string, unknown> })
      }
    }
  }
  const tombs = await db.tombstones.toArray()
  return { records, tombstones: tombs.map((t) => ({ entity: t.entity as SyncEntity, id: t.id, updated_at: t.updated_at })) }
}

async function pushOnce(): Promise<void> {
  const { records, tombstones } = await collectDirty()
  const tombstoneRecords: ServerRecord[] = tombstones.map((t) => ({ ...t, deleted: true, payload: {} }))
  if (records.length === 0 && tombstoneRecords.length === 0) return

  const { url, headers } = api('/api/sync/push')
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [...records, ...tombstoneRecords] }),
  })
  if (!res.ok) throw new Error(`push failed (${res.status})`)
  await res.json()

  // Mark non-media rows synced - but only if they haven't changed since we read them.
  for (const rec of records) {
    if (rec.entity === 'media') continue
    const table = entityTable(rec.entity)
    const cur = (await table.get(rec.id)) as Row | undefined
    if (cur && cur.updated_at === rec.updated_at) await table.update(rec.id, { sync_state: 'synced' } as Partial<Row>)
  }
  // Tombstones are delivered; drop them.
  if (tombstones.length) await db.tombstones.bulkDelete(tombstones.map((t) => `${t.entity}:${t.id}`))
}

async function uploadPendingMedia(): Promise<void> {
  const medias = await db.media.toArray()
  for (const m of medias.filter((x) => x.sync_state !== 'synced')) {
    const blob = await getMediaBlob(m.local_uri)
    if (!blob) continue // bytes not present locally (e.g. evicted) - can't upload
    const ext = parseLocalUri(m.local_uri)?.ext || 'bin'
    const { url, headers } = api(`/api/media/${m.id}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': mimeForUpload(m.media_type, ext) },
      body: blob,
    })
    if (!res.ok) throw new Error(`media upload failed (${res.status})`)
    const j = (await res.json()) as { remote_url?: string }
    const cur = await db.media.get(m.id)
    if (cur) await db.media.update(m.id, { remote_url: j.remote_url, sync_state: 'synced' })
  }
}

async function applyPulled(rec: ServerRecord): Promise<void> {
  if (!SYNC_ENTITIES.includes(rec.entity)) return
  const table = entityTable(rec.entity)
  const cur = (await table.get(rec.id)) as Row | undefined

  if (rec.deleted) {
    if (!cur || cur.updated_at <= rec.updated_at) {
      if (rec.entity === 'media' && cur) await deleteMedia((cur as unknown as Media).local_uri).catch(() => {})
      await table.delete(rec.id)
    }
    return
  }
  if (!cur || cur.updated_at < rec.updated_at) {
    await table.put({ ...rec.payload, sync_state: 'synced' } as unknown as Row)
  }
}

async function pullOnce(): Promise<void> {
  let cursor = getCursor()
  for (let guard = 0; guard < 100; guard++) {
    const { url, headers } = api(`/api/sync/pull?since=${encodeURIComponent(cursor)}&limit=500`)
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`pull failed (${res.status})`)
    const data = (await res.json()) as { records: ServerRecord[]; more: boolean }
    for (const rec of data.records) {
      await applyPulled(rec)
      if (rec.updated_at > cursor) cursor = rec.updated_at
    }
    setCursor(cursor)
    if (!data.more) break
  }
}

let running = false

/** One full sync pass: push dirty rows + tombstones, upload media bytes, then pull + merge. */
export async function runSync(): Promise<void> {
  if (!isSyncConfigured()) {
    setStatus({ phase: 'disabled' })
    return
  }
  if (running) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ phase: 'offline' })
    return
  }
  running = true
  setStatus({ phase: 'syncing', error: undefined })
  try {
    await pushOnce()
    await uploadPendingMedia()
    await pullOnce()
    setStatus({ phase: 'idle', lastSyncedAt: new Date().toISOString(), error: undefined })
  } catch (e) {
    // Resumable: leave everything dirty and try again next pass.
    setStatus({ phase: 'error', error: e instanceof Error ? e.message : 'sync failed' })
  } finally {
    running = false
  }
}

export const requestSync = () => {
  void runSync()
}

let started = false

export function startSync(): void {
  if (started) return
  started = true
  window.setTimeout(() => void runSync(), 1500)
  window.setInterval(() => void runSync(), 20_000)
  window.addEventListener('online', () => void runSync())
  subscribeSettings(() => void runSync())
}
