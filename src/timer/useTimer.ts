import { useEffect, useState } from 'react'
import type { Session } from '../domain/types'
import { currentElapsedMs } from './timer'

/** A shared clock that re-renders every `intervalMs`. For lists of live timers. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

type TimerView = Pick<Session, 'status' | 'total_elapsed_ms' | 'last_resumed_at'> | null | undefined

/**
 * Live elapsed milliseconds for a session. Ticks once a second while active; the tick only forces
 * a re-render - the value is always derived from persisted state, so it's correct across reloads
 * and never drifts. Returns total_elapsed_ms when paused/completed.
 */
export function useTimer(session: TimerView): number {
  const active = session?.status === 'active'
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000)
    return () => window.clearInterval(id)
  }, [active])
  if (!session) return 0
  return currentElapsedMs(session)
}
