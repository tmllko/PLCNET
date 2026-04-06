/**
 * schedule.js — Scheduled Backup Manager page.
 *
 * Controls the server-side background scheduler that automatically
 * backs up all (or selected) PLCs on a configurable interval.
 */

let scheduleData = null;

// ── Load schedule status ─────────────────────────────────────────────────────
async function fetchSchedule() {
  try {
    const res  = await fetch(`${API}/schedule`);
    const data = await res.json();
    if (data.success) {
      scheduleData = data.schedule;
      renderSchedule();
    }
  } catch { /* silent */ }
}

// ── Render schedule panel ────────────────────────────────────────────────────
function renderSchedule() {
  const s = scheduleData;
  if (!s) return;

  // Status badge
  const badge = document.getElementById('schdBadge');
  if (badge) {
    badge.textContent  = s.enabled ? '⬤ ACTIVE' : '⬤ PAUSED';
    badge.className    = 'schd-badge ' + (s.enabled ? 'schd-active' : 'schd-paused');
  }

  // Interval input
  const inp = document.getElementById('schdInterval');
  if (inp && !inp.matches(':focus')) inp.value = s.interval_min;

  // Stats
  _setText('schdRunCount', s.run_count);
  _setText('schdLastRun',  s.last_run ? s.last_run.replace('T', ' ') : '—');
  _setText('schdNextRun',  s.next_run ? s.next_run.replace('T', ' ') : '—');

  // Toggle button text
  const btn = document.getElementById('schdToggleBtn');
  if (btn) {
    btn.textContent = s.enabled ? '⏸  PAUSE Scheduler' : '▶  ENABLE Scheduler';
    btn.className   = 'schd-btn ' + (s.enabled ? 'schd-btn-pause' : 'schd-btn-enable');
  }

  // Last result
  const res = document.getElementById('schdLastResult');
  if (res && s.last_result) {
    if (s.last_result.error) {
      res.innerHTML = `<span style="color:var(--fault)">Error: ${s.last_result.error}</span>`;
    } else {
      res.innerHTML = Object.entries(s.last_result).map(([name, result]) => {
        const ok = result.startsWith('ok');
        return `<div class="schd-result-row ${ok ? 'schd-ok' : 'schd-err'}">
          <span>${name}</span><span>${result}</span>
        </div>`;
      }).join('');
    }
  } else if (res) {
    res.innerHTML = '<span style="color:var(--muted2);font-size:10px">No runs yet</span>';
  }
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function toggleScheduler() {
  const enabled = scheduleData?.enabled;
  const url = enabled ? `${API}/schedule/disable` : `${API}/schedule/enable`;
  const res  = await fetch(url, { method: 'POST' });
  const data = await res.json();
  showToast(data.success
    ? (enabled ? 'Scheduler paused' : `Scheduler enabled — next run: ${(data.next_run || '').slice(11,19)}`)
    : `Error: ${data.error}`);
  fetchSchedule();
}

async function saveScheduleSettings() {
  const interval = +document.getElementById('schdInterval').value;
  if (!interval || interval < 1) { showToast('⚠ Interval must be at least 1 minute'); return; }

  // Collect selected PLCs
  const checkboxes = document.querySelectorAll('.schd-plc-chk:checked');
  const plc_ids = [...checkboxes].map(cb => +cb.value);

  const res  = await fetch(`${API}/schedule/set`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ interval_min: interval, plc_ids }),
  });
  const data = await res.json();
  if (data.success) { showToast(`✓ Schedule set — every ${interval} minutes`); fetchSchedule(); }
  else showToast(`Error: ${data.error}`);
}

async function runBackupNow() {
  const btn = document.getElementById('schdRunNowBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⟳  RUNNING…'; }

  const checkboxes = document.querySelectorAll('.schd-plc-chk:checked');
  const plc_ids = [...checkboxes].map(cb => +cb.value);

  try {
    const res  = await fetch(`${API}/schedule/run_now`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plc_ids }),
    });
    const data = await res.json();
    showToast(data.success ? '✓ Backup complete' : `Error: ${data.error}`);
    fetchSchedule();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡  RUN NOW'; }
  }
}

// ── Render PLC checkboxes for scheduler ─────────────────────────────────────
function renderSchdPlcList() {
  const box = document.getElementById('schdPlcList');
  if (!box) return;
  box.innerHTML = plcData.map(p => `
    <label class="schd-plc-lbl">
      <input type="checkbox" class="schd-plc-chk" value="${p.id}" checked
             style="accent-color:var(--accent)">
      <span class="schd-plc-name">${p.name}</span>
      <span class="schd-plc-ip">${p.ip}</span>
    </label>
  `).join('');
}
