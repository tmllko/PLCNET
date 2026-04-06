/**
 * emailcfg.js — Email Report Configuration & Sending page.
 */

let emailCfg = {};

// ── Load email config from server ────────────────────────────────────────────
async function fetchEmailConfig() {
  try {
    const res  = await fetch(`${API}/email/config`);
    const data = await res.json();
    if (data.success) {
      emailCfg = data.config;
      populateEmailForm(emailCfg);
    }
  } catch { /* silent */ }
}

function populateEmailForm(cfg) {
  _setVal('emailSmtpHost',  cfg.smtp_host    || '');
  _setVal('emailSmtpPort',  cfg.smtp_port    || 587);
  _setVal('emailUsername',  cfg.username     || '');
  _setVal('emailFromName',  cfg.from_name    || '');
  _setVal('emailSubjPfx',   cfg.subject_prefix || '[PLC-NET]');
  _setVal('emailRecipients',Array.isArray(cfg.recipients) ? cfg.recipients.join(', ') : '');

  const tlsChk = document.getElementById('emailUseTls');
  if (tlsChk) tlsChk.checked = !!cfg.use_tls;
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ── Save config ──────────────────────────────────────────────────────────────
async function saveEmailConfig() {
  const body = {
    smtp_host:      document.getElementById('emailSmtpHost')?.value.trim(),
    smtp_port:      +document.getElementById('emailSmtpPort')?.value,
    use_tls:        !!document.getElementById('emailUseTls')?.checked,
    username:       document.getElementById('emailUsername')?.value.trim(),
    from_name:      document.getElementById('emailFromName')?.value.trim(),
    subject_prefix: document.getElementById('emailSubjPfx')?.value.trim(),
    recipients:     (document.getElementById('emailRecipients')?.value || '')
                      .split(',').map(s => s.trim()).filter(Boolean),
  };

  const pw = document.getElementById('emailPassword')?.value;
  if (pw) body.password = pw;

  const res  = await fetch(`${API}/email/config`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  showToast(data.success ? '✓ Email config saved' : `Error: ${data.error}`);
  if (data.success) fetchEmailConfig();
}

// ── Test email ───────────────────────────────────────────────────────────────
async function sendTestEmail() {
  const btn = document.getElementById('emailTestBtn');
  if (btn) btn.disabled = true;
  showToast('📨 Sending test email…');
  try {
    const res  = await fetch(`${API}/email/test`, { method: 'POST' });
    const data = await res.json();
    showToast(data.success ? '✅ Test email sent! Check your inbox.' : `❌ ${data.error}`);
    _setEmailStatus(data.success ? 'ok' : 'err', data.success ? data.message : data.error);
  } catch (e) {
    showToast(`❌ ${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Send backup report via email ─────────────────────────────────────────────
async function emailBackupFile(filename) {
  showToast('📨 Sending backup email…');
  const res  = await fetch(`${API}/email/send_backup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ filename }),
  });
  const data = await res.json();
  showToast(data.success ? `✅ Email sent (${data.files_sent} file${data.files_sent > 1 ? 's' : ''})` : `❌ ${data.error}`);
}

// ── Send log report via email ─────────────────────────────────────────────────
async function emailLogReport() {
  showToast('📨 Generating & sending log email…');
  const res  = await fetch(`${API}/email/send_log`, { method: 'POST' });
  const data = await res.json();
  showToast(data.success ? `✅ Log report emailed (${data.filename})` : `❌ ${data.error}`);
}

function _setEmailStatus(type, msg) {
  const el = document.getElementById('emailStatus');
  if (!el) return;
  el.textContent  = msg;
  el.className    = 'email-status email-status-' + type;
  el.style.display = 'block';
}
