import type { Session } from '../domain/types'
import { nowISO } from '../domain/ids'

/* Pure, offset-based timer math - the spine. Truth is two persisted numbers on the session:
 * `total_elapsed_ms` (frozen accumulated runtime) and `last_resumed_at` (wall-clock of the last
 * resume, only while active). Live elapsed is derived; the display tick never mutates state, so
 * the timer survives reloads and is immune to wall-clock changes. */

type TimerView = Pick<Session, 'status' | 'total_elapsed_ms' | 'last_resumed_at'>

export function currentElapsedMs(s: TimerView, now: number = Date.now()): number {
  if (s.status === 'active' && s.last_resumed_at) {
    return s.total_elapsed_ms + Math.max(0, now - Date.parse(s.last_resumed_at))
  }
  return s.total_elapsed_ms
}

export interface SessionTimerPatch {
  status: Session['status']
  total_elapsed_ms?: number
  last_resumed_at?: string | undefined
  ended_at?: string
}

/** Pause: fold the running delta into total_elapsed_ms and stop counting. */
export function pausePatch(s: TimerView, now = Date.now()): SessionTimerPatch {
  return {
    status: 'paused',
    total_elapsed_ms: currentElapsedMs(s, now),
    last_resumed_at: undefined,
  }
}

/** Resume: start counting again from now. */
export function resumePatch(): SessionTimerPatch {
  return { status: 'active', last_resumed_at: nowISO() }
}

/** Complete: freeze elapsed and stamp the wall-clock end. */
export function completePatch(s: TimerView, now = Date.now()): SessionTimerPatch {
  return {
    status: 'completed',
    total_elapsed_ms: currentElapsedMs(s, now),
    last_resumed_at: undefined,
    ended_at: nowISO(),
  }
}
