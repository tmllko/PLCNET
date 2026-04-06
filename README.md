# PLC Network Monitor v1
Advanced Industrial HMI for Mitsubishi PLC Networks (MC Protocol)

## Project Structure
```text
plc_v1/
├── run.py                   ← Start the server: python run.py
├── requirements.txt         ← Python dependencies
│
├── app/                     ← Flask application package
│   ├── __init__.py          ← App factory (create_app) + SocketIO instance
│   ├── config.py            ← PLC network config
│   ├── state.py             ← Shared in-memory state
│   │
│   ├── api/                 ← REST API blueprints
│   │   ├── plcs.py          ← PLC CRUD and status
│   │   ├── io.py            ← I/O mapping
│   │   ├── logging.py       ← Data logging
│   │   ├── backup.py        ← Memory backup
│   │   └── static.py        ← Serves index.html
│   │
│   └── sockets/             ← WebSocket events
│       └── events.py        ← on_connect, on_write_register handlers
│
└── static/                  ← Frontend SPA
    ├── index.html           ← Main HMI structure
    ├── css/
    │   └── style.css        ← CyberIndustrial V1 styles
    └── js/
        ├── app.js           ← Bootstrap + shared state
        ├── monitor.js       ← PLC cards
        └── ...              ← Module specific logic
``````

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Edit PLC IPs in app/config.py

# 3. Run
python run.py

# 4. Open browser
http://localhost:5000
```

## Key Configuration

Edit **`app/config.py`** to match your network:

| Setting | Description |
|---|---|
| `PLC_CONFIG` | List of PLCs with IP, port, model, location |
| `IO_SCAN` | Number of X/Y/M/D points to auto-scan |
| `POLL_INTERVAL` | Seconds between full polls (default: 2) |

## API Reference

| Method | URL | Description |
|---|---|---|
| GET | `/api/plcs` | All PLC status snapshots |
| GET | `/api/status` | Summary counts |
| GET | `/api/io/<id>` | Raw I/O for one PLC |
| GET | `/api/alarms` | Active alarms |
| POST | `/api/plcs/<id>/read` | On-demand register read |
| POST | `/api/plcs/<id>/write` | Register write |
| GET/POST | `/api/log/config` | Logging configuration |
| GET | `/api/log/records` | Recent log records |
| GET | `/api/log/export` | Download Excel report |
| POST | `/api/backup/<id>` | Snapshot D+M registers to JSON |

## WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `plc_update` | Server → Client | Full data push every poll cycle |
| `write_register` | Client → Server | Write a value to a PLC register |
| `write_result` | Server → Client | Confirmation of write operation |
