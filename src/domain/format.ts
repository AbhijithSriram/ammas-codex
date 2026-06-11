import type { IngredientRef, LogIngredient } from './types'

/** ms → "M:SS" (or "H:MM:SS" past an hour). The session spine reads in elapsed offsets. */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

/** ms → "0:09" style short duration for media badges. */
export function fmtDuration(ms?: number): string {
  if (ms == null) return ''
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Honest amount formatting. "to taste" is a real value, never a missing number - it renders as
 * its own label, not "0 g" or a blank.
 */
export function formatAmount(li: Pick<LogIngredient, 'to_taste' | 'amount_g'>): string {
  if (li.to_taste) return 'to taste'
  if (li.amount_g == null) return '-'
  return `${li.amount_g} g`
}

/** A view-model for the ingredient chip: roman name, english name, amount label. */
export interface IngChipView {
  r: string // romanized Tamil (or freehand text)
  e: string // english (may be empty for freehand)
  amt: string
  taste: boolean
}

export function ingChipView(li: LogIngredient, ref?: IngredientRef): IngChipView {
  const r = ref ? ref.name_ta || ref.name_en : li.freehand_name || '-'
  const e = ref ? (ref.name_ta ? ref.name_en : '') : ''
  return { r, e, amt: formatAmount(li), taste: li.to_taste }
}
