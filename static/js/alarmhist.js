/**
 * alarmhist.js — Alarm History Viewer page.
 *
 * Features:
 *  - Full alarm history table with severity color coding
 *  - Filter by severity / ack status / PLC
 *  - Acknowledge individual or all alarms
 *  - Export to Excel
 *  - Live unacked count badge
 */

let alarmHistData = [];

// ── Fetch alarm history ──────────────────────────────────────────────────────
async function fetchAlarmHistory() {
  try {
    const sev   = document.getElementById('ahSevFilter')?.value  || '';
    const acked = document.getElementById('ahAckFilter')?.value  || '';
    const plc   = document.getElementById('ahPlcFilter')?.value  || '';
    const params = new URLSearchParams({ limit: 300 });
    if (sev)   params.set('severity', sev);
    if (acked) params.set('acked', acked);
    if (plc)   params.set('plc', plc);

    const res  = await fetch(`${API}/alarms/history?${params}`);
    const data = await res.json();
    if (data.success) {
      alarmHistData = data.alarms;
      renderAlarmHistory(data);
      // Update badge
      const badge = document.getElementById('ahUnackedBadge');
      if (badge) {
        badge.textContent   = data.unacked > 0 ? data.unacked : '';
        badge.style.display = data.unacked > 0 ? 'inline-flex' : 'none';
      }
    }
  } catch { /* silent */ }
}

// ── Render alarm history table ───────────────────────────────────────────────
function renderAlarmHistory(data) {
  const tbody = document.getElementById('ahTbody');
  const info  = document.getElementById('ahInfo');
  if (!tbody) return;

  if (info) info.textContent = `${data.total} total · ${data.unacked} unacknowledged`;

  if (!alarmHistData.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted2);padding:32px;font-family:'Share Tech Mono',monospace;font-size:11px">
      No alarm records — system is operating normally
    </td></tr>`;
    return;
  }

  tbody.innerHTML = alarmHistData.map(a => {
    const sevClass = a.severity === 'fault'   ? 'sev-fault'
                   : a.severity === 'warning' ? 'sev-warn'
                   : 'sev-ok';
    const ackHtml = a.acked
      ? `<span class="ah-acked">✓ ACK ${(a.ts_acked || '').slice(11, 19)}</span>`
      : `<button class="ah-ack-btn" onclick="ackAlarm('${a.id}')">ACK</button>`;

    return `<tr class="${a.acked ? 'ah-row-acked' : 'ah-row-active'}">
      <td style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted2)">${(a.ts_raised || '').slice(0,19).replace('T',' ')}</td>
      <td><span class="ah-plc">${a.plc_name}</span></td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--accent)">${a.device}</td>
      <td style="max-width:260px">${a.message}</td>
      <td><span class="ah-sev ${sevClass}">${(a.severity || 'warn').toUpperCase()}</span></td>
      <td>${ackHtml}</td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted2)">${a.id}</td>
    </tr>`;
  }).join('');
}

// ── Acknowledge actions ──────────────────────────────────────────────────────
async function ackAlarm(id) {
  await fetch(`${API}/alarms/acknowledge/${id}`, { method: 'POST' });
  showToast('✓ Alarm acknowledged');
  fetchAlarmHistory();
}

async function ackAllAlarms() {
  const res  = await fetch(`${API}/alarms/acknowledge/all`, { method: 'POST' });
  const data = await res.json();
  showToast(`✓ Acknowledged ${data.acknowledged} alarms`);
  fetchAlarmHistory();
}

async function clearAlarmHistory() {
  if (!confirm('Clear all alarm history? This cannot be undone.')) return;
  await fetch(`${API}/alarms/clear`, { method: 'POST' });
  alarmHistData = [];
  fetchAlarmHistory();
  showToast('Alarm history cleared');
}

async function exportAlarmHistory() {
  showToast('⬇ Generating Excel report…');
  window.location.href = `${API}/alarms/export`;
}

// ── Populate PLC filter dropdown ─────────────────────────────────────────────
function populateAlarmPlcFilter() {
  const sel = document.getElementById('ahPlcFilter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All PLCs</option>';
  plcData.forEach(p => {
    const o = document.createElement('option');
    o.value = p.name; o.textContent = p.name;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

// Record alarm to server (called from socket/poller layer)
async function recordAlarmEvent(plcId, plcName, device, message, severity = 'warning') {
  // Pushed via the existing active_alarms state; also POST to history
  try {
    await fetch(`${API}/alarms/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plc_id: plcId, plc_name: plcName, device, message, severity }),
    });
  } catch { /* silent */ }
}
