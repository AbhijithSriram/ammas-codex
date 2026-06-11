import { useCallback, useEffect, useRef, useState } from 'react'

/* Real video capture: getUserMedia(video + audio) → MediaRecorder. Exposes the live stream so the
 * deck can show a framing preview while she holds Record. Raw video is preserved as-is. */

export interface RecordedVideo {
  blob: Blob
  mime: string
  duration_ms: number
  width?: number
  height?: number
}

interface VideoRecorderState {
  recording: boolean
  stream: MediaStream | null
  error: string | null
}

function pickMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function useVideoRecorder() {
  const [state, setState] = useState<VideoRecorderState>({ recording: false, stream: null, error: null })

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const dimsRef = useRef<{ width?: number; height?: number }>({})
  const resolveRef = useRef<((r: RecordedVideo | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const start = useCallback(async (): Promise<boolean> => {
    if (recRef.current) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      })
      streamRef.current = stream
      const settings = stream.getVideoTracks()[0]?.getSettings?.() || {}
      dimsRef.current = { width: settings.width, height: settings.height }

      const mime = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const type = rec.mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type })
        const duration_ms = Date.now() - startRef.current
        cleanup()
        setState({ recording: false, stream: null, error: null })
        const resolve = resolveRef.current
        resolveRef.current = null
        resolve?.(blob.size > 0 ? { blob, mime: type, duration_ms, ...dimsRef.current } : null)
      }

      startRef.current = Date.now()
      recRef.current = rec
      rec.start()
      setState({ recording: true, stream, error: null })
      return true
    } catch (e) {
      cleanup()
      const msg =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Camera/microphone permission was blocked.'
          : 'Could not start the camera.'
      setState({ recording: false, stream: null, error: msg })
      return false
    }
  }, [cleanup])

  const stop = useCallback((): Promise<RecordedVideo | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }
      resolveRef.current = resolve
      rec.stop()
    })
  }, [])

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])

  return { ...state, start, stop, clearError }
}
