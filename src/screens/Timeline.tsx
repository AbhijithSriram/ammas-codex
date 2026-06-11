import { useLiveQuery } from 'dexie-react-hooks'
import { completeSession, deleteLog, updateLogCaption } from '../db/repo'
import { getSessionTimeline, type LogView, type StageView } from '../db/timeline'
import { fmtElapsed, ingChipView, type IngChipView } from '../domain/format'
import { useApp } from '../state/app'
import { useToast } from '../state/toast'
import { IngChip, UtensilTile } from '../components/chips'
import { MediaThumb } from '../components/media'
import { BackButton } from '../components/ui'
import { Check, Chevron, Play, Trash } from '../components/icons'
import type { WeighedLine, IngredientLine } from '../db/timeline'

function weighedView(w: WeighedLine): IngChipView {
  return { r: w.name_ta || w.name_en, e: w.name_ta ? w.name_en : '', amt: `${w.total_g} g`, taste: false }
}
function tasteView(t: IngredientLine): IngChipView {
  return { r: t.name_ta || t.name_en, e: t.name_ta ? t.name_en : '', amt: 'to taste', taste: true }
}

function representativeMedia(lv: LogView) {
  return lv.media.find((m) => m.media_type === 'image') ?? lv.media[0]
}

function TimelineLog({
  lv,
  onDelete,
  onCaption,
}: {
  lv: LogView
  onDelete: (logId: string) => void
  onCaption: (logId: string, current: string) => void
}) {
  const media = representativeMedia(lv)
  return (
    <div className="tl-log">
      <div className="tl-lnode" />
      <div className="log-card">
        <div className="tl-lhead">
          {media && <MediaThumb media={media} size={56} radius={14} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="log-time" style={{ fontSize: 13 }}>
              {fmtElapsed(lv.log.elapsed_ms)}
            </div>
            {lv.log.caption ? (
              <button
                className="log-caption"
                style={{ marginTop: 2, textAlign: 'left', background: 'none', display: 'block' }}
                onClick={() => onCaption(lv.log.id, lv.log.caption || '')}
              >
                {lv.log.caption}
              </button>
            ) : (
              <button className="tl-addnote" onClick={() => onCaption(lv.log.id, '')}>
                + add a note
              </button>
            )}
          </div>
          <button className="tl-del" onClick={() => onDelete(lv.log.id)} aria-label="Delete log">
            <Trash s={16} />
          </button>
        </div>
        {(lv.ingredients.length > 0 || lv.utensils.length > 0) && (
          <div className="tl-lused">
            <div className="chip-row">
              {lv.ingredients.map(({ li, ref }) => (
                <IngChip key={li.id} ing={ingChipView(li, ref)} />
              ))}
            </div>
            {lv.utensils.length > 0 && (
              <div className="tl-lutils">
                {lv.utensils.map(({ lu, ref }) => ref && <UtensilTile key={lu.id} utensil={ref} size={28} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StageBlock({
  sv,
  index,
  onDelete,
  onCaption,
}: {
  sv: StageView
  index: number
  onDelete: (logId: string) => void
  onCaption: (logId: string, current: string) => void
}) {
  const { stage, summary } = sv
  const named = stage.name.trim().length > 0
  const rangeEnd = stage.ended_elapsed_ms != null ? fmtElapsed(stage.ended_elapsed_ms) : 'now'
  return (
    <div className="tl-stage">
      <div className="tl-marker">
        <div className="tl-mnode" />
        <div className="tl-mhead">
          <div>
            <span className={'tl-mname disp' + (named ? '' : ' unnamed')}>{named ? stage.name : `Stage ${index + 1}`}</span>
          </div>
          <div className="tl-mdur tnum">{fmtElapsed(summary.duration_ms)}</div>
        </div>
      </div>

      <div className="tl-rollup">
        <div className="tl-ru-row">
          <span className="tl-ru-k">used</span>
          {summary.weighed.length === 0 && summary.toTaste.length === 0 ? (
            <span className="tl-ru-empty">nothing logged</span>
          ) : (
            <div className="chip-row" style={{ flex: 1 }}>
              {summary.weighed.map((w) => (
                <IngChip key={w.key} ing={weighedView(w)} />
              ))}
              {summary.toTaste.map((t) => (
                <IngChip key={t.key} ing={tasteView(t)} />
              ))}
            </div>
          )}
        </div>
        <div className="tl-ru-row">
          <span className="tl-ru-k">tools</span>
          {summary.utensils.length === 0 ? (
            <span className="tl-ru-empty">-</span>
          ) : (
            <div className="tl-ru-tools">
              {summary.utensils.map((u) => (
                <div key={u.id} className="tl-ru-tool">
                  <UtensilTile utensil={u} size={26} />
                  <span>{u.name_ta || u.name_en}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="tl-ru-row">
          <span className="tl-ru-k">moments</span>
          <span className="tl-ru-media tnum">
            {summary.logCount} {summary.logCount === 1 ? 'log' : 'logs'} · {fmtElapsed(stage.started_elapsed_ms)}-{rangeEnd}
          </span>
        </div>
      </div>

      {sv.logs.map((lv) => (
        <TimelineLog key={lv.log.id} lv={lv} onDelete={onDelete} onCaption={onCaption} />
      ))}
    </div>
  )
}

export function Timeline({ sessionId }: { sessionId: string }) {
  const { nav, back } = useApp()
  const toast = useToast()
  const data = useLiveQuery(() => getSessionTimeline(sessionId), [sessionId])

  if (data === undefined) {
    return (
      <>
        <div className="appbar">
          <BackButton onClick={back} />
        </div>
        <div className="empty">
          <div className="empty-sub">Loading the timeline…</div>
        </div>
      </>
    )
  }
  if (data === null) {
    return (
      <>
        <div className="appbar">
          <BackButton onClick={back} />
        </div>
        <div className="empty">
          <div className="empty-title disp">Session not found</div>
          <div className="empty-sub">It may have been removed.</div>
        </div>
      </>
    )
  }

  const { session, dish, stages } = data
  const totalMs = stages.reduce((m, s) => Math.max(m, s.stage.ended_elapsed_ms ?? s.summary.duration_ms + s.stage.started_elapsed_ms), session.total_elapsed_ms)
  const logCount = stages.reduce((n, s) => n + s.summary.logCount, 0)
  const completed = session.status === 'completed'

  const finish = async () => {
    try {
      await completeSession(sessionId)
      toast.ok('Session finished')
    } catch {
      toast.err("Couldn't finish")
    }
  }

  const onDelete = async (logId: string) => {
    if (!window.confirm('Delete this log? This removes its photo/voice and what you logged with it.')) return
    try {
      await deleteLog(logId)
      toast.ok('Log deleted')
    } catch {
      toast.err("Couldn't delete")
    }
  }

  const onCaption = async (logId: string, current: string) => {
    const next = window.prompt('Add a note to this moment', current)
    if (next == null) return
    try {
      await updateLogCaption(logId, next.trim())
      toast.ok('Note saved')
    } catch {
      toast.err("Couldn't save the note")
    }
  }

  return (
    <>
      <div className="tl-head">
        <BackButton onClick={back} />
        <div>
          <div className="tl-htitle disp">{dish?.name_ta || dish?.name_en || 'Session'}</div>
          <div className="tl-hen">
            {dish?.name_ta ? dish.name_en + ' · ' : ''}
            {completed ? 'finished' : session.status}
          </div>
        </div>
        <div className="tl-htime">
          <div className="v tnum">{fmtElapsed(totalMs)}</div>
          <div className="k">total</div>
        </div>
      </div>
      <div className="tl-meta">
        <span className="chip">
          {stages.length} {stages.length === 1 ? 'stage' : 'stages'} · {logCount} {logCount === 1 ? 'log' : 'logs'}
        </span>
      </div>

      <div className="tl-scroll no-scrollbar">
        <div className="tl-rail" />
        {stages.length === 0 || logCount === 0 ? (
          <div className="empty" style={{ paddingTop: 40 }}>
            <div className="empty-title disp">Nothing captured yet</div>
            <div className="empty-sub">Keep cooking and drop a log - it'll appear here on the thread.</div>
          </div>
        ) : (
          stages.map((sv, i) => (
            <StageBlock key={sv.stage.id} sv={sv} index={i} onDelete={onDelete} onCaption={onCaption} />
          ))
        )}

        <div className="tl-foot">
          {completed ? (
            <button className="tl-resume" onClick={() => (dish ? nav({ name: 'dish', dishId: dish.id }) : back())}>
              <Chevron dir="left" s={16} />
              Back to dish
            </button>
          ) : (
            <>
              <button className="tl-resume" onClick={() => nav({ name: 'cooking', sessionId })}>
                <Play s={16} />
                Keep cooking
              </button>
              <button className="tl-done-btn" onClick={finish}>
                <Check s={16} />
                Finish
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
