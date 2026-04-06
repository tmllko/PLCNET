"""
API — Line Status Board
========================
Stores the Line Board configuration (entered by user via UI),
then reads the configured PLC registers live and returns the
full board state for rendering.

Routes:
  GET  /api/lineboard/config          → get saved config
  POST /api/lineboard/config          → save config
  GET  /api/lineboard/live            → read registers & return live board state
  POST /api/lineboard/config/reset    → reset to defaults

FIXES APPLIED:
  1. Station button matrix now uses a SINGLE batch read for all M-bits
     instead of one individual TCP call per button (was 40+ calls/request).
     Eliminates connection saturation and poller thread blocking.
  2. _save_reason_log() uses atomic write (temp file + os.replace) so a
     server crash during a write cannot corrupt reason_time_log.json and
     silently reset shift stop-reason times.
"""

import json
import os
import tempfile
from datetime import datetime
from flask import Blueprint, jsonify, request
from app.config import PLC_CONFIG
from app.plc.poller import connections

bp = Blueprint("lineboard", __name__, url_prefix="/api/lineboard")

_CFG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "lineboard_config.json"
)

# ── Vehicle counter state tracker (in-memory, resets on server restart) ────────────
_ctr = {
    "shift_date":        None,
    "shift_start_val":   None,
    "hour_snap":         {},
    "last_val":          None,
}

# ── Reason-time auto-tracker ──────────────────────────────────────────────────────
_reason_state = {
    "shift_date":        None,
    "btn_pressed_since": {},
    "accumulated_sec":   {},
}

_REASON_LOG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "reason_time_log.json"
)


def _load_reason_log() -> dict:
    try:
        if os.path.exists(_REASON_LOG_FILE):
            with open(_REASON_LOG_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_reason_log(data: dict):
    """FIX 2: atomic write — temp file + os.replace so a crash during write
    cannot leave a partial/corrupt JSON file on disk."""
    try:
        tmp = _REASON_LOG_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, _REASON_LOG_FILE)   # atomic on POSIX and Windows
    except Exception:
        pass


# ── Default / empty config template ──────────────────────────────────────────
_DEFAULT_CONFIG = {
    "line_name":       "LINE 1",
    "plc_id":          1,
    "num_stations":    8,
    "num_buttons":     5,

    "reg_line_running":   "M0",
    "reg_stopped_station": "D100",

    "buttons": [
        {"label": "MAINTENANCE", "color": "yellow"},
        {"label": "MATERIAL",    "color": "orange"},
        {"label": "PRODUCTION",  "color": "red"},
        {"label": "QUALITY",     "color": "purple"},
        {"label": "EMERGENCY",   "color": "red"},
    ],

    "reg_buttons": [],

    "reg_reason_time": [
        {"hr": "D130", "min": "D131"},
        {"hr": "D132", "min": "D133"},
        {"hr": "D134", "min": "D135"},
        {"hr": "D136", "min": "D137"},
        {"hr": "D138", "min": "D139"},
    ],

    "shift_hours":      8.5,
    "shift_start":      "08:00",
    "daily_target":     170,

    "dropping": {
        "vehicle_counter_reg": "D200",
        "current_hour":   {"plan_value": 20},
        "till_last_hour": {"plan_value": 40, "auto_till": True},
        "for_day":        {"plan_value": 170},
    },

    "reg_oee":          "D120",
    "reg_availability": "D121",
    "reg_performance":  "D122",
    "reg_drr1":         "D123",

    "kpi_enabled": {
        "oee":          True,
        "availability": True,
        "performance":  True,
        "drr1":         True,
    },

    "eol_sensor": {
        "enabled":      False,
        "reg":          "X0",
        "active_state": "ON",
    },

    "marquee_text": "WELCOME TO LINE 1",
}


def _generate_default_button_regs(num_stations: int, num_buttons: int) -> list:
    """Auto-generate sequential M-register addresses for all station buttons."""
    regs = []
    base = 100
    for s in range(num_stations):
        row = []
        for b in range(num_buttons):
            row.append(f"M{base + s * num_buttons + b}")
        regs.append(row)
    return regs


def _load_config() -> dict:
    if os.path.exists(_CFG_FILE):
        with open(_CFG_FILE) as f:
            return json.load(f)
    cfg = dict(_DEFAULT_CONFIG)
    cfg["reg_buttons"] = _generate_default_button_regs(
        cfg["num_stations"], cfg["num_buttons"]
    )
    return cfg


def _save_config(cfg: dict):
    with open(_CFG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def _safe_read_bit(conn, addr: str) -> int:
    """Read a single bit register. Returns 0 on error."""
    try:
        vals = conn.read_bits(addr, 1)
        return int(vals[0]) if vals else 0
    except Exception:
        return 0


def _safe_read_word(conn, addr: str) -> int:
    """Read a single D-word. Returns 0 on error."""
    try:
        vals = conn.read_words(addr, 1)
        return int(vals[0]) if vals else 0
    except Exception:
        return 0


def _parse_m_address(addr: str) -> int:
    """Parse an M-register address string like 'M105' and return the integer index."""
    try:
        return int(addr.strip().upper().lstrip("M"))
    except (ValueError, AttributeError):
        return -1


# ── Routes ────────────────────────────────────────────────────────────────────

@bp.get("/config")
def get_config():
    cfg = _load_config()
    return jsonify({"success": True, "config": cfg, "plcs": PLC_CONFIG})


@bp.post("/config")
def save_config():
    body = request.json or {}
    cfg  = _load_config()

    for key in ["line_name", "plc_id", "num_stations", "num_buttons",
                 "reg_line_running", "reg_stopped_station",
                 "reg_oee", "reg_availability", "reg_performance", "reg_drr1",
                 "marquee_text", "shift_hours", "shift_start", "daily_target"]:
        if key in body:
            cfg[key] = body[key]

    if "buttons"        in body: cfg["buttons"]        = body["buttons"]
    if "reg_buttons"    in body: cfg["reg_buttons"]    = body["reg_buttons"]
    if "reg_reason_time" in body: cfg["reg_reason_time"] = body["reg_reason_time"]
    if "dropping"       in body: cfg["dropping"]       = body["dropping"]
    if "kpi_enabled"    in body: cfg["kpi_enabled"]    = body["kpi_enabled"]
    if "eol_sensor"     in body: cfg["eol_sensor"]     = body["eol_sensor"]

    ns = int(cfg["num_stations"])
    nb = int(cfg["num_buttons"])
    if (not cfg.get("reg_buttons") or
            len(cfg["reg_buttons"]) != ns or
            any(len(r) != nb for r in cfg["reg_buttons"])):
        cfg["reg_buttons"] = _generate_default_button_regs(ns, nb)

    _save_config(cfg)
    return jsonify({"success": True})


@bp.post("/config/reset")
def reset_config():
    cfg = dict(_DEFAULT_CONFIG)
    cfg["reg_buttons"] = _generate_default_button_regs(
        cfg["num_stations"], cfg["num_buttons"]
    )
    _save_config(cfg)
    return jsonify({"success": True, "config": cfg})


@bp.post("/reason-time/reset")
def reset_reason_times():
    """Clear all accumulated reason time data for the current shift."""
    _reason_state["accumulated_sec"]   = {}
    _reason_state["btn_pressed_since"] = {}
    now_str = datetime.now()
    _save_reason_log({
        "date":           now_str.strftime("%Y-%m-%d"),
        "accumulated_sec": {},
        "last_updated":   now_str.isoformat(),
        "note":           "Manually reset by user",
    })
    return jsonify({"success": True, "message": "Reason times reset to 0"})


@bp.get("/live")
def get_live():
    """Read all configured registers from the PLC and return live board state."""
    cfg  = _load_config()
    pid  = int(cfg["plc_id"])
    conn = connections.get(pid)

    now  = datetime.now()
    ts   = now.strftime("%d-%m-%Y")
    tm   = now.strftime("%H:%M")

    connected = conn and conn.connected

    def rbit(addr):
        return _safe_read_bit(conn, addr) if connected else 0

    def rword(addr):
        return _safe_read_word(conn, addr) if connected else 0

    ns = int(cfg["num_stations"])
    nb = int(cfg["num_buttons"])
    reg_buttons = cfg.get("reg_buttons", [])

    # ── FIX 1: Batch read all button M-bits in ONE call ───────────────────
    # Previously this was ns×nb individual reads (up to 40 TCP calls).
    # Now we find the lowest M address, read the full span in one batch,
    # and index into the result array — one TCP round-trip total.
    stations = []

    if connected and reg_buttons:
        # Collect all M addresses to find the span we need to read
        all_addrs = []
        for s in range(ns):
            for b in range(nb):
                try:
                    all_addrs.append(reg_buttons[s][b])
                except (IndexError, TypeError):
                    all_addrs.append(f"M{100 + s * nb + b}")

        m_indices = [_parse_m_address(a) for a in all_addrs]
        valid_indices = [i for i in m_indices if i >= 0]

        batch_bits = {}
        if valid_indices:
            min_m   = min(valid_indices)
            max_m   = max(valid_indices)
            span    = max_m - min_m + 1
            head    = f"M{min_m}"
            try:
                raw = conn.read_bits(head, span)
                if raw and len(raw) >= span:
                    for offset, val in enumerate(raw):
                        batch_bits[min_m + offset] = int(val)
            except Exception:
                pass  # fall back to zero for all bits below

        for s in range(ns):
            btn_states = []
            for b in range(nb):
                try:
                    addr = reg_buttons[s][b]
                except (IndexError, TypeError):
                    addr = f"M{100 + s * nb + b}"
                midx   = _parse_m_address(addr)
                active = batch_bits.get(midx, 0)
                btn_states.append({"addr": addr, "active": active})
            stations.append({
                "station_no": s + 1,
                "buttons":    btn_states,
                "any_active": any(b["active"] for b in btn_states),
            })
    else:
        # Offline — all buttons inactive
        for s in range(ns):
            btn_states = []
            for b in range(nb):
                try:
                    addr = reg_buttons[s][b]
                except (IndexError, TypeError):
                    addr = f"M{100 + s * nb + b}"
                btn_states.append({"addr": addr, "active": 0})
            stations.append({
                "station_no": s + 1,
                "buttons":    btn_states,
                "any_active": False,
            })

    # ── LINE STATE — AUTO-DERIVED ─────────────────────────────────────────
    any_btn_active = any(stn["any_active"] for stn in stations)

    # ── End-of-Line Sensor check ──────────────────────────────────────────
    eol_cfg       = cfg.get("eol_sensor", {})
    eol_enabled   = bool(eol_cfg.get("enabled", False))
    eol_triggered = False
    eol_val       = None

    if eol_enabled and eol_cfg.get("reg"):
        eol_val      = rbit(eol_cfg["reg"])
        stop_on      = eol_cfg.get("active_state", "ON") == "ON"
        eol_triggered = bool(eol_val == 1) if stop_on else bool(eol_val == 0)

    line_running    = 0 if (any_btn_active or eol_triggered) else 1
    stopped_station = rword(cfg["reg_stopped_station"])

    active_stns = [stn["station_no"] for stn in stations if stn["any_active"]]
    if active_stns:
        stopped_station = active_stns[0]

    # ── Reason Time — AUTO-CALCULATED from button press durations ─────────
    rt_start = cfg.get("shift_start", "08:00")
    try:
        rt_sh, rt_sm = [int(x) for x in rt_start.split(":")]
    except Exception:
        rt_sh, rt_sm = 8, 0
    rt_today    = now.strftime("%Y-%m-%d")
    rt_shift_on = (now.hour > rt_sh) or (now.hour == rt_sh and now.minute >= rt_sm)

    if _reason_state["shift_date"] is None:
        saved_rt = _load_reason_log()
        if saved_rt.get("date") == rt_today:
            _reason_state["shift_date"]      = rt_today
            _reason_state["accumulated_sec"] = {
                int(k): v for k, v in saved_rt.get("accumulated_sec", {}).items()
            }
        elif rt_shift_on:
            _reason_state["shift_date"] = rt_today

    elif _reason_state["shift_date"] != rt_today and rt_shift_on:
        _reason_state["shift_date"]        = rt_today
        _reason_state["accumulated_sec"]   = {}
        _reason_state["btn_pressed_since"] = {}
        _save_reason_log({"date": rt_today, "accumulated_sec": {},
                          "last_updated": now.isoformat()})

    for b in range(nb):
        any_active = any(
            b < len(stn["buttons"]) and stn["buttons"][b]["active"]
            for stn in stations
        )
        if any_active:
            if b not in _reason_state["btn_pressed_since"]:
                _reason_state["btn_pressed_since"][b] = now
        else:
            if b in _reason_state["btn_pressed_since"]:
                elapsed = (now - _reason_state["btn_pressed_since"][b]).total_seconds()
                _reason_state["accumulated_sec"][b] = (
                    _reason_state["accumulated_sec"].get(b, 0.0) + elapsed
                )
                del _reason_state["btn_pressed_since"][b]

    reason_times = []
    buttons_cfg  = cfg.get("buttons", [])
    for i in range(nb):
        lbl  = buttons_cfg[i]["label"] if i < len(buttons_cfg) else f"BTN{i+1}"
        acc  = _reason_state["accumulated_sec"].get(i, 0.0)
        if i in _reason_state["btn_pressed_since"]:
            acc += (now - _reason_state["btn_pressed_since"][i]).total_seconds()
        total_sec = int(acc)
        reason_times.append({
            "label":     lbl,
            "hr":        total_sec // 3600,
            "min":       (total_sec % 3600) // 60,
            "sec":       total_sec % 60,
            "total_sec": total_sec,
        })

    # FIX 2: atomic write protects against mid-write crash
    _save_reason_log({
        "date":            rt_today,
        "accumulated_sec": {str(k): v for k, v in _reason_state["accumulated_sec"].items()},
        "last_updated":    now.isoformat(),
        "summary":         [{"label": r["label"], "total_sec": r["total_sec"]}
                            for r in reason_times],
    })

    total_min = sum(r["hr"] * 60 + r["min"] for r in reason_times)
    total_hr  = total_min // 60
    total_rem = total_min % 60

    # ── Dropping section ──────────────────────────────────────────────────
    dr           = cfg.get("dropping", {})
    shift_hours  = float(cfg.get("shift_hours",  8.5))
    daily_target = int(cfg.get("daily_target",   170))
    shift_start  = cfg.get("shift_start",        "08:00")

    hourly_rate = daily_target / shift_hours if shift_hours > 0 else 0

    try:
        sh, sm          = [int(x) for x in shift_start.split(":")]
        shift_start_min = sh * 60 + sm
        now_min         = now.hour * 60 + now.minute
        elapsed_min     = max(0, now_min - shift_start_min)
        elapsed_min     = min(elapsed_min, int(shift_hours * 60))
        completed_hours = elapsed_min // 60
    except Exception:
        sh = 8; sm = 0; completed_hours = 0

    ctr_reg   = dr.get("vehicle_counter_reg", "").strip().upper()
    ctr_val   = rword(ctr_reg) if (ctr_reg and connected) else None
    today_str = now.strftime("%Y-%m-%d")
    shift_on  = (now.hour > sh) or (now.hour == sh and now.minute >= sm)
    cur_h     = now.hour

    if ctr_val is not None:
        _ctr["last_val"] = ctr_val
        if _ctr["shift_date"] != today_str and shift_on:
            _ctr["shift_date"]      = today_str
            _ctr["shift_start_val"] = ctr_val
            _ctr["hour_snap"]       = {cur_h: ctr_val}
        if cur_h not in _ctr["hour_snap"]:
            _ctr["hour_snap"][cur_h] = ctr_val

    use_val = ctr_val if ctr_val is not None else (_ctr["last_val"] or 0)
    ss_snap = _ctr["shift_start_val"] if _ctr["shift_start_val"] is not None else use_val
    h_snap  = _ctr["hour_snap"].get(cur_h, use_val)

    if ctr_reg:
        ch_actual  = max(0, use_val - h_snap)
        tlh_actual = max(0, h_snap  - ss_snap)
        fd_actual  = max(0, use_val - ss_snap)
    else:
        ch_actual  = rword(dr.get("current_hour",   {}).get("actual", "D0"))
        tlh_actual = rword(dr.get("till_last_hour", {}).get("actual", "D0"))
        fd_actual  = rword(dr.get("for_day",        {}).get("actual", "D0"))

    ch_plan  = int(dr.get("current_hour",  {}).get("plan_value", round(hourly_rate)))
    fd_plan  = int(dr.get("for_day",       {}).get("plan_value", daily_target))
    tlh_cfg  = dr.get("till_last_hour", {})
    if tlh_cfg.get("auto_till", True):
        tlh_plan = round(hourly_rate * completed_hours)
    else:
        tlh_plan = int(tlh_cfg.get("plan_value", 0))

    dropping = {
        "current_hour": {
            "plan":   ch_plan,
            "actual": ch_actual,
        },
        "till_last_hour": {
            "plan":            tlh_plan,
            "actual":          tlh_actual,
            "auto_till":       tlh_cfg.get("auto_till", True),
            "completed_hours": completed_hours,
        },
        "for_day": {
            "plan":   fd_plan,
            "actual": fd_actual,
        },
        "counter_val":     use_val,
        "counter_reg":     ctr_reg,
        "shift_start_val": ss_snap,
        "hour_start_val":  h_snap,
    }

    # ── KPIs ──────────────────────────────────────────────────────────────
    oee          = rword(cfg.get("reg_oee",          "D0"))
    availability = rword(cfg.get("reg_availability", "D0"))
    performance  = rword(cfg.get("reg_performance",  "D0"))
    drr1         = rword(cfg.get("reg_drr1",         "D0"))

    return jsonify({
        "success":         True,
        "connected":       connected,
        "line_running":    line_running,
        "stopped_station": stopped_station,
        "any_btn_active":  any_btn_active,
        "eol_triggered":   eol_triggered,
        "eol_enabled":     eol_enabled,
        "eol_val":         eol_val,
        "date":            ts,
        "time":            tm,
        "stations":        stations,
        "reason_times":    reason_times,
        "total_stop":      {"hr": total_hr, "min": total_rem},
        "dropping":        dropping,
        "oee":             oee,
        "availability":    availability,
        "performance":     performance,
        "drr1":            drr1,
        "kpi_enabled":     cfg.get("kpi_enabled", {}),
        "line_name":       cfg.get("line_name", "LINE 1"),
        "marquee_text":    cfg.get("marquee_text", "WELCOME TO LINE 1"),
        "buttons":         cfg.get("buttons", []),
    })