"""Bearer-token auth. One shared secret guards every endpoint (no user accounts)."""
import hmac
from functools import wraps

from flask import current_app, jsonify, request


def _provided_token() -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[len("Bearer "):].strip()
    # Allow a query token for the media <img>/<audio> case where headers are awkward.
    return request.args.get("token", "")


def require_token(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        expected = current_app.config.get("SYNC_TOKEN", "")
        provided = _provided_token()
        if not expected:
            return jsonify(error="server has no SYNC_TOKEN set"), 503
        if not provided or not hmac.compare_digest(provided, expected):
            return jsonify(error="unauthorized"), 401
        return fn(*args, **kwargs)

    return wrapper
