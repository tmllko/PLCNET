"""
API — I/O Routes
=================
GET /api/io/<plc_id>  → raw I/O snapshot for one PLC
GET /api/alarms       → all active alarms
"""

from flask import Blueprint, jsonify
from app import state

bp = Blueprint("io", __name__, url_prefix="/api")


@bp.get("/io/<int:pid>")
def get_io(pid: int):
    """Return the latest I/O snapshot for a single PLC."""
    return jsonify({
        "success": True,
        "plc_id":  pid,
        "io":      state.io_states.get(pid, {}),
    })


@bp.get("/alarms")
def get_alarms():
    """Return the list of currently active alarms."""
    return jsonify({
        "success": True,
        "alarms":  state.active_alarms,
    })
