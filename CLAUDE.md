# Amma's Codex

A personal app for capturing how my mother cooks - in her own intuitive, by-feel way - so her recipes are preserved and, later, reviewable. This is a **capture journal**, not a recipe reader and not a meal planner.

There are exactly two users: my mother (the cook, primary) and me (her son, the reviewer). Everything is optimized for *her* speed and comfort while cooking. We are not building for strangers - no accounts, onboarding, social features, or sharing.

---

## How to treat the design file

A visual prototype was made in Claude Design (URL provided in the kickoff prompt). **Treat it as a visual target and a source of aesthetic truth - palette, typography, the timer-as-spine concept, the overall warmth and layout feel - NOT as a functional spec.**

The prototype is a static mockup. It does not account for real state, persistence, error/empty/loading conditions, or the many controls a working app needs that were never drawn (editing a log, deleting, correcting a mistimed stage, retrying a failed media upload, switching between parallel sessions, etc.).

**You have explicit license to diverge from the prototype's exact layout wherever function requires it.** When you add or move controls the mockup didn't have, keep them consistent with the prototype's established visual language. The rule of thumb: *match the feeling, serve the function.* If a beautiful prototype choice actively fights usability for a cook with wet hands, function wins - note the change and why.

---

## Non-negotiable product constraints

These define the app. They override convenience.

1. **Messy hands, glancing attention.** Large tap targets, high contrast, readable from arm's length on a propped-up phone. No typing required during active cooking. No tiny icons or dense menus in the cooking flow.
2. **One-handed, thumb-zone reachability.** Primary cooking actions live in the lower half of the screen.
3. **Offline-first, local is the source of truth.** All data and media write to local storage immediately. The server is a replica synced opportunistically. Cooking must never block on the network.
4. **Honest data over fake precision.** Ingredient amounts are in grams (solids and liquids both), but "to taste" is a first-class value - never force a fabricated number.
5. **Romanized Tamil, not Tamil script.** Dish and ingredient names are Tamil written in the Latin alphabet (e.g. "Vatha Kuzhambu"). No Tamil-script font is needed; the type just needs to render Latin text warmly.
6. **Don't overcomplicate multitasking.** Parallel dishes = independent sessions she switches between by hand. No dependency graphs, no auto-scheduling, no "smart planner."

---

## Data model

The schema is the contract. Build the app around it exactly. A separate detailed schema doc may also be in the repo; this is the working summary.

```
Dish ──< Session ──< Stage ──< Log >── LogIngredient >── IngredientRef
                                  └──< LogUtensil    >── UtensilRef
                                  └──< Media
```

- **Dish** - the timeless identity of a recipe. Fields: `name_ta` (romanized Tamil), `name_en`, `description`, `types[]` (main / side / sweet / savory / snack / health / … - editable vocabulary, a dish can have several), optional `cover_media_id`.
- **Session** - one instance of cooking a dish. Owns the master timer. Fields: `dish_id`, `started_at`, `ended_at?`, `status` (active / paused / completed), `total_elapsed_ms` (pause-aware accumulated runtime), `notes?`. Multiple sessions may be `active` at once (parallel dishes).
- **Stage** - a named lap on the master timer (e.g. "Prep", "Main Cooking", "Final Touches"; free text, she names it). Fields: `session_id`, `name`, `order_index`, `started_elapsed_ms`, `ended_elapsed_ms?`.
- **Log** - a single timestamped moment she chose to record, inside a stage. The heart of the app. Fields: `stage_id`, `elapsed_ms` (offset from session start = its position on the timeline), `kind` (audio / image / image_audio / video), `caption?`.
- **Media** - binary blob attached to a log. Fields: `log_id`, `media_type` (audio/image/video), `local_uri`, `remote_url?`, `duration_ms?`, `width?`, `height?`, `byte_size`, `sync_state` (local_only / uploading / synced). A log can hold more than one media row (image_audio = image + audio). **No auto-transcription** - raw audio is preserved as-is.
- **LogIngredient** - what was used at that log. Fields: `log_id`, `ingredient_ref_id?` OR `freehand_name?` (exactly one), `amount_g?`, `to_taste` (bool - if true, amount is ignored), `state` (solid/liquid; both weighed in grams, only the physical container differs).
- **LogUtensil** - fields: `log_id`, `utensil_ref_id`. Utensils are registry-only (tap a photo).
- **IngredientRef** / **UtensilRef** - reusable registries shared across ALL dishes, built up once and tapped forever. Ingredient supports registry + freehand; freehand entries can be promoted into the registry later. Utensils carry a `photo_uri` - tapping the photo is the whole interaction.

### Timer model (get this right - it's the spine)
- Store timing as **offsets from session start (`elapsed_ms`)**, never wall-clock, for stages and logs. Only keep wall-clock `created_at` for sync ordering. This keeps the timeline portable and immune to clock changes.
- While active: `current_elapsed = total_elapsed_ms + (now − last_resumed_at)`.
- Pause freezes `total_elapsed_ms`; resume sets `last_resumed_at = now`.
- Starting a new stage closes the previous one (`ended_elapsed_ms = current_elapsed`) and opens the new one at the same offset.
- A log stamps `elapsed_ms = current_elapsed` at capture.

### Stage summary (derived, never stored)
Computed on the fly by rolling up a stage's logs - duration, ingredients used (sum `amount_g`, list `to_taste` separately), distinct utensils, media counts. Never persist it; it can't be allowed to drift.

---

## Architecture & stack

- **Self-hosted mobile-first PWA.** Vite + React + Tailwind. Must be installable and work offline (service worker, offline shell).
- **Local storage (source of truth):** IndexedDB for structured data; OPFS (Origin Private File System) for media blobs - OPFS scales better for video than IndexedDB blobs. Use stable client-generated UUIDs so records created offline merge without ID collisions.
- **Server (replica):** an Ubuntu box reached via Cloudflare tunnel at `ammas-codex.abhijith-sriram.in`. Receives pushes when reachable; never on the critical path.
- **Sync:** background queue pushes new/changed rows and uploads media (`local_only → uploading → synced`, stamping `remote_url`). Conflict policy: last-write-wins by `updated_at` is fine - effectively single-author. Media is immutable once captured, so blobs never conflict, only metadata. Sync must be resumable: a dropped tunnel just pauses the queue.

---

## Explicitly out of scope (do not build, do not scaffold for)

- Automatic speech-to-text / transcription.
- Dependency graphs, parallel planners, auto-pivoting "execution engine" playback.
- Deterministic countdown replay from recorded timings (sensory cues don't transfer across stoves - a later "guided cue" idea, not a timer).
- Multi-user concurrent editing / real-time collaboration / accounts.

---

## Build order (first milestone)

The thinnest slice that's actually useful in a real kitchen. Get this working and solid before anything else:

1. Create a Dish (both names, description, type tags).
2. Start a Session → master timer runs (with pause/resume).
3. Add and name Stages as laps.
4. Drop a Log in the current stage: record audio **or** capture an image; optionally attach ingredients (registry + freehand, grams or to-taste) and utensils (registry photo tap).
5. View the session timeline (the timer-as-spine) with per-stage summaries.
6. Local persistence only - IndexedDB + OPFS, fully offline.

Server sync and parallel sessions come immediately after, once capture feels fast and reliable.

---

## Working agreement

- Prioritize a working, reliable capture flow over visual completeness. A beautiful screen that loses a log when Wi-Fi drops is a failure; a plain one that never loses data is a success.
- When you make a judgment call that diverges from the prototype or this doc, leave a short note (in code comments or a CHANGES note) saying what and why.
- Ask before introducing heavy dependencies or changing the storage/sync approach.
- Mobile-first always. Test the cooking flow at a phone width. Respect reduced-motion, visible focus, and large touch targets.
