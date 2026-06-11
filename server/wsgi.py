"""WSGI / dev entrypoint.

`app` is what gunicorn imports:  gunicorn -k gevent -w 1 wsgi:app
Running this file directly starts Flask's dev server.
"""
from dotenv import load_dotenv

load_dotenv()  # read .env before Config is constructed

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    import os

    # Ensure tables exist for a frictionless dev start.
    from extensions import db

    with app.app_context():
        db.create_all()

    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5055")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
