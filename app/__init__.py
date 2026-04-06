"""
Flask Application Factory
"""

import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")

from werkzeug.middleware.proxy_fix import ProxyFix

# Resolve paths relative to the project root (one level above this package)
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.join(_ROOT, "static"),
        static_url_path="/static",
    )
    # Support Cloudflare Tunnel / Reverse Proxy IPs
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)
    
    CORS(app)

    @app.after_request
    def add_header(response):
        """Add headers to both force latest IE rendering engine or 
        else to not cache the rendered page."""
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '-1'
        return response

    # Ensure required directories exist (absolute — safe regardless of CWD)
    os.makedirs(os.path.join(_ROOT, "backups"), exist_ok=True)
    os.makedirs(os.path.join(_ROOT, "logs"),    exist_ok=True)

    # Initialize SocketIO with the app
    socketio.init_app(app)

    # Register API blueprints
    from app.api.plcs      import bp as plcs_bp
    from app.api.io        import bp as io_bp
    from app.api.logging   import bp as log_bp
    from app.api.backup    import bp as bak_bp
    from app.api.static    import bp as static_bp
    from app.api.alarms    import bp as alarms_bp
    from app.api.schedule  import bp as schedule_bp
    from app.api.email_api  import bp as email_bp
    from app.api.lineboard  import bp as lineboard_bp

    app.register_blueprint(plcs_bp)
    app.register_blueprint(io_bp)
    app.register_blueprint(log_bp)
    app.register_blueprint(bak_bp)
    app.register_blueprint(static_bp)
    app.register_blueprint(alarms_bp)
    app.register_blueprint(schedule_bp)
    app.register_blueprint(email_bp)
    app.register_blueprint(lineboard_bp)

    # Register WebSocket event handlers
    from app.sockets import events  # noqa: F401

    # Start background scheduler
    from app.api.schedule import start_scheduler
    start_scheduler(app)

    return app
