import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { currentElapsedMs } from '../timer/timer'
import { useNow } from '../timer/useTimer'
import { fmtElapsed } from '../domain/format'
import { useApp } from '../state/app'
import { dishGradient } from './tone'
import type { Dish, Session } from '../domain/types'

/* Parallel dishes are just independent sessions she switches between by hand (no scheduling, no
 * dependency graph). This strip surfaces every active/paused session so she can foreground one. */
export function CookingNow() {
  const { nav } = useApp()
  const now = useNow()
  const sessions = useLiveQuery(
    () => db.sessions.where('status').anyOf('active', 'paused').toArray(),
    [],
    [] as Session[],
  )
  const dishes = useLiveQuery(() => db.dishes.toArray(), [], [] as Dish[])

  if (sessions.length === 0) return null
  const dishMap = new Map(dishes.map((d) => [d.id, d]))
  const ordered = [...sessions].sort((a, b) => (a.started_at < b.started_at ? 1 : -1))

  return (
    <div className="cn-wrap">
      <div className="cn-label">cooking now</div>
      <div className="cn-row no-scrollbar">
        {ordered.map((s) => {
          const dish = dishMap.get(s.dish_id)
          const paused = s.status === 'paused'
          return (
            <button key={s.id} className="cn-card" onClick={() => nav({ name: 'cooking', sessionId: s.id })}>
              <div className="cn-thumb" style={{ backgroundImage: dishGradient(s.dish_id) }}>
                <span className={'cn-dot' + (paused ? ' paused' : '')} />
              </div>
              <div className="cn-body">
                <div className="cn-name disp">{dish ? dish.name_ta || dish.name_en : 'Session'}</div>
                <div className="cn-meta tnum">
                  {fmtElapsed(currentElapsedMs(s, now))} · {paused ? 'paused' : 'cooking'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
