/**
 * lineboard.js — Live Line Status Board renderer.
 *
 * Displays the real Tata Motors production HMI screen:
 *   • LINE RUNNING  — white header, reason table, station grid, dropping, KPIs
 *   • LINE STOPPED  — red header, stopped station + reason highlight, dropping, KPIs
 *
 * Auto-refreshes every 2 seconds (matches PLC poll rate).
 * Includes full-screen kiosk mode for shop floor TV display.
 */

let _lbLiveTimer  = null;
let _lbKioskMode  = false;
let _lbLiveData   = null;

// ── Start / stop live polling ─────────────────────────────────────────────────
function startLineBoardLive() {
  fetchLineBoardLive();
  if (_lbLiveTimer) clearInterval(_lbLiveTimer);
  _lbLiveTimer = setInterval(fetchLineBoardLive, 2000);
}

function stopLineBoardLive() {
  if (_lbLiveTimer) clearInterval(_lbLiveTimer);
  _lbLiveTimer = null;
}

async function fetchLineBoardLive() {
  try {
    const res  = await fetch(`${API}/lineboard/live`);
    const data = await res.json();
    if (data.success) {
      _lbLiveData = data;
      renderLineBoardLive(data);
    }
  } catch { /* silent — offline */ }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function renderLineBoardLive(d) {
  const root = document.getElementById('lbLiveRoot');
  if (!root) return;

  const running = !!d.line_running;

  // ── Prepare Sections if not already present ──
  if (!root.querySelector('.lb-header')) {
    root.innerHTML = `
      <div id="lbHdrWrap"></div>
      <div id="lbMarqueeWrap"></div>
      <div id="lbBodyWrap"></div>
      <div id="lbGridWrap"></div>
      <div id="lbKpiWrap"></div>
      <div id="lbOfflineWrap"></div>
    `;
  }

  // 1. Header
  const activeStations = (d.stations || []).filter(s => s.any_active).map(s => s.station_no);
  const stnStr = activeStations.length > 0 ? activeStations.join(', ') : d.stopped_station;
  const hdrHtml = `
    <div class="lb-header ${running ? 'lb-running' : 'lb-stopped'}">
      ${running
        ? `LINE RUNNING`
        : `LINE STOPPED AT STN &nbsp; ${stnStr}${d.eol_triggered ? ' <span style="font-size:clamp(10px,1.5vw,16px);letter-spacing:3px;background:rgba(170,68,255,.3);border:2px solid #aa44ff;padding:2px 10px;vertical-align:middle;margin-left:12px">⚡ EOL SENSOR</span>' : ''}`
      }
    </div>`;
  const hdrWrap = document.getElementById('lbHdrWrap');
  if (hdrWrap.innerHTML !== hdrHtml) hdrWrap.innerHTML = hdrHtml;

  // 2. Marquee (Persistent to prevent animation reset)
  const mqWrap = document.getElementById('lbMarqueeWrap');
  
  const statusMarquee = running ? "LINE RUNNING" : `LINE STOPPED AT STN ${stnStr}`;
  const fullMarquee = `${d.marquee_text}  •  ${statusMarquee}`;
  
  const currentText = mqWrap.querySelector('span')?.textContent;
  if (currentText !== fullMarquee || !mqWrap.querySelector('.lb-marquee')) {
    mqWrap.innerHTML = `<div class="lb-marquee" style="${running ? '' : 'background: #cc0000;'}"><span>${fullMarquee}</span></div>`;
  }

  // 3. Main Body
  const bodyHtml = `
    <div class="lb-body">
      <div class="lb-left">
        ${running ? _renderReasonTable(d) : _renderStoppedPanel(d)}
      </div>
      <div class="lb-right">
        ${_renderDroppingTable(d)}
      </div>
    </div>`;
  const bodyWrap = document.getElementById('lbBodyWrap');
  if (bodyWrap.innerHTML !== bodyHtml) bodyWrap.innerHTML = bodyHtml;

  // 4. Station Grid
  const gridHtml = `
    <div class="lb-station-section">
      <div class="lb-stn-title">STATION BUTTON STATUS</div>
      <div class="lb-station-grid">${_renderStationGrid(d)}</div>
    </div>`;
  const gridWrap = document.getElementById('lbGridWrap');
  if (gridWrap.innerHTML !== gridHtml) gridWrap.innerHTML = gridHtml;

  // 5. KPI Bar
  const kpiWrap = document.getElementById('lbKpiWrap');
  const kpiHtml = _renderKpiBar(d);
  if (kpiWrap.innerHTML !== kpiHtml) kpiWrap.innerHTML = kpiHtml;

  // 6. Connection Badge
  const offWrap = document.getElementById('lbOfflineWrap');
  const offHtml = !d.connected ? `<div class="lb-offline-warn">⚠ PLC OFFLINE — Showing last known / zero values</div>` : '';
  if (offWrap.innerHTML !== offHtml) offWrap.innerHTML = offHtml;

  // Update mini status indicator
  const ind = document.getElementById('lbStatusInd');
  if (ind) {
    ind.textContent  = running ? '⬤ LINE RUNNING' : '⬤ LINE STOPPED';
    ind.className    = 'lb-status-ind ' + (running ? 'lb-ind-run' : 'lb-ind-stop');
  }
}

// ── Reason Table (LINE RUNNING left panel) ───────────────────────────────────
function _renderReasonTable(d) {
  const rows = d.reason_times.map(r => {
    const isActive = r.total_sec > 0;
    const secFmt   = String(r.sec || 0).padStart(2, '0');
    return `<tr ${isActive ? 'class="lb-rt-active"' : ''}>
      <td class="lb-rt-label">${r.label}</td>
      <td class="lb-rt-val">${r.hr}</td>
      <td class="lb-rt-val">${String(r.min).padStart(2,'0')}</td>
      <td class="lb-rt-val" style="font-size:.75em;color:rgba(255,255,255,.5)">${secFmt}</td>
    </tr>`;
  }).join('');

  const ts = d.total_stop || {hr:0, min:0};
  return `
    <table class="lb-reason-tbl">
      <thead>
        <tr>
          <th class="lb-th-reason">REASON</th>
          <th class="lb-th-hm">HR</th>
          <th class="lb-th-hm">MIN</th>
          <th class="lb-th-hm" style="font-size:.75em">SEC</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="lb-total-row">
          <td class="lb-rt-label">TOTAL STOP TIME</td>
          <td class="lb-rt-val">${ts.hr}</td>
          <td class="lb-rt-val">${String(ts.min).padStart(2,'0')}</td>
          <td class="lb-rt-val"></td>
        </tr>
      </tbody>
    </table>`;
}

// ── Stopped Panel (LINE STOPPED left panel) ──────────────────────────────────
function _renderStoppedPanel(d) {
  // Find all active buttons across all stations
  let activeReasons = [];
  (d.stations || []).forEach(stn => {
    (stn.buttons || []).forEach((b, i) => {
      if (b.active) {
        const bDef = (d.buttons || [])[i] || {};
        activeReasons.push({
          station: stn.station_no,
          label: bDef.label || `BTN${i+1}`,
          color: bDef.color || 'yellow'
        });
      }
    });
  });

  if (activeReasons.length === 0) {
    // Fallback: line is stopped but no specific buttons are pressed
    return `
      <div class="lb-stop-left">
        <div class="lb-stop-stn-box">
          <div class="lb-stop-stn-l">STATION</div>
          <div class="lb-stop-stn-v">${d.stopped_station}</div>
        </div>
        <div class="lb-stop-reason-label">STOPPAGES</div>
        <div class="lb-stop-btns">
          <div class="lb-stop-btn lb-stop-btn-active" style="color:#111;background:#ccc;border-color:#aaa;">UNKNOWN REASON</div>
        </div>
      </div>`;
  }

  if (activeReasons.length === 1) {
    // Only 1 reason active: display exactly like before (large single button)
    const r = activeReasons[0];
    return `
      <div class="lb-stop-left">
        <div class="lb-stop-stn-box">
          <div class="lb-stop-stn-l">STATION</div>
          <div class="lb-stop-stn-v">${r.station}</div>
        </div>
        <div class="lb-stop-reason-label">STOPPAGES</div>
        <div class="lb-stop-btns">
          <div class="lb-stop-btn lb-stop-btn-active"
            style="background:${_btnBgJs(r.color)};border-color:${_btnBorderJs(r.color)};animation:lbpulse 1s infinite">
            ${r.label}
          </div>
        </div>
      </div>`;
  }

  // Multiple active buttons: show a scrollable list of all active stations & reasons
  const reasonHtml = activeReasons.map(r => `
    <div style="display:flex; align-items:stretch; margin-bottom: 12px; gap: 12px;">
      <div class="lb-stop-stn-v" style="font-size:32px; padding:0 18px; border-width:3px; display:flex; align-items:center;">
        ${r.station}
      </div>
      <div class="lb-stop-btn lb-stop-btn-active" style="flex:1; display:flex; align-items:center; justify-content:center; font-size: 22px; background:${_btnBgJs(r.color)}; border-color:${_btnBorderJs(r.color)}; animation:lbpulse 1s infinite;">
        ${r.label}
      </div>
    </div>
  `).join('');

  return `
    <div class="lb-stop-left" style="justify-content: flex-start; padding-top: 32px; width: 100%;">
      <div class="lb-stop-reason-label" style="margin-bottom: 24px; font-size: 16px; letter-spacing: 6px;">ACTIVE STOPPAGES</div>
      <div style="width: 100%; max-width: 440px; overflow-y: auto; padding-right: 12px;">
        ${reasonHtml}
      </div>
    </div>`;
}

// ── Dropping Table (right panel shared between both states) ──────────────────
function _renderDroppingTable(d) {
  const dr = d.dropping || {};

  // Helper: render one dropping row
  const makeRow = (label, key, spanDate) => {
    if (spanDate) {
      // DATE / TIME / OEE rows span both plan+actual columns
      return `<tr>
        <td class="lb-dr-label">${label}</td>
        <td class="lb-dr-span" colspan="2">${spanDate}</td>
      </tr>`;
    }
    const rowData = dr[key] || {};
    const plan    = rowData.plan ?? '—';
    const actual  = rowData.actual ?? '—';
    const isLow   = (+actual < +plan) && actual !== '—';

    // Extra indicator for TILL LAST HOUR auto mode
    const autoTag = (key === 'till_last_hour' && rowData.auto_till)
      ? `<div style="font-size:7px;color:rgba(255,255,255,.5);letter-spacing:1px;margin-top:2px">AUTO · ${rowData.completed_hours ?? 0} hr done</div>`
      : '';

    return `<tr>
      <td class="lb-dr-label">${label}${autoTag}</td>
      <td class="lb-dr-plan">${plan}</td>
      <td class="lb-dr-actual ${isLow ? 'lb-dr-low' : ''}">${actual}</td>
    </tr>`;
  };

  return `
    <table class="lb-drop-tbl">
      <thead>
        <tr>
          <th class="lb-dh">DROPPING</th>
          <th class="lb-dh">PLAN</th>
          <th class="lb-dh">ACTUAL</th>
        </tr>
      </thead>
      <tbody>
        ${makeRow('CURRENT HOUR',   'current_hour')}
        ${makeRow('TILL LAST HOUR', 'till_last_hour')}
        ${makeRow('FOR DAY',        'for_day')}
        ${makeRow('DATE',   null, d.date)}
        ${makeRow('TIME',   null, d.time)}
        ${makeRow('OEE',    null, d.oee)}
      </tbody>
    </table>`;
}

// ── KPI Bar (only shows enabled KPIs) ───────────────────────────────────────
function _renderKpiBar(d) {
  const en = d.kpi_enabled || {};  // { oee: true, availability: false, ... }

  const ALL = [
    { key: 'availability', label: 'AVAILABILITY', val: d.availability },
    { key: 'performance',  label: 'PERFORMANCE',  val: d.performance  },
    { key: 'oee',          label: 'OEE',          val: d.oee          },
    { key: 'drr1',         label: 'DRR1',         val: d.drr1         },
  ];

  // Default: show all if kpi_enabled not yet in config (backward compat)
  const hasFlags = Object.keys(en).length > 0;
  const visible  = ALL.filter(k => !hasFlags || en[k.key] !== false);

  if (visible.length === 0) {
    return ``;
  }

  const cells = visible.map((k, i) => `
    ${i > 0 ? '<div class="lb-kpi-sep"></div>' : ''}
    <div class="lb-kpi">
      <span class="lb-kpi-l">${k.label}</span>
      <span class="lb-kpi-v">${k.val ?? '—'}</span>
    </div>`).join('');

  return `<div class="lb-kpi-bar">${cells}</div>`;
}

// ── Station grid (all stations with their buttons) ───────────────────────────
function _renderStationGrid(d) {
  return (d.stations || []).map(stn => {
    const anyActive = stn.any_active;
    const btns = (stn.buttons || []).map((b, i) => {
      const bDef = (d.buttons || [])[i] || {};
      const active = !!b.active;
      return `<div class="lb-sg-btn ${active ? 'lb-sg-btn-on' : ''}"
        title="${bDef.label || ''} — ${b.addr}"
        style="${active
          ? `background:${_btnBgJs(bDef.color)};box-shadow:0 0 8px ${_btnBgJs(bDef.color)}`
          : ''}">
        ${active ? (bDef.label || '').slice(0,1) : (i + 1)}
      </div>`;
    }).join('');

    return `<div class="lb-sg-card ${anyActive ? 'lb-sg-card-active' : ''}">
      <div class="lb-sg-no">${stn.station_no}</div>
      <div class="lb-sg-btns">${btns}</div>
    </div>`;
  }).join('');
}

// ── Toggle full-screen kiosk mode ────────────────────────────────────────────
function toggleLineBoardKiosk() {
  const el = document.getElementById('page-lineboard');
  if (!el) return;
  if (!_lbKioskMode) {
    el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    _lbKioskMode = true;
    document.getElementById('lbKioskBtn').textContent = '⊡ EXIT KIOSK';
  } else {
    document.exitFullscreen?.();
    _lbKioskMode = false;
    document.getElementById('lbKioskBtn').textContent = '⛶ KIOSK MODE';
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) _lbKioskMode = false;
});

// ── Colour helpers (client-side mirror of backend) ───────────────────────────
function _btnBgJs(color) {
  const m = { yellow:'#e6d000', orange:'#e65c00', red:'#cc0000',
               purple:'#6a0dad', blue:'#0047ab', green:'#006600',
               cyan:'#007b8a', white:'#d0d0d0' };
  return m[color] || '#444';
}
function _btnBorderJs(color) {
  const m = { yellow:'#fff176', orange:'#ffb74d', red:'#ff5252',
               purple:'#ce93d8', blue:'#90caf9', green:'#a5d6a7',
               cyan:'#80deea', white:'#ffffff' };
  return m[color] || '#888';
}
