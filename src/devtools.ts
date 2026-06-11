/* Dev-only inspection hook. Exposes the repo + db on window so the capture/persistence path can
 * be exercised and verified in a browser without real mic/camera hardware. Guarded by import.meta.env.DEV
 * so it is never present in a production build. */
import * as repo from './db/repo'
import { db } from './db/db'
import * as timeline from './db/timeline'
import * as mediaStore from './media/store'
import * as syncEngine from './sync/engine'
import * as syncSettings from './sync/settings'

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).codex = {
    repo,
    db,
    timeline,
    mediaStore,
    sync: syncEngine,
    syncSettings,
  }
}
