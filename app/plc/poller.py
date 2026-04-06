"""
PLC Poller
===========
Background thread that polls all PLCs every POLL_INTERVAL seconds,
updates shared state, evaluates warnings, logs I/O, and emits
a WebSocket event to all connected clients.

FIXES APPLIED:
  1. X/Y bits now stored with HEXADECIMAL address keys (f"X{i:X}")
     so X10 = decimal index 16, not 10.  Fixes phantom-ON bits X11–X19.
  2. M bits are now included in the state dict sent to the frontend.
  3. scan_time is measured in real-time instead of hardcoded "2.0ms".
  4. cpu field comment updated — D0 is a user data register, not CPU load.
"""

import time
from datetime import datetime

from app.config import PLC_CONFIG, IO_SCAN, POLL_INTERVAL
from app.plc.connection import PLCConnection
from app import state
from app.core.warnings import check_warnings
from app.core.logger import log_tick

# Build a connection object for every PLC in config
connections: dict[int, PLCConnection] = {
    cfg["id"]: PLCConnection(cfg) for cfg in PLC_CONFIG
}


def _build_offline_state(cfg: dict, conn: PLCConnection) -> dict:
    """Return a standardised 'offline' state dict for a PLC."""
    return {
        "id":          cfg["id"],
        "name":        cfg["name"],
        "model":       cfg["model"],
        "ip":          cfg["ip"],
        "location":    cfg["location"],
        "status":      "offline",
        "cpu":         0,
        "registers":   {},
        "bits":        {},
        "scan_time":   "—",
        "errors":      [{"code": "ERR-CONN", "desc": conn.last_err or "No response"}],
        "last_update": datetime.now().isoformat(),
    }


def _build_online_state(cfg: dict, io: dict, warns: list, scan_ms: float) -> dict:
    """Return a standardised 'online' (or 'warning') state dict for a PLC.

    FIX 1 — X/Y use hexadecimal address suffixes (Mitsubishi convention).
             i=10 decimal → key "XA", i=16 decimal → key "X10".
             Previously used decimal index which caused bits X10–X1F to appear
             at wrong addresses, making X11/X12/X19 show ON with no input.

    FIX 2 — M bits are now included in the bits dict so the frontend
             and downstream consumers can read M register values.

    FIX 3 — scan_time is the real measured poll duration, not hardcoded.
    """
    d_regs = io.get("D", [])
    x_bits = io.get("X", [])
    y_bits = io.get("Y", [])
    m_bits = io.get("M", [])

    registers = {f"D{i}": v for i, v in enumerate(d_regs)}

    bits = {}
    is_octal = cfg.get("plc_type") == "octal"
    
    # FIX 1: use uppercase hex suffix for X and Y, or octal for FX series
    for i, v in enumerate(x_bits):
        bits[f"X{oct(i)[2:]}" if is_octal else f"X{i:X}"] = v
    for i, v in enumerate(y_bits):
        bits[f"Y{oct(i)[2:]}" if is_octal else f"Y{i:X}"] = v

    # FIX 2: include M bits so monitor.js and logger can see them
    for i, v in enumerate(m_bits):
        bits[f"M{i}"] = v            # M registers are decimal-addressed

    return {
        "id":          cfg["id"],
        "name":        cfg["name"],
        "model":       cfg["model"],
        "ip":          cfg["ip"],
        "location":    cfg["location"],
        "status":      "warning" if warns else "online",
        # NOTE: D0 is a general-purpose data register — not true CPU load.
        # Replace with your actual CPU-usage register if the PLC exposes one.
        "cpu":         registers.get("D0", 0),
        "registers":   registers,
        "bits":        bits,
        # FIX 3: real scan time measured in poll_one()
        "scan_time":   f"{scan_ms:.1f}ms",
        "errors":      [{"code": "WARN", "desc": w["message"]} for w in warns],
        "last_update": datetime.now().isoformat(),
    }


# Track the previous status per PLC to detect offline → online transitions
_prev_status: dict[int, str] = {}


def poll_one(cfg: dict) -> dict:
    """
    Poll a single PLC: connect → read I/O → check warnings → return state.

    If a PLC transitions from offline → online (cable re-inserted),
    a 'plc_reconnect' WebSocket event is emitted immediately.

    FIX 3: measures actual read duration and passes it to _build_online_state.
    """
    pid  = cfg["id"]
    conn = connections[pid]

    # Always attempt reconnect when not connected.
    # _connect() closes the stale socket first (cable re-insertion fix).
    if not conn.connected:
        conn._connect()

    if conn.connected:
        # FIX 3 — measure real scan time across all four reads
        t0 = time.perf_counter()

        x = conn.read_bits("X0", IO_SCAN["X"])
        y = conn.read_bits("Y0", IO_SCAN["Y"])
        m = conn.read_bits("M0", IO_SCAN["M"])
        d = conn.read_words("D0", IO_SCAN["D"])

        scan_ms = round((time.perf_counter() - t0) * 1000, 1)

        # If any read returned None the cable likely dropped mid-poll;
        # conn.connected is already False from _handle_error — fall through.
        if conn.connected:
            io = {
                "X": x or [],
                "Y": y or [],
                "M": m or [],
                "D": d or [],
            }
            state.io_states[pid] = io
            warns  = check_warnings(pid, io)
            result = _build_online_state(cfg, io, warns, scan_ms)

            # Detect cable re-insertion: was offline, now online
            if _prev_status.get(pid) == "offline":
                try:
                    from app import socketio
                    socketio.emit("plc_reconnect", {
                        "plc_id":   pid,
                        "name":     cfg["name"],
                        "message":  f"{cfg['name']} reconnected ({cfg['ip']})",
                        "timestamp": result["last_update"],
                    })
                except Exception:
                    pass

            _prev_status[pid] = result["status"]
            return result

    # Connection failed (cable out or read error)
    state.io_states[pid] = {"X": [], "Y": [], "M": [], "D": []}
    result = _build_offline_state(cfg, conn)
    _prev_status[pid] = "offline"
    return result


def poll_all():
    """
    Infinite polling loop — runs in a daemon thread.
    Every POLL_INTERVAL seconds:
      1. Poll every PLC
      2. Tick the I/O logger
      3. Emit plc_update via WebSocket
    """
    # Import here to avoid circular import at module load time
    from app import socketio

    while True:
        all_states = []

        for cfg in PLC_CONFIG:
            plc_state = poll_one(cfg)
            state.plc_states[cfg["id"]] = plc_state
            all_states.append(plc_state)

        log_tick()

        socketio.emit("plc_update", {
            "plcs":      all_states,
            "io":        {str(k): v for k, v in state.io_states.items()},
            "alarms":    state.active_alarms,
            "timestamp": datetime.now().isoformat(),
        })

        time.sleep(POLL_INTERVAL)