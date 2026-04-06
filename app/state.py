"""
Shared In-Memory State
========================
Single source of truth for live data shared between the poller,
API routes, and WebSocket events.
"""

# Live PLC status snapshots  { plc_id: status_dict }
plc_states: dict = {}

# Live I/O data             { plc_id: {\"X\":[], \"Y\":[], \"M\":[], \"D\":[]} }
io_states: dict = {}

# Logging configuration     { plc_id: [items...] }
log_config: dict = {}

# Accumulated log records   [ {...}, ... ]
log_records: list = []

# Currently active alarms   [ {...}, ... ]
active_alarms: list = []

# Trend history ref (populated by api.trends module)
# { "plc_id:device": [{ts, value}, ...] }
trend_history: dict = {}
