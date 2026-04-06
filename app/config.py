"""
PLC Hardware Configuration
===========================
Edit PLC_CONFIG to match your real network.
"""

import os
import json

# ── PLC DEFINITIONS ────────────────────────────────────────────────────────
CONFIG_PATH = os.path.join(os.getcwd(), "plcs.json")
if os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "r") as f:
        PLC_CONFIG = json.load(f)
else:
    PLC_CONFIG = [
        {"id": 1, "name": "PLC-LINE-01",  "ip": "192.168.1.10", "port": 5001, "location": "Assembly Line 1",  "model": "Q06HCPU"},
        {"id": 2, "name": "PLC-LINE-02",  "ip": "192.168.1.11", "port": 5001, "location": "Assembly Line 2",  "model": "QJ71E71-100"},
        {"id": 3, "name": "PLC-PACK-01",  "ip": "192.168.1.20", "port": 5001, "location": "Packaging",        "model": "Q03UDECPU"},
        {"id": 4, "name": "PLC-WELD-01",  "ip": "192.168.1.30", "port": 5001, "location": "Welding Cell A",   "model": "Q06UDEHCPU"},
        {"id": 5, "name": "PLC-CONV-01",  "ip": "192.168.1.40", "port": 5001, "location": "Conveyor",         "model": "FX5U-32MT"},
        {"id": 6, "name": "PLC-HVAC-01",  "ip": "192.168.1.50", "port": 5001, "location": "HVAC Control",     "model": "L02SCPU"},
        {"id": 7, "name": "PLC-ROBOT-01", "ip": "192.168.1.60", "port": 5001, "location": "Robot Cell B",     "model": "iQ-R R16CPU"},
        {"id": 8, "name": "PLC-INSP-01",  "ip": "192.168.1.70", "port": 5001, "location": "Inspection",       "model": "FX5U-80MT"},
    ]

# ── SCAN SETTINGS ──────────────────────────────────────────────────────────
# How many points to read per register type in auto-scan
IO_SCAN = {
    "X": 40,   # Input bits
    "Y": 32,   # Output bits
    "M": 64,   # Internal relays
    "D": 20,   # Data registers (words)
}

# Poll interval in seconds
POLL_INTERVAL = 2
