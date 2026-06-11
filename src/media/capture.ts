import { extFromType } from './store'
import type { CaptureItem } from '../db/repo'
import type { MediaType } from '../domain/types'

/** A captured-but-not-yet-saved item, held in memory during review. */
export interface PendingCapture {
  blob: Blob
  media_type: MediaType
  mime: string
  duration_ms?: number
  width?: number
  height?: number
}

export function toCaptureItem(p: PendingCapture): CaptureItem {
  return {
    blob: p.blob,
    media_type: p.media_type,
    mime: p.mime,
    ext: extFromType(p.mime),
    duration_ms: p.duration_ms,
    width: p.width,
    height: p.height,
  }
}
