import { useCallback, useEffect, useRef, useState } from 'react'

/* Real audio capture via getUserMedia + MediaRecorder, with live amplitude levels driving the
 * waveform. Raw audio is preserved as-is (no transcription, per spec). */

export interface RecordedAudio {
  blob: Blob
  mime: string
  duration_ms: number
}

interface RecorderState {
  recording: boolean
  /** Recent normalized amplitudes [0..1] for the live waveform. */
  levels: number[]
  error: string | null
}

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

const BARS = 22

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>({ recording: false, levels: new Array(BARS).fill(0.06), error: null })

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const levelsRef = useRef<number[]>(new Array(BARS).fill(0.06))
  const resolveRef = useRef<((r: RecordedAudio | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close().catch(() => {})
    ctxRef.current = null
    analyserRef.current = null
    recRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const sample = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const buf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / buf.length)
    const level = Math.min(1, Math.max(0.06, rms * 3.2))
    const next = [...levelsRef.current.slice(1), level]
    levelsRef.current = next
    setState((s) => ({ ...s, levels: next }))
    rafRef.current = requestAnimationFrame(sample)
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    if (recRef.current) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        const duration_ms = Date.now() - startRef.current
        cleanup()
        setState({ recording: false, levels: new Array(BARS).fill(0.06), error: null })
        levelsRef.current = new Array(BARS).fill(0.06)
        const resolve = resolveRef.current
        resolveRef.current = null
        resolve?.(blob.size > 0 ? { blob, mime: type, duration_ms } : null)
      }

      // Live level metering.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      analyserRef.current = analyser

      startRef.current = Date.now()
      recRef.current = rec
      rec.start()
      setState({ recording: true, levels: levelsRef.current, error: null })
      rafRef.current = requestAnimationFrame(sample)
      return true
    } catch (e) {
      cleanup()
      const msg =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was blocked.'
          : 'Could not start the microphone.'
      setState({ recording: false, levels: new Array(BARS).fill(0.06), error: msg })
      return false
    }
  }, [cleanup, sample])

  const stop = useCallback((): Promise<RecordedAudio | null> => {
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

  return { ...state, start, stop, clearError, bars: BARS }
}
