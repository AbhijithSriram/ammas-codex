import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listStageNameSuggestions } from '../db/repo'
import { Check, Flag, Plus } from './icons'

/* Names a stage with no typing (preset taps) or, optionally, by hand. Used both to start a new
 * lap and to rename the current one - the caller decides what `onPick` does. */
export function StageNameSheet({
  title,
  sub,
  onPick,
  onClose,
}: {
  title: string
  sub: string
  onPick: (value: string) => Promise<void> | void
  onClose: () => void
}) {
  const suggestions = useLiveQuery(() => listStageNameSuggestions(), [], [] as { value: string; label_ta?: string }[])
  const [freehand, setFreehand] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (value: string) => {
    if (busy) return
    setBusy(true)
    try {
      await onPick(value)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="ns-head">
          <div className="ns-title disp">{title}</div>
          <div className="ns-sub">{sub}</div>
        </div>
        <div className="ns-presets">
          {suggestions.map((p) => (
            <button key={p.value} className="ns-preset" onClick={() => pick(p.value)}>
              <span className="ns-flag">
                <Flag s={17} />
              </span>
              <span>
                <span className="ns-pr disp">{p.label_ta || p.value}</span>
                {p.label_ta && <span className="ns-pe">{p.value}</span>}
              </span>
            </button>
          ))}

          {freehand ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="nd-input"
                style={{ height: 56, fontSize: 18 }}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && pick(name)}
                placeholder="Stage name"
              />
              <button className="btn-primary" style={{ width: 64, height: 56, flex: '0 0 auto' }} onClick={() => pick(name)} aria-label="Confirm">
                <Check s={22} />
              </button>
            </div>
          ) : (
            <button className="ns-freehand" onClick={() => setFreehand(true)}>
              <Plus s={18} />
              Name it myself
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
