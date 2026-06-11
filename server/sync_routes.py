"""Sync surface - the whole API.

  POST /api/sync/push     upsert rows (last-write-wins by updated_at)
  GET  /api/sync/pull     rows changed since a cursor (for a second device)
  POST /api/media/<id>    upload immutable media bytes
  GET  /api/media/<id>    download media bytes
  GET  /api/health        liveness
"""
import json
import os
import re

from flask import Blueprint, current_app, jsonify, request, send_file

from extensions import db
from models import MediaBlob, Record, _now_iso
from security import require_token

sync_bp = Blueprint("sync", __name__)

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


@sync_bp.get("/api/health")
def health():
    return jsonify(ok=True, time=_now_iso(), service="ammas-codex-sync")


@sync_bp.post("/api/sync/push")
@require_token
def push():
    """Body: { records: [{entity, id, updated_at, deleted?, payload}] }.
    Idempotent. A row is written only if it's new or strictly newer than what we hold."""
    body = request.get_json(silent=True) or {}
    records = body.get("records", [])
    if not isinstance(records, list):
        return jsonify(error="records must be a list"), 400

    applied, skipped = [], []
    for r in records:
        entity = r.get("entity")
        rid = r.get("id")
        updated_at = r.get("updated_at")
        if not (entity and rid and updated_at):
            skipped.append({"id": rid, "reason": "missing entity/id/updated_at"})
            continue
        existing = db.session.get(Record, (entity, rid))
        # Lexicographic compare is chronological for fixed-format UTC ISO strings.
        if existing is not None and existing.updated_at >= updated_at:
            skipped.append({"id": rid, "reason": "older-or-equal"})
            continue
        payload = json.dumps(r.get("payload", {}), separators=(",", ":"))
        if existing is None:
            db.session.add(Record(
                entity=entity, id=rid, updated_at=updated_at,
                deleted=bool(r.get("deleted", False)), payload=payload, received_at=_now_iso(),
            ))
        else:
            existing.updated_at = updated_at
            existing.deleted = bool(r.get("deleted", False))
            existing.payload = payload
            existing.received_at = _now_iso()
        applied.append(rid)

    db.session.commit()
    return jsonify(applied=applied, skipped=skipped, serverTime=_now_iso())


@sync_bp.get("/api/sync/pull")
@require_token
def pull():
    """Rows with updated_at > `since` (exclusive), ordered, paged by `limit`.
    The client advances its cursor to the max updated_at it received."""
    since = request.args.get("since", "")
    limit = min(int(request.args.get("limit", "500")), 2000)
    q = Record.query
    if since:
        q = q.filter(Record.updated_at > since)
    rows = q.order_by(Record.updated_at.asc()).limit(limit).all()
    return jsonify(
        records=[r.to_dict() for r in rows],
        serverTime=_now_iso(),
        count=len(rows),
        more=len(rows) == limit,
    )


def _media_path(media_id: str) -> str:
    return os.path.join(current_app.config["MEDIA_DIR"], media_id)


@sync_bp.post("/api/media/<media_id>")
@require_token
def upload_media(media_id):
    """Raw body = bytes; Content-Type = mime. Media is immutable, so this is idempotent:
    if the bytes already exist we just confirm."""
    if not _SAFE_ID.match(media_id):
        return jsonify(error="bad id"), 400
    path = _media_path(media_id)
    existing = db.session.get(MediaBlob, media_id)
    if existing and os.path.exists(path):
        return jsonify(stored=True, remote_url=f"/api/media/{media_id}", size=existing.size)

    data = request.get_data()
    if not data:
        return jsonify(error="empty body"), 400
    os.makedirs(current_app.config["MEDIA_DIR"], exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    mime = request.headers.get("Content-Type", "application/octet-stream")
    if existing is None:
        db.session.add(MediaBlob(id=media_id, mime=mime, size=len(data)))
    else:
        existing.mime, existing.size = mime, len(data)
    db.session.commit()
    return jsonify(stored=True, remote_url=f"/api/media/{media_id}", size=len(data))


@sync_bp.get("/api/media/<media_id>")
@require_token
def download_media(media_id):
    if not _SAFE_ID.match(media_id):
        return jsonify(error="bad id"), 400
    path = _media_path(media_id)
    if not os.path.exists(path):
        return jsonify(error="not found"), 404
    blob = db.session.get(MediaBlob, media_id)
    mime = blob.mime if blob else "application/octet-stream"
    return send_file(path, mimetype=mime, conditional=True)


@sync_bp.get("/api/sync/stats")
@require_token
def stats():
    """A tiny dashboard number for the reviewer: how much has landed."""
    counts = {}
    for (entity,) in db.session.query(Record.entity).distinct():
        counts[entity] = Record.query.filter_by(entity=entity).count()
    return jsonify(records=counts, media=MediaBlob.query.count(), serverTime=_now_iso())
