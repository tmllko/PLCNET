"""
API — Static File Route
========================
GET / → serve the frontend SPA (static/index.html)
"""

from flask import Blueprint, send_from_directory, current_app

bp = Blueprint("static_files", __name__)


@bp.get("/")
def index():
    """Serve the single-page app using the absolute static folder path."""
    return send_from_directory(current_app.static_folder, "index.html")
