"""
API — Logging Routes
=====================
GET    /api/log/config          → current per-PLC logging config
POST   /api/log/config          → set logging items for a PLC
DELETE /api/log/config/<pid>    → remove logging config for a PLC
GET    /api/log/records         → fetch recent log records
POST   /api/log/clear           → clear all log records
GET    /api/log/export          → download records as Excel
"""

import os
from datetime import datetime
from flask import Blueprint, jsonify, request, send_from_directory
from app import state
from app.core.excel import make_excel

bp = Blueprint("logging", __name__, url_prefix="/api/log")

# Absolute path to the logs directory (safe regardless of CWD)
_LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
os.makedirs(_LOGS_DIR, exist_ok=True)


@bp.get("/config")
def get_log_config():
    """Return the current logging configuration for all PLCs."""
    return jsonify({"success": True, "config": state.log_config})


@bp.post("/config")
def set_log_config():
    """
    Save logging items for a single PLC.
    Body: { "plc_id": int, "items": [ {...}, ... ] }
    """
    body   = request.json
    pid    = body["plc_id"]
    items  = body.get("items", [])
    state.log_config[pid] = items
    return jsonify({"success": True, "plc_id": pid, "count": len(items)})


@bp.delete("/config/<int:pid>")
def delete_log_config(pid: int):
    """Remove the logging configuration for a specific PLC."""
    state.log_config.pop(pid, None)
    return jsonify({"success": True})


@bp.get("/records")
def get_records():
    """
    Return the most recent log records.
    Query param: ?limit=500  (default 500)
    """
    limit = int(request.args.get("limit", 500))
    return jsonify({
        "success": True,
        "records": state.log_records[-limit:],
        "total":   len(state.log_records),
    })


@bp.post("/clear")
def clear_records():
    """Delete all accumulated log records."""
    state.log_records.clear()
    return jsonify({"success": True})


@bp.post("/stop_and_save")
def stop_and_save():
    """Dynamically save current logs to Excel and turn off all logging."""
    if not state.log_records:
        return jsonify({"success": False, "error": "No records to export"}), 400

    filename = f"PLC_IO_Log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    try:
        make_excel(state.log_records, filename, _LOGS_DIR)
        # Clear running config AND records
        state.log_config.clear()
        state.log_records.clear()
        return jsonify({"success": True, "filename": filename})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.get("/export")
def export_excel():
    """Generate and download a styled Excel report of all log records."""
    if not state.log_records:
        return jsonify({"success": False, "error": "No records to export"}), 400

    filename = f"PLC_IO_Log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    try:
        make_excel(state.log_records, filename, _LOGS_DIR)
        return send_from_directory(_LOGS_DIR, filename, as_attachment=True)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
