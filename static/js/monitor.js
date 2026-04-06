/**
 * monitor.js — PLC card rendering (industrial faceplate style),
 *              network topology map, system event log.
 */

let prevRegs = {};

/** Colour for CPU load bar fill. */
function cpuColour(v) {
  return v < 60 ? 'var(--run)' : v < 85 ? 'var(--warn)' : 'var(--fault)';
}

// ── PLC Cards — Stitch Glassmorphism Style ────────────────────────────────
function renderCards() {
  const grid  = document.getElementById('pgrid');
  grid.innerHTML = '';

  const badge = document.getElementById('plcCountBadge');
  if (badge) badge.textContent = `Displaying ${plcData.length} Nodes`;

  plcData.forEach(plc => {
    const sc   = plc.status === 'error' ? 'error' : plc.status;
    const card = document.createElement('div');
    card.className = `pc s-${sc}`;
    
    // Clicking the card opens the VIEW modal
    card.onclick   = (e) => {
      if (e.target.classList.contains('pc-settings')) return; // ignore settings gear
      openModal(plc);
    };

    const regs = plc.registers || {};
    const prev = prevRegs[plc.id] || {};

    const bdgLabel = sc === 'online'  ? 'RUNNING'
                   : sc === 'offline' ? 'OFFLINE'
                   : sc === 'warning' ? 'WARNING'
                   : 'FAULTED';

    const ioCount = plc.io_count || (plc.model ? '' : '—');

    const cpuPct  = plc.cpu || 0;
    const cpuCol  = cpuColour(cpuPct);
    const cpuHtml = `
      <div class="pc-cpu-wrap">
        <span class="pc-cpu-lbl">CPU Load</span>
        <div class="pc-cpu-bar-wrap">
          <div class="pc-cpu-bar" style="width:${Math.min(cpuPct,100)}%;background:${cpuCol}"></div>
        </div>
        <span class="pc-cpu-val" style="color:${cpuCol}">${cpuPct}%</span>
      </div>`;

    const errHtml = plc.errors && plc.errors.length
      ? `<div class="pc-errs">
           ${plc.errors.slice(0,2).map(e => `<div class="pc-err">${e.desc}</div>`).join('')}
         </div>`
      : '';

    const pollTime = plc.last_poll
      ? `Poll: ${new Date(plc.last_poll).toLocaleTimeString('en-GB',{hour12:false})}`
      : (sc === 'offline' ? 'Offline' : 'Poll: —');

    card.innerHTML = `
      <div class="pc-hd">
        <div class="pc-hd-left">
          <div class="pc-name">${plc.name}</div>
          <div class="pc-model">${plc.model || 'UNKNOWN'}</div>
        </div>
        <div class="bdg ${sc}">${bdgLabel}</div>
      </div>
      <div class="pc-rows">
        <div class="pc-row">
          <span class="pc-row-l">IP Address</span>
          <span class="pc-row-v">${plc.ip || '—'}</span>
        </div>
        ${ioCount ? `<div class="pc-row">
          <span class="pc-row-l">I/O Count</span>
          <span class="pc-row-v">${ioCount}</span>
        </div>` : ''}
        <div class="pc-row">
          <span class="pc-row-l">Location</span>
          <span class="pc-row-v">${plc.location || '—'}</span>
        </div>
      </div>
      ${cpuHtml}
      <div class="pc-foot">
        <span class="pc-poll">${pollTime}</span>
        <span class="material-symbols-outlined pc-settings" onclick="showEditPlcModal(${plc.id})">settings</span>
      </div>
      ${errHtml}
    `;

    grid.appendChild(card);
    prevRegs[plc.id] = { ...regs };
  });

  populateSelects();
}

// ── CRUD Logic (Add / Edit / Delete) ───────────────────────────────────────

function showAddPlcModal() {
  const modal = document.getElementById('mo');
  document.getElementById('mtit').textContent = 'ADD NEW PLC DEVICE';
  document.getElementById('msub').textContent = 'Configure a new network node';
  
  const formHtml = `
    <div style="grid-column: 1/-1; display:flex; flex-direction:column; gap:12px">
      <div class="fr"><label class="fl">Device Name</label><input class="fi" id="plc-name" placeholder="PLC-LINE-05"></div>
      <div class="fr"><label class="fl">IP Address</label><input class="fi" id="plc-ip" placeholder="192.168.1.50"></div>
      <div class="fr"><label class="fl">Port (MC Protocol)</label><input class="fi" id="plc-port" type="number" value="5001"></div>
      <div class="frw">
        <div class="fr"><label class="fl">CPU Model</label><input class="fi" id="plc-model" placeholder="Q03UDECPU"></div>
        <div class="fr"><label class="fl">PLC Type (I/O Addressing)</label>
          <select class="fi" id="plc-type" style="padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #000; color: #fff">
            <option value="hex">Q/L/iQ-R Series (Hex X/Y)</option>
            <option value="octal">FX Series (Octal X/Y)</option>
          </select>
        </div>
      </div>
      <div class="fr"><label class="fl">Location</label><input class="fi" id="plc-location" placeholder="Section A"></div>
      <button class="sb-btn save" style="margin-top:10px;width:100%" onclick="savePlc()">✓ SAVE DEVICE</button>
    </div>
  `;
  document.getElementById('mgrid').innerHTML = formHtml;
  document.getElementById('merr').innerHTML  = '';
  modal.classList.add('open');
}

async function showEditPlcModal(id) {
  const plc = plcData.find(p => p.id === id);
  if (!plc) return;

  const modal = document.getElementById('mo');
  document.getElementById('mtit').textContent = `EDIT DEVICE: ${plc.name}`;
  document.getElementById('msub').textContent = 'Modify network parameters';
  
  const formHtml = `
    <div style="grid-column: 1/-1; display:flex; flex-direction:column; gap:12px">
      <input type="hidden" id="plc-id" value="${plc.id}">
      <div class="fr"><label class="fl">Device Name</label><input class="fi" id="plc-name" value="${plc.name}"></div>
      <div class="fr"><label class="fl">IP Address</label><input class="fi" id="plc-ip" value="${plc.ip}"></div>
      <div class="fr"><label class="fl">Port</label><input class="fi" id="plc-port" type="number" value="${plc.port || 5001}"></div>
      <div class="frw">
        <div class="fr"><label class="fl">CPU Model</label><input class="fi" id="plc-model" value="${plc.model || ''}"></div>
        <div class="fr"><label class="fl">PLC Type (I/O)</label>
          <select class="fi" id="plc-type" style="padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #000; color: #fff">
            <option value="hex" ${plc.plc_type !== 'octal' ? 'selected' : ''}>Q/L/iQ-R Series (Hex X/Y)</option>
            <option value="octal" ${plc.plc_type === 'octal' ? 'selected' : ''}>FX Series (Octal X/Y)</option>
          </select>
        </div>
      </div>
      <div class="fr"><label class="fl">Location</label><input class="fi" id="plc-location" value="${plc.location || ''}"></div>
      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="sb-btn save" style="flex:1" onclick="savePlc(${plc.id})">✓ UPDATE</button>
        <button class="sb-btn del" style="flex:1" onclick="deletePlc(${plc.id})">✕ DELETE</button>
      </div>
    </div>
  `;
  document.getElementById('mgrid').innerHTML = formHtml;
  document.getElementById('merr').innerHTML  = '';
  modal.classList.add('open');
}

async function savePlc(id) {
  const body = {
    name:     document.getElementById('plc-name').value,
    ip:       document.getElementById('plc-ip').value,
    port:     parseInt(document.getElementById('plc-port').value),
    model:    document.getElementById('plc-model').value,
    location: document.getElementById('plc-location').value,
    plc_type: document.getElementById('plc-type').value,
  };

  const url = id ? `${API}/plcs/${id}` : `${API}/plcs`;
  const res = await fetch(url, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await res.json();
  if (data.success) {
    showToast(id ? '✓ Device updated' : '✓ New device added');
    document.getElementById('mo').classList.remove('open');
    // Refresh will happen via next socket tick, but we can force it
    forceRefresh();
  } else {
    alert('Error: ' + data.error);
  }
}

async function deletePlc(id) {
  if (!confirm('Are you sure you want to remove this device from the network monitor?')) return;
  
  const res = await fetch(`${API}/plcs/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.success) {
    showToast('✓ Device removed');
    document.getElementById('mo').classList.remove('open');
    forceRefresh();
  }
}

// ── Network Topology Map ───────────────────────────────────────────────────
function drawNetworkMap() {
  const canvas = document.getElementById('netCv');
  if (!canvas || !plcData.length) return;

  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.36;

  ctx.clearRect(0, 0, W, H);

  // Draw grid overlay
  ctx.strokeStyle = 'rgba(0,188,212,.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  plcData.forEach((plc, i) => {
    const angle = (i / plcData.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const col = plc.status === 'online'  ? '#00e676'
              : plc.status === 'offline' ? '#ff1744'
              : plc.status === 'warning' ? '#ff9100'
              : '#ff6d00';

    // Dashed cable line to switch
    ctx.beginPath();
    ctx.strokeStyle = col + '55';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glow halo on online nodes
    if (plc.status === 'online') {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = col + '22';
      ctx.fill();
    }

    // Node dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // PLC label
    ctx.font      = '7px Share Tech Mono';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    const lx = cx + Math.cos(angle) * (radius + 18);
    const ly = cy + Math.sin(angle) * (radius + 18);
    ctx.fillText(plc.name.split('-').slice(-1)[0], lx, ly + 3);
  });

  // Central switch node
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#00bcd4';
  ctx.shadowColor = '#00bcd4';
  ctx.shadowBlur  = 14;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // Switch ring
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,188,212,.4)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.font      = '7px Share Tech Mono';
  ctx.fillStyle = '#4a8090';
  ctx.textAlign = 'center';
  ctx.fillText('SWITCH', cx, cy + 26);
}

// ── System Event Log ───────────────────────────────────────────────────────
function addEvent(type, message) {
  const log  = document.getElementById('evl');
  const time = new Date().toTimeString().slice(0, 8);
  const div  = document.createElement('div');
  div.className = `ev ${type}`;
  div.innerHTML = `<span class="et">${time}</span><span>${message}</span>`;
  log.insertBefore(div, log.firstChild);
  if (log.children.length > 30) log.removeChild(log.lastChild);
}

function forceRefresh() {
  addEvent('info', 'Manual scan requested…');
}
