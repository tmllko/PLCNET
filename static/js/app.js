/**
 * app.js — Application bootstrap.
 *
 * Shared mutable state (written by socket.js, read by all page modules):
 *   plcData  — array of live PLC state objects
 *   ioData   — map of plc_id → {X,Y,M,D} arrays
 *   alarms   — array of active alarm objects
 */

let plcData = [];
let ioData  = {};
let alarms  = [];

window.addEventListener('load', async () => {
  // 1. Initial REST fetch so UI is populated before first WS push
  try {
    const [plcRes, cfgRes] = await Promise.all([
      fetch(`${API}/plcs`).then(r => r.json()),
      fetch(`${API}/log/config`).then(r => r.json()),
    ]);

    if (plcRes.success) {
      plcData = plcRes.plcs;
      renderCards();
      updateStats();
      populateSelects();
      populateAlarmPlcFilter();
      renderSchdPlcList();
    }

    // Restore locally-staged log config from server
    if (cfgRes.success && cfgRes.config) {
      logCfgLocal = [];
      Object.entries(cfgRes.config).forEach(([pid, items]) => {
        items.forEach(item => logCfgLocal.push({ ...item, plc_id: +pid }));
      });
      renderLogItems();
    }

    setConn('live', 'CONNECTED');
  } catch {
    setConn('dead', 'OFFLINE');
    addEvent('err', 'Backend offline — start run.py');
  }

  // 2. Draw network map after layout is ready
  setTimeout(drawNetworkMap, 100);

  // 3. Connect WebSocket
  initSocket();

  // 4. Periodically refresh log records even when no WS push arrives
  setInterval(fetchLogRecords, 5000);

  // 6. Fetch alarm history every 10 seconds
  setInterval(fetchAlarmHistory, 10000);

  // 7. Fetch schedule status every 30 seconds
  setInterval(fetchSchedule, 30000);
  fetchSchedule();

  // 8. Load email config
  fetchEmailConfig();
});

// Redraw network map on window resize
window.addEventListener('resize', drawNetworkMap);
