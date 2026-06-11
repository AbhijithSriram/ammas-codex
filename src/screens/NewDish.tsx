import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDishType, createDish, listDishTypes } from '../db/repo'
import { useApp } from '../state/app'
import { useToast } from '../state/toast'
import { BackButton } from '../components/ui'
import { Check, Plus } from '../components/icons'

/* The one screen where typing is fine - she's setting up, not cooking. Big, unhurried inputs. */
export function NewDish() {
  const { nav, back } = useApp()
  const toast = useToast()
  const [nameTa, setNameTa] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [desc, setDesc] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [addingType, setAddingType] = useState(false)
  const [newType, setNewType] = useState('')
  const [saving, setSaving] = useState(false)

  const vocabTypes = useLiveQuery(() => listDishTypes(), [], [] as string[])
  const ready = nameTa.trim().length > 0 || nameEn.trim().length > 0

  const toggle = (t: string) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))

  const commitNewType = async () => {
    const v = newType.trim().toLowerCase()
    if (v) {
      await addDishType(v)
      setTypes((x) => (x.includes(v) ? x : [...x, v]))
    }
    setNewType('')
    setAddingType(false)
  }

  const save = async () => {
    if (!ready || saving) return
    setSaving(true)
    try {
      const dish = await createDish({
        name_ta: nameTa.trim(),
        name_en: nameEn.trim(),
        description: desc.trim(),
        types,
      })
      toast.ok('Dish saved')
      nav({ name: 'dish', dishId: dish.id })
    } catch {
      toast.err("Couldn't save the dish")
      setSaving(false)
    }
  }

  return (
    <>
      <div className="appbar">
        <BackButton onClick={back} />
        <div className="disp" style={{ fontSize: 22, fontWeight: 600 }}>
          New dish
        </div>
      </div>

      <div className="nd-body no-scrollbar">
        <div className="nd-field">
          <div className="nd-label">
            Tamil name <span className="hint">in English letters</span>
          </div>
          <input className="nd-input" value={nameTa} onChange={(e) => setNameTa(e.target.value)} placeholder="Vatha Kuzhambu" />
        </div>
        <div className="nd-field">
          <div className="nd-label">English name</div>
          <input className="nd-input en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Tamarind & lentil gravy" />
        </div>
        <div className="nd-field">
          <div className="nd-label">
            A few words <span className="hint">optional</span>
          </div>
          <textarea
            className="nd-area"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="The everyday kuzhambu. Tangy, dark, keeps for days."
          />
        </div>
        <div className="nd-field">
          <div className="nd-label">What kind</div>
          <div className="nd-types">
            {vocabTypes.map((t) => {
              const on = types.includes(t)
              return (
                <button key={t} className={'nd-type' + (on ? ' on' : '')} onClick={() => toggle(t)}>
                  {on && (
                    <span className="tick">
                      <Check s={13} />
                    </span>
                  )}
                  {t}
                </button>
              )
            })}
            {addingType ? (
              <input
                className="nd-type"
                style={{ minWidth: 120 }}
                autoFocus
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onBlur={commitNewType}
                onKeyDown={(e) => e.key === 'Enter' && commitNewType()}
                placeholder="new kind"
              />
            ) : (
              <button className="nd-type" onClick={() => setAddingType(true)}>
                <Plus s={15} />
                kind
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="foot-bar">
        <button className="btn-primary" disabled={!ready || saving} onClick={save}>
          <Check s={20} />
          Save dish
        </button>
      </div>
    </>
  )
}
