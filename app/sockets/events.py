"""
WebSocket Event Handlers
=========================
Handles real-time events between server and browser clients.
"""

from datetime import datetime
from flask_socketio import emit
from app import socketio, state
from app.plc.poller import connections


@socketio.on("connect")
def on_connect():
    """
    Send the current snapshot immediately when a client connects
    so the UI doesn't wait for the next poll cycle.
    """
    emit("plc_update", {
        "plcs":      list(state.plc_states.values()),
        "io":        {str(k): v for k, v in state.io_states.items()},
        "alarms":    state.active_alarms,
        "timestamp": datetime.now().isoformat(),
    })


@socketio.on("write_register")
def on_write_register(data: dict):
    """
    Write a value to a PLC register via WebSocket.
    Expected payload:
      { plc_id, device, values: [int], type: "word"|"bit" }
    """
    pid  = data.get("plc_id")
    conn = connections.get(pid)

    if not conn:
        emit("write_result", {"success": False, "plc_id": pid, "error": "PLC not found"})
        return

    dtype  = data.get("type", "word")
    device = data["device"]
    values = data["values"]

    ok = (
        conn.write_words(device, values)
        if dtype == "word"
        else conn.write_bits(device, values)
    )

    emit("write_result", {
        "success": ok,
        "plc_id":  pid,
        "device":  device,
        "error":   conn.last_err if not ok else None,
    })
