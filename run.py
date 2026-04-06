"""
# PLC Network Monitor v1 — Entry Point
=====================================
Run this file to start the server:
    python run.py
Then open: http://localhost:5000
"""

import threading
from app import create_app, socketio
from app.plc.poller import poll_all

app = create_app()

if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  PLC Network Monitor v1  |  http://localhost:5000")
    print("=" * 55 + "\n")

    # Start background polling thread
    threading.Thread(target=poll_all, daemon=True).start()

    # Start Flask-SocketIO server
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
