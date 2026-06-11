import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Close, Retry } from './icons'

export interface CapturedImage {
  blob: Blob
  mime: string
  width: number
  height: number
}

/* Live in-app camera (getUserMedia) with a canvas snapshot. If the camera is unavailable or
 * permission is denied, it falls back to the OS camera via <input capture> so a photo is still
 * always possible - capture must never be a dead end. */
export function CameraCapture({ onCapture, onClose }: { onCapture: (img: CapturedImage) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [fallback, setFallback] = useState(false)
  const [ready, setReady] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        if (!cancelled) setFallback(true)
      }
    })()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [facing, stopStream])

  // When falling back, open the OS camera immediately.
  useEffect(() => {
    if (fallback) fileRef.current?.click()
  }, [fallback])

  const snap = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stopStream()
        onCapture({ blob, mime: 'image/jpeg', width: w, height: h })
      },
      'image/jpeg',
      0.9,
    )
  }, [onCapture, stopStream])

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) {
        onClose()
        return
      }
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        onCapture({ blob: file, mime: file.type || 'image/jpeg', width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        onCapture({ blob: file, mime: file.type || 'image/jpeg', width: 0, height: 0 })
      }
      img.src = url
    },
    [onCapture, onClose],
  )

  return (
    <div className="cam-overlay">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
      />
      {!fallback && (
        <>
          <video ref={videoRef} className="cam-video" playsInline muted />
          <button className="cam-close icon-btn" onClick={() => { stopStream(); onClose() }} aria-label="Close camera">
            <Close />
          </button>
          <div className="cam-controls">
            <button
              className="cam-flip"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              aria-label="Flip camera"
            >
              <Retry s={22} />
            </button>
            <button className="cam-shutter" onClick={snap} aria-label="Take photo" disabled={!ready}>
              <Camera s={34} />
            </button>
            <div style={{ width: 52 }} />
          </div>
        </>
      )}
    </div>
  )
}
