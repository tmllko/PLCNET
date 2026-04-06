# PLC Network Monitor v1 (PLCNET)
Advanced Industrial Technology & Digital Action Plan for Mitsubishi PLC Networks (MC Protocol)

## Overview
PLCNET is a full-featured industrial web dashboard designed to poll, monitor, and log data across multiple Mitsubishi PLCs. Built with a Flask backend and a modern vanilla-JS frontend, the system relies on `pymcprotocol` to directly interface with PLCs over TCP/IP seamlessly.

### Core Features
- **Multi-Device Support:** Add, edit, and monitor an entire network of PLCs dynamically via the UI without touching source code.
- **Auto-Switching Architecture:** Dynamically format inputs/outputs (X/Y) depending on the configuration: Hexadecimal (Q/L/iQ-R Series) or Octal (FX Series) addressing natively supported.
- **Live Line Board & Action Plan:** Designed for big-screen TVs on the shop floor. Features a live station button matrix, stoppage reason time tracking, OEE/Availability KPIs, dynamic marquee ribbons, and production dropping charts.
- **Smart Data Logging:** Includes a dedicated subsystem that utilizes a high-speed small auto-scan buffer for extreme speed polling, while cleanly handling "on-demand" targeted reads for arbitrary register addresses outside the buffer. Export to Excel.
- **Direct Read/Write:** Write bits or words directly into any networked PLC via the UI.
- **Excel Exports:** Stop and save historical log records natively into a managed `.xlsx` file repository natively on the server.

## Project Structure
```text
plc_v2/
├── run.py                   ← Start the server: python run.py
├── requirements.txt         ← Python dependencies (.venv setup)
│
├── app/                     ← Flask application package
│   ├── __init__.py          ← App factory & SocketIO instance
│   ├── config.py            ← Fallback global configs
│   ├── state.py             ← Shared thread-safe runtime state
│   ├── core/                ← Core processing logic (logger, alerts, excel)
│   ├── plc/                 ← Thread-safe smart polling scripts & connection wrappers
│   ├── api/                 ← REST hooks for lineboard, loggers, I/O mapping, alarms
│   └── sockets/             ← Real-time WebSocket emitter
│
└── static/                  ← Frontend UI
    ├── index.html           ← Single-page application template
    ├── css/style.css        ← Cyber-industrial CSS stylesheet
    └── js/                  ← Modular logic handlers
```

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start Application (Uses Port 5000 by default)
python run.py

# 3. Access Dashboard
http://localhost:5000
```

## UI Tabs & Modules
1. **MONITOR:** High-level network topology layout showing connected status, heartbeats, and raw base I/O maps for all configured PLCs. Add new PLCs here.
2. **I/O MAP:** Comprehensive memory map grid. Supports X, Y, M, and D arrays with real-time toggle visualizer.
3. **READ/WRITE:** Direct console for manual override values into integer words or forcing bits perfectly formatted per PLC connection.
4. **ALARMS:** Background alarm monitoring triggers warning tags on out-of-spec registers.
5. **DATA LOGGER:** Dynamic background logger supporting targeted array tracking. Export to `.xlsx`. 
6. **LINE CONFIG:** Builder logic allowing you to map PLC register arrays into a visual representation of a multi-station production line.
7. **LINE BOARD:** Kiosk-ready high visibility screen rendering active stoppages, shift total duration tracking, dropping limits, and scrolling marquees.
