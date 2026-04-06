/**
 * readwrite.js — On-demand register Read / Write operations.
 */

async function doRead() {
  const pid   = +document.getElementById('rdPlc').value;
  const dev   = document.getElementById('rdDev').value.trim().toUpperCase();
  const count = +document.getElementById('rdCnt').value;
  const type  = document.getElementById('rdType').value;
  const box   = document.getElementById('rdRes');

  box.textContent = '// Reading…';
  box.style.color = 'var(--muted2)';

  try {
    const res  = await fetch(`${API}/plcs/${pid}/read`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device: dev, count, type }),
    });
    const data = await res.json();

    if (data.success) {
      const prefix = dev.replace(/\d+$/, '');
      const base   = parseInt(dev.replace(/\D/g, '')) || 0;
      const lines  = data.values.map((v, i) => {
        const addr = type === 'bit'
          ? prefix + (base + i).toString(prefix === 'X' || prefix === 'Y' ? 16 : 10).toUpperCase()
          : prefix + (base + i);
        return `${addr.padEnd(8)} = ${type === 'bit' ? (v ? 'ON ' : 'OFF') : v}`;
      }).join('\n');

      box.textContent = lines;
      box.style.color = 'var(--green)';
      addEvent('ok', `Read ${dev}×${count} from PLC-${pid}`);
    } else {
      box.textContent = `ERROR: ${data.error}`;
      box.style.color = 'var(--red)';
    }
  } catch {
    box.textContent = 'ERROR: Backend offline\nStart run.py first';
    box.style.color = 'var(--red)';
  }
}

async function doWrite() {
  const pid  = +document.getElementById('wrPlc').value;
  const dev  = document.getElementById('wrDev').value.trim().toUpperCase();
  const val  = +document.getElementById('wrVal').value;
  const type = document.getElementById('wrType').value;
  const box  = document.getElementById('wrRes');

  box.textContent = '// Writing…';
  box.style.color = 'var(--muted2)';

  // Prefer WebSocket for lower latency
  if (socket && socket.connected) {
    socket.emit('write_register', { plc_id: pid, device: dev, values: [val], type });
    box.textContent = `// Sent: ${dev} = ${val}`;
    box.style.color = 'var(--accent)';
    return;
  }

  // REST fallback
  try {
    const res  = await fetch(`${API}/plcs/${pid}/write`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device: dev, values: [val], type }),
    });
    const data = await res.json();

    box.textContent = data.success
      ? `✓ Written: ${dev} = ${val}`
      : `✕ Error: ${data.error}`;
    box.style.color = data.success ? 'var(--green)' : 'var(--red)';
    if (data.success) showToast(`✓ ${dev} = ${val}`);
  } catch {
    box.textContent = 'ERROR: Backend offline';
    box.style.color = 'var(--red)';
  }
}
