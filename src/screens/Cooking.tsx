import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  addStage,
  createLogWithMedia,
  getCurrentStage,
  getSession,
  listStages,
  pauseSession,
  renameStage,
  resumeSession,
} from '../db/repo'
import { useTimer } from '../timer/useTimer'
import { fmtElapsed, ingChipView } from '../domain/format'
import { toCaptureItem, type PendingCapture } from '../media/capture'
import { useAudioRecorder } from '../media/useAudioRecorder'
import { useVideoRecorder } from '../media/useVideoRecorder'
import { useApp } from '../state/app'
import { useToast } from '../state/toast'
import { IngChip, UtensilTile } from '../components/chips'
import { MediaThumb } from '../components/media'
import { CameraCapture, type CapturedImage } from '../components/CameraCapture'
import { CaptureReview } from '../components/CaptureReview'
import { LogDetail } from '../components/LogDetail'
import { StageNameSheet } from '../components/NewStageSheet'
import { Camera, Chevron, Flag, Mic, Pause, Play, Plus, Pot, Scale, Video } from '../components/icons'
import type { IngredientRef, Log, LogKind, Media, Stage, UtensilRef } from '../domain/types'

type CapMode = 'voice' | 'video'

/** Live camera preview bound to the video recorder's stream (framing while she holds Record). */
function VideoPreview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && stream) {
      el.srcObject = stream
      el.play().catch(() => {})
    }
  }, [stream])
  return (
    <div className="a2-videoprev">
      <video ref={ref} muted playsInline />
    </div>
  )
}

function KindGlyph({ kind, s = 13 }: { kind: LogKind; s?: number }) {
  if (kind === 'video') return <Play s={s - 1} />
  if (kind === 'audio' || kind === 'image_audio') return <Mic s={s} />
  return <Camera s={s} />
}

function LiveWave({ levels }: { levels: number[] }) {
  return (
    <div className="a2-wave">
      {levels.map((l, i) => (
        <i key={i} style={{ height: Math.max(6, Math.min(44, l * 44)) }} />
      ))}
    </div>
  )
}

interface ActiveView {
  log: Log
  media: Media[]
  ingredients: { id: string; view: ReturnType<typeof ingChipView> }[]
  utensils: UtensilRef[]
}

export function Cooking({ sessionId }: { sessionId: string }) {
  const { nav, back } = useApp()
  const toast = useToast()
  const rec = useAudioRecorder()
  const vrec = useVideoRecorder()

  const [pending, setPending] = useState<PendingCapture | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [overlay, setOverlay] = useState<null | 'newstage' | 'renamestage' | { logId: string; tab: 'ing' | 'util' }>(null)
  const [activeLogId, setActiveLogId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<CapMode>(() => (localStorage.getItem('amma_capmode') === 'video' ? 'video' : 'voice'))
  const setCapMode = (m: CapMode) => {
    setMode(m)
    localStorage.setItem('amma_capmode', m)
  }

  const session = useLiveQuery(() => getSession(sessionId), [sessionId])
  const stages = useLiveQuery(() => listStages(sessionId), [sessionId], [] as Stage[])
  const currentStage = useLiveQuery(() => getCurrentStage(sessionId), [sessionId, stages.length])
  const stageLogs = useLiveQuery(
    async (): Promise<Log[]> =>
      currentStage ? db.logs.where('stage_id').equals(currentStage.id).sortBy('elapsed_ms') : [],
    [currentStage?.id],
    [] as Log[],
  )
  const activeView = useLiveQuery(
    async (): Promise<ActiveView | null> => {
      if (!activeLogId) return null
      const log = await db.logs.get(activeLogId)
      if (!log) return null
      const [media, lis, lus, ingRefs, utRefs] = await Promise.all([
        db.media.where('log_id').equals(activeLogId).toArray(),
        db.logIngredients.where('log_id').equals(activeLogId).toArray(),
        db.logUtensils.where('log_id').equals(activeLogId).toArray(),
        db.ingredientRefs.toArray(),
        db.utensilRefs.toArray(),
      ])
      const ingMap = new Map(ingRefs.map((r: IngredientRef) => [r.id, r]))
      const utMap = new Map(utRefs.map((r: UtensilRef) => [r.id, r]))
      return {
        log,
        media,
        ingredients: lis.map((li) => ({ id: li.id, view: ingChipView(li, li.ingredient_ref_id ? ingMap.get(li.ingredient_ref_id) : undefined) })),
        utensils: lus.map((lu) => utMap.get(lu.utensil_ref_id)).filter((u): u is UtensilRef => !!u),
      }
    },
    [activeLogId],
    null,
  )

  const elapsed = useTimer(session)
  const stageStart = currentStage?.started_elapsed_ms ?? 0
  const paused = session?.status === 'paused'
  const recording = rec.recording || vrec.recording
  const canRecord = session?.status === 'active' && !pending && !overlay && !showCamera

  if (!session) {
    return (
      <>
        <div className="appbar">
          <button className="icon-btn" onClick={back} aria-label="Back">
            <Chevron />
          </button>
        </div>
        <div className="empty">
          <div className="empty-sub">Loading the session…</div>
        </div>
      </>
    )
  }

  const dishLabel = () => {
    // dish name resolved lazily for the log-detail subtitle
    return `${fmtElapsed(elapsed)}`
  }

  /* ---- capture handlers ---- */
  // Hold the Record button: in Voice mode it records a voice note; in Video mode it records
  // camera + mic with a live framing preview. Whatever the toggle says is what Record captures.
  const onRecordDown = async (e: React.PointerEvent) => {
    if (!canRecord) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (mode === 'video') {
      const ok = await vrec.start()
      if (!ok) toast.err(vrec.error || 'Could not start the camera')
    } else {
      const ok = await rec.start()
      if (!ok) toast.err(rec.error || 'Could not start the microphone')
    }
  }
  const onRecordUp = async () => {
    if (vrec.recording) {
      const r = await vrec.stop()
      if (r) setPending({ blob: r.blob, media_type: 'video', mime: r.mime, duration_ms: r.duration_ms, width: r.width, height: r.height })
      return
    }
    if (rec.recording) {
      const r = await rec.stop()
      if (r) setPending({ blob: r.blob, media_type: 'audio', mime: r.mime, duration_ms: r.duration_ms })
    }
  }
  const onPhoto = (img: CapturedImage) => {
    setShowCamera(false)
    setPending({ blob: img.blob, media_type: 'image', mime: img.mime, width: img.width, height: img.height })
  }

  const keep = async () => {
    if (!pending || saving) return
    setSaving(true)
    try {
      const log = await createLogWithMedia({ sessionId, items: [toCaptureItem(pending)] })
      setActiveLogId(log.id)
      setPending(null)
      toast.ok('Saved')
    } catch {
      // Keep the pending capture on screen so nothing is lost - she can retry.
      toast.err("Couldn't save - kept here, tap Keep to try again")
    } finally {
      setSaving(false)
    }
  }
  const retake = () => {
    const wasImage = pending?.media_type === 'image'
    setPending(null)
    if (wasImage) setShowCamera(true)
  }

  const togglePause = async () => {
    try {
      if (paused) await resumeSession(sessionId)
      else await pauseSession(sessionId)
    } catch {
      toast.err("Couldn't change the timer")
    }
  }

  const openAttach = (tab: 'ing' | 'util') => {
    if (!activeLogId) {
      toast.err('Capture a photo or voice note first, then add what went in')
      return
    }
    setOverlay({ logId: activeLogId, tab })
  }

  /* ---- full-screen capture/overlays ---- */
  if (showCamera) return <CameraCapture onCapture={onPhoto} onClose={() => setShowCamera(false)} />
  if (pending)
    return <CaptureReview item={pending} onKeep={keep} onRetry={retake} onDiscard={() => setPending(null)} />
  if (overlay && typeof overlay === 'object')
    return <LogDetail logId={overlay.logId} subtitle={dishLabel()} initialTab={overlay.tab} onClose={() => setOverlay(null)} />

  const doneLogs = stageLogs.slice(-3)
  const stageNamed = (currentStage?.name.trim().length ?? 0) > 0

  return (
    <>
      <div className="dishrow">
        <button className="icon-btn" onClick={back} aria-label="Back" style={{ marginRight: 2 }}>
          <Chevron />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dish-roman disp" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <DishName dishId={session.dish_id} />
          </div>
        </div>
        <button className="pause-pill" onClick={togglePause}>
          <span className="ico">{paused ? <Play s={16} /> : <Pause />}</span>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      <div className="a2-top">
        <div className="a2-cook">{paused ? 'paused' : 'cooking'}</div>
        <div className={'a2-time tnum' + (paused ? ' paused' : '')}>{fmtElapsed(elapsed)}</div>
        <div className="a2-stage">
          {!paused && <span className="live-dot" />}
          <button
            className={'a2-sname disp' + (stageNamed ? '' : ' unnamed')}
            onClick={() => currentStage && setOverlay('renamestage')}
            style={{ background: 'none' }}
          >
            {stageNamed ? currentStage?.name : `Stage ${(currentStage?.order_index ?? 0) + 1}`}
          </button>
          <span className="a2-slap tnum">{fmtElapsed(Math.max(0, elapsed - stageStart))}</span>
        </div>
      </div>

      <div className="a2-mid">
        <div className="a2-thread" />
        <div className="a2-done-list">
          {doneLogs.map((log) => (
            <div key={log.id} className="a2-done">
              <div className="a2-dnode" />
              <span className="a2-dtime tnum">{fmtElapsed(log.elapsed_ms)}</span>
              <span className="a2-dico">
                <KindGlyph kind={log.kind} />
              </span>
              <span className="a2-dcap">{log.caption || logKindLabel(log.kind)}</span>
            </div>
          ))}
        </div>

        {paused ? (
          <div className="a2-now">
            <div className="a2-now-node" />
            <div className="a2-now-empty" style={{ paddingTop: 2 }}>
              Timer paused. Take your time.
            </div>
            <button className="btn-primary" style={{ marginBottom: 8 }} onClick={togglePause}>
              <Play s={18} />
              Resume cooking
            </button>
            <button className="btn-secondary" onClick={() => nav({ name: 'timeline', sessionId })}>
              Review timeline
            </button>
          </div>
        ) : (
          <div className={'a2-now' + (recording ? ' rec' : '')}>
            <div className="a2-now-node" />
            <div className="a2-now-head">
              <span className="a2-nh-t tnum">this log · {fmtElapsed(elapsed)}</span>
              <span className="a2-nh-now">
                {recording ? (
                  <>
                    <span className="live-dot" />
                    recording {mode}
                  </>
                ) : (
                  'now'
                )}
              </span>
            </div>

            {vrec.recording ? (
              <VideoPreview stream={vrec.stream} />
            ) : rec.recording ? (
              <LiveWave levels={rec.levels} />
            ) : activeView ? (
              <>
                <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 11 }}>
                  {activeView.media[0] && <MediaThumb media={activeView.media[0]} size={52} radius={13} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {activeView.log.caption ? (
                      <div className="log-caption">{activeView.log.caption}</div>
                    ) : (
                      <div className="a2-attach-label" style={{ margin: 0 }}>
                        {logKindLabel(activeView.log.kind)} saved · add what went in
                      </div>
                    )}
                    {activeView.utensils.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                        {activeView.utensils.map((u) => (
                          <UtensilTile key={u.id} utensil={u} size={26} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="chip-row">
                  {activeView.ingredients.map((ing) => (
                    <IngChip key={ing.id} ing={ing.view} />
                  ))}
                  <button className="a2-add-chip" onClick={() => openAttach('ing')}>
                    <Plus s={14} />
                    add
                  </button>
                </div>
              </>
            ) : (
              <div className="a2-now-empty">Hold the mic, or tap the camera, to drop your first log.</div>
            )}
          </div>
        )}
      </div>

      <div className="a2-dock">
        <div className="a2-secondary">
          <button className="a2-pill" onClick={() => setOverlay('newstage')}>
            <span className="ico">
              <Flag />
            </span>
            New stage
          </button>
          <button className="a2-pill" onClick={() => openAttach('ing')} style={{ opacity: activeLogId ? 1 : 0.5 }}>
            <span className="ico">
              <Scale />
            </span>
            Ingredient
          </button>
          <button className="a2-pill" onClick={() => openAttach('util')} style={{ opacity: activeLogId ? 1 : 0.5 }}>
            <span className="ico">
              <Pot />
            </span>
            Tool
          </button>
        </div>
        <div className="a2-toggle">
          <div className="inner">
            <button
              className={'a2-tg' + (mode === 'voice' ? ' on' : '')}
              onClick={() => !recording && setCapMode('voice')}
              disabled={recording}
            >
              <Mic s={16} />
              Voice
            </button>
            <button
              className={'a2-tg' + (mode === 'video' ? ' on' : '')}
              onClick={() => !recording && setCapMode('video')}
              disabled={recording}
            >
              <Video s={16} />
              Video
            </button>
          </div>
        </div>
        <div className="a2-controls">
          <div className="a2-cap">
            <button
              className="a2-circle photo"
              onClick={() => canRecord && setShowCamera(true)}
              disabled={!canRecord}
              aria-label="Take photo"
            >
              <Camera s={34} />
            </button>
            <div className="a2-caplabel">Photo</div>
          </div>
          <div className="a2-cap">
            <button
              className={'a2-circle rec' + (recording ? ' live' : '')}
              onPointerDown={onRecordDown}
              onPointerUp={onRecordUp}
              onPointerCancel={onRecordUp}
              disabled={!canRecord && !recording}
              aria-label={mode === 'video' ? 'Hold to record video' : 'Hold to record'}
            >
              {mode === 'video' ? <Video s={40} /> : <Mic s={40} />}
            </button>
            <div className="a2-caplabel">
              {recording ? 'Release to keep' : mode === 'video' ? 'Hold for video' : 'Hold to record'}
            </div>
          </div>
        </div>
      </div>

      {overlay === 'newstage' && (
        <StageNameSheet
          title="Name this stage"
          sub="it laps the timer and starts a fresh thread"
          onPick={async (v) => {
            await addStage(sessionId, v)
            setActiveLogId(null) // new stage → fresh thread
            toast.ok(v.trim() ? `Stage “${v.trim()}” started` : 'New stage started')
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'renamestage' && currentStage && (
        <StageNameSheet
          title="Rename this stage"
          sub="just changes the name - the timer keeps running"
          onPick={async (v) => {
            await renameStage(currentStage.id, v)
            toast.ok('Stage renamed')
          }}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  )
}

function logKindLabel(kind: LogKind): string {
  if (kind === 'audio') return 'Voice note'
  if (kind === 'image') return 'Photo'
  if (kind === 'image_audio') return 'Photo + voice'
  return 'Video'
}

function DishName({ dishId }: { dishId: string }) {
  const dish = useLiveQuery(() => db.dishes.get(dishId), [dishId])
  return <>{dish ? dish.name_ta || dish.name_en : ''}</>
}
