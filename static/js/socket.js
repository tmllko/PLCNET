/**
 * socket.js — WebSocket (Socket.IO) connection + REST fallback polling.
 *
 * On connect: prefers WebSocket for real-time updates.
 * On failure: falls back to REST polling every 3 seconds.
 */

let socket;

function initSocket() {
  socket = io(WS, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    setConn('live', 'LIVE');
    addEvent('ok', 'Connected to backend');
  });

  socket.on('disconnect', () => {
    setConn('dead', 'OFFLINE');
    addEvent('err', 'Backend disconnected');
  });

  socket.on('connect_error', () => {
    setConn('dead', 'OFFLINE');
    startRestPolling();
  });

  // Main data push from server every POLL_INTERVAL seconds
  socket.on('plc_update', data => {
    plcData = data.plcs;
    ioData  = data.io || {};
    alarms  = data.alarms || [];

    renderCards();
    updateStats();
    drawNetworkMap();
    updateAlarms();
    fetchLogRecords();
  });

  // Write confirmation
  socket.on('write_result', data => {
    const box = document.getElementById('wrRes');
    box.textContent = data.success
      ? `✓ Written: ${data.device} = OK`
      : `✕ Error: ${data.error}`;
    box.style.color = data.success ? 'var(--green)' : 'var(--red)';
    showToast(data.success ? `✓ ${data.device} written` : `✕ Write failed: ${data.error}`);
    addEvent(data.success ? 'ok' : 'err',
      data.success ? `Written ${data.device} PLC-${data.plc_id}` : `Write error: ${data.error}`);
  });

  // Cable re-insertion detected: PLC came back online
  socket.on('plc_reconnect', data => {
    addEvent('ok', `🔌 ${data.message}`);
    showToast(`✅ ${data.name} reconnected`);
  });
}

/** Fallback: poll REST endpoints if WebSocket is unavailable. */
function startRestPolling() {
  (async function poll() {
    try {
      const [plcRes, alarmRes] = await Promise.all([
        fetch(`${API}/plcs`).then(r => r.json()),
        fetch(`${API}/alarms`).then(r => r.json()),
      ]);

      if (plcRes.success) {
        plcData = plcRes.plcs;
        renderCards();
        updateStats();
        drawNetworkMap();
      }
      if (alarmRes.success) {
        alarms = alarmRes.alarms;
        updateAlarms();
      }
      setConn('live', 'REST');
    } catch {
      setConn('dead', 'OFFLINE');
    }
    setTimeout(poll, 3000);
  })();
}
