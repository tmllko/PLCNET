"""
Warning / Alarm Checker
========================
Evaluates each configured logging point against its threshold
and updates the shared active_alarms list.
"""

from datetime import datetime
from app import state


def _resolve_value(device: str, dtype: str, io: dict):
    """
    Extract the live value for a given device from the I/O snapshot.
    Returns None if the index is out of range.
    """
    if dtype == "word":
        idx = int("".join(filter(str.isdigit, device)) or 0)
        d_arr = io.get("D", [])
        return d_arr[idx] if idx < len(d_arr) else None

    # bit type: X / Y (hex address) or M (decimal address)
    prefix = device[0]
    rest = device[1:]
    idx = int(rest, 16) if prefix in ("X", "Y") else int(rest)
    arr = io.get(prefix, [])
    return arr[idx] if idx < len(arr) else None


def _word_alarm(plc_id, device, label, value, item) -> dict | None:
    """Check min/max thresholds for a word (D-register) item."""
    mn = item.get("min")
    mx = item.get("max")

    if mn is not None and value < mn:
        msg = f"{label} ({device})={value} BELOW min {mn}"
    elif mx is not None and value > mx:
        msg = f"{label} ({device})={value} ABOVE max {mx}"
    else:
        return None

    return {
        "plc_id":    plc_id,
        "device":    device,
        "label":     label,
        "value":     value,
        "message":   msg,
        "severity":  "error",
        "timestamp": datetime.now().isoformat(),
    }


def _bit_alarm(plc_id, device, label, value, item) -> dict | None:
    """Check expected-state for a bit (M/X/Y) item."""
    expected = item.get("expected")
    if expected is None or value == expected:
        return None

    actual_str   = "ON" if value    else "OFF"
    expected_str = "ON" if expected else "OFF"
    return {
        "plc_id":    plc_id,
        "device":    device,
        "label":     label,
        "value":     value,
        "message":   f"{label} ({device})={actual_str} expected {expected_str}",
        "severity":  "warning",
        "timestamp": datetime.now().isoformat(),
    }


def check_warnings(plc_id: int, io: dict) -> list:
    """
    Evaluate threshold rules for every configured logging point on `plc_id`.
    Updates state.active_alarms and returns the list of new alarms.
    """
    items = state.log_config.get(plc_id, [])
    new_alarms = []

    for item in items:
        device = item["device"]
        dtype  = item["type"]
        label  = item.get("label", device)

        value = _resolve_value(device, dtype, io)
        if value is None:
            continue

        alarm = (
            _word_alarm(plc_id, device, label, value, item)
            if dtype == "word"
            else _bit_alarm(plc_id, device, label, value, item)
        )
        if alarm:
            new_alarms.append(alarm)

    # Replace this PLC's alarms with the latest batch
    state.active_alarms = [a for a in state.active_alarms if a["plc_id"] != plc_id]
    state.active_alarms.extend(new_alarms)

    return new_alarms
