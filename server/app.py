"""Application factory + CLI.

Bootstrap once:
    cp .env.example .env            # set SYNC_TOKEN (token_hex(32)) etc.
    python -m venv venv && . venv/bin/activate   (Windows: venv\\Scripts\\activate)
    pip install -r requirements.txt
    flask --app wsgi init-db
Run (dev):
    python wsgi.py
Run (prod, behind the Cloudflare tunnel - see README):
    waitress-serve --listen=127.0.0.1:5055 wsgi:app
"""
import click
from flask import Flask
from sqlalchemy import event
from sqlalchemy.engine import Engine

from config import Config
from extensions import db


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_con, _):
    cur = dbapi_con.cursor()
    cur.execute("PRAGMA journal_mode=WAL")      # better concurrency
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


def create_app(config=Config):
    import os

    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist'))
    app = Flask(__name__, static_folder=dist_dir, static_url_path="/")

    app.config.from_object(config)
    os.makedirs(app.config["MEDIA_DIR"], exist_ok=True)

    db.init_app(app)

    # CORS - bearer-token auth (no cookies), so a wildcard is safe. Lock via CORS_ORIGINS.
    allowed = app.config["CORS_ORIGINS"]

    @app.after_request
    def _cors(resp):
        origin = "*" if allowed == "*" else allowed
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Max-Age"] = "86400"
        resp.headers["Vary"] = "Origin"
        return resp

    @app.route("/api/<path:_any>", methods=["OPTIONS"])
    def _preflight(_any):
        return ("", 204)

    from sync_routes import sync_bp
    app.register_blueprint(sync_bp)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def catch_all(path):
        if path.startswith("api/"):
            return "Not Found", 404
        if path != "" and os.path.exists(os.path.join(dist_dir, path)):
            return app.send_static_file(path)
        else:
            return app.send_static_file("index.html")

    @app.cli.command("init-db")
    def init_db():
        """Create all tables."""
        with app.app_context():
            db.create_all()
        click.echo("✓ tables created")

    return app
