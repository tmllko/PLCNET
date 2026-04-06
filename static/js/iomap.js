/**
 * iomap.js — I/O Map page: renders X / Y / M / D tables for a selected PLC.
 */

function renderIO() {
  const sel = document.getElementById('ioPlcSel');
  const pid = +sel.value;
  if (!pid) return;

  const io = ioData[String(pid)] || {};
  const x  = io.X || [], y = io.Y || [], m = io.M || [], d = io.D || [];
  const xOn = x.filter(v => v).length;
  const yOn = y.filter(v => v).length;
  const mOn = m.filter(v => v).length;

  // Summary tiles
  document.getElementById('ioSummary').innerHTML = `
    <div class="io-sum"><div class="io-sum-v" style="color:#00aaff">${xOn}/${x.length}</div><div class="io-sum-l">Inputs ON</div></div>
    <div class="io-sum"><div class="io-sum-v" style="color:var(--green)">${yOn}/${y.length}</div><div class="io-sum-l">Outputs ON</div></div>
    <div class="io-sum"><div class="io-sum-v" style="color:var(--yellow)">${mOn}/${m.length}</div><div class="io-sum-l">Relays ON</div></div>
    <div class="io-sum"><div class="io-sum-v" style="color:var(--purple)">${d.length}</div><div class="io-sum-l">D Registers</div></div>
  `;

  // Bit rows
  const makeBits = (arr, prefix) => arr.map((v, i) => {
    const addr = (prefix === 'X' || prefix === 'Y') ? i.toString(16).toUpperCase() : i;
    return `<div class="io-bit ${v ? 'on' : 'off'}"><div class="ibd"></div>${prefix}${addr}</div>`;
  }).join('');

  // Word rows with progress bar
  const makeWords = arr => arr.map((v, i) => {
    const pct = Math.min(v / 9999 * 100, 100);
    return `<div class="io-word">
      <div class="iw-name">D${i}</div>
      <div class="iw-val">${v}</div>
      <div class="iw-bar"><div class="iw-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  document.getElementById('ioSections').innerHTML = `
    <div class="io-section">
      <div class="io-sh x">X — INPUTS (${x.length} points, ${xOn} ON)</div>
      <div class="io-bits">${makeBits(x, 'X')}</div>
    </div>
    <div class="io-section">
      <div class="io-sh y">Y — OUTPUTS (${y.length} points, ${yOn} ON)</div>
      <div class="io-bits">${makeBits(y, 'Y')}</div>
    </div>
    <div class="io-section">
      <div class="io-sh m">M — INTERNAL RELAYS (${m.length} points, ${mOn} ON)</div>
      <div class="io-bits">${makeBits(m, 'M')}</div>
    </div>
    <div class="io-section">
      <div class="io-sh d">D — DATA REGISTERS (${d.length} points)</div>
      <div class="io-words">${makeWords(d)}</div>
    </div>
  `;

  document.getElementById('ioStatus').textContent =
    `Last updated: ${new Date().toTimeString().slice(0, 8)}`;
}
