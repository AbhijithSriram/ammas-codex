"""Server data model - a dumb, durable *replica* of the phone's local store.

The phone is the source of truth. The server doesn't need to understand the cooking
domain; it stores each row generically (entity + client-UUID + updated_at + JSON payload)
and serves it back. Conflict policy is last-write-wins by `updated_at` - effectively
single-author. Media bytes are immutable once captured and live on disk.
"""
from datetime import datetime, timezone

from extensions import db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Record(db.Model):
    """One row from any local table. (entity, id) is the natural key - the same stable
    client UUID the phone generated, so offline-created rows never collide."""
    __tablename__ = "records"
    entity = db.Column(db.String, primary_key=True)          # 'dish','session','stage','log',...
    id = db.Column(db.String, primary_key=True)              # client UUID
    updated_at = db.Column(db.String, nullable=False, index=True)  # ISO-8601; the LWW key
    deleted = db.Column(db.Boolean, nullable=False, default=False)
    payload = db.Column(db.Text, nullable=False)             # JSON of the full row
    received_at = db.Column(db.String, nullable=False, default=_now_iso)

    def to_dict(self):
        import json
        return {
            "entity": self.entity,
            "id": self.id,
            "updated_at": self.updated_at,
            "deleted": self.deleted,
            "payload": json.loads(self.payload),
        }


class MediaBlob(db.Model):
    """Tracks which media ids have their bytes on disk. Bytes themselves live in MEDIA_DIR."""
    __tablename__ = "media_blobs"
    id = db.Column(db.String, primary_key=True)              # == media row id
    mime = db.Column(db.String, nullable=False, default="application/octet-stream")
    size = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.String, nullable=False, default=_now_iso)
