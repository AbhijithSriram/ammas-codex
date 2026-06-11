import { useEffect, useMemo } from 'react'
import type { PendingCapture } from '../media/capture'
import { fmtDuration } from '../domain/format'
import { Check, Retry, Trash } from './icons'

/* Preview a just-captured item before it's saved. Keep persists it (durably); Re-take discards
 * and re-opens capture; Discard throws it away. Nothing is written until Keep. */
export function CaptureReview({
  item,
  onKeep,
  onRetry,
  onDiscard,
}: {
  item: PendingCapture
  onKeep: () => void
  onRetry: () => void
  onDiscard: () => void
}) {
  const url = useMemo(() => URL.createObjectURL(item.blob), [item.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="app-frame" style={{ position: 'absolute', inset: 0, maxWidth: 'none', height: '100%', zIndex: 65 }}>
      <div className="appbar">
        <div className="disp" style={{ fontSize: 18, fontWeight: 600 }}>
          {item.media_type === 'image' ? 'Keep this photo?' : item.media_type === 'video' ? 'Keep this video?' : 'Keep this voice note?'}
        </div>
      </div>
      <div className="cr-body no-scrollbar">
        {item.media_type === 'image' ? (
          <img src={url} alt="capture preview" style={{ width: '100%', borderRadius: 18, display: 'block' }} />
        ) : item.media_type === 'video' ? (
          <video src={url} controls playsInline style={{ width: '100%', borderRadius: 18, display: 'block', background: '#0c0906' }} />
        ) : (
          <div className="log-card" style={{ padding: 16 }}>
            <div className="a2-nh-now" style={{ marginBottom: 10 }}>
              voice note {item.duration_ms ? `· ${fmtDuration(item.duration_ms)}` : ''}
            </div>
            <audio src={url} controls style={{ width: '100%' }} />
          </div>
        )}
        <div className="empty-sub" style={{ textAlign: 'center' }}>
          Keep it and it's saved to this moment on the timeline. You can add ingredients or tools after.
        </div>
      </div>
      <div className="cr-foot">
        <button className="cr-discard" onClick={onDiscard} aria-label="Discard">
          <Trash s={18} />
        </button>
        <button className="btn-secondary" style={{ flex: '0 0 auto', width: 'auto', padding: '0 18px' }} onClick={onRetry}>
          <Retry s={18} />
          Re-take
        </button>
        <button className="btn-primary cr-keep" onClick={onKeep}>
          <Check s={20} />
          Keep
        </button>
      </div>
    </div>
  )
}
