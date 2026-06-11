# Amma's Codex - build notes (Milestone 1)

This milestone builds the thinnest useful capture slice, fully offline, local-only:
**create a dish → start a session with a pause/resume master timer → add/name stages as laps →
drop a log (record audio **or** capture an image) with optional ingredients (registry + freehand,
grams or to-taste) and utensils (registry photo tap) → view the session timeline with per-stage
summaries.** No server sync, no parallel sessions, no video yet.

The prototype in `prototype/amma-s-codex/` was treated as the **aesthetic target** (palette,
type, the timer-as-spine, the warmth) - not a functional spec. Where function required diverging,
it did; those calls are listed below (per the working agreement).

---

## How to run

```
npm install
npm run dev        # http://localhost:5180 (configured in .claude/launch.json)
npm run build      # tsc + vite build + PWA service worker / manifest
npm run preview    # serve the production build
```

Target device is **Android / Chrome** (per kickoff): full OPFS + installable PWA.

---

## Divergences from the prototype (match the feeling, serve the function)

1. **No fake device chrome.** Dropped the prototype's letterboxed "phone frame", fake `9:41`
   status bar, and the bottom demo screen-switcher ("review nav"). The real app is a responsive
   full-viewport shell (`.app-frame`) that fills a phone and sits as a centered phone-width column
   on desktop. Real navigation uses a small history stack with working Back.
2. **Self-hosted fonts** (`@fontsource-variable/*`) instead of the Google Fonts CDN - offline-first
   means the type must render with no network.
3. **Real capture, with a review step.** "Hold to record" is a real `MediaRecorder` (with a live
   amplitude waveform); "Photo" is a real in-app `getUserMedia` camera with a canvas snapshot, and
   a native `<input capture>` fallback if the camera/permission is unavailable. After capture there
   is a **keep / re-take / discard** review the mockup never drew, plus permission + error states.
4. **Capture persists on "Keep", then attachments edit the saved log.** The prototype implied
   attaching ingredients to an in-progress "this log" before it exists. To honor *never lose a
   captured log*, pressing **Keep** writes the media + log immediately (durably); ingredients and
   utensils then attach to that saved log. Consequence: the **Ingredient/Tool** buttons are disabled
   until a log exists in the current moment (with a hint), because an attachment needs a log to live on.
5. **Real pause/resume in place.** The header pill toggles Pause/Resume and freezes/continues the
   master timer without leaving the screen. When paused, the capture card becomes a calm panel with
   **Resume cooking** + **Review timeline** (the prototype's "Done for now" idea, made functional).
6. **Video deferred.** Milestone 1 is audio + image (per CLAUDE.md build order). The prototype's
   Voice/Video toggle is omitted so the UI doesn't imply an unbuilt feature; it can return when
   video lands.
7. **First stage auto-opens unnamed.** Starting a session creates an unnamed first stage at offset 0
   (shown as "Stage 1") so a log is never blocked on typing a name. Subsequent stages are named via
   the New-stage sheet (preset taps, no typing required).
8. **Empty / loading / error states added** (none were drawn): empty library invitation, empty
   session, paused panel, "media unavailable" fallback, and toasts for *Saved* / errors.
9. **Dish thumbnails** are a deterministic warm gradient derived from the dish id (the prototype
   hardcoded per-dish tones). A chosen cover photo can replace this later.
10. **Utensil tiles**: seeded utensils carry a `tone:` gradient token (they have no real photo yet);
    real photos are added via the "add tool" camera and stored like any other media.

## Data-model decisions

- **`Session.last_resumed_at` added** (persisted). The schema's timer math references "last_resumed_at
  = now" but doesn't list it as a field; it must persist so a reload *mid-cook* keeps counting from
  the right point. See `src/domain/types.ts` and `src/timer/timer.ts`.
- **`Vocab.order_index` added** for stable display order of dish types / stage suggestions.
- **Timing is offset-based** everywhere (`elapsed_ms`, `started/ended_elapsed_ms`); only `started_at`
  / `created_at` keep wall-clock, for ordering - exactly per the spec's timer model.
- **"to taste" is stored honestly**: `to_taste: true` with `amount_g` omitted (never a fabricated 0).
- **Sync-ready, not synced.** Every row carries a client `crypto.randomUUID()` plus
  `created_at` / `updated_at` / `sync_state: 'local_only'`, so milestone-2 server sync needs no
  migration. Nothing reads `sync_state` yet.
- **Stage summaries are derived on read** (`src/db/timeline.ts`), never stored - they can't drift.

## Storage & reliability

- **IndexedDB (Dexie)** for structured rows; **OPFS** for media blobs, with an automatic
  **IndexedDB-blob fallback** abstracted behind `src/media/store.ts` (`opfs:` / `idb:` handles).
- **Never-lose ordering**: on capture, bytes are written to durable storage *first*; only then are
  the log + media rows committed in one Dexie transaction; only then is "Saved" shown. A crash
  mid-write can orphan a blob (harmless), never a log the cook believes was saved. If the metadata
  commit fails, the just-written bytes are rolled back and the pending capture is kept on screen for
  retry.
- `navigator.storage.persist()` is requested on launch so the OS won't evict the kitchen's data.
  (In a headless browser without an engagement signal this is denied and OPFS may be evicted between
  launches; an installed Android PWA is granted persistence. Missing blobs degrade to a
  "media unavailable" state rather than failing.)
- Verified: data (dish/session/stage/log/media/ingredients/utensils) survives a full browser
  restart; an OPFS-written JPEG reads back byte-for-byte; the offset timer keeps correct elapsed
  across reloads.

## Dependencies added

`dexie`, `dexie-react-hooks` (live queries), `vite-plugin-pwa` (manifest + offline service worker),
`@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/hanken-grotesk`. Dexie, the
Android/Chrome storage target, and real capture were approved up front; `dexie-react-hooks` is a
small, justified extension of the Dexie dependency for reactive reads.

---

# Milestone 2 - server sync + parallel sessions

## The sync server (`server/`)
Mirrors the `chat-with-me` hosting reality (Flask + SQLAlchemy + SQLite WAL, env-driven config,
dotenv in `wsgi.py`, CLI bootstrap, Cloudflare tunnel → `*.abhijith-sriram.in` → localhost), with
two deliberate departures:
- **gevent instead of eventlet** (`gunicorn -k gevent -w 1`) - friendlier on Python 3.13/3.14.
- **A shared bearer token instead of accounts** - the app has no accounts by design, but the tunnel
  is public, so `SYNC_TOKEN` guards every endpoint (`Authorization: Bearer …`, or `?token=` for
  media `<img>`/`<audio>`).

The server is a **dumb, durable replica**: a generic `records` table keyed by `(entity, client-UUID)`
storing each row as JSON + `updated_at`, plus media bytes on disk. It doesn't model the cooking
domain. API: `POST /api/sync/push` (last-write-wins upsert), `GET /api/sync/pull?since=` (cursor
hydration), `POST|GET /api/media/<id>` (immutable bytes), `/api/health`, `/api/sync/stats`.
Conflict policy is LWW by `updated_at` (lexicographic compare of fixed-format UTC ISO = chronological).

## The client sync engine (`src/sync/`)
- **Dirty tracking**: every create/update marks the row `sync_state: 'local_only'`; deletes leave a
  **tombstone** (`db.tombstones`) so removals reach the replica instead of being resurrected.
- **One pass = push dirty rows + tombstones → upload media bytes → pull + merge.** It is never on the
  critical path: it runs on a 20s timer, on `online`, and on settings change, and any failure just
  leaves rows dirty for the next pass (**resumable**). Media is `local_only → (metadata pushed) →
  bytes uploaded → synced`, stamping `remote_url`.
- **Second-device hydration**: a freshly-wiped client pulls everything back, and media it doesn't
  hold locally is **downloaded on demand** from the server and cached to OPFS (verified:
  `bytesRecovered: true` after clearing local bytes). Missing bytes degrade to "media unavailable".
- **Settings** (server URL + token + on/off) live in `localStorage`, **never synced**. Sync is
  **off by default** - the cook opts in via the Settings sheet. A status pill in the library header
  shows synced / N-to-sync / syncing / offline / error and a live pending count.

Verified end-to-end against a local server: push (every entity + media bytes), LWW idempotency
(older writes skipped), pull-hydrate, media up/download, and **deletes propagating** (server marks
the row `deleted: true`; tombstones clear after a successful push).

## Parallel sessions
Multiple sessions can be `active` at once - starting one for another dish does **not** pause the
others; each timer runs independently off its own offsets (verified: two sessions counting
`00:01` and `13:12` side by side). A **"cooking now"** strip in the library lists every
active/paused session with its live timer; tapping foregrounds it. No scheduling, no dependency
graph - exactly the "independent sessions she switches between by hand" model.

## Finishing touches
- **Video capture** - the prototype's **Voice / Video toggle** is restored on the deck: the toggle
  decides what Hold-to-Record captures (voice note vs camera + mic video), Photo stays its own
  button. Video shows a **live framing preview** while she holds Record, then the same
  keep/re-take/discard review. Produces a `kind: 'video'` log; the OPFS/sync/timeline paths were
  already video-ready (verified: a 640×480, 2.7s clip saved durably and rendered with a play badge).
- **Rename the current stage** (tap the stage name → the same no-typing preset sheet, reused).
- **Delete a log** from the timeline (with confirm; removes media bytes + attachments + tombstones).
- **Add a note** (caption) to any log from the timeline - the optional post-cook text layer the
  schema allows (typing is fine when reviewing, not while cooking).
- **Error boundary** + defensive `types ?? []` so one malformed pulled row can never blank the app.

## Known gaps / next up (not built)

- **Correct a mistimed stage's offsets** (renaming is done; shifting `started/ended_elapsed_ms` is
  more involved and deferred).
- **Transcription** - explicitly out of scope.
- **PWA icons** are SVG (installable on Android/Chrome); PNG icons could be added for the broadest
  install compatibility.
- **Sync hardening for true multi-device** (rare cross-device edit/delete races): fine for the
  effectively single-author reality; revisit if both of you edit the same row offline simultaneously.
