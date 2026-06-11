# Amma's Codex - Data Schema & Architecture Spec

*A structured cooking journal for capturing and preserving intuitive home cooking.*

---

## 1. Design Principles

These constrain every decision below. When in doubt, defer to them.

1. **Capture, not orchestration.** The app records what Amma actually did. It does not plan, infer dependencies, or auto-pivot. The "execution engine" is out of scope for v1.
2. **Offline-first, local source of truth.** All data and media are written to local storage immediately. The server is a replica that gets synced *when* the connection is good - never a blocker for cooking.
3. **Logging must be faster than the cooking.** Every tap matters. Registries (utensils, ingredients) are pre-built once and reused forever so mid-cook logging is a few taps, not typing.
4. **Honest data over fake precision.** Measurements are encouraged in grams on one universal scale, but "to taste" is a first-class value. Never force a fabricated number.
5. **Don't overcomplicate multitasking.** Parallel dishes are just independent sessions she switches between by hand. No dependency graphs.

---

## 2. Entity Overview

```
Dish ──< Session ──< Stage ──< Log >── LogIngredient >── IngredientRef
                                  └──< LogUtensil    >── UtensilRef
                                  └──< Media
```

- A **Dish** is the timeless identity of a recipe (name, type, description).
- A **Session** is one instance of cooking that dish, with a master timer.
- A **Stage** is a named lap within a session (Prep, Main Cooking, …).
- A **Log** is a single timestamped moment Amma chose to record, inside a stage.
- A log carries **Media** (audio/image/video), **ingredients used**, and **utensils used**.
- **IngredientRef** / **UtensilRef** are reusable registry items, shared across all dishes.

---

## 3. Entities

### 3.1 Dish

The recipe's identity. Created once; cooked many times.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name_ta` | string | Tamil name |
| `name_en` | string | English name |
| `description` | string | Free text |
| `types` | string[] | One or more: `main`, `side`, `sweet`, `savory`, `snack`, `health`, … (extensible list, see §6) |
| `cover_media_id` | UUID? | Optional hero image, usually picked from a session's media |
| `created_at` | ISO 8601 | |
| `updated_at` | ISO 8601 | |

`types` is an array because a dish can be both `sweet` and `snack`. Keep the vocabulary editable rather than a fixed enum.

### 3.2 Session

One cooking instance. Owns the master timer.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `dish_id` | UUID | FK → Dish |
| `started_at` | ISO 8601 | Wall-clock start. The master timer = `now − started_at` while running |
| `ended_at` | ISO 8601? | Null while active |
| `status` | enum | `active`, `paused`, `completed` |
| `total_elapsed_ms` | int | Accumulated run time, excluding paused spans (see §4) |
| `notes` | string? | Optional post-cook reflection |

A session can be `active` even when not in the foreground - this is how parallel dishes work. Multiple sessions may be `active` at once; the UI just foregrounds one at a time.

### 3.3 Stage

A named lap on the master timer.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `session_id` | UUID | FK → Session |
| `name` | string | Amma names it: "Prep", "Main Cooking", "Final Touches", anything |
| `order_index` | int | Display/sequence order within the session |
| `started_elapsed_ms` | int | Offset from session start when this stage began |
| `ended_elapsed_ms` | int? | Null while this is the current stage |

Stage timing is stored as **offsets from session start**, not wall-clock. This makes the timeline portable and immune to clock changes. A stage's duration = `ended − started` (or `current_elapsed − started` if active).

### 3.4 Log

A single recorded moment. The heart of the app.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `stage_id` | UUID | FK → Stage |
| `elapsed_ms` | int | Offset from session start when logged - this is the timestamp |
| `kind` | enum | `audio`, `image`, `image_audio`, `video` |
| `caption` | string? | Optional short text label |
| `created_at` | ISO 8601 | Wall-clock, for sync ordering |

Every log belongs to exactly one stage, and its `elapsed_ms` places it precisely on the master timeline. The `kind` determines which media records attach (see §3.5). Ingredients and utensils attach per-log (§3.6).

### 3.5 Media

Binary blobs (audio/image/video) attached to a log. Stored locally first, synced when possible.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `log_id` | UUID | FK → Log |
| `media_type` | enum | `audio`, `image`, `video` |
| `local_uri` | string | Path/handle in local store (IndexedDB blob, OPFS, or filesystem) |
| `remote_url` | string? | Populated after successful sync to server |
| `duration_ms` | int? | For audio/video |
| `width`, `height` | int? | For image/video |
| `byte_size` | int | |
| `sync_state` | enum | `local_only`, `uploading`, `synced` |

A single log can hold more than one media row (e.g. `image_audio` = one image + one audio). Transcription is explicitly **not** done here - raw voice is preserved as-is (Tamil-English code-switching). A text transcript field can be added later as an *optional* human-entered layer, never auto-generated.

### 3.6 Ingredient & Utensil usage (per log)

Each log records what was used at that moment. These join to reusable registry refs but also allow freehand.

**LogIngredient**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `log_id` | UUID | FK → Log |
| `ingredient_ref_id` | UUID? | FK → IngredientRef, if chosen from registry |
| `freehand_name` | string? | Used instead when not in registry |
| `amount_g` | number? | Grams on the universal scale. Null if `to_taste` |
| `to_taste` | bool | If true, `amount_g` is ignored - honest "pinch/handful" value |
| `state` | enum | `solid` or `liquid` - both weighed in grams, container differs only physically |

Exactly one of `ingredient_ref_id` / `freehand_name` is set. Freehand entries can be "promoted" into the registry later with one tap.

**LogUtensil**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `log_id` | UUID | FK → Log |
| `utensil_ref_id` | UUID | FK → UtensilRef |

Utensils are registry-only (you tap a photo). If something's missing, you add it to the registry first, then tap it - keeps the visual-tap flow intact.

### 3.7 Registries (reusable, shared across all dishes)

**IngredientRef**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name_ta` | string? | |
| `name_en` | string | |
| `default_state` | enum | `solid` / `liquid` |
| `photo_media_id` | UUID? | Optional |

**UtensilRef**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name_ta` | string? | |
| `name_en` | string | |
| `photo_uri` | string | The pre-loaded photo she taps - this is the whole point |

---

## 4. The Timer Model

One master timer per session, with stages as laps. Keep the math simple and offset-based.

- Session stores `started_at` (wall clock) and `total_elapsed_ms` (accumulated, pause-aware).
- While `active`: `current_elapsed = total_elapsed_ms + (now − last_resumed_at)`.
- On **pause**: freeze `total_elapsed_ms`, stop counting.
- On **resume**: set `last_resumed_at = now`, continue.
- **Stages** are laps: starting a new stage sets the previous stage's `ended_elapsed_ms = current_elapsed` and the new stage's `started_elapsed_ms = current_elapsed`.
- **Logs** stamp `elapsed_ms = current_elapsed` at the moment of capture.

Everything downstream (stage summaries, the timeline view) is derived from these offsets. No stage or log ever stores wall-clock time for positioning - only `created_at` for sync ordering.

---

## 5. Stage Summary (derived, not stored)

A stage summary is computed on the fly by rolling up its logs - never duplicated as stored state, so it can't drift.

For a given stage:
- **Duration** = `ended_elapsed_ms − started_elapsed_ms`
- **Ingredients used** = aggregate of all `LogIngredient` across the stage's logs, summing `amount_g` per ingredient and listing `to_taste` ones separately
- **Utensils used** = distinct set of `UtensilRef` across the stage's logs
- **Media count** = logs grouped by `kind`

---

## 6. Vocabularies (editable, not hard enums)

Stored as small editable lists so Amma/you can extend them without a code change:

- **Dish types:** main, side, sweet, savory, snack, health, … (add freely)
- **Common stage names** (suggestions only, fully free-text): Prep, Main Cooking, Final Touches, Resting, Plating

---

## 7. Sync & Storage Architecture

**Local (source of truth):**
- Structured data → IndexedDB (or SQLite via WASM if you want SQL queries).
- Media blobs → OPFS (Origin Private File System) or IndexedDB blobs. OPFS scales better for video.

**Server (replica) - `ammas-codex.abhijith-sriram.in`:**
- Ubuntu box behind a Cloudflare tunnel.
- Receives pushes when reachable. Never on the critical path of cooking.

**Sync strategy (offline-first):**
- Every write gets a `created_at` / `updated_at` and a stable client-generated UUID, so records can be created offline and merged without ID collisions.
- A background sync queue pushes new/changed rows and uploads media (`sync_state: local_only → uploading → synced`, stamping `remote_url`).
- **Conflict policy:** last-write-wins by `updated_at` is fine for v1 - it's effectively single-author (you and Amma rarely edit the same row simultaneously). Media is immutable once captured, so blobs never conflict, only metadata.
- Sync is resumable: interrupted uploads retry from the queue; a dropped tunnel just pauses the queue.

---

## 8. Parallel Dishes (kept deliberately simple)

- Multiple `Session` rows can be `active` simultaneously.
- The UI shows a switcher; foregrounding a session just changes which timer/stage view is on screen.
- Each session's timer runs independently off its own `started_at` + pause math.
- **No** cross-session dependencies, scheduling, or auto-switching. If she's marinating chicken while prepping rice, those are two active sessions she taps between. That's the entire feature.

---

## 9. Explicitly Out of Scope for v1

Parked so the build stays focused:

- Automatic speech-to-text / transcription (raw audio is preserved instead).
- Dependency graphs, parallel planners, auto-pivoting playback ("Son's UI execution engine").
- Deterministic countdown replay from recorded timings (sensory cues don't transfer across stoves/pans - revisit as guided cues, not timers).
- Multi-user concurrent editing / real-time collaboration.

---

## 10. Suggested First Milestone

The thinnest slice that's actually useful to you and Amma:

1. Create a Dish (names, type, description).
2. Start a Session → master timer runs.
3. Add/name Stages as laps.
4. Drop a Log in the current stage: record audio **or** snap an image, optionally attach ingredients (registry + freehand, grams or to-taste) and utensils (registry tap).
5. View the session timeline + per-stage summaries.
6. Local persistence only.

Sync to the server and parallel sessions come immediately after, once capture feels fast and reliable in a real kitchen.
