import { db, type SyncEntity } from './db'
import { uuid, nowISO, trackedNow, dirtyFields } from '../domain/ids'
import { completePatch, currentElapsedMs, pausePatch, resumePatch } from '../timer/timer'
import { deleteMedia, putMedia } from '../media/store'
import {
  SEED_DISH_TYPES,
  SEED_INGREDIENTS,
  SEED_STAGE_NAMES,
  SEED_UTENSILS,
  toneUri,
} from '../domain/seed'
import type {
  Dish,
  DishType,
  IngredientRef,
  IngredientState,
  Log,
  LogIngredient,
  LogKind,
  LogUtensil,
  Media,
  MediaType,
  Session,
  Stage,
  UtensilRef,
} from '../domain/types'

/* =========================================================================================
 * The repository is the ONLY place screens touch storage. It owns the write ordering that
 * makes "never lose a captured log" true, and keeps timing offset-based per the schema.
 * ========================================================================================= */

/** Record a delete marker so the removal propagates to the server replica (and to other devices
 *  on pull) instead of being resurrected. */
async function recordTombstone(entity: SyncEntity, id: string): Promise<void> {
  await db.tombstones.put({ key: `${entity}:${id}`, entity, id, updated_at: nowISO() })
}

/* ---------- First-run seed ---------- */

export async function ensureSeed(): Promise<void> {
  // One atomic, idempotent transaction. The IndexedDB readwrite scope serializes concurrent
  // callers (e.g. React StrictMode's double-invoked effect), so the guard can't race.
  await db.transaction('rw', db.vocab, db.ingredientRefs, db.utensilRefs, async () => {
    const seeded = await db.vocab.where('kind').equals('dish_type').count()
    if (seeded > 0) return

    await db.ingredientRefs.bulkPut(
      SEED_INGREDIENTS.map((s) => ({
        id: uuid(),
        name_ta: s.name_ta,
        name_en: s.name_en,
        default_state: s.default_state,
        ...trackedNow(),
      })),
    )
    await db.utensilRefs.bulkPut(
      SEED_UTENSILS.map((s) => ({
        id: uuid(),
        name_ta: s.name_ta,
        name_en: s.name_en,
        photo_uri: toneUri(s.tone),
        ...trackedNow(),
      })),
    )
    await db.vocab.bulkPut([
      ...SEED_DISH_TYPES.map((value, i) => ({ id: uuid(), kind: 'dish_type' as const, value, order_index: i, ...trackedNow() })),
      ...SEED_STAGE_NAMES.map((s, i) => ({
        id: uuid(),
        kind: 'stage_name' as const,
        value: s.value,
        label_ta: s.label_ta,
        order_index: i,
        ...trackedNow(),
      })),
    ])
  })
}

/* ---------- Dishes ---------- */

export interface NewDishInput {
  name_ta: string
  name_en: string
  description: string
  types: DishType[]
}

export async function createDish(input: NewDishInput): Promise<Dish> {
  const dish: Dish = { id: uuid(), ...input, ...trackedNow() }
  await db.dishes.put(dish)
  return dish
}

export async function listDishes(): Promise<Dish[]> {
  const all = await db.dishes.toArray()
  return all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

export function getDish(id: string): Promise<Dish | undefined> {
  return db.dishes.get(id)
}

export async function updateDish(id: string, changes: Partial<NewDishInput>): Promise<void> {
  await db.dishes.update(id, { ...changes, ...dirtyFields() })
}

/* ---------- Sessions ---------- */

/** Start cooking: create an active session and auto-open an (unnamed) first stage at offset 0,
 *  so she can drop a log immediately without being blocked on typing a stage name. */
export async function startSession(dishId: string): Promise<{ session: Session; stage: Stage }> {
  const t = nowISO()
  const session: Session = {
    id: uuid(),
    dish_id: dishId,
    started_at: t,
    status: 'active',
    total_elapsed_ms: 0,
    last_resumed_at: t,
    ...trackedNow(),
  }
  const stage: Stage = {
    id: uuid(),
    session_id: session.id,
    name: '',
    order_index: 0,
    started_elapsed_ms: 0,
    ...trackedNow(),
  }
  await db.transaction('rw', db.sessions, db.stages, async () => {
    await db.sessions.put(session)
    await db.stages.put(stage)
  })
  return { session, stage }
}

export function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id)
}

export async function listSessionsForDish(dishId: string): Promise<Session[]> {
  const all = await db.sessions.where('dish_id').equals(dishId).toArray()
  return all.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
}

/** The most recent not-completed session for a dish, if any (for "Resume"). */
export async function getOngoingSessionForDish(dishId: string): Promise<Session | undefined> {
  const all = await db.sessions.where('dish_id').equals(dishId).toArray()
  return all
    .filter((s) => s.status !== 'completed')
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0]
}

/** Any ongoing session app-wide (for booting straight back into cooking). */
export async function getAnyOngoingSession(): Promise<Session | undefined> {
  const all = await db.sessions.where('status').anyOf('active', 'paused').toArray()
  return all.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0]
}

async function applySessionPatch(id: string, patch: Partial<Session>): Promise<Session> {
  await db.sessions.update(id, { ...patch, ...dirtyFields() })
  const s = await db.sessions.get(id)
  if (!s) throw new Error('session vanished')
  return s
}

export async function pauseSession(id: string): Promise<Session> {
  const s = await db.sessions.get(id)
  if (!s || s.status !== 'active') return s as Session
  return applySessionPatch(id, pausePatch(s))
}

export async function resumeSession(id: string): Promise<Session> {
  const s = await db.sessions.get(id)
  if (!s || s.status === 'completed') return s as Session
  return applySessionPatch(id, resumePatch())
}

export async function completeSession(id: string, notes?: string): Promise<Session> {
  const s = await db.sessions.get(id)
  if (!s) throw new Error('no session')
  const patch = completePatch(s)
  // close any still-open stage at the final offset
  const elapsed = patch.total_elapsed_ms ?? s.total_elapsed_ms
  const open = await currentOpenStage(id)
  if (open) await db.stages.update(open.id, { ended_elapsed_ms: elapsed, updated_at: nowISO() })
  return applySessionPatch(id, { ...patch, ...(notes != null ? { notes } : {}) })
}

/* ---------- Stages (laps on the master timer) ---------- */

export function listStages(sessionId: string): Promise<Stage[]> {
  return db.stages.where('session_id').equals(sessionId).sortBy('order_index')
}

async function currentOpenStage(sessionId: string): Promise<Stage | undefined> {
  const stages = await listStages(sessionId)
  return [...stages].reverse().find((s) => s.ended_elapsed_ms == null)
}

export { currentOpenStage as getCurrentStage }

/** Start a new lap: close the open stage at the current offset, open a new one at the same offset. */
export async function addStage(sessionId: string, name: string): Promise<Stage> {
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('no session')
  const elapsed = currentElapsedMs(session)
  const stages = await listStages(sessionId)
  const open = [...stages].reverse().find((s) => s.ended_elapsed_ms == null)
  const order = stages.reduce((m, s) => Math.max(m, s.order_index), -1) + 1
  const stage: Stage = {
    id: uuid(),
    session_id: sessionId,
    name: name.trim(),
    order_index: order,
    started_elapsed_ms: elapsed,
    ...trackedNow(),
  }
  await db.transaction('rw', db.stages, async () => {
    if (open) await db.stages.update(open.id, { ended_elapsed_ms: elapsed, ...dirtyFields() })
    await db.stages.put(stage)
  })
  return stage
}

export async function renameStage(stageId: string, name: string): Promise<void> {
  await db.stages.update(stageId, { name: name.trim(), ...dirtyFields() })
}

/* ---------- Logs (the heart) ---------- */

export interface CaptureItem {
  blob: Blob
  media_type: MediaType
  mime: string
  ext: string
  duration_ms?: number
  width?: number
  height?: number
}

function deriveKind(items: CaptureItem[]): LogKind {
  const hasImage = items.some((i) => i.media_type === 'image')
  const hasAudio = items.some((i) => i.media_type === 'audio')
  const hasVideo = items.some((i) => i.media_type === 'video')
  if (hasVideo) return 'video'
  if (hasImage && hasAudio) return 'image_audio'
  if (hasImage) return 'image'
  return 'audio'
}

/**
 * Capture → durable. Writes every blob to durable storage FIRST, then commits the log + media
 * rows in one transaction. Only after this resolves is the log "saved". Throws on failure so the
 * caller can keep the in-memory blob and offer retry - a captured log is never silently dropped.
 */
export async function createLogWithMedia(params: {
  sessionId: string
  items: CaptureItem[]
  caption?: string
  kind?: LogKind
}): Promise<Log> {
  const { sessionId, items } = params
  const session = await db.sessions.get(sessionId)
  if (!session) throw new Error('no session')
  let stage = await currentOpenStage(sessionId)
  if (!stage) stage = await addStage(sessionId, '') // safety: ensure a current stage exists
  const elapsed = currentElapsedMs(session)

  // 1) Durable bytes first (outside the metadata transaction).
  const mediaRows: Media[] = []
  for (const item of items) {
    const id = uuid()
    const stored = await putMedia(id, item.blob, item.ext)
    mediaRows.push({
      id,
      log_id: '', // filled below
      media_type: item.media_type,
      local_uri: stored.local_uri,
      byte_size: stored.byte_size,
      duration_ms: item.duration_ms,
      width: item.width,
      height: item.height,
      ...trackedNow(),
    })
  }

  // 2) Commit metadata atomically.
  const log: Log = {
    id: uuid(),
    stage_id: stage.id,
    elapsed_ms: elapsed,
    kind: params.kind ?? deriveKind(items),
    caption: params.caption,
    ...trackedNow(),
  }
  for (const m of mediaRows) m.log_id = log.id

  try {
    await db.transaction('rw', db.logs, db.media, async () => {
      await db.logs.put(log)
      if (mediaRows.length) await db.media.bulkPut(mediaRows)
    })
  } catch (e) {
    // Roll back the durable bytes we just wrote so we don't accumulate orphans on a failed save.
    for (const m of mediaRows) await deleteMedia(m.local_uri).catch(() => {})
    throw e
  }
  return log
}

/** Append media to an existing log (e.g. snap a photo, then attach a voice note → image_audio). */
export async function addMediaToLog(logId: string, item: CaptureItem): Promise<void> {
  const log = await db.logs.get(logId)
  if (!log) throw new Error('no log')
  const id = uuid()
  const stored = await putMedia(id, item.blob, item.ext)
  const media: Media = {
    id,
    log_id: logId,
    media_type: item.media_type,
    local_uri: stored.local_uri,
    byte_size: stored.byte_size,
    duration_ms: item.duration_ms,
    width: item.width,
    height: item.height,
    ...trackedNow(),
  }
  const all = await db.media.where('log_id').equals(logId).toArray()
  const kind = deriveKind([
    ...all.map((m) => ({ media_type: m.media_type }) as CaptureItem),
    { media_type: item.media_type } as CaptureItem,
  ])
  await db.transaction('rw', db.logs, db.media, async () => {
    await db.media.put(media)
    await db.logs.update(logId, { kind, ...dirtyFields() })
  })
}

export function getLog(id: string): Promise<Log | undefined> {
  return db.logs.get(id)
}

export async function updateLogCaption(logId: string, caption: string): Promise<void> {
  await db.logs.update(logId, { caption, ...dirtyFields() })
}

/** Delete a log and everything attached to it, including durable media bytes. Leaves tombstones
 *  so the deletion reaches the server replica. */
export async function deleteLog(logId: string): Promise<void> {
  const media = await db.media.where('log_id').equals(logId).toArray()
  const lis = await db.logIngredients.where('log_id').equals(logId).toArray()
  const lus = await db.logUtensils.where('log_id').equals(logId).toArray()
  for (const m of media) await deleteMedia(m.local_uri).catch(() => {})
  await db.transaction('rw', [db.logs, db.media, db.logIngredients, db.logUtensils, db.tombstones], async () => {
    await db.media.where('log_id').equals(logId).delete()
    await db.logIngredients.where('log_id').equals(logId).delete()
    await db.logUtensils.where('log_id').equals(logId).delete()
    await db.logs.delete(logId)
    const t = nowISO()
    const tombs = [
      { entity: 'log' as const, id: logId },
      ...media.map((m) => ({ entity: 'media' as const, id: m.id })),
      ...lis.map((li) => ({ entity: 'logIngredient' as const, id: li.id })),
      ...lus.map((lu) => ({ entity: 'logUtensil' as const, id: lu.id })),
    ]
    await db.tombstones.bulkPut(tombs.map((x) => ({ key: `${x.entity}:${x.id}`, entity: x.entity, id: x.id, updated_at: t })))
  })
}

/* ---------- Ingredients & utensils (per log) ---------- */

export interface AttachIngredientInput {
  log_id: string
  ingredient_ref_id?: string
  freehand_name?: string
  amount_g?: number
  to_taste: boolean
  state: IngredientState
}

export async function attachIngredient(input: AttachIngredientInput): Promise<LogIngredient> {
  const li: LogIngredient = {
    id: uuid(),
    log_id: input.log_id,
    ingredient_ref_id: input.ingredient_ref_id,
    freehand_name: input.ingredient_ref_id ? undefined : input.freehand_name,
    amount_g: input.to_taste ? undefined : input.amount_g,
    to_taste: input.to_taste,
    state: input.state,
    ...trackedNow(),
  }
  await db.logIngredients.put(li)
  return li
}

export function listLogIngredients(logId: string): Promise<LogIngredient[]> {
  return db.logIngredients.where('log_id').equals(logId).toArray()
}

export async function removeLogIngredient(id: string): Promise<void> {
  await db.logIngredients.delete(id)
  await recordTombstone('logIngredient', id)
}

export async function attachUtensil(logId: string, utensilRefId: string): Promise<void> {
  const existing = await db.logUtensils
    .where('[log_id+utensil_ref_id]')
    .equals([logId, utensilRefId])
    .count()
  if (existing > 0) return // tap is idempotent
  const lu: LogUtensil = { id: uuid(), log_id: logId, utensil_ref_id: utensilRefId, ...trackedNow() }
  await db.logUtensils.put(lu)
}

export async function detachUtensil(logId: string, utensilRefId: string): Promise<void> {
  const rows = await db.logUtensils.where('[log_id+utensil_ref_id]').equals([logId, utensilRefId]).toArray()
  await db.logUtensils.where('[log_id+utensil_ref_id]').equals([logId, utensilRefId]).delete()
  for (const r of rows) await recordTombstone('logUtensil', r.id)
}

export function listLogUtensils(logId: string): Promise<LogUtensil[]> {
  return db.logUtensils.where('log_id').equals(logId).toArray()
}

/* ---------- Registries ---------- */

export function listIngredientRefs(): Promise<IngredientRef[]> {
  return db.ingredientRefs.orderBy('name_en').toArray()
}

export async function createIngredientRef(input: {
  name_ta?: string
  name_en: string
  default_state: IngredientState
}): Promise<IngredientRef> {
  const ref: IngredientRef = { id: uuid(), ...input, ...trackedNow() }
  await db.ingredientRefs.put(ref)
  return ref
}

export function listUtensilRefs(): Promise<UtensilRef[]> {
  return db.utensilRefs.orderBy('name_en').toArray()
}

export async function createUtensilRef(input: {
  name_ta?: string
  name_en: string
  photo_uri: string
}): Promise<UtensilRef> {
  const ref: UtensilRef = { id: uuid(), ...input, ...trackedNow() }
  await db.utensilRefs.put(ref)
  return ref
}

/* ---------- Vocabulary ---------- */

export async function listDishTypes(): Promise<string[]> {
  const rows = await db.vocab.where('kind').equals('dish_type').toArray()
  rows.sort((a, b) => a.order_index - b.order_index)
  return rows.map((r) => r.value)
}

export async function addDishType(value: string): Promise<void> {
  const v = value.trim().toLowerCase()
  if (!v) return
  const existing = await db.vocab.where('kind').equals('dish_type').toArray()
  if (existing.some((r) => r.value === v)) return
  const order = existing.reduce((m, r) => Math.max(m, r.order_index), -1) + 1
  await db.vocab.put({ id: uuid(), kind: 'dish_type', value: v, order_index: order, ...trackedNow() })
}

export async function listStageNameSuggestions(): Promise<{ value: string; label_ta?: string }[]> {
  const rows = await db.vocab.where('kind').equals('stage_name').toArray()
  rows.sort((a, b) => a.order_index - b.order_index)
  return rows.map((r) => ({ value: r.value, label_ta: r.label_ta }))
}
