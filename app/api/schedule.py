"""
API — Scheduled Backup
========================
Manages a background thread that runs automatic PLC backups on a configurable cron-like schedule.

Routes:
  GET  /api/schedule              → return current schedule config & next run times
  POST /api/schedule/set          → save/update schedule
  POST /api/schedule/enable       → enable scheduler
  POST /api/schedule/disable      → pause scheduler
  POST /api/schedule/run_now      → trigger immediate backup of all PLCs
"""

import threading
import time
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from app.config import PLC_CONFIG

bp = Blueprint("schedule", __name__, url_prefix="/api/schedule")

# ── Shared scheduler state ────────────────────────────────────────────────────
_lock = threading.Lock()
_scheduler_config = {
    "enabled":       False,
    "interval_min":  60,      # backup every N minutes
    "last_run":      None,
    "next_run":      None,
    "run_count":     0,
    "last_result":   None,
    "plc_ids":       [],      # empty = all PLCs
}
_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _do_backup_all(plc_ids: list) -> dict:
    """Run backup for specified PLC IDs (or all if empty). Returns summary."""
    from app.api.backup import create_backup as _backup_fn
    from flask import current_app

    targets = [c for c in PLC_CONFIG if (not plc_ids or c["id"] in plc_ids)]
    results = {}
    for cfg in targets:
        try:
            # We call the backup function in the request context-free way
            from app.api import backup as bak_mod
            from app.plc.poller import connections

            conn = connections.get(cfg["id"])
            if not conn or not conn.connected:
                results[cfg["name"]] = "skipped — offline"
                continue

            # Import and call directly
            import json, os
            from datetime import datetime as dt

            ts       = dt.now()
            ts_str   = ts.strftime("%Y%m%d_%H%M%S")
            base     = f"backup_{cfg['name']}_{ts_str}"
            json_f   = base + ".json"
            xlsx_f   = base + ".xlsx"
            backups_dir = bak_mod._BACKUPS_DIR

            devices   = {}
            by_device = {}
            t_pts = t_nz = 0

            for (prefix, start, count, dtype, label) in bak_mod.BACKUP_PLAN:
                data = bak_mod._read_all_words(conn, prefix, start, count) \
                       if dtype == "word" else bak_mod._read_all_bits(conn, prefix, start, count)
                nz = sum(1 for v in data if v != 0)
                devices[prefix] = {"label": label, "type": dtype, "start": start, "count": count, "data": data}
                by_device[prefix] = {"count": count, "non_zero": nz}
                t_pts += count; t_nz += nz

            doc = {
                "metadata": {
                    "plc_name": cfg["name"], "ip": cfg["ip"], "model": cfg["model"],
                    "location": cfg["location"],
                    "backup_time": ts.isoformat(),
                    "software":    "PLC Network Monitor v1 — Scheduled Backup",
                    "version":     "3.0",
                },
                "summary": {"total_points": t_pts, "non_zero": t_nz, "duration_ms": 0, "by_device": by_device},
                "devices": devices,
            }
            with open(os.path.join(backups_dir, json_f), "w") as fh:
                json.dump(doc, fh, indent=2)
            try:
                bak_mod._make_excel_report(doc, os.path.join(backups_dir, xlsx_f))
            except Exception:
                xlsx_f = None

            results[cfg["name"]] = f"ok — {t_nz}/{t_pts} non-zero | {json_f}"
        except Exception as exc:
            results[cfg["name"]] = f"error: {exc}"
    return results


def _scheduler_loop(app):
    """Background thread — wakes up every 30 seconds and checks if it's time to run."""
    with app.app_context():
        while not _stop_event.is_set():
            time.sleep(30)
            with _lock:
                cfg = _scheduler_config
                if not cfg["enabled"]:
                    continue
                now = datetime.now()
                if cfg["next_run"] and now >= cfg["next_run"]:
                    try:
                        result = _do_backup_all(cfg["plc_ids"])
                        cfg["last_run"]    = now.isoformat(timespec="seconds")
                        cfg["run_count"]  += 1
                        cfg["last_result"] = result
                        cfg["next_run"]    = now + timedelta(minutes=cfg["interval_min"])
                    except Exception as exc:
                        cfg["last_result"] = {"error": str(exc)}
                        cfg["next_run"]    = now + timedelta(minutes=cfg["interval_min"])


def start_scheduler(app):
    """Call once at application startup to launch the background thread."""
    global _scheduler_thread
    _stop_event.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, args=(app,), daemon=True)
    _scheduler_thread.start()


# ── Routes ───────────────────────────────────────────────────────────────────

@bp.get("")
def get_schedule():
    with _lock:
        cfg = dict(_scheduler_config)
    cfg["next_run"] = cfg["next_run"].isoformat(timespec="seconds") if cfg["next_run"] else None
    return jsonify({"success": True, "schedule": cfg})


@bp.post("/set")
def set_schedule():
    body = request.json or {}
    with _lock:
        cfg = _scheduler_config
        cfg["interval_min"] = int(body.get("interval_min", cfg["interval_min"]))
        cfg["plc_ids"]      = body.get("plc_ids", cfg["plc_ids"])
        # Recompute next run from now
        if cfg["enabled"]:
            cfg["next_run"] = datetime.now() + timedelta(minutes=cfg["interval_min"])
    return jsonify({"success": True, "schedule": _scheduler_config})


@bp.post("/enable")
def enable_schedule():
    with _lock:
        _scheduler_config["enabled"]  = True
        _scheduler_config["next_run"] = datetime.now() + timedelta(minutes=_scheduler_config["interval_min"])
    return jsonify({"success": True, "next_run": _scheduler_config["next_run"].isoformat(timespec="seconds")})


@bp.post("/disable")
def disable_schedule():
    with _lock:
        _scheduler_config["enabled"]  = False
        _scheduler_config["next_run"] = None
    return jsonify({"success": True})


@bp.post("/run_now")
def run_now():
    body    = request.json or {}
    plc_ids = body.get("plc_ids", [])
    try:
        result = _do_backup_all(plc_ids)
        with _lock:
            _scheduler_config["last_run"]    = datetime.now().isoformat(timespec="seconds")
            _scheduler_config["run_count"]  += 1
            _scheduler_config["last_result"] = result
        return jsonify({"success": True, "results": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
