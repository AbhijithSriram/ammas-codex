import { db } from './db'
import { currentElapsedMs } from '../timer/timer'
import type {
  Dish,
  IngredientRef,
  Log,
  LogIngredient,
  LogKind,
  LogUtensil,
  Media,
  Session,
  Stage,
  UtensilRef,
} from '../domain/types'

/* Derived views. Stage summaries are rolled up from logs on every read and never persisted, so
 * they can't drift (schema §5). */

export interface LogView {
  log: Log
  media: Media[]
  ingredients: { li: LogIngredient; ref?: IngredientRef }[]
  utensils: { lu: LogUtensil; ref?: UtensilRef }[]
}

export interface IngredientLine {
  key: string
  name_ta?: string
  name_en: string
}
export interface WeighedLine extends IngredientLine {
  total_g: number
}

export interface StageSummary {
  duration_ms: number
  /** Sum of grams per ingredient. */
  weighed: WeighedLine[]
  /** "to taste" ingredients, listed separately - an honest value, not a missing number. */
  toTaste: IngredientLine[]
  /** Distinct utensils used across the stage's logs. */
  utensils: UtensilRef[]
  logCount: number
  kindCounts: Partial<Record<LogKind, number>>
}

export interface StageView {
  stage: Stage
  logs: LogView[]
  summary: StageSummary
}

export interface SessionTimeline {
  session: Session
  dish?: Dish
  stages: StageView[]
}

function lineKey(li: LogIngredient, ref?: IngredientRef): { key: string; name_ta?: string; name_en: string } {
  if (ref) return { key: `ref:${ref.id}`, name_ta: ref.name_ta, name_en: ref.name_en }
  const name = (li.freehand_name || '').trim()
  return { key: `free:${name.toLowerCase()}`, name_en: name }
}

function summarize(
  session: Session,
  stage: Stage,
  logs: LogView[],
  now: number,
): StageSummary {
  const endOffset = stage.ended_elapsed_ms ?? currentElapsedMs(session, now)
  const duration_ms = Math.max(0, endOffset - stage.started_elapsed_ms)

  const weighedMap = new Map<string, WeighedLine>()
  const tasteMap = new Map<string, IngredientLine>()
  const utensilMap = new Map<string, UtensilRef>()
  const kindCounts: Partial<Record<LogKind, number>> = {}

  for (const lv of logs) {
    kindCounts[lv.log.kind] = (kindCounts[lv.log.kind] ?? 0) + 1
    for (const { li, ref } of lv.ingredients) {
      const k = lineKey(li, ref)
      if (li.to_taste) {
        if (!tasteMap.has(k.key)) tasteMap.set(k.key, k)
      } else if (li.amount_g != null) {
        const cur = weighedMap.get(k.key)
        if (cur) cur.total_g += li.amount_g
        else weighedMap.set(k.key, { ...k, total_g: li.amount_g })
      }
    }
    for (const { ref } of lv.utensils) {
      if (ref) utensilMap.set(ref.id, ref)
    }
  }

  return {
    duration_ms,
    weighed: [...weighedMap.values()],
    toTaste: [...tasteMap.values()],
    utensils: [...utensilMap.values()],
    logCount: logs.length,
    kindCounts,
  }
}

export async function getSessionTimeline(sessionId: string): Promise<SessionTimeline | null> {
  const session = await db.sessions.get(sessionId)
  if (!session) return null
  const now = Date.now()

  const [dish, stages, ingredientRefs, utensilRefs] = await Promise.all([
    db.dishes.get(session.dish_id),
    db.stages.where('session_id').equals(sessionId).sortBy('order_index'),
    db.ingredientRefs.toArray(),
    db.utensilRefs.toArray(),
  ])
  const ingRefMap = new Map(ingredientRefs.map((r) => [r.id, r]))
  const utRefMap = new Map(utensilRefs.map((r) => [r.id, r]))

  const stageViews: StageView[] = []
  for (const stage of stages) {
    const logs = await db.logs.where('stage_id').equals(stage.id).sortBy('elapsed_ms')
    const logViews: LogView[] = []
    for (const log of logs) {
      const [media, lis, lus] = await Promise.all([
        db.media.where('log_id').equals(log.id).toArray(),
        db.logIngredients.where('log_id').equals(log.id).toArray(),
        db.logUtensils.where('log_id').equals(log.id).toArray(),
      ])
      logViews.push({
        log,
        media,
        ingredients: lis.map((li) => ({ li, ref: li.ingredient_ref_id ? ingRefMap.get(li.ingredient_ref_id) : undefined })),
        utensils: lus.map((lu) => ({ lu, ref: utRefMap.get(lu.utensil_ref_id) })),
      })
    }
    stageViews.push({ stage, logs: logViews, summary: summarize(session, stage, logViews, now) })
  }

  return { session, dish, stages: stageViews }
}
