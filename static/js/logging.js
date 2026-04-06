/**
 * logging.js — I/O Logger config, log table, alarms, Excel export.
 */

let logCfgLocal = [];  // Locally staged logging items before saving to server
let logRecs     = [];  // Latest log records from server

// ── Toggle threshold fields based on type selection ────────────────────────
function toggleThresh() {
  const type = document.getElementById('lgType').value;
  document.getElementById('wordThresh').style.display = type === 'word' ? 'block' : 'none';
  document.getElementById('bitThresh').style.display  = type === 'bit'  ? 'block' : 'none';
}

// ── Add a device to the local staging list ─────────────────────────────────
function addLogItem() {
  const pid  = +document.getElementById('lgPlc').value;
  const dev  = document.getElementById('lgDev').value.trim().toUpperCase();
  const lbl  = document.getElementById('lgLbl').value.trim() || dev;
  const type = document.getElementById('lgType').value;

  if (!pid || !dev) { showToast('⚠ Select PLC and enter device'); return; }

  const item = { plc_id: pid, device: dev, label: lbl, type };

  if (type === 'word') {
    const mn = document.getElementById('lgMin').value;
    const mx = document.getElementById('lgMax').value;
    if (mn !== '') item.min = +mn;
    if (mx !== '') item.max = +mx;
  } else {
    const exp = document.getElementById('lgExp').value;
    if (exp !== '') item.expected = +exp;
  }

  logCfgLocal.push(item);
  renderLogItems();
  document.getElementById('lgDev').value = '';
  document.getElementById('lgLbl').value = '';
  showToast(`Added: ${lbl} (${dev})`);
}

// ── Render the staged items list ───────────────────────────────────────────
function renderLogItems() {
  const container = document.getElementById('logItems');
  if (!logCfgLocal.length) {
    container.innerHTML = '<div style="color:var(--muted2);font-size:11px;text-align:center;padding:14px">No devices configured</div>';
    return;
  }

  container.innerHTML = logCfgLocal.map((item, i) => {
    const plcName = plcData.find(p => p.id === item.plc_id)?.name || `PLC-${item.plc_id}`;
    let thresh = '';
    if (item.type === 'word') {
      if (item.min !== undefined) thresh += `min:${item.min} `;
      if (item.max !== undefined) thresh += `max:${item.max}`;
    } else {
      if (item.expected !== undefined) thresh = `expect:${item.expected ? 'ON' : 'OFF'}`;
    }
    return `<div class="log-item">
      <div class="li-head">
        <div><div class="li-dev">${item.device}</div><div class="li-lbl">${item.label}</div></div>
        <button class="li-del" onclick="removeLogItem(${i})">✕</button>
      </div>
      <div class="li-thresh">${plcName} · ${item.type.toUpperCase()}${thresh ? ' · ' + thresh : ''}</div>
    </div>`;
  }).join('');
}

function removeLogItem(index) { logCfgLocal.splice(index, 1); renderLogItems(); }
function clearLogItems()      { logCfgLocal = []; renderLogItems(); showToast('Log config cleared'); }

// ── Save staged config to server ───────────────────────────────────────────
async function saveLogConfig() {
  if (!logCfgLocal.length) { showToast('⚠ No devices to save'); return; }

  // Group by plc_id before posting
  const byPlc = {};
  logCfgLocal.forEach(item => {
    if (!byPlc[item.plc_id]) byPlc[item.plc_id] = [];
    byPlc[item.plc_id].push(item);
  });

  for (const [pid, items] of Object.entries(byPlc)) {
    await fetch(`${API}/log/config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plc_id: +pid, items }),
    });
  }

  showToast(`✓ Saved ${logCfgLocal.length} logging points`);
  addEvent('info', `Log config saved: ${logCfgLocal.length} devices`);
}

// ── Fetch and display log records ──────────────────────────────────────────
async function fetchLogRecords() {
  try {
    const res  = await fetch(`${API}/log/records?limit=200`);
    const data = await res.json();
    if (data.success) {
      logRecs = data.records;
      document.getElementById('stL').textContent = data.total;
      renderLogTable();
    }
  } catch { /* silent */ }
}

function renderLogTable() {
  const tbody = document.getElementById('logTbody');
  const count = document.getElementById('logCount');

  if (!logRecs.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted2);padding:20px;font-family:'Share Tech Mono',monospace;font-size:11px">No log records yet</td></tr>`;
    count.textContent = '0 records';
    return;
  }

  const recent = [...logRecs].reverse().slice(0, 100);
  count.textContent = `${logRecs.length} records`;

  tbody.innerHTML = recent.map(rec => {
    const hasWarn = !!rec.warning;
    const valHtml = rec.type === 'bit'
      ? (rec.value ? '<span style="color:var(--green)">ON</span>' : '<span style="color:var(--muted)">OFF</span>')
      : rec.value;

    return `<tr class="${hasWarn ? 'warn-row' : ''}">
      <td style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted2)">${rec.timestamp.slice(11,19)}</td>
      <td>${rec.plc_name}</td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--accent)">${rec.device}</td>
      <td>${rec.label}</td>
      <td>${valHtml}</td>
      <td>${hasWarn ? `<span class="wtag">⚠ ${rec.warning}</span>` : '<span class="oktag">—</span>'}</td>
      <td>${hasWarn
        ? '<span style="color:var(--orange);font-size:10px;font-weight:700">⚠ WARN</span>'
        : '<span style="color:var(--green);font-size:10px">✓ OK</span>'}</td>
    </tr>`;
  }).join('');
}

// ── Excel export & log clear ───────────────────────────────────────────────
async function exportExcel() {
  showToast('⬇ Generating Excel…');
  window.location.href = `${API}/log/export`;
  addEvent('info', 'Excel export downloaded');
}

async function stopAndSaveLogs() {
  showToast('🛑 Stopping logger & saving file...');
  try {
    const res = await fetch(`${API}/log/stop_and_save`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      logCfgLocal = [];
      renderLogItems();
      logRecs = [];
      renderLogTable();
      showToast(`✓ Saved to logs/${data.filename} and stopped logging!`);
      addEvent('info', `Logging stopped. Saved: ${data.filename}`);
    } else {
      showToast('⚠ Error: ' + data.error);
    }
  } catch (err) {
    showToast('⚠ Network Error');
  }
}

async function clearLogs() {
  await fetch(`${API}/log/clear`, { method: 'POST' });
  logRecs = [];
  renderLogTable();
  updateStats();
  showToast('Logs cleared');
}

// ── Alarm banner ───────────────────────────────────────────────────────────
function updateAlarms() {
  const banner = document.getElementById('alarmBanner');
  const list   = document.getElementById('alarmList');
  if (!alarms.length) { banner.style.display = 'none'; return; }

  banner.style.display = 'block';
  list.innerHTML = alarms.map(a => `
    <div class="alarm-row">
      <div class="aicon">⚠</div>
      <div class="alarm-msg">${a.message}</div>
      <div class="alarm-ts">${(a.timestamp || '').slice(11,19)}</div>
    </div>
  `).join('');

  alarms.forEach(a => addEvent('alarm', a.message));
}
