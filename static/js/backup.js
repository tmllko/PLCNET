/**
 * backup.js — GX Works-style full device memory backup UI.
 *
 * Features:
 *  - Per-PLC animated progress during backup
 *  - Summary card after backup (non-zero counts per device)
 *  - Saved backup file list with JSON + Excel download links
 *  - Restore from backup file
 */

// ── Table rows ─────────────────────────────────────────────────────────────
function renderBakTable() {
  const tbody = document.getElementById('bakTbody');
  tbody.innerHTML = '';

  plcData.forEach(plc => {
    const sc = plc.status === 'error' ? 'error' : plc.status;
    const tr = document.createElement('tr');
    tr.id = `bakRow-${plc.id}`;
    tr.innerHTML = `
      <td><input type="checkbox" class="plc-cb" data-id="${plc.id}" style="accent-color:var(--accent)"></td>
      <td>
        <div style="font-weight:700;font-family:'Rajdhani',sans-serif;letter-spacing:1px">${plc.name}</div>
        <div style="font-size:10px;color:var(--muted2);font-family:'Share Tech Mono',monospace">${plc.location || ''}</div>
      </td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--muted2)">${plc.model || '—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:11px">${plc.ip}</td>
      <td><div class="bdg ${sc}" style="display:inline-block">${sc === 'online' ? 'RUN' : 'FAULT'}</div></td>
      <td>
        <button class="bmb do" id="bakBtn-${plc.id}" onclick="backupOne(${plc.id})">⬇ Full Backup</button>
        <div id="bakStatus-${plc.id}" style="margin-top:5px;display:none"></div>
        <div class="bprog" id="bp-${plc.id}">
          <div class="bpf" id="bf-${plc.id}"></div>
        </div>
        <div id="bakResult-${plc.id}" style="margin-top:6px"></div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Load saved backups list
  loadBackupList();
}

// ── Run a full backup for one PLC ──────────────────────────────────────────
async function backupOne(id) {
  const bar    = document.getElementById(`bp-${id}`);
  const fill   = document.getElementById(`bf-${id}`);
  const btn    = document.getElementById(`bakBtn-${id}`);
  const status = document.getElementById(`bakStatus-${id}`);
  const result = document.getElementById(`bakResult-${id}`);

  btn.disabled    = true;
  btn.textContent = '⟳ Reading…';
  bar.style.display  = 'block';
  status.style.display = 'block';
  result.innerHTML = '';

  // Animated indeterminate progress bar
  let width = 0;
  const steps = [
    'Reading D registers (8000 words)…',
    'Reading TN/CN (timers & counters)…',
    'Reading M relays (8192 bits)…',
    'Reading L/F/SM relays…',
    'Generating Excel report…',
    'Saving backup…',
  ];
  let stepIdx = 0;
  const interval = setInterval(() => {
    width = Math.min(width + Math.random() * 4 + 2, 90);
    fill.style.width = width + '%';
    if (stepIdx < steps.length - 1 && width > (stepIdx + 1) * 15) {
      stepIdx++;
      status.innerHTML = `<span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted2)">${steps[stepIdx]}</span>`;
    }
  }, 250);

  status.innerHTML = `<span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--muted2)">${steps[0]}</span>`;

  try {
    const res  = await fetch(`${API}/backup/${id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    const data = await res.json();

    clearInterval(interval);
    fill.style.width = '100%';
    fill.style.background = data.success ? 'var(--run)' : 'var(--fault)';
    setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; fill.style.background = ''; }, 1500);
    status.style.display = 'none';
    btn.disabled    = false;
    btn.textContent = '⬇ Full Backup';

    if (data.success) {
      const s   = data.summary;
      const pct = Math.round(s.non_zero / s.total_points * 100);

      // Build per-device stats
      const devRows = Object.entries(s.by_device).map(([dev, info]) =>
        `<div class="bak-dev-row">
          <span class="bak-dev-name">${dev}</span>
          <span class="bak-dev-bar-wrap">
            <span class="bak-dev-bar" style="width:${info.count > 0 ? Math.round(info.non_zero / info.count * 100) : 0}%"></span>
          </span>
          <span class="bak-dev-val">${info.non_zero.toLocaleString()} / ${info.count.toLocaleString()}</span>
        </div>`
      ).join('');

      result.innerHTML = `
        <div class="bak-result-card">
          <div class="brc-title">✓ Backup Complete — ${data.duration_ms}ms</div>
          <div class="brc-stat">${s.total_points.toLocaleString()} points  ·  ${s.non_zero.toLocaleString()} non-zero (${pct}%)</div>
          <div class="brc-devices">${devRows}</div>
          <div class="brc-links">
            <a class="brc-dl json" href="${API}/backup/download/${data.json_file}" download>
              ⬇ JSON  <span>${data.json_size}</span>
            </a>
            ${data.excel_file ? `<a class="brc-dl xls" href="${API}/backup/excel/${data.excel_file}" download>
              ⬇ Excel  <span>${data.excel_size}</span>
            </a>` : ''}
          </div>
        </div>
      `;

      showToast(`✓ ${plcData.find(p => p.id === id)?.name} — backup complete`);
      addEvent('ok', `Full backup: ${s.total_points.toLocaleString()} pts · ${s.non_zero} non-zero · ${data.duration_ms}ms`);
      loadBackupList();

    } else {
      result.innerHTML = `<div style="color:var(--fault);font-family:'Share Tech Mono',monospace;font-size:10px;">✕ ${data.error}</div>`;
      showToast(`✕ Backup failed: ${data.error}`);
    }

  } catch (e) {
    clearInterval(interval);
    bar.style.display = 'none';
    status.style.display = 'none';
    btn.disabled    = false;
    btn.textContent = '⬇ Full Backup';
    result.innerHTML = `<div style="color:var(--fault);font-family:'Share Tech Mono',monospace;font-size:10px;">✕ Backend offline</div>`;
    showToast('✕ Backend offline');
  }
}

/** Backup every PLC with 2s stagger. */
function bakAll() {
  plcData.forEach((plc, i) => setTimeout(() => backupOne(plc.id), i * 2000));
}

/** Backup only checked PLCs. */
function bakSelected() {
  const checked = [...document.querySelectorAll('.plc-cb:checked')];
  if (!checked.length) { showToast('⚠ Select PLC stations first'); return; }
  checked.forEach((cb, i) => setTimeout(() => backupOne(+cb.dataset.id), i * 2000));
}

function toggleAll(masterCb) {
  document.querySelectorAll('.plc-cb').forEach(cb => cb.checked = masterCb.checked);
}

// ── Saved backup file list ─────────────────────────────────────────────────
async function loadBackupList() {
  try {
    const res  = await fetch(`${API}/backup/list`);
    const data = await res.json();
    if (!data.success) return;

    const container = document.getElementById('bakFileList');
    if (!container) return;

    const files = data.files;
    if (!files.length) {
      container.innerHTML = '<div style="color:var(--muted2);font-family:\'Share Tech Mono\',monospace;font-size:10px;padding:10px">No backups saved yet</div>';
      return;
    }

    // Group: show JSON files (each has a paired .xlsx)
    const jsons = files.filter(f => f.type === 'json');
    container.innerHTML = jsons.map(f => {
      const xlsName = f.filename.replace('.json', '.xlsx');
      const hasXls  = files.some(x => x.filename === xlsName);
      const dt      = f.modified.slice(0, 19).replace('T', ' ');
      const nameParts = f.filename.replace('backup_', '').replace('.json', '').split('_');
      const plcName   = nameParts.slice(0, -2).join('_');
      const dateStr   = nameParts.slice(-2).join(' ').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

      return `
        <div class="bfl-row">
          <div class="bfl-icon">💾</div>
          <div class="bfl-info">
            <div class="bfl-name">${plcName}</div>
            <div class="bfl-date">${dateStr}  ·  ${f.size}</div>
          </div>
          <div class="bfl-acts">
            <a class="bfl-btn j" href="${API}/backup/download/${f.filename}" download>JSON</a>
            ${hasXls ? `<a class="bfl-btn x" href="${API}/backup/excel/${xlsName}" download>Excel</a>` : ''}
            <button class="bfl-btn j" onclick="emailBackupFile('${f.filename}')" style="cursor:pointer;background:none">📤 Email</button>
          </div>
        </div>
      `;
    }).join('');

  } catch { /* silent */ }
}
