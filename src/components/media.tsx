import { useEffect, useState } from 'react'
import { useMediaURL } from '../media/useMediaURL'
import { getMediaURL } from '../media/store'
import { fmtDuration } from '../domain/format'
import type { Media } from '../domain/types'
import { Camera, Mic, Play, Wave } from './icons'

/** A thumbnail for a single media row. Images load their bytes; audio/video show a labelled tile. */
export function MediaThumb({ media, size = 56, radius = 14 }: { media: Media; size?: number; radius?: number }) {
  const isImage = media.media_type === 'image'
  const url = useMediaURL(isImage ? media.local_uri : undefined)
  const style: React.CSSProperties = { width: size, height: size, borderRadius: radius }

  if (media.media_type === 'audio') {
    return (
      <div
        className="media-thumb"
        style={{ ...style, backgroundImage: 'none', background: 'var(--clay-wash)', color: 'var(--clay)' }}
      >
        <Wave s={Math.round(size * 0.42)} />
        <span className="mt-badge">
          <Mic s={11} />
          {fmtDuration(media.duration_ms) || 'voice'}
        </span>
      </div>
    )
  }

  if (media.media_type === 'video') {
    return (
      <div className="media-thumb" style={style}>
        <span className="mt-badge">
          <Play s={11} />
          {fmtDuration(media.duration_ms) || 'video'}
        </span>
      </div>
    )
  }

  // image
  return (
    <div className="media-thumb" style={style}>
      {url ? <img src={url} alt={media.media_type} /> : null}
      <span className="mt-badge">
        <Camera s={11} />
        photo
      </span>
    </div>
  )
}

/** Inline player for a media row (used when a log is opened). */
export function MediaPlayer({ media }: { media: Media }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    let current: string | null = null
    setLoading(true)
    getMediaURL(media.local_uri).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      current = u
      setUrl(u)
      setLoading(false)
    })
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [media.local_uri])

  if (!url) {
    return (
      <div
        className="media-thumb"
        style={{ width: '100%', height: 120, borderRadius: 16, background: 'var(--surface-2)', color: 'var(--ink-faint)', fontSize: 13, fontWeight: 600 }}
      >
        {loading ? 'loading…' : 'media unavailable'}
      </div>
    )
  }
  if (media.media_type === 'image') {
    return <img src={url} alt="capture" style={{ width: '100%', borderRadius: 16, display: 'block' }} />
  }
  if (media.media_type === 'video') {
    return <video src={url} controls playsInline style={{ width: '100%', borderRadius: 16, display: 'block' }} />
  }
  return <audio src={url} controls style={{ width: '100%' }} />
}
