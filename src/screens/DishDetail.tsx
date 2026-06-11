import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getDish, getOngoingSessionForDish, startSession } from '../db/repo'
import { currentElapsedMs } from '../timer/timer'
import { fmtElapsed } from '../domain/format'
import { useApp } from '../state/app'
import { useToast } from '../state/toast'
import { dishGradient } from '../components/tone'
import { TypeTag } from '../components/chips'
import { Chevron, Play } from '../components/icons'
import type { Session } from '../domain/types'

interface SessionRow {
  session: Session
  stages: number
  logs: number
  durationMs: number
}

function whenLabel(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'Last week'
  return new Date(iso).toLocaleDateString()
}

export function DishDetail({ dishId }: { dishId: string }) {
  const { nav, back } = useApp()
  const toast = useToast()
  const [starting, setStarting] = useState(false)

  const dish = useLiveQuery(() => getDish(dishId), [dishId])
  const ongoing = useLiveQuery(() => getOngoingSessionForDish(dishId), [dishId])
  const rows = useLiveQuery(
    async (): Promise<SessionRow[]> => {
      const sessions = await db.sessions.where('dish_id').equals(dishId).toArray()
      sessions.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      const out: SessionRow[] = []
      for (const session of sessions) {
        const stages = await db.stages.where('session_id').equals(session.id).toArray()
        let logs = 0
        for (const st of stages) logs += await db.logs.where('stage_id').equals(st.id).count()
        out.push({ session, stages: stages.length, logs, durationMs: currentElapsedMs(session) })
      }
      return out
    },
    [dishId],
    [] as SessionRow[],
  )

  if (!dish) {
    return (
      <>
        <div className="appbar" />
        <div className="empty">
          <div className="empty-sub">Loading…</div>
        </div>
      </>
    )
  }

  const onStart = async () => {
    if (starting) return
    setStarting(true)
    try {
      if (ongoing) {
        nav({ name: 'cooking', sessionId: ongoing.id })
        return
      }
      const { session } = await startSession(dish.id)
      nav({ name: 'cooking', sessionId: session.id })
    } catch {
      toast.err("Couldn't start cooking")
      setStarting(false)
    }
  }

  const openSession = (r: SessionRow) => {
    if (r.session.status === 'completed') nav({ name: 'timeline', sessionId: r.session.id })
    else nav({ name: 'cooking', sessionId: r.session.id })
  }

  return (
    <>
      <div className="dh-banner">
        <div className="dh-bg" style={{ backgroundImage: dishGradient(dish.id) }} />
        <button className="dh-back icon-btn" onClick={back} aria-label="Back">
          <Chevron />
        </button>
        <div className="dh-bname">
          <div className="dh-broman disp">{dish.name_ta || dish.name_en}</div>
          {dish.name_ta && <div className="dh-ben">{dish.name_en}</div>}
        </div>
      </div>

      <div className="dh-body no-scrollbar">
        {(dish.types ?? []).length > 0 && (
          <div className="dh-tags">
            {(dish.types ?? []).map((t) => (
              <TypeTag key={t} t={t} />
            ))}
          </div>
        )}
        {dish.description && <div className="dh-desc">{dish.description}</div>}

        <div className="dh-sec">
          {rows.length === 0 ? 'not cooked yet' : `${rows.length} ${rows.length === 1 ? 'time' : 'times'} she's cooked this`}
        </div>

        {rows.length === 0 ? (
          <div className="empty-sub" style={{ paddingTop: 4 }}>
            When she cooks this, each session shows up here as a timeline you can revisit.
          </div>
        ) : (
          <div className="dh-sessions">
            {rows.map((r) => {
              const live = r.session.status !== 'completed'
              return (
                <button key={r.session.id} className="dh-srow" onClick={() => openSession(r)}>
                  <div className={'dh-sdot' + (live ? ' live' : '')} />
                  <div>
                    <div className="dh-sdate">{whenLabel(r.session.started_at)}</div>
                    <div className="dh-smeta">
                      {r.stages} {r.stages === 1 ? 'stage' : 'stages'} · {r.logs} {r.logs === 1 ? 'log' : 'logs'}
                    </div>
                  </div>
                  {live ? (
                    <span className="dh-slive">
                      <span className="live-dot" />
                      {r.session.status === 'active' ? 'cooking now' : 'paused'}
                    </span>
                  ) : (
                    <span className="dh-sdur tnum">{fmtElapsed(r.durationMs)}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="dh-cta">
        <button className="btn-primary" onClick={onStart} disabled={starting}>
          <Play s={18} />
          {ongoing ? 'Resume cooking' : 'Start cooking'}
        </button>
      </div>
    </>
  )
}
