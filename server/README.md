# Amma's Codex - sync server

A small, dumb, durable **replica** of the phone's local store. The phone is the source of
truth; this server receives pushes when reachable and never sits on the critical path of
cooking. It also lets a second device (the reviewer's) pull the record.

```
Phone PWA (IndexedDB + OPFS, source of truth)
   │  HTTPS  (push when reachable; resumable; offline-first)
   ▼
Cloudflare Tunnel  ──►  ammas-codex.abhijith-sriram.in
   │
   ▼
Old laptop:  gunicorn -k gevent -w 1 wsgi:app  --bind 127.0.0.1:5055
   ├─ Flask        REST: /api/sync/push, /api/sync/pull, /api/media/<id>, /api/health
   ├─ SQLite (WAL) generic `records` table (entity, id, updated_at, deleted, payload JSON)
   └─ ./media/     immutable media bytes on local disk
```

## Why this shape
- **No accounts.** The app has exactly two users and no onboarding by design. A single shared
  **bearer token** (`SYNC_TOKEN`) guards the public tunnel endpoint. Auth rides the
  `Authorization: Bearer …` header (or `?token=` for `<img>`/`<audio>` media).
- **Generic record store.** The server doesn't model the cooking domain - it stores each row
  the phone created (keyed by the same client UUID) and serves it back. This keeps the replica
  trivial and decoupled from schema changes.
- **Last-write-wins by `updated_at`.** Effectively single-author, so a lexicographic compare of
  fixed-format UTC ISO timestamps is the whole conflict policy. Media is immutable once captured,
  so bytes never conflict - only metadata.
- **gevent, one worker.** Plenty for two users; no shared in-process state, so you *could* run
  more workers, but `-w 1` is simplest with SQLite.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness |
| POST | `/api/sync/push` | `{records:[{entity,id,updated_at,deleted?,payload}]}` → upsert (LWW). Returns `{applied,skipped,serverTime}` |
| GET | `/api/sync/pull?since=<iso>&limit=` | rows changed since a cursor, ascending by `updated_at` |
| POST | `/api/media/<id>` | raw body = bytes, `Content-Type` = mime. Idempotent (immutable) |
| GET | `/api/media/<id>` | download bytes |
| GET | `/api/sync/stats` | per-entity counts (handy for the reviewer) |

All except `/api/health` require the bearer token.

## Setup & run
```bash
cp .env.example .env
python -c "import secrets;print(secrets.token_hex(32))"   # paste into SYNC_TOKEN
python -m venv venv && . venv/bin/activate                 # Windows: venv\Scripts\activate
pip install -r requirements.txt
flask --app wsgi init-db
python wsgi.py                                             # dev: http://127.0.0.1:5055
```

### Production (on the laptop, behind the tunnel)
```bash
gunicorn -k gevent -w 1 wsgi:app --bind 127.0.0.1:5055
# expose it - route ammas-codex.abhijith-sriram.in → http://127.0.0.1:5055
cloudflared tunnel run
```
A `cloudflared` config typically looks like:
```yaml
# ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /home/abhijith/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ammas-codex.abhijith-sriram.in
    service: http://127.0.0.1:5055
  - service: http_status:404
```
Keep gunicorn bound to localhost; Cloudflare terminates TLS. Set the same `SYNC_TOKEN`
in the app's Settings as in this server's `.env`.

### Backups
Back up `ammas_codex.db` (checkpoint the WAL first) and the `./media/` folder together.

## Out of scope (matches the app)
No realtime, no accounts, no transcription. This is a replica + upload sink, nothing more.
