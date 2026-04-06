"""
I/O Logger
===========
On every poll cycle `log_tick()` appends a record for each
configured device to state.log_records.

FIXES APPLIED:
  1. _resolve_value() now correctly handles D registers regardless of
     whether dtype is "word" or "bit" — previously a D register
     configured as "bit" would call int(rest, 16) on a decimal string,
     crash with ValueError, and silently drop the log record.
  2. Hex parsing is now wrapped in try/except so a bad address string
     returns None cleanly instead of raising an unhandled exception.
  3. Device string is stripped and uppercased before parsing so
     user input like " d100 " or "x1a" works correctly.
"""

from datetime import datetime
from app.config import PLC_CONFIG
from app import state


def _get_plc_name(plc_id: int) -> str:
    """Look up a PLC's friendly name from config."""
    return next(
        (c["name"] for c in PLC_CONFIG if c["id"] == plc_id),
        f"PLC-{plc_id}",
    )


def _resolve_value(device: str, dtype: str, io: dict, plc_id: int):
    """Return the live value for a device from the I/O snapshot, or read directly if out of bounds.

    FIX: Previously the "bit" branch used int(rest, 16) for ALL prefixes,
    which crashed on D register addresses (decimal strings) when dtype was
    accidentally set to "bit", and also crashed on M/T/C registers whose
    addresses are decimal, not hex.  Now:
      - D registers (or dtype=="word") always use decimal indexing into D[].
      - X/Y use hex address parsing (Mitsubishi convention).
      - M/T/C and all other prefixes use decimal address parsing.
      - Any parse error returns None instead of raising.
    """
    device = device.strip().upper()
    if not device:
        return None

    prefix = device[0]
    rest   = device[1:]

    # ── Word registers (D) ────────────────────────────────────────────────
    # Route by prefix OR dtype so a D register always hits this path even
    # if the user misconfigured dtype as "bit".
    if prefix == "D" or dtype == "word":
        try:
            idx = int(rest) if rest else 0
        except ValueError:
            return None
        d_arr = io.get("D", [])
        if idx < len(d_arr):
            return d_arr[idx]
        # Out of bounds for auto-scan, read on-demand
        try:
            from app.plc.poller import connections
            conn = connections.get(plc_id)
            if conn and conn.connected:
                vals = conn.read_words(device, 1)
                return vals[0] if vals else None
        except Exception:
            return None
        return None

    # ── Bit registers ─────────────────────────────────────────────────────
    # X and Y use hexadecimal addressing on Mitsubishi PLCs.
    # M, T, C, and all others use decimal addressing.
    try:
        idx = int(rest, 16) if prefix in ("X", "Y") else int(rest)
    except ValueError:
        return None

    arr = io.get(prefix, [])
    if idx < len(arr):
        return arr[idx]
        
    # Out of bounds for auto-scan, read on-demand
    try:
        from app.plc.poller import connections
        conn = connections.get(plc_id)
        if conn and conn.connected:
            vals = conn.read_bits(device, 1)
            return vals[0] if vals else None
    except Exception:
        pass
    return None


def _check_warning_text(value, dtype: str, item: dict) -> str:
    """Return a warning string if the value breaches thresholds, else ''."""
    if dtype == "word":
        mn = item.get("min")
        mx = item.get("max")
        if mn is not None and value < mn:
            return f"BELOW MIN ({mn})"
        if mx is not None and value > mx:
            return f"ABOVE MAX ({mx})"
    else:
        expected = item.get("expected")
        if expected is not None and value != expected:
            state_str = "ON" if value else "OFF"
            return f"UNEXPECTED ({state_str})"
    return ""


def log_tick():
    """
    Called once per poll cycle.
    Appends one record per configured device to state.log_records.
    """
    timestamp = datetime.now().isoformat()

    for plc_id, items in state.log_config.items():
        io       = state.io_states.get(plc_id, {})
        plc_name = _get_plc_name(plc_id)

        for item in items:
            device = item["device"]
            dtype  = item["type"]
            label  = item.get("label", device)

            value = _resolve_value(device, dtype, io, plc_id)
            if value is None:
                continue

            warning = _check_warning_text(value, dtype, item)

            state.log_records.append({
                "timestamp": timestamp,
                "plc_id":    plc_id,
                "plc_name":  plc_name,
                "device":    device,
                "label":     label,
                "type":      dtype,
                "value":     value,
                "warning":   warning,
            })