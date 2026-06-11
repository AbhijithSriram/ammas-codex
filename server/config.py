"""Configuration. Values come from the environment (.env is loaded in wsgi.py)."""
import os


class Config:
    # Not strictly needed (no sessions), but Flask likes a key set.
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///ammas_codex.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Where media bytes (audio/image/video) live on the laptop's disk.
    MEDIA_DIR = os.path.abspath(os.environ.get("MEDIA_DIR", "./media"))
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_UPLOAD_MB", "200")) * 1024 * 1024

    # The single shared secret the phone (and the reviewer device) present as a
    # bearer token. The app has no accounts by design; this guards the public
    # tunnel endpoint. Generate one: python -c "import secrets;print(secrets.token_hex(32))"
    SYNC_TOKEN = os.environ.get("SYNC_TOKEN", "")

    # Public origin reached through the Cloudflare Tunnel.
    PUBLIC_ORIGIN = os.environ.get("PUBLIC_ORIGIN", "https://ammas-codex.abhijith-sriram.in")

    # CORS allowlist. Bearer-token auth (not cookies) means a wildcard is safe;
    # set a comma-separated list to lock it down. "*" is fine for this private app.
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
