import Dexie, { type Table } from 'dexie'
import type {
  Dish,
  IngredientRef,
  Log,
  LogIngredient,
  LogUtensil,
  Media,
  Session,
  Stage,
  UtensilRef,
  Vocab,
} from '../domain/types'

/** Fallback blob row for environments without reliable OPFS (idb: backend). */
export interface MediaBlob {
  id: string // == Media.id
  blob: Blob
}

/** A delete marker, so removals propagate to the server replica instead of being resurrected. */
export interface Tombstone {
  key: string // `${entity}:${id}`
  entity: string
  id: string
  updated_at: string
}

/**
 * The local source of truth. Structured rows in IndexedDB (via Dexie); media bytes live in OPFS
 * (see src/media) with this `mediaBlobs` table only as the fallback backend.
 *
 * Compound indexes are chosen for the exact reads the app does: a session's stages in order,
 * a stage's logs along the timeline, a log's attachments.
 */
export class CodexDB extends Dexie {
  dishes!: Table<Dish, string>
  sessions!: Table<Session, string>
  stages!: Table<Stage, string>
  logs!: Table<Log, string>
  media!: Table<Media, string>
  logIngredients!: Table<LogIngredient, string>
  logUtensils!: Table<LogUtensil, string>
  ingredientRefs!: Table<IngredientRef, string>
  utensilRefs!: Table<UtensilRef, string>
  vocab!: Table<Vocab, string>
  mediaBlobs!: Table<MediaBlob, string>
  tombstones!: Table<Tombstone, string>

  constructor() {
    super('ammas-codex')
    this.version(1).stores({
      dishes: 'id, updated_at',
      sessions: 'id, dish_id, status, [dish_id+status], started_at, updated_at',
      stages: 'id, session_id, [session_id+order_index], updated_at',
      logs: 'id, stage_id, [stage_id+elapsed_ms], updated_at',
      media: 'id, log_id, sync_state',
      logIngredients: 'id, log_id',
      logUtensils: 'id, log_id, [log_id+utensil_ref_id]',
      ingredientRefs: 'id, name_en, updated_at',
      utensilRefs: 'id, name_en, updated_at',
      vocab: 'id, kind, [kind+value]',
      mediaBlobs: 'id',
    })
    // v2: delete markers for sync. Existing data is preserved.
    this.version(2).stores({
      tombstones: 'key, updated_at',
    })
  }
}

/** The entity names used in sync payloads, mapped to their Dexie tables. */
export const SYNC_ENTITIES = [
  'dish',
  'session',
  'stage',
  'log',
  'media',
  'logIngredient',
  'logUtensil',
  'ingredientRef',
  'utensilRef',
  'vocab',
] as const
export type SyncEntity = (typeof SYNC_ENTITIES)[number]

export const db = new CodexDB()

/** Map a sync entity name to its Dexie table. */
export function entityTable(entity: SyncEntity): Table<{ id: string; updated_at: string; sync_state: string }, string> {
  const map: Record<SyncEntity, Table<never, string>> = {
    dish: db.dishes as unknown as Table<never, string>,
    session: db.sessions as unknown as Table<never, string>,
    stage: db.stages as unknown as Table<never, string>,
    log: db.logs as unknown as Table<never, string>,
    media: db.media as unknown as Table<never, string>,
    logIngredient: db.logIngredients as unknown as Table<never, string>,
    logUtensil: db.logUtensils as unknown as Table<never, string>,
    ingredientRef: db.ingredientRefs as unknown as Table<never, string>,
    utensilRef: db.utensilRefs as unknown as Table<never, string>,
    vocab: db.vocab as unknown as Table<never, string>,
  }
  return map[entity] as unknown as Table<{ id: string; updated_at: string; sync_state: string }, string>
}
