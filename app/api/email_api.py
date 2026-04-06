"""
API — Email Reports
=====================
Sends backup files or log reports as email attachments via SMTP.

Routes:
  GET  /api/email/config        → get current SMTP config (passwords masked)
  POST /api/email/config        → save SMTP config
  POST /api/email/test          → send a test email
  POST /api/email/send_backup   → email a specific backup file
  POST /api/email/send_log      → generate & email latest log report
"""

import os
import json
import smtplib
import ssl
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text       import MIMEText
from email.mime.base       import MIMEBase
from email                 import encoders

from flask import Blueprint, jsonify, request

bp = Blueprint("email", __name__, url_prefix="/api/email")

_CFG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "email_config.json"
)
_BACKUPS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "backups"
)
_LOGS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "logs"
)

_DEFAULT_CFG = {
    "smtp_host":   "smtp.gmail.com",
    "smtp_port":   587,
    "use_tls":     True,
    "username":    "",
    "password":    "",
    "from_name":   "PLC Monitor v1",
    "recipients":  [],
    "subject_prefix": "[PLC-NET]",
}


def _load_cfg() -> dict:
    if os.path.exists(_CFG_FILE):
        with open(_CFG_FILE) as f:
            return {**_DEFAULT_CFG, **json.load(f)}
    return dict(_DEFAULT_CFG)


def _save_cfg(cfg: dict):
    with open(_CFG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def _send(cfg: dict, subject: str, body_html: str, attachments: list[str] = None):
    """Core send function. attachments = list of absolute file paths."""
    if not cfg["username"] or not cfg["recipients"]:
        raise ValueError("SMTP username and at least one recipient are required.")

    msg = MIMEMultipart("mixed")
    msg["From"]    = f"{cfg['from_name']} <{cfg['username']}>"
    msg["To"]      = ", ".join(cfg["recipients"])
    msg["Subject"] = f"{cfg['subject_prefix']} {subject}"

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_html, "html"))
    msg.attach(alt)

    for fpath in (attachments or []):
        if not os.path.exists(fpath):
            continue
        with open(fpath, "rb") as fh:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(fh.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{os.path.basename(fpath)}"')
        msg.attach(part)

    ctx = ssl.create_default_context()
    with smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"]) as server:
        if cfg["use_tls"]:
            server.starttls(context=ctx)
        server.login(cfg["username"], cfg["password"])
        server.sendmail(cfg["username"], cfg["recipients"], msg.as_string())


def _html_body(title: str, rows: list[tuple]) -> str:
    row_html = "".join(
        f'<tr><td style="padding:6px 12px;color:#00bcd4;font-weight:bold">{k}</td>'
        f'<td style="padding:6px 12px;color:#c8ddf0">{v}</td></tr>'
        for k, v in rows
    )
    return f"""
    <html><body style="background:#04070b;color:#c8ddf0;font-family:Calibri,sans-serif;padding:24px">
      <div style="max-width:600px;margin:auto;border:1px solid #1a2d42;padding:24px;background:#0c1520">
        <h2 style="color:#00bcd4;margin-top:0;font-size:18px">{title}</h2>
        <table style="width:100%;border-collapse:collapse">
          {row_html}
        </table>
        <p style="color:#4a6880;font-size:11px;margin-top:24px;border-top:1px solid #1a2d42;padding-top:12px">
          Sent by <strong>PLC Network Monitor v1</strong> — Tata Motors &bull; {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
        </p>
      </div>
    </body></html>
    """


# ── Routes ────────────────────────────────────────────────────────────────────

@bp.get("/config")
def get_config():
    cfg = _load_cfg()
    safe = dict(cfg)
    safe["password"] = "●●●●●●" if cfg["password"] else ""
    return jsonify({"success": True, "config": safe})


@bp.post("/config")
def save_config():
    body = request.json or {}
    cfg  = _load_cfg()
    for k in ["smtp_host", "smtp_port", "use_tls", "username", "from_name", "recipients", "subject_prefix"]:
        if k in body:
            cfg[k] = body[k]
    if body.get("password") and not body["password"].startswith("●"):
        cfg["password"] = body["password"]
    _save_cfg(cfg)
    return jsonify({"success": True})


@bp.post("/test")
def test_email():
    cfg = _load_cfg()
    try:
        _send(cfg, "Test Email — PLC Monitor v1",
              _html_body("✅ SMTP Test Successful",
                         [("Status", "Connection OK"), ("Time", datetime.now().isoformat(timespec="seconds")),
                          ("Server", f"{cfg['smtp_host']}:{cfg['smtp_port']}")]))
        return jsonify({"success": True, "message": "Test email sent successfully"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.post("/send_backup")
def send_backup():
    """Email a specific backup JSON+Excel pair."""
    body     = request.json or {}
    filename = body.get("filename", "")
    if not filename:
        return jsonify({"success": False, "error": "filename required"}), 400

    cfg   = _load_cfg()
    paths = []
    base  = filename.replace(".json", "").replace(".xlsx", "")
    for ext in [".json", ".xlsx"]:
        p = os.path.join(_BACKUPS_DIR, base + ext)
        if os.path.exists(p):
            paths.append(p)

    if not paths:
        return jsonify({"success": False, "error": "No backup files found"}), 404

    size_kb = sum(os.path.getsize(p) for p in paths) // 1024
    try:
        _send(cfg,
              f"Backup Report — {base}",
              _html_body("📦 PLC Backup Report",
                         [("Backup", base), ("Files", str(len(paths))),
                          ("Total Size", f"{size_kb} KB"), ("Sent At", datetime.now().isoformat(timespec="seconds"))]),
              paths)
        return jsonify({"success": True, "files_sent": len(paths)})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@bp.post("/send_log")
def send_log():
    """Generate a fresh Excel log and email it."""
    from app import state
    from app.core.excel import make_excel

    cfg = _load_cfg()
    if not state.log_records:
        return jsonify({"success": False, "error": "No log records to send"}), 400

    fname = f"PLC_IO_Log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    try:
        make_excel(state.log_records, fname, _LOGS_DIR)
        fpath = os.path.join(_LOGS_DIR, fname)
        _send(cfg,
              f"Data Log Report — {len(state.log_records)} records",
              _html_body("📋 PLC Data Log Report",
                         [("Records", len(state.log_records)), ("File", fname),
                          ("Generated", datetime.now().isoformat(timespec="seconds"))]),
              [fpath])
        return jsonify({"success": True, "filename": fname})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
