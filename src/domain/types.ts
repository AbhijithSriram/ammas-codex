/* Domain types - mirror ammas-codex-schema.md exactly.
 *
 * Every row carries sync-readiness fields (`created_at`, `updated_at`, `sync_state`) and a
 * stable client-generated UUID, so records created offline merge without collisions when the
 * server sync lands later (milestone 2+). Milestone 1 never reads `sync_state` beyond defaulting
 * it to 'local_only' - it's here so no migration is needed when sync arrives.
 */

export type ISO = string // ISO-8601 wall-clock timestamp
export type UUID = string

/** Local-first sync lifecycle. Media: local_only → uploading → synced. */
export type SyncState = 'local_only' | 'uploading' | 'synced'

/** Fields shared by every persisted row. */
export interface Tracked {
  created_at: ISO
  updated_at: ISO
  sync_state: SyncState
}

/** Dish types are an editable vocabulary (§6), not a fixed enum. */
export type DishType = string

export interface Dish extends Tracked {
  id: UUID
  name_ta: string // romanized Tamil, e.g. "Vatha Kuzhambu"
  name_en: string
  description: string
  types: DishType[]
  cover_media_id?: UUID
}

export type SessionStatus = 'active' | 'paused' | 'completed'

export interface Session extends Tracked {
  id: UUID
  dish_id: UUID
  /** Wall-clock start. Used only for sync ordering and display ("today"), never for the timeline. */
  started_at: ISO
  ended_at?: ISO
  status: SessionStatus
  /** Pause-aware accumulated runtime (ms), excluding paused spans. */
  total_elapsed_ms: number
  /**
   * ADDED beyond the schema doc: wall-clock of the last resume, or undefined while paused/completed.
   * The doc's timer math references "last_resumed_at = now" but doesn't list it as a field; we must
   * persist it so a page reload mid-cook keeps counting from the right point. See src/timer.
   */
  last_resumed_at?: ISO
  notes?: string
}

export interface Stage extends Tracked {
  id: UUID
  session_id: UUID
  name: string
  order_index: number
  /** Offset from session start when this stage began (ms). Portable, clock-immune. */
  started_elapsed_ms: number
  /** Undefined while this is the current (open) stage. */
  ended_elapsed_ms?: number
}

export type LogKind = 'audio' | 'image' | 'image_audio' | 'video'

export interface Log extends Tracked {
  id: UUID
  stage_id: UUID
  /** Offset from session start at the moment of capture (ms) - the log's position on the spine. */
  elapsed_ms: number
  kind: LogKind
  caption?: string
}

export type MediaType = 'audio' | 'image' | 'video'

export interface Media extends Tracked {
  id: UUID
  log_id: UUID
  media_type: MediaType
  /** Backend-tagged handle: "opfs:media/{id}.{ext}" or "idb:{id}" (see src/media). */
  local_uri: string
  remote_url?: string
  duration_ms?: number
  width?: number
  height?: number
  byte_size: number
}

export type IngredientState = 'solid' | 'liquid'

export interface LogIngredient extends Tracked {
  id: UUID
  log_id: UUID
  /** Exactly one of ingredient_ref_id / freehand_name is set. */
  ingredient_ref_id?: UUID
  freehand_name?: string
  /** Grams on the universal scale. Undefined when to_taste - never a fabricated number. */
  amount_g?: number
  to_taste: boolean
  state: IngredientState
}

export interface LogUtensil extends Tracked {
  id: UUID
  log_id: UUID
  utensil_ref_id: UUID
}

export interface IngredientRef extends Tracked {
  id: UUID
  name_ta?: string
  name_en: string
  default_state: IngredientState
  photo_media_id?: UUID
}

export interface UtensilRef extends Tracked {
  id: UUID
  name_ta?: string
  name_en: string
  /**
   * The pre-loaded photo she taps. Real photos are "opfs:.."/"idb:.." handles; seeded utensils
   * (which have no photo yet) use a "tone:#hexA,#hexB" gradient token so they still render as the
   * prototype's warm tiles. See UtensilTile.
   */
  photo_uri: string
}

/** Editable vocabularies (§6): dish types and stage-name suggestions. */
export type VocabKind = 'dish_type' | 'stage_name'

export interface Vocab extends Tracked {
  id: UUID
  kind: VocabKind
  value: string
  /** Romanized Tamil label for stage-name suggestions, optional. */
  label_ta?: string
  /** Stable display order within a kind. */
  order_index: number
}
