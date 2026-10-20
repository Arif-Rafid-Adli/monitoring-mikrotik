const pool = require('../config/db');
const { fetchSwitchSnapshot } = require('./mikrotik');

let latestSnapshot = [];
let latestTimestamp = null;
let timers = [];

const prevStatus = new Map(); // interfaceName -> 'up' | 'down'
let switchReachable = null; // null = belum diketahui
let lastLogAt = 0;

function getLatestSnapshot() {
  return latestSnapshot;
}

function getLatestTimestamp() {
  return latestTimestamp;
}

function getStaleAfterMs() {
  const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);
  return Math.max(pollMs * 3, 30000);
}

function getSwitchReachable() {
  return switchReachable;
}

/** Simpan event ke DB lalu kembalikan dalam bentuk siap kirim ke frontend. */
async function recordEvents(switchId, events) {
  if (events.length === 0) return [];
  const now = new Date();
  const saved = [];
  for (const ev of events) {
    const [res] = await pool.query(
      `INSERT INTO port_events (switch_id, interface_name, event_type, message, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [switchId, ev.interfaceName || null, ev.type, ev.message, now]
    );
    saved.push({
      id: res.insertId,
      interface_name: ev.interfaceName || null,
      event_type: ev.type,
      message: ev.message,
      recorded_at: now.toISOString(),
    });
  }
  return saved;
}

/** Simpan snapshot berkala (bulk insert) untuk histori. */
async function saveSnapshotToDb(switchId, ports) {
  const now = new Date();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const portRows = ports.map((p) => [
      switchId, p.interfaceName, p.status, p.poeSupported ? 1 : 0, p.txMbps, p.rxMbps, now,
    ]);
    if (portRows.length) {
      await conn.query(
        `INSERT INTO port_logs (switch_id, interface_name, status, poe_supported, tx_mbps, rx_mbps, recorded_at)
         VALUES ?`,
        [portRows]
      );
    }

    const deviceRows = ports.flatMap((p) =>
      p.devices.map((d) => [switchId, p.interfaceName, d.name, d.mac, now])
    );
    if (deviceRows.length) {
      await conn.query(
        `INSERT INTO connected_devices (switch_id, interface_name, device_name, mac_address, recorded_at)
         VALUES ?`,
        [deviceRows]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('Gagal menyimpan snapshot ke database:', err.message);
  } finally {
    conn.release();
  }
}

/** Hapus log lama agar tabel tidak membengkak. */
async function pruneOldLogs() {
  const days = Number(process.env.LOG_RETENTION_DAYS || 7);
  if (!(days > 0)) return;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    for (const table of ['port_logs', 'connected_devices', 'port_events']) {
      await pool.query(`DELETE FROM ${table} WHERE recorded_at < ?`, [cutoff]);
    }
  } catch (err) {
    console.error('Gagal membersihkan log lama:', err.message);
  }
}

function detectStatusChanges(snapshot) {
  const events = [];
  for (const port of snapshot) {
    const before = prevStatus.get(port.interfaceName);
    // Poll pertama hanya membentuk baseline, tidak menghasilkan event.
    if (before && before !== port.status) {
      events.push({
        interfaceName: port.interfaceName,
        type: port.status === 'up' ? 'port_up' : 'port_down',
        message: `${port.interfaceName} ${port.status === 'up' ? 'ON (link naik)' : 'OFF (link turun)'}`,
      });
    }
    prevStatus.set(port.interfaceName, port.status);
  }
  return events;
}

function startPolling(io, switchId) {
  const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);
  const logMs = Number(process.env.LOG_INTERVAL_MS || 60000);
  let running = false;

  const tick = async () => {
    if (running) return; // jangan menumpuk jika switch lambat merespons
    running = true;
    try {
      const snapshot = await fetchSwitchSnapshot();
      latestSnapshot = snapshot;
      latestTimestamp = new Date().toISOString();

      const events = [];
      if (switchReachable === false) {
        events.push({ type: 'switch_reachable', message: 'Switch kembali terhubung' });
      }
      switchReachable = true;
      events.push(...detectStatusChanges(snapshot));

      io.emit('ports:update', {
        switchId,
        timestamp: latestTimestamp,
        staleAfterMs: getStaleAfterMs(),
        switchReachable: true,
        ports: snapshot,
      });

      if (events.length) {
        try {
          const saved = await recordEvents(switchId, events);
          io.emit('events:new', { events: saved });
        } catch (err) {
          console.error('Gagal mencatat event:', err.message);
        }
      }

      if (Date.now() - lastLogAt >= logMs) {
        lastLogAt = Date.now();
        saveSnapshotToDb(switchId, snapshot).catch((e) => console.error('saveSnapshotToDb:', e.message));
      }
    } catch (err) {
      console.error('Polling Mikrotik gagal:', err.message);
      io.emit('ports:error', { message: 'Gagal terhubung ke switch Mikrotik' });
      if (switchReachable !== false) {
        switchReachable = false;
        try {
          const saved = await recordEvents(switchId, [
            { type: 'switch_unreachable', message: 'Switch tidak dapat dihubungi (RouterOS API)' },
          ]);
          io.emit('events:new', { events: saved });
        } catch (e) {
          console.error('Gagal mencatat event:', e.message);
        }
      }
    } finally {
      running = false;
    }
  };

  tick();
  timers.push(setInterval(tick, pollMs));
  pruneOldLogs();
  timers.push(setInterval(pruneOldLogs, 60 * 60 * 1000));
}

function stopPolling() {
  timers.forEach(clearInterval);
  timers = [];
}

module.exports = {
  startPolling,
  stopPolling,
  getLatestSnapshot,
  getLatestTimestamp,
  getStaleAfterMs,
  getSwitchReachable,
};
