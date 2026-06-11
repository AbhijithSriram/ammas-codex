import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  attachIngredient,
  attachUtensil,
  createIngredientRef,
  createUtensilRef,
  detachUtensil,
  listIngredientRefs,
  listLogIngredients,
  listLogUtensils,
  listUtensilRefs,
  removeLogIngredient,
} from '../db/repo'
import { putMedia } from '../media/store'
import { useMediaURL } from '../media/useMediaURL'
import { uuid } from '../domain/ids'
import { ingChipView } from '../domain/format'
import { useToast } from '../state/toast'
import { IngChip } from './chips'
import { CameraCapture, type CapturedImage } from './CameraCapture'
import { Check, Chevron, Minus, Plus, Pot, Scale, Search } from './icons'
import type { IngredientRef, IngredientState } from '../domain/types'

interface Picked {
  ref?: IngredientRef
  freehand_name?: string
  name_ta?: string
  name_en: string
  state: IngredientState
}

function GramStepper({
  value,
  onChange,
  taste,
  onTaste,
  state,
  onState,
}: {
  value: number
  onChange: (n: number) => void
  taste: boolean
  onTaste: () => void
  state: IngredientState
  onState: (s: IngredientState) => void
}) {
  return (
    <div className="ld-amount">
      <div className="ld-readout">
        <button className="ld-step minus" disabled={taste} onClick={() => onChange(Math.max(0, value - 5))} aria-label="Minus 5 grams">
          <Minus s={26} />
        </button>
        <div className={'ld-grams' + (taste ? ' off' : '')}>
          <span className="ld-g-num tnum">{taste ? '-' : value}</span>
          <span className="ld-g-unit">{taste ? 'to taste' : 'grams'}</span>
        </div>
        <button className="ld-step plus" disabled={taste} onClick={() => onChange(value + 5)} aria-label="Plus 5 grams">
          <Plus s={26} />
        </button>
      </div>
      <div className="ld-quick">
        {[5, 25, 50, 100].map((n) => (
          <button key={n} className="ld-q" disabled={taste} onClick={() => onChange(value + n)}>
            +{n}
          </button>
        ))}
        <button className={'ld-taste' + (taste ? ' on' : '')} onClick={onTaste}>
          to taste
        </button>
      </div>
      <div className="ld-state">
        <button className={'ld-state-btn' + (state === 'solid' ? ' on' : '')} onClick={() => onState('solid')}>
          solid
        </button>
        <button className={'ld-state-btn' + (state === 'liquid' ? ' on' : '')} onClick={() => onState('liquid')}>
          liquid
        </button>
      </div>
    </div>
  )
}

export function LogDetail({
  logId,
  subtitle,
  initialTab = 'ing',
  onClose,
}: {
  logId: string
  subtitle: string
  initialTab?: 'ing' | 'util'
  onClose: () => void
}) {
  const toast = useToast()
  const [tab, setTab] = useState<'ing' | 'util'>(initialTab)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [grams, setGrams] = useState(50)
  const [taste, setTaste] = useState(false)
  const [remember, setRemember] = useState(false)
  const [freehandName, setFreehandName] = useState('')
  const [addingFreehand, setAddingFreehand] = useState(false)
  const [addingUtensil, setAddingUtensil] = useState(false)

  const ingredientRefs = useLiveQuery(() => listIngredientRefs(), [], [] as IngredientRef[])
  const utensilRefs = useLiveQuery(() => listUtensilRefs(), [], [])
  const added = useLiveQuery(() => listLogIngredients(logId), [logId], [])
  const logUtensils = useLiveQuery(() => listLogUtensils(logId), [logId], [])

  const refMap = useMemo(() => new Map(ingredientRefs.map((r) => [r.id, r])), [ingredientRefs])
  const attachedUtensilIds = useMemo(() => new Set(logUtensils.map((lu) => lu.utensil_ref_id)), [logUtensils])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ingredientRefs
    return ingredientRefs.filter((r) => r.name_en.toLowerCase().includes(q) || (r.name_ta || '').toLowerCase().includes(q))
  }, [ingredientRefs, search])

  const pickRef = (ref: IngredientRef) => {
    setPicked({ ref, name_ta: ref.name_ta, name_en: ref.name_en, state: ref.default_state })
    setGrams(50)
    setTaste(false)
    setRemember(false)
  }
  const pickFreehand = () => {
    const name = freehandName.trim()
    if (!name) return
    setPicked({ freehand_name: name, name_en: name, state: 'solid' })
    setGrams(50)
    setTaste(false)
    setRemember(false)
    setAddingFreehand(false)
    setFreehandName('')
  }

  const confirm = async () => {
    if (!picked) return
    try {
      let refId = picked.ref?.id
      if (!refId && remember && picked.freehand_name) {
        const ref = await createIngredientRef({ name_en: picked.freehand_name, default_state: picked.state })
        refId = ref.id
      }
      await attachIngredient({
        log_id: logId,
        ingredient_ref_id: refId,
        freehand_name: refId ? undefined : picked.freehand_name,
        amount_g: taste ? undefined : grams,
        to_taste: taste,
        state: picked.state,
      })
      toast.ok(`Added ${picked.name_ta || picked.name_en}`)
      setPicked(null)
    } catch {
      toast.err("Couldn't add it")
    }
  }

  const toggleUtensil = async (refId: string) => {
    try {
      if (attachedUtensilIds.has(refId)) await detachUtensil(logId, refId)
      else await attachUtensil(logId, refId)
    } catch {
      toast.err("Couldn't update tools")
    }
  }

  const onUtensilPhoto = async (img: CapturedImage) => {
    setAddingUtensil(false)
    try {
      const id = uuid()
      const stored = await putMedia(id, img.blob, 'jpg')
      const ref = await createUtensilRef({ name_en: 'New tool', photo_uri: stored.local_uri })
      await attachUtensil(logId, ref.id)
      toast.ok('Tool added')
    } catch {
      toast.err("Couldn't add the tool")
    }
  }

  if (addingUtensil) {
    return <CameraCapture onCapture={onUtensilPhoto} onClose={() => setAddingUtensil(false)} />
  }

  return (
    <div className="app-frame" style={{ position: 'absolute', inset: 0, maxWidth: 'none', height: '100%', zIndex: 64 }}>
      <div className="appbar">
        <button className="icon-btn" onClick={() => (picked ? setPicked(null) : onClose())} aria-label="Back">
          <Chevron />
        </button>
        <div>
          <div className="ld-htitle">{picked ? 'How much?' : 'Add to this log'}</div>
          <div className="ld-hsub">{picked ? `${picked.name_ta || picked.name_en}${picked.name_en && picked.name_ta ? ' · ' + picked.name_en : ''}` : subtitle}</div>
        </div>
      </div>

      {!picked && (
        <div className="ld-tabs">
          <button className={'ld-tab' + (tab === 'ing' ? ' on' : '')} onClick={() => setTab('ing')}>
            <Scale s={19} />
            Ingredients {added.length > 0 && <span className="ic-count">{added.length}</span>}
          </button>
          <button className={'ld-tab' + (tab === 'util' ? ' on' : '')} onClick={() => setTab('util')}>
            <Pot s={19} />
            Tools {logUtensils.length > 0 && <span className="ic-count">{logUtensils.length}</span>}
          </button>
        </div>
      )}

      <div className="ld-body no-scrollbar">
        {picked ? (
          <>
            <div className="ld-picked-name">
              <div className="pn-r disp">{picked.name_ta || picked.name_en}</div>
              {picked.name_ta && <div className="pn-e">{picked.name_en}</div>}
            </div>
            <GramStepper
              value={grams}
              onChange={setGrams}
              taste={taste}
              onTaste={() => setTaste((t) => !t)}
              state={picked.state}
              onState={(s) => setPicked((p) => (p ? { ...p, state: s } : p))}
            />
            {picked.freehand_name && (
              <button
                className={'ld-state-btn' + (remember ? ' on' : '')}
                style={{ display: 'flex', margin: '16px auto 0', gap: 7, alignItems: 'center' }}
                onClick={() => setRemember((r) => !r)}
              >
                {remember && <Check s={14} />}
                remember in her pantry
              </button>
            )}
          </>
        ) : tab === 'ing' ? (
          <>
            {added.length > 0 && (
              <div className="ld-added">
                {added.map((li) => (
                  <button
                    key={li.id}
                    onClick={() => {
                      removeLogIngredient(li.id)
                    }}
                    aria-label="Remove"
                    title="Tap to remove"
                  >
                    <IngChip ing={ingChipView(li, li.ingredient_ref_id ? refMap.get(li.ingredient_ref_id) : undefined)} big />
                  </button>
                ))}
              </div>
            )}
            <div className="ld-srch">
              <Search />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search her pantry…" />
            </div>
            {addingFreehand ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  className="nd-input"
                  style={{ height: 54, fontSize: 18 }}
                  autoFocus
                  value={freehandName}
                  onChange={(e) => setFreehandName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && pickFreehand()}
                  placeholder="Something new"
                />
                <button className="btn-primary" style={{ width: 64, height: 54, flex: '0 0 auto' }} onClick={pickFreehand} aria-label="Next">
                  <Chevron dir="right" s={22} />
                </button>
              </div>
            ) : null}
            <div className="ld-grid">
              {filtered.map((ref) => (
                <button key={ref.id} className="ld-reg" onClick={() => pickRef(ref)}>
                  <div className="rr">{ref.name_ta || ref.name_en}</div>
                  {ref.name_ta && <div className="re">{ref.name_en}</div>}
                </button>
              ))}
              {!addingFreehand && (
                <button className="ld-freehand" onClick={() => setAddingFreehand(true)}>
                  <Plus s={18} />
                  Add something new
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="ld-ugrid">
            {utensilRefs.map((u) => {
              const on = attachedUtensilIds.has(u.id)
              const bg = u.photo_uri.startsWith('tone:')
                ? `linear-gradient(140deg, ${u.photo_uri.slice(5).split(',').join(', ')})`
                : undefined
              return (
                <button key={u.id} className={'ld-util' + (on ? ' on' : '')} onClick={() => toggleUtensil(u.id)}>
                  <UtensilImg photoUri={u.photo_uri} bg={bg} />
                  {on && (
                    <div className="ucheck">
                      <Check s={16} />
                    </div>
                  )}
                  <div className="ulabel">
                    <div className="ul-r">{u.name_ta || u.name_en}</div>
                    {u.name_ta && <div className="ul-e">{u.name_en}</div>}
                  </div>
                </button>
              )
            })}
            <button className="ld-util-add" onClick={() => setAddingUtensil(true)}>
              <Plus s={20} />
              add tool
            </button>
          </div>
        )}
      </div>

      <div className="foot-bar" style={{ position: 'static', background: 'none' }}>
        {picked ? (
          <button className="btn-primary" onClick={confirm}>
            <Check s={20} />
            Add {picked.name_ta || picked.name_en}
          </button>
        ) : (
          <button className="btn-primary" onClick={onClose}>
            <Check s={20} />
            Done
          </button>
        )}
      </div>
    </div>
  )
}

/** Utensil image inside the picker grid: a tone gradient or a stored photo. */
function UtensilImg({ photoUri, bg }: { photoUri: string; bg?: string }) {
  const isPhoto = !photoUri.startsWith('tone:')
  const url = useMediaURL(isPhoto ? photoUri : undefined)
  return <div className="uimg" style={bg ? { backgroundImage: bg } : url ? { backgroundImage: `url(${url})` } : {}} />
}
