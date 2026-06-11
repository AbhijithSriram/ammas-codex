import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { listDishes, listDishTypes } from '../db/repo'
import { useApp } from '../state/app'
import { dishGradient } from '../components/tone'
import { TypeTag } from '../components/chips'
import { IconButton } from '../components/ui'
import { SyncWidget } from '../components/SyncWidget'
import { CookingNow } from '../components/CookingNow'
import { Moon, Plus, Sun } from '../components/icons'
import type { Dish, Session } from '../domain/types'

function relativeWhen(iso?: string): string {
  if (!iso) return 'not cooked yet'
  const d = Date.parse(iso)
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days <= 0) return 'cooked today'
  if (days === 1) return 'cooked yesterday'
  if (days < 7) return `cooked ${days} days ago`
  if (days < 14) return 'cooked last week'
  if (days < 60) return `cooked ${Math.floor(days / 7)} weeks ago`
  return 'cooked a while ago'
}

function DishCard({ dish, sessions, onOpen }: { dish: Dish; sessions: Session[]; onOpen: () => void }) {
  const mine = sessions.filter((s) => s.dish_id === dish.id)
  const last = mine.map((s) => s.started_at).sort().at(-1)
  return (
    <button className="lib-card" onClick={onOpen} type="button">
      <div className="lib-thumb" style={{ backgroundImage: dishGradient(dish.id) }}>
        {mine.length > 0 && <span className="lib-sessions tnum">{mine.length}</span>}
      </div>
      <div className="lib-cbody">
        <div className="lib-roman disp">{dish.name_ta || dish.name_en}</div>
        {dish.name_ta && <div className="lib-en">{dish.name_en}</div>}
        <div className="lib-tags">
          {(dish.types ?? []).map((t) => (
            <TypeTag key={t} t={t} />
          ))}
        </div>
        <div className="lib-last">{relativeWhen(last)}</div>
      </div>
    </button>
  )
}

export function Library() {
  const { nav, theme, toggleTheme } = useApp()
  const [filter, setFilter] = useState('all')

  const dishes = useLiveQuery(() => listDishes(), [], undefined as Dish[] | undefined)
  const types = useLiveQuery(() => listDishTypes(), [], [] as string[])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [] as Session[])

  if (dishes === undefined) {
    return (
      <>
        <div className="appbar" />
        <div className="empty">
          <div className="empty-sub">Opening her codex…</div>
        </div>
      </>
    )
  }

  const filtered = filter === 'all' ? dishes : dishes.filter((d) => (d.types ?? []).includes(filter))
  const filterChips = ['all', ...types]

  return (
    <>
      <div className="lib-head">
        <div>
          <div className="lib-hi">Amma's Codex</div>
          <div className="lib-title disp">Her dishes</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SyncWidget />
          <IconButton onClick={toggleTheme} label="Toggle theme">
            {theme === 'light' ? <Moon /> : <Sun />}
          </IconButton>
        </div>
      </div>

      <CookingNow />

      {dishes.length === 0 ? (
        <div className="empty">
          <div className="empty-title disp">No dishes yet</div>
          <div className="empty-sub">
            Start by adding the first dish - both names, a few words, what kind it is. Then you can cook it and capture
            how she makes it.
          </div>
          <button className="btn-primary" style={{ maxWidth: 240, marginTop: 8 }} onClick={() => nav({ name: 'newdish' })}>
            <Plus s={20} />
            Add the first dish
          </button>
        </div>
      ) : (
        <>
          {filterChips.length > 1 && (
            <div className="lib-filters no-scrollbar">
              {filterChips.map((t) => (
                <button key={t} className={'lib-fchip' + (filter === t ? ' on' : '')} onClick={() => setFilter(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="lib-list no-scrollbar">
            {filtered.map((d) => (
              <DishCard key={d.id} dish={d} sessions={sessions} onOpen={() => nav({ name: 'dish', dishId: d.id })} />
            ))}
            {filtered.length === 0 && (
              <div className="empty-sub" style={{ textAlign: 'center', padding: '24px 0' }}>
                Nothing in “{filter}” yet.
              </div>
            )}
          </div>
          <button className="fab" onClick={() => nav({ name: 'newdish' })}>
            <Plus s={20} />
            New dish
          </button>
        </>
      )}
    </>
  )
}
