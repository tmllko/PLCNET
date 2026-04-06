/**
 * ui.js — Shared UI helpers: clock, tabs, stats bar, toast, modal.
 */

// ── Clock ──────────────────────────────────────────────────────────────────
function tick() {
  document.getElementById('clk').textContent = new Date().toTimeString().slice(0, 8);
}
setInterval(tick, 1000);
tick();

// ── Tab navigation ─────────────────────────────────────────────────────────
function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  el.classList.add('active');

  // Trigger page-specific renderers
  if (id === 'iomap')    renderIO();
  if (id === 'logging')  renderLogTable();
  if (id === 'backup')   renderBakTable();
  if (id === 'alarms')   { fetchAlarmHistory(); populateAlarmPlcFilter(); }
  if (id === 'schedule') { fetchSchedule(); renderSchdPlcList(); }
  if (id === 'email')    fetchEmailConfig();
  if (id === 'lineconfig') loadLineBoardConfig();
  if (id === 'lineboard')  startLineBoardLive();
  // Stop live board polling when leaving line board tab
  if (id !== 'lineboard')  stopLineBoardLive();
}

// ── Connection badge ───────────────────────────────────────────────────────
function setConn(cls, label) {
  const badge = document.getElementById('connBadge');
  badge.className = 'conn ' + cls;
  document.getElementById('connLbl').textContent = label;
}

// ── Stats bar ───────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stT').textContent   = plcData.length;
  document.getElementById('stOn').textContent  = plcData.filter(p => p.status === 'online').length;
  document.getElementById('stOff').textContent = plcData.filter(p => p.status === 'offline').length;
  document.getElementById('stW').textContent   = plcData.filter(p => ['warning','error'].includes(p.status)).length;
  document.getElementById('stA').textContent   = alarms.length;
  document.getElementById('stL').textContent   = logRecs.length;

  // Keep invisible pill in sync (JS compat)
  document.getElementById('alarmCount').textContent = alarms.length;

  updateAlarmTicker();
}

// ── Alarm Ticker Strip ─────────────────────────────────────────────────────
function updateAlarmTicker() {
  const ticker  = document.getElementById('alarmTicker');
  const label   = document.getElementById('tickerLabel');
  const dot     = document.getElementById('tickerDot');
  const status  = document.getElementById('tickerStatus');
  const inner   = document.getElementById('tickerInner');

  ticker.classList.remove('hidden');

  const offline = plcData.filter(p => p.status === 'offline').length;
  const warned  = plcData.filter(p => ['warning','error'].includes(p.status)).length;
  const hasAlarm = alarms.length > 0 || offline > 0 || warned > 0;

  if (hasAlarm) {
    ticker.classList.remove('ok');
    label.classList.remove('ok');
    dot.classList.remove('ok');
    inner.classList.remove('ok');
    status.textContent = `FAULT — ${alarms.length} ALARM${alarms.length !== 1 ? 'S' : ''}`;

    const msgs = [
      offline > 0 ? `${offline} PLC${offline > 1 ? 's' : ''} OFFLINE` : null,
      warned  > 0 ? `${warned} PLC${warned  > 1 ? 's' : ''} IN WARNING` : null,
      ...alarms.slice(0, 5).map(a => `⚠ ${a.message}`),
    ].filter(Boolean);
    inner.textContent = msgs.join('   ●   ') + '   ●   ';
  } else {
    ticker.classList.add('ok');
    label.classList.add('ok');
    dot.classList.add('ok');
    inner.classList.add('ok');
    status.textContent = 'ALL SYSTEMS NOMINAL';
    inner.textContent  = `● ALL SYSTEMS NOMINAL — ${plcData.length} PLC${plcData.length !== 1 ? 's' : ''} RUNNING — No active alarms`;
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Modal (PLC detail popup) ───────────────────────────────────────────────
function openModal(plc) {
  document.getElementById('mtit').textContent = plc.name;
  document.getElementById('msub').textContent = `${plc.model || ''} · ${plc.ip}`;

  const regs = plc.registers || {};
  const bits = plc.bits || {};
  const fields = [
    { l: 'Status',    v: plc.status },
    { l: 'Location',  v: plc.location },
    { l: 'IP',        v: plc.ip },
    { l: 'CPU Load',  v: plc.cpu > 0 ? plc.cpu + '%' : 'N/A' },
    { l: 'Scan Time', v: plc.scan_time || 'N/A' },
    { l: 'Updated',   v: (plc.last_update || '').slice(11, 19) },
    ...Object.entries(regs).slice(0, 6).map(([k, v]) => ({ l: k, v: String(v) })),
    ...Object.entries(bits).slice(0, 6).map(([k, v]) => ({ l: k, v: v ? 'ON' : 'OFF' })),
  ];

  document.getElementById('mgrid').innerHTML = fields
    .map(f => `<div class="mf"><div class="mfl">${f.l}</div><div class="mfv">${f.v}</div></div>`)
    .join('');

  const errors = plc.errors || [];
  document.getElementById('merr').innerHTML = errors.length
    ? `<div style="font-size:8px;letter-spacing:2px;color:var(--muted2);margin-bottom:7px;padding-top:10px;border-top:1px solid var(--border)">ERRORS</div>
       ${errors.map(e => `<div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--orange);padding:3px 0">${e.desc}</div>`).join('')}`
    : `<div style="font-size:11px;color:var(--green);padding-top:10px;border-top:1px solid var(--border)">✓ No errors</div>`;

  document.getElementById('mo').classList.add('open');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('mo')) {
    document.getElementById('mo').classList.remove('open');
  }
}

// ── Populate all PLC <select> dropdowns ───────────────────────────────────
function populateSelects() {
  ['rdPlc', 'wrPlc', 'lgPlc', 'ioPlcSel'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = (id === 'ioPlcSel' ? '<option value="">Select PLC...</option>' : '');
    plcData.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.name} (${p.ip})`;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  });

  // Also refresh new page components
  populateAlarmPlcFilter?.();
  renderSchdPlcList?.();
}
