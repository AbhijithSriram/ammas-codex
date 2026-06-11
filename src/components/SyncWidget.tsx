import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { countPending, requestSync } from '../sync/engine'
import { getSettings, setSettings } from '../sync/settings'
import { useSyncStatus } from '../sync/status'
import { Check, Cloud } from './icons'

function statusLabel(phase: string, pending: number): { text: string; cls: string } {
  if (phase === 'disabled') return { text: 'Sync off', cls: '' }
  if (phase === 'offline') return { text: 'Offline', cls: '' }
  if (phase === 'syncing') return { text: 'Syncing…', cls: 'busy' }
  if (phase === 'error') return { text: 'Sync error', cls: 'err' }
  // idle
  return pending > 0 ? { text: `${pending} to sync`, cls: '' } : { text: 'Synced', cls: 'ok' }
}

/** Status pill + the settings sheet. Lives in the library header. */
export function SyncWidget() {
  const status = useSyncStatus()
  const pending = useLiveQuery(() => countPending(), [], 0)
  const [open, setOpen] = useState(false)
  const { text, cls } = statusLabel(status.phase, pending)

  return (
    <>
      <button className={'sync-pill ' + cls} onClick={() => setOpen(true)} aria-label="Sync settings">
        <span className="ico">
          <Cloud s={16} />
        </span>
        {text}
        {status.phase === 'idle' && pending > 0 && <span className="badge tnum">{pending}</span>}
      </button>
      {open && <SyncSheet onClose={() => setOpen(false)} pending={pending} />}
    </>
  )
}

function SyncSheet({ onClose, pending }: { onClose: () => void; pending: number }) {
  const status = useSyncStatus()
  const initial = getSettings()
  const [serverUrl, setServerUrl] = useState(initial.serverUrl)
  const [token, setToken] = useState(initial.token)
  const [enabled, setEnabled] = useState(initial.enabled)

  const save = (next: { serverUrl?: string; token?: string; enabled?: boolean }) => {
    const merged = { serverUrl, token, enabled, ...next }
    setServerUrl(merged.serverUrl)
    setToken(merged.token)
    setEnabled(merged.enabled)
    setSettings(merged)
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="ns-head">
          <div className="ns-title disp">Sync &amp; backup</div>
          <div className="ns-sub">push the record to your home server when it's reachable</div>
        </div>

        <div className="ss-row">
          <div className="ss-status">
            <Cloud s={18} />
            {status.phase === 'disabled'
              ? 'Off'
              : status.phase === 'syncing'
                ? 'Syncing…'
                : status.phase === 'offline'
                  ? 'Offline'
                  : status.phase === 'error'
                    ? status.error || 'Error'
                    : pending > 0
                      ? `${pending} waiting`
                      : 'All synced'}
          </div>
          <button
            className={'ss-toggle' + (enabled ? ' on' : '')}
            onClick={() => save({ enabled: !enabled })}
            aria-label="Enable sync"
            role="switch"
            aria-checked={enabled}
          />
        </div>

        <div className="nd-field">
          <div className="nd-label">Server</div>
          <input
            className="nd-input en"
            style={{ fontSize: 16 }}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            onBlur={() => save({})}
            placeholder="https://ammas-codex.abhijith-sriram.in"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div className="nd-field">
          <div className="nd-label">Sync token</div>
          <input
            className="nd-input en"
            style={{ fontSize: 16 }}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => save({})}
            placeholder="shared secret from the server's .env"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>

        {status.phase === 'error' && status.error && (
          <div className="empty-sub" style={{ textAlign: 'left', color: 'var(--clay-deep)', margin: '0 0 12px' }}>
            {status.error}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={() => {
            save({})
            requestSync()
          }}
        >
          <Check s={20} />
          Sync now
        </button>
        <div className="empty-sub" style={{ textAlign: 'center', marginTop: 12 }}>
          {status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}` : 'Cooking never waits on sync - it runs in the background.'}
        </div>
      </div>
    </div>
  )
}
