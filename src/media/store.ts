import { db } from '../db/db'
import { api, isSyncConfigured } from '../sync/settings'
import type { MediaType } from '../domain/types'

/* Media storage. Bytes are written to OPFS (Origin Private File System) on the target device
 * (Android/Chrome); a Dexie blob table is the automatic fallback where OPFS is unavailable, so
 * callers never care which backend holds the bytes.
 *
 * local_uri encodes the backend:  "opfs:media/{id}.{ext}"  |  "idb:{id}"
 *
 * Reliability rule (see repo.createLogWithMedia): bytes are written here and confirmed durable
 * BEFORE any log/media row is committed. A crash mid-write can orphan a blob (harmless garbage),
 * never a log the cook believes was saved. */

const DIR = 'media'

function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage && !!navigator.storage.getDirectory
}

async function mediaDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) return null
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(DIR, { create })
  } catch {
    return null
  }
}

export function extFromType(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('webm')) return 'webm'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return m.includes('audio') ? 'm4a' : 'mp4'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('quicktime') || m.includes('mov')) return 'mov'
  return 'bin'
}

export interface StoredMedia {
  local_uri: string
  byte_size: number
}

/** Persist bytes durably. Returns the backend-tagged handle + size. Throws if nothing could be written. */
export async function putMedia(id: string, blob: Blob, ext: string): Promise<StoredMedia> {
  const dir = await mediaDir(true)
  if (dir) {
    try {
      const name = `${id}.${ext}`
      const fh = await dir.getFileHandle(name, { create: true })
      const w = await fh.createWritable()
      await w.write(blob)
      await w.close()
      return { local_uri: `opfs:${DIR}/${name}`, byte_size: blob.size }
    } catch {
      // fall through to the IndexedDB blob fallback
    }
  }
  await db.mediaBlobs.put({ id, blob })
  return { local_uri: `idb:${id}`, byte_size: blob.size }
}

/** Extract the media id + extension encoded in a local_uri. */
export function parseLocalUri(local_uri: string): { id: string; ext: string } | null {
  if (!local_uri) return null
  if (local_uri.startsWith('opfs:')) {
    const path = local_uri.slice('opfs:'.length) // "media/{id}.{ext}"
    const slash = path.indexOf('/')
    const file = slash >= 0 ? path.slice(slash + 1) : path
    const dot = file.lastIndexOf('.')
    return dot >= 0 ? { id: file.slice(0, dot), ext: file.slice(dot + 1) } : { id: file, ext: 'bin' }
  }
  if (local_uri.startsWith('idb:')) return { id: local_uri.slice('idb:'.length), ext: 'bin' }
  return null
}

/** Read the raw Blob for a local_uri (for upload). Null if the bytes aren't present locally. */
export async function getMediaBlob(local_uri: string): Promise<Blob | null> {
  if (!local_uri) return null
  if (local_uri.startsWith('opfs:')) {
    const parsed = parseLocalUri(local_uri)
    if (!parsed) return null
    const dir = await mediaDir(false)
    if (!dir) return null
    try {
      const fh = await dir.getFileHandle(`${parsed.id}.${parsed.ext}`)
      return await fh.getFile()
    } catch {
      return null
    }
  }
  if (local_uri.startsWith('idb:')) {
    const row = await db.mediaBlobs.get(local_uri.slice('idb:'.length))
    return row ? row.blob : null
  }
  return null
}

/** When local bytes are missing but sync is configured, fetch them from the server replica and
 * cache them locally (so a reviewer device that pulled metadata can still see the media). */
async function fetchFromServer(local_uri: string): Promise<Blob | null> {
  if (!isSyncConfigured()) return null
  const parsed = parseLocalUri(local_uri)
  if (!parsed) return null
  try {
    const { url, headers } = api(`/api/media/${parsed.id}`)
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const blob = await res.blob()
    await putMedia(parsed.id, blob, parsed.ext) // cache for next time
    return blob
  } catch {
    return null
  }
}

/** Resolve a local_uri to an object URL for playback/preview. Caller must revokeObjectURL. */
export async function getMediaURL(local_uri: string): Promise<string | null> {
  const local = await getMediaBlob(local_uri)
  if (local) return URL.createObjectURL(local)
  const remote = await fetchFromServer(local_uri)
  return remote ? URL.createObjectURL(remote) : null
}

export async function deleteMedia(local_uri: string): Promise<void> {
  if (local_uri.startsWith('opfs:')) {
    const path = local_uri.slice('opfs:'.length)
    const slash = path.indexOf('/')
    const file = slash >= 0 ? path.slice(slash + 1) : path
    const dir = await mediaDir(false)
    if (dir) {
      try {
        await dir.removeEntry(file)
      } catch {
        /* already gone */
      }
    }
    return
  }
  if (local_uri.startsWith('idb:')) {
    await db.mediaBlobs.delete(local_uri.slice('idb:'.length))
  }
}

/** Ask the OS to not evict the kitchen's data. Best-effort; safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* ignore */
  }
  return false
}

export interface StorageEstimate {
  usage: number
  quota: number
}

export async function storageEstimate(): Promise<StorageEstimate | null> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate()
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
    }
  } catch {
    /* ignore */
  }
  return null
}

export type { MediaType }
