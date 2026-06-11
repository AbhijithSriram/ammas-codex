import { useMediaURL } from '../media/useMediaURL'
import type { IngChipView } from '../domain/format'
import type { UtensilRef } from '../domain/types'

/** Ingredient chip: roman name · english · amount. "to taste" renders in sage, not as a number. */
export function IngChip({ ing, big }: { ing: IngChipView; big?: boolean }) {
  return (
    <span className={'ing-chip' + (ing.taste ? ' taste' : '') + (big ? ' big' : '')}>
      <span>{ing.r}</span>
      {ing.e && <span className="ic-en">{ing.e}</span>}
      <span className="ic-amt">{ing.amt}</span>
    </span>
  )
}

/** Resolve a utensil's photo_uri: a "tone:" gradient token, or a real opfs:/idb: photo. */
function utensilBackground(photoUri: string, resolved: string | null): React.CSSProperties {
  if (photoUri.startsWith('tone:')) {
    const [a, b] = photoUri.slice('tone:'.length).split(',')
    return { backgroundImage: `linear-gradient(140deg, ${a}, ${b})` }
  }
  if (resolved) return { backgroundImage: `url(${resolved})` }
  return {}
}

export function UtensilTile({ utensil, size = 30 }: { utensil: UtensilRef; size?: number }) {
  const isPhoto = !utensil.photo_uri.startsWith('tone:')
  const url = useMediaURL(isPhoto ? utensil.photo_uri : undefined)
  return (
    <div
      className="util-thumb"
      title={utensil.name_ta || utensil.name_en}
      style={{ width: size, height: size, ...utensilBackground(utensil.photo_uri, url) }}
    />
  )
}

export function TypeTag({ t }: { t: string }) {
  const sweet = t === 'sweet' || t === 'snack'
  const health = t === 'health'
  return <span className={'type-tag' + (sweet ? ' sweet' : '') + (health ? ' health' : '')}>{t}</span>
}
