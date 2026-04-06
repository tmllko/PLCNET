/**
 * lineconfig.js  — Line Status Board configurator.
 *
 * Renders the full setup form dynamically based on user inputs:
 *   · Line name + PLC selector
 *   · Number of stations & buttons per station
 *   · Register addresses for every button (M bits)
 *   · Reason-time registers (D words for HR / MIN per button reason)
 *   · Dropping section registers (Plan / Actual × 3 rows)
 *   · KPI registers (OEE, Availability, Performance, DRR1)
 *   · Marquee text
 */

let _lbCfg = null;   // cached config from server

// ── Boot: load config on first visit ─────────────────────────────────────────
async function loadLineBoardConfig() {
  try {
    const res  = await fetch(`${API}/lineboard/config`);
    const data = await res.json();
    if (data.success) {
      _lbCfg = data.config;
      renderLineBoardForm(_lbCfg, data.plcs || []);
    }
  } catch { /* silent */ }
}

// ── Render the full form ──────────────────────────────────────────────────────
function renderLineBoardForm(cfg, plcs) {
  const ns = parseInt(cfg.num_stations) || 8;
  const nb = parseInt(cfg.num_buttons)  || 5;

  // ── Section 1: Basic settings ─────────────────────────────────────────────
  _setVal('lbLineName',      cfg.line_name       || '');
  _setVal('lbMarquee',       cfg.marquee_text    || '');
  _setVal('lbNumStations',   ns);
  _setVal('lbNumButtons',    nb);
  _setVal('lbRegStoppedStn', cfg.reg_stopped_station || 'D100');

  // ── Restore EOL sensor settings ──────────────────────────────────────────
  const eol = cfg.eol_sensor || {};
  const eolEnabled = !!eol.enabled;
  const eolBtn  = document.getElementById('eolEnable');
  const eolInp  = document.getElementById('lbEolReg');
  const eolSel  = document.getElementById('lbEolActiveState');
  const eolHint = document.getElementById('eolHint');
  if (eolBtn) {
    eolBtn.textContent = eolEnabled ? 'ON' : 'OFF';
    eolBtn.className   = `kpi-toggle ${eolEnabled ? 'kpi-on' : 'kpi-off'}`;
  }
  if (eolInp) { eolInp.value = eol.reg || 'X0'; eolInp.disabled = !eolEnabled; eolInp.style.opacity = eolEnabled ? '1' : '.4'; }
  if (eolSel) { eolSel.value = eol.active_state || 'ON'; eolSel.disabled = !eolEnabled; eolSel.style.opacity = eolEnabled ? '1' : '.4'; }
  if (eolHint) _updateEolHint(eolEnabled, eol.reg || 'X0', eol.active_state || 'ON');

  // Shift settings
  _setVal('lbShiftHours',  cfg.shift_hours   || 8.5);
  _setVal('lbShiftStart',  cfg.shift_start   || '08:00');
  _setVal('lbDailyTarget', cfg.daily_target  || 170);

  // PLC selector
  const sel = document.getElementById('lbPlcSel');
  if (sel) {
    sel.innerHTML = plcs.map(p =>
      `<option value="${p.id}" ${p.id === cfg.plc_id ? 'selected' : ''}>${p.name} (${p.ip})</option>`
    ).join('');
  }

  // ── Section 2: Button labels & colours ────────────────────────────────────
  renderButtonDefs(nb, cfg.buttons || []);

  // ── Section 3: Dropping registers ─────────────────────────────────────────
  const dr = cfg.dropping || {};
  renderDropRegs(dr);

  // ── Section 4: Reason time registers ─────────────────────────────────────
  renderReasonTimeRegs(nb, cfg.reg_reason_time || [], cfg.buttons || []);

  // ── Section 5: Register address matrix ───────────────────────────────────
  renderRegMatrix(ns, nb, cfg.reg_buttons || [], cfg.buttons || []);

  // ── Section 6: KPI registers ──────────────────────────────────────────────
  _setVal('lbRegOEE',          cfg.reg_oee          || '');
  _setVal('lbRegAvailability', cfg.reg_availability || '');
  _setVal('lbRegPerformance',  cfg.reg_performance  || '');
  _setVal('lbRegDRR1',         cfg.reg_drr1         || '');

  // ── Restore KPI enable/disable toggles ────────────────────────────────────
  const kpiEnabled = cfg.kpi_enabled || {};
  ['oee', 'availability', 'performance', 'drr1'].forEach(k => {
    const enabled = kpiEnabled[k] !== false;  // default ON
    const btn  = document.getElementById(`kpiEn-${k}`);
    const row  = document.getElementById(`kpiRow-${k}`);
    const inpt = document.getElementById(`lbReg${k.charAt(0).toUpperCase()+k.slice(1)}`);
    if (btn)  { btn.textContent = enabled ? 'ON' : 'OFF'; btn.className = `kpi-toggle ${enabled ? 'kpi-on' : 'kpi-off'}`; }
    if (row)  { row.classList.toggle('kpi-disabled', !enabled); }
    if (inpt) { inpt.disabled = !enabled; }
  });
}

// ── Render DROPPING section (single vehicle counter → auto-calc all actuals) ─
function renderDropRegs(dr) {
  const box = document.getElementById('lbDropRegs');
  if (!box) return;

  const ctrReg = dr.vehicle_counter_reg || 'D200';
  const rows = [
    { key: 'current_hour',   label: 'CURRENT HOUR',  hint: 'vehicles produced in this clock hour',      calc: 'counter − hour_start',  auto: false },
    { key: 'till_last_hour', label: 'TILL LAST HOUR', hint: 'vehicles produced up to last completed hour', calc: 'hour_start − shift_start', auto: true  },
    { key: 'for_day',        label: 'FOR DAY',        hint: 'total vehicles produced this shift',        calc: 'counter − shift_start', auto: false },
  ];

  const ctrBanner = `
    <div style="background:rgba(68,216,241,.06);border:1px solid rgba(68,216,241,.25);border-left:3px solid var(--accent);padding:10px 14px;margin-bottom:12px">
      <div style="font-size:8px;letter-spacing:2px;color:var(--accent);font-family:'Rajdhani',sans-serif;font-weight:700;margin-bottom:6px">
        ⚡ VEHICLE COUNTER REGISTER — ONE register auto-calculates all 3 rows
      </div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div>
          <div class="lbf-micro">PLC D-word Address (increments +1 per vehicle)</div>
          <input class="fi" id="lb-veh-ctr" value="${ctrReg}" placeholder="D200"
            style="width:110px;font-family:'Share Tech Mono',monospace;font-size:14px;font-weight:700;color:var(--accent)">
        </div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted2);line-height:2">
          CURRENT HOUR &nbsp;= counter − hour_start<br>
          TILL LAST HOUR = hour_start − shift_start<br>
          FOR DAY &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= counter − shift_start
        </div>
      </div>
    </div>`;

  const rowsHtml = rows.map(r => {
    const cfg   = dr[r.key] || {};
    const plan  = cfg.plan_value ?? (r.key === 'for_day' ? 170 : r.key === 'current_hour' ? 20 : 40);
    const isAuto = r.auto && (cfg.auto_till !== false);

    return `<div class="lbc-row" id="lbc-drop-row-${r.key}">
      <div>
        <div class="lbc-rl">${r.label}</div>
        <div style="font-size:8px;color:var(--muted2);font-family:'Share Tech Mono',monospace;margin-top:3px">${r.hint}</div>
        <div style="font-size:7px;font-family:'Share Tech Mono',monospace;color:var(--accent);margin-top:3px;letter-spacing:1px">⚡ ${r.calc}</div>
      </div>
      <div class="lbf-pair" style="flex:1">
        <div>
          <div class="lbf-micro">PLAN value (user sets) ${r.auto ? `
            <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;margin-left:8px">
              <input type="checkbox" id="lb-autotill" ${isAuto ? 'checked' : ''}
                onchange="toggleAutoTill(this)" style="accent-color:var(--accent)">
              <span style="font-size:7px;color:var(--accent)">AUTO (from shift)</span>
            </label>` : ''}</div>
          <input class="fi lb-drop-plan" id="lb-drop-${r.key}-plan"
            value="${plan}" type="number" min="0" placeholder="e.g. ${plan}"
            ${r.auto && isAuto ? 'disabled style="opacity:.4"' : ''}>
          ${r.auto ? `<div style="font-size:8px;font-family:'Share Tech Mono',monospace;color:var(--accent);margin-top:4px" id="lbAutoTillPreview">
            AUTO = hourly rate × completed hours of shift
          </div>` : ''}
        </div>
        <div>
          <div class="lbf-micro">ACTUAL (⚡ auto-calc from counter)</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:20px;font-weight:700;color:var(--accent);padding:6px 12px;background:rgba(68,216,241,.05);border:1px solid rgba(68,216,241,.15);min-width:70px;text-align:center;letter-spacing:1px">—</div>
          <div style="font-size:7px;font-family:'Share Tech Mono',monospace;color:var(--run);margin-top:4px">⬤ live from ${ctrReg}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = ctrBanner + rowsHtml;
  updateAutoTillPreview();
}

function toggleAutoTill(chk) {
  const planInput = document.getElementById('lb-drop-till_last_hour-plan');
  if (planInput) {
    planInput.disabled = chk.checked;
    planInput.style.opacity = chk.checked ? '.4' : '1';
  }
  updateAutoTillPreview();
}

function updateAutoTillPreview() {
  const preview  = document.getElementById('lbAutoTillPreview');
  if (!preview) return;
  const daily    = parseFloat(document.getElementById('lbDailyTarget')?.value) || 170;
  const hours    = parseFloat(document.getElementById('lbShiftHours')?.value)  || 8.5;
  const rate     = hours > 0 ? (daily / hours).toFixed(1) : 0;
  preview.innerHTML = `AUTO = ${rate} units/hr × completed hours of shift`;
}

function autoCalculateDrop() {
  const daily  = parseFloat(document.getElementById('lbDailyTarget')?.value) || 170;
  const hours  = parseFloat(document.getElementById('lbShiftHours')?.value)  || 8.5;
  const rate   = hours > 0 ? Math.round(daily / hours) : 0;

  const chInput = document.getElementById('lb-drop-current_hour-plan');
  const fdInput = document.getElementById('lb-drop-for_day-plan');
  if (chInput) chInput.value = rate;
  if (fdInput) fdInput.value = daily;
  showToast(`✓ Calculated: ${rate} units/hr · ${daily} units/day`);
  updateAutoTillPreview();
}

// ── Render button definition rows ────────────────────────────────────────────
function renderButtonDefs(nb, buttons) {
  const COLORS = ['yellow','orange','red','purple','blue','green','cyan','white'];
  const box = document.getElementById('lbBtnDefs');
  if (!box) return;
  box.innerHTML = Array.from({ length: nb }, (_, i) => {
    const b   = buttons[i] || {};
    const lbl = b.label || `BUTTON ${i + 1}`;
    const col = b.color || 'yellow';
    return `<div class="lbc-btnrow" id="lbc-btn-${i}">
      <div class="lbc-btnno">BTN ${i + 1}</div>
      <div style="flex:1">
        <div class="lbf-micro">LABEL</div>
        <input class="fi lb-btn-label" id="lb-btnlbl-${i}" data-idx="${i}" value="${lbl}" placeholder="MAINTENANCE">
      </div>
      <div>
        <div class="lbf-micro">COLOUR</div>
        <select class="fi lb-btn-color" id="lb-btnclr-${i}" data-idx="${i}">
          ${COLORS.map(c => `<option value="${c}" ${col === c ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}
        </select>
      </div>
      <div class="lbc-swatch" id="lbc-swatch-${i}" style="background:${_btnBg(col)};border:2px solid ${_btnBorder(col)}"></div>
    </div>`;
  }).join('');

  // Live swatch update
  box.querySelectorAll('.lb-btn-color').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = sel.dataset.idx;
      document.getElementById(`lbc-swatch-${i}`).style.background = _btnBg(sel.value);
      document.getElementById(`lbc-swatch-${i}`).style.borderColor = _btnBorder(sel.value);
    });
  });
}

// ── Render bit-address matrix (X, Y, M supported) ────────────────────────────
function renderRegMatrix(ns, nb, regMatrix, buttons) {
  const box = document.getElementById('lbRegMatrix');
  if (!box) return;

  const headerCells = Array.from({length: nb}, (_, b) => {
    const lbl = buttons[b]?.label || `BTN ${b+1}`;
    return `<th>BTN ${b+1}<br><span style="font-size:8px;color:var(--muted2)">${lbl.slice(0,8)}</span></th>`;
  }).join('');

  const rows = Array.from({length: ns}, (_, s) => {
    const cells = Array.from({length: nb}, (_, b) => {
      // Use existing saved value; default to X-address starting from X0
      const val = (regMatrix[s] && regMatrix[s][b]) ? regMatrix[s][b] : `X${s * nb + b}`;
      return `<td><input class="fi lb-reg-cell" id="lb-reg-${s}-${b}"
        data-s="${s}" data-b="${b}" value="${val}"
        placeholder="X0 / M0 / Y0"
        oninput="_validateBitAddr(this)"
        style="width:90px;font-size:11px;padding:5px 7px"></td>`;
    }).join('');
    return `<tr><td class="lb-stn-label">STN ${s + 1}</td>${cells}</tr>`;
  }).join('');

  box.innerHTML = `
    <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--accent);margin-bottom:8px;letter-spacing:1px">
      ⓘ Enter any bit address: <strong>X0–X7999</strong> (Inputs) · <strong>Y0–Y7999</strong> (Outputs) · <strong>M0–M8191</strong> (Internal bits)
    </div>
    <table class="lbr-tbl">
      <thead><tr><th>Station</th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Run validation on all cells after render
  box.querySelectorAll('.lb-reg-cell').forEach(inp => _validateBitAddr(inp));
}

// ── Render reason time section (auto-tracked, no PLC registers needed) ────────
function renderReasonTimeRegs(nb, reasonRegs, buttons) {
  const box = document.getElementById('lbReasonRegs');
  if (!box) return;

  const rows = Array.from({length: nb}, (_, i) => {
    const lbl = buttons[i]?.label || `BTN ${i + 1}`;
    const col = buttons[i]?.color || 'yellow';
    const dot = `<span style="color:${_btnBgJs ? _btnBgJs(col) : '#e6d000'};margin-right:6px">⬤</span>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;
        padding:7px 12px;margin-bottom:4px;background:var(--bg-inset);
        border:1px solid var(--border)">
      <div style="font-family:'Rajdhani',sans-serif;font-size:11px;font-weight:700;
          letter-spacing:2px;color:var(--label)">${dot}${lbl}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--accent);
          text-align:right" id="lbRtLive-${i}">— hr — min</div>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div style="background:rgba(68,216,241,.06);border:1px solid rgba(68,216,241,.25);
        border-left:3px solid var(--accent);padding:10px 14px;margin-bottom:12px">
      <div style="font-size:8px;letter-spacing:2px;color:var(--accent);
          font-family:'Rajdhani',sans-serif;font-weight:700;margin-bottom:5px">
        ⚡ AUTO-TRACKED — No PLC registers needed
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted2);line-height:1.9">
        Stoppage time is measured automatically when any station button is pressed.<br>
        Times accumulate per button type · Reset at each shift start · Saved to local file.
      </div>
    </div>
    ${rows}
    <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn-sm" onclick="resetReasonTimes()"
        style="background:rgba(255,23,68,.08);border-color:rgba(255,23,68,.4);
               color:var(--fault);font-size:9px;letter-spacing:2px">
        ⟳ RESET TIMERS (new shift)
      </button>
      <span style="font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--muted2)"
        id="lbRtResetHint">Times auto-reset at shift start · or click to reset manually</span>
    </div>`;

  // Fetch live reason times right away
  refreshReasonTimeLive();
}

async function refreshReasonTimeLive() {
  try {
    const res  = await fetch(`${API}/lineboard/live`);
    const data = await res.json();
    if (!data.success || !data.reason_times) return;
    data.reason_times.forEach((r, i) => {
      const el = document.getElementById(`lbRtLive-${i}`);
      if (el) {
        const h  = String(r.hr).padStart(2, '0');
        const m  = String(r.min).padStart(2, '0');
        const s  = String(r.sec || 0).padStart(2, '0');
        el.textContent = `${h}h ${m}m ${s}s`;
        el.style.color = r.total_sec > 0 ? 'var(--fault)' : 'var(--muted2)';
      }
    });
  } catch { /* silent */ }
}

async function resetReasonTimes() {
  if (!confirm('Reset all stoppage reason timers to 0:00:00?\nThis should be done at the start of a new shift.')) return;
  const res  = await fetch(`${API}/lineboard/reason-time/reset`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    showToast('✓ Reason timers reset to 0');
    refreshReasonTimeLive();
  }
}

// colour helper mirror (used inside renderReasonTimeRegs)
function _btnBgJs(color) {
  const m = { yellow:'#e6d000', orange:'#e65c00', red:'#cc0000',
               purple:'#6a0dad', blue:'#0047ab', green:'#006600',
               cyan:'#007b8a', white:'#d0d0d0' };
  return m[color] || '#888';
}


// ── Re-render sections when counts change ────────────────────────────────────
function onLineBoardCountChange() {
  const ns = parseInt(document.getElementById('lbNumStations')?.value) || 8;
  const nb = parseInt(document.getElementById('lbNumButtons')?.value)  || 5;
  const buttons = _collectButtonDefs();
  renderButtonDefs(nb, buttons);
  renderRegMatrix(ns, nb, [], buttons);
  renderReasonTimeRegs(nb, [], buttons);
}

// ── Collect current form values ───────────────────────────────────────────────
function _collectButtonDefs() {
  const nb = parseInt(document.getElementById('lbNumButtons')?.value) || 5;
  return Array.from({length: nb}, (_, i) => ({
    label: document.getElementById(`lb-btnlbl-${i}`)?.value || `BUTTON ${i+1}`,
    color: document.getElementById(`lb-btnclr-${i}`)?.value || 'yellow',
  }));
}

function _collectRegMatrix() {
  const cells = document.querySelectorAll('.lb-reg-cell');
  const matrix = {};
  const nb = parseInt(document.getElementById('lbNumButtons')?.value) || 5;
  cells.forEach(inp => {
    const s = +inp.dataset.s, b = +inp.dataset.b;
    if (!matrix[s]) matrix[s] = [];
    // Preserve whatever the user typed (X, Y, M all allowed)
    matrix[s][b] = inp.value.trim().toUpperCase() || `X${s * nb + b}`;
  });
  const ns = parseInt(document.getElementById('lbNumStations')?.value) || 8;
  return Array.from({length: ns}, (_, s) => matrix[s] || []);
}

// ── Validate a bit-address input cell (X / Y / M only) ────────────────────────
function _validateBitAddr(inp) {
  const v = inp.value.trim().toUpperCase();
  // Valid: X0, Y12, M100, X1000, etc. — letter then digits
  const ok = v === '' || /^[XYM]\d+$/.test(v);
  inp.style.borderColor  = ok ? '' : 'var(--fault)';
  inp.style.color        = ok ? '' : 'var(--fault)';
  inp.style.background   = ok ? '' : 'rgba(255,23,68,0.06)';
  inp.title = ok ? '' : 'Invalid address. Use format: X0, Y5, M10, etc.';
}

function _collectReasonTimeRegs() {
  const nb = parseInt(document.getElementById('lbNumButtons')?.value) || 5;
  return Array.from({length: nb}, (_, i) => ({
    hr:  document.getElementById(`lb-rt-hr-${i}`)?.value.trim() || `D${130 + i * 2}`,
    min: document.getElementById(`lb-rt-min-${i}`)?.value.trim() || `D${131 + i * 2}`,
  }));
}

function _collectDropping() {
  const keys = [
    { key: 'current_hour',   auto: false },
    { key: 'till_last_hour', auto: true  },
    { key: 'for_day',        auto: false },
  ];
  const obj = {
    vehicle_counter_reg: (document.getElementById('lb-veh-ctr')?.value || 'D200').trim().toUpperCase(),
  };
  keys.forEach(r => {
    obj[r.key] = {
      plan_value: +(document.getElementById(`lb-drop-${r.key}-plan`)?.value || 0),
    };
    if (r.auto) {
      obj[r.key].auto_till = !!document.getElementById('lb-autotill')?.checked;
    }
  });
  return obj;
}

// ── Save config to server ────────────────────────────────────────────────────
async function saveLineBoardConfig() {
  const cfg = {
    line_name:            document.getElementById('lbLineName')?.value.trim()  || 'LINE 1',
    marquee_text:         document.getElementById('lbMarquee')?.value.trim()   || '',
    plc_id:               +(document.getElementById('lbPlcSel')?.value        || 1),
    num_stations:         +(document.getElementById('lbNumStations')?.value    || 8),
    num_buttons:          +(document.getElementById('lbNumButtons')?.value     || 5),
    shift_hours:          +(document.getElementById('lbShiftHours')?.value     || 8.5),
    shift_start:           (document.getElementById('lbShiftStart')?.value     || '08:00').trim(),
    daily_target:         +(document.getElementById('lbDailyTarget')?.value    || 170),
    reg_stopped_station:  (document.getElementById('lbRegStoppedStn')?.value  || 'D100').trim().toUpperCase(),
    reg_oee:              (document.getElementById('lbRegOEE')?.value          || 'D120').trim().toUpperCase(),
    reg_availability:     (document.getElementById('lbRegAvailability')?.value || 'D121').trim().toUpperCase(),
    reg_performance:      (document.getElementById('lbRegPerformance')?.value  || 'D122').trim().toUpperCase(),
    reg_drr1:             (document.getElementById('lbRegDRR1')?.value         || 'D123').trim().toUpperCase(),
    eol_sensor: {
      enabled:      document.getElementById('eolEnable')?.classList.contains('kpi-on'),
      reg:          (document.getElementById('lbEolReg')?.value          || 'X0').trim().toUpperCase(),
      active_state: (document.getElementById('lbEolActiveState')?.value  || 'ON'),
    },
    kpi_enabled: {
      oee:          document.getElementById('kpiEn-oee')?.classList.contains('kpi-on'),
      availability: document.getElementById('kpiEn-availability')?.classList.contains('kpi-on'),
      performance:  document.getElementById('kpiEn-performance')?.classList.contains('kpi-on'),
      drr1:         document.getElementById('kpiEn-drr1')?.classList.contains('kpi-on'),
    },
    buttons:              _collectButtonDefs(),
    reg_buttons:          _collectRegMatrix(),
    reg_reason_time:      _collectReasonTimeRegs(),
    dropping:             _collectDropping(),
  };

  const res  = await fetch(`${API}/lineboard/config`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(cfg),
  });
  const data = await res.json();
  if (data.success) {
    showToast('✓ Line Board config saved — go to LINE BOARD tab to view live display');
    _lbCfg = cfg;
  } else {
    showToast(`Error saving config: ${data.error}`);
  }
}

async function resetLineBoardConfig() {
  if (!confirm('Reset all Line Board settings to defaults?')) return;
  const res  = await fetch(`${API}/lineboard/config/reset`, { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    _lbCfg = data.config;
    const r2 = await fetch(`${API}/lineboard/config`);
    const d2 = await r2.json();
    renderLineBoardForm(data.config, d2.plcs || []);
    showToast('Config reset to defaults');
  }
}

// ── Toggle End-of-Line Sensor ON / OFF ──────────────────────────────────────
function toggleEolSensor(btn) {
  const isOn   = btn.classList.contains('kpi-on');
  const inp    = document.getElementById('lbEolReg');
  const sel    = document.getElementById('lbEolActiveState');
  const hint   = document.getElementById('eolHint');
  const newOn  = !isOn;

  btn.textContent = newOn ? 'ON'  : 'OFF';
  btn.classList.replace(isOn ? 'kpi-on' : 'kpi-off', newOn ? 'kpi-on' : 'kpi-off');

  if (inp) { inp.disabled = !newOn; inp.style.opacity = newOn ? '1' : '.4'; }
  if (sel) { sel.disabled = !newOn; sel.style.opacity = newOn ? '1' : '.4'; }
  _updateEolHint(newOn, inp?.value || 'X0', sel?.value || 'ON');
}

function _updateEolHint(enabled, reg, activeState) {
  const hint = document.getElementById('eolHint');
  if (!hint) return;
  if (!enabled) {
    hint.innerHTML = 'Enable EOL sensor to add a physical end-of-line product sensor that stops the line independently of button presses.';
    hint.style.color = 'var(--muted2)';
    return;
  }
  const stopWord = activeState === 'ON' ? '<span style="color:var(--fault)">goes HIGH (ON)</span>' : '<span style="color:var(--fault)">goes LOW (OFF)</span>';
  hint.innerHTML = `⚡ EOL Sensor active — Line will STOP when <strong style="color:var(--purple)">${reg}</strong> ${stopWord}<br>
    &nbsp;&nbsp;LINE STOPPED = any button pressed OR sensor triggers`;
  hint.style.color = 'var(--purple)';
}

// ── Toggle a single KPI on / off ─────────────────────────────────────────────
function toggleKpi(key, btn) {
  const isOn = btn.classList.contains('kpi-on');
  const row  = document.getElementById(`kpiRow-${key}`);
  // Build input ID from key: 'oee' → 'lbRegOee', 'drr1' → 'lbRegDrr1', etc.
  const inputId = 'lbReg' + key.charAt(0).toUpperCase() + key.slice(1);
  const inp  = document.getElementById(inputId);

  if (isOn) {
    // Turn OFF
    btn.textContent = 'OFF';
    btn.classList.replace('kpi-on', 'kpi-off');
    btn.title = `Click to enable ${key.toUpperCase()}`;
    row?.classList.add('kpi-disabled');
    if (inp) inp.disabled = true;
  } else {
    // Turn ON
    btn.textContent = 'ON';
    btn.classList.replace('kpi-off', 'kpi-on');
    btn.title = `Click to disable ${key.toUpperCase()}`;
    row?.classList.remove('kpi-disabled');
    if (inp) inp.disabled = false;
  }
}

// ── Colour helpers ───────────────────────────────────────────────────────────
function _btnBg(color) {
  const map = {
    yellow: '#e6d000', orange: '#e65c00', red:    '#cc0000',
    purple: '#6a0dad', blue:   '#0047ab', green:  '#006600',
    cyan:   '#007b8a', white:  '#e0e0e0',
  };
  return map[color] || '#444';
}
function _btnBorder(color) {
  const map = {
    yellow: '#fff176', orange: '#ffb74d', red:    '#ff5252',
    purple: '#ce93d8', blue:   '#90caf9', green:  '#a5d6a7',
    cyan:   '#80deea', white:  '#ffffff',
  };
  return map[color] || '#888';
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
