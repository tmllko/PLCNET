"""
API — PLC Routes
=================
GET  /api/plcs               → all PLC state snapshots
GET  /api/status             → summary counts
POST /api/plcs/<id>/read     → read registers on demand
POST /api/plcs/<id>/write    → write registers on demand
"""

from datetime import datetime
import json
import os
from flask import Blueprint, jsonify, request
from app import state
from app.config import PLC_CONFIG, CONFIG_PATH
from app.plc.poller import connections
from app.plc.connection import PLCConnection

bp = Blueprint("plcs", __name__, url_prefix="/api")


@bp.get("/plcs")
def get_plcs():
    """Return live state for all PLCs."""
    return jsonify({
        "success":   True,
        "plcs":      list(state.plc_states.values()),
        "timestamp": datetime.now().isoformat(),
    })


@bp.get("/status")
def get_status():
    """Return a summary count of online / offline / warning PLCs."""
    statuses = [s.get("status") for s in state.plc_states.values()]
    return jsonify({
        "success":       True,
        "total":         len(statuses),
        "online":        statuses.count("online"),
        "offline":       statuses.count("offline"),
        "warnings":      sum(1 for s in statuses if s in ("warning", "error")),
        "alarms":        len(state.active_alarms),
        "poll_interval": 2,
    })


@bp.post("/plcs")
def add_plc():
    """Add a new PLC station to the network."""
    data = request.json
    new_id = max([p["id"] for p in PLC_CONFIG], default=0) + 1
    new_plc = {
        "id":       new_id,
        "name":     data.get("name", f"PLC-{new_id:02d}"),
        "ip":       data.get("ip", "127.0.0.1"),
        "port":     int(data.get("port", 5001)),
        "model":    data.get("model", "UNKNOWN"),
        "plc_type": data.get("plc_type", "hex"),
        "location": data.get("location", ""),
    }

    # Update memory
    PLC_CONFIG.append(new_plc)
    connections[new_id] = PLCConnection(new_plc)

    # Save to file
    with open(CONFIG_PATH, "w") as f:
        json.dump(PLC_CONFIG, f, indent=4)

    return jsonify({"success": True, "plc": new_plc})


@bp.put("/plcs/<int:pid>")
def update_plc(pid: int):
    """Update details of an existing PLC station."""
    data = request.json
    idx  = next((i for i, p in enumerate(PLC_CONFIG) if p["id"] == pid), None)
    if idx is None:
        return jsonify({"success": False, "error": "PLC not found"}), 404

    # Update config
    PLC_CONFIG[idx].update({
        "name":     data.get("name",     PLC_CONFIG[idx]["name"]),
        "ip":       data.get("ip",       PLC_CONFIG[idx]["ip"]),
        "port":     int(data.get("port", PLC_CONFIG[idx]["port"])),
        "model":    data.get("model",    PLC_CONFIG[idx]["model"]),
        "plc_type": data.get("plc_type", PLC_CONFIG[idx].get("plc_type", "hex")),
        "location": data.get("location", PLC_CONFIG[idx]["location"]),
    })

    # Update connection object (forces new settings)
    connections[pid] = PLCConnection(PLC_CONFIG[idx])

    # Save to file
    with open(CONFIG_PATH, "w") as f:
        json.dump(PLC_CONFIG, f, indent=4)

    return jsonify({"success": True, "plc": PLC_CONFIG[idx]})


@bp.delete("/plcs/<int:pid>")
def delete_plc(pid: int):
    """Remove a PLC station from the network."""
    idx = next((i for i, p in enumerate(PLC_CONFIG) if p["id"] == pid), None)
    if idx is None:
        return jsonify({"success": False, "error": "PLC not found"}), 404

    # Remove from config and connections
    PLC_CONFIG.pop(idx)
    connections.pop(pid, None)
    state.plc_states.pop(pid, None)

    # Save to file
    with open(CONFIG_PATH, "w") as f:
        json.dump(PLC_CONFIG, f, indent=4)

    return jsonify({"success": True})


@bp.post("/plcs/<int:pid>/read")
def read_register(pid: int):
    """Read word or bit registers from a PLC on demand."""
    conn = connections.get(pid)
    if not conn:
        return jsonify({"success": False, "error": "PLC not found"}), 404

    body  = request.json
    dtype = body.get("type", "word")
    dev   = body["device"]
    count = body.get("count", 1)

    values = (
        conn.read_words(dev, count)
        if dtype == "word"
        else conn.read_bits(dev, count)
    )

    if values is None:
        return jsonify({"success": False, "error": conn.last_err}), 500

    return jsonify({"success": True, "device": dev, "values": values})


@bp.post("/plcs/<int:pid>/write")
def write_register(pid: int):
    """Write word or bit values to a PLC."""
    conn = connections.get(pid)
    if not conn:
        return jsonify({"success": False, "error": "PLC not found"}), 404

    body   = request.json
    dtype  = body.get("type", "word")
    dev    = body["device"]
    values = body["values"]

    ok = (
        conn.write_words(dev, values)
        if dtype == "word"
        else conn.write_bits(dev, values)
    )

    if not ok:
        return jsonify({"success": False, "error": conn.last_err}), 500

    return jsonify({"success": True, "device": dev, "values_written": values})
