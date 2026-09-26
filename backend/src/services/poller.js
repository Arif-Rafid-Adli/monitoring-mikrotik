const pool = require('../config/db');
const { fetchSwitchSnapshot } = require('./mikrotik');

let latestSnapshot = [];
let pollTimer = null;

function getLatestSnapshot() {
  return latestSnapshot;
}

async function saveSnapshotToDb(switchId, portsSnapshot) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const port of portsSnapshot) {
      await conn.query(
        `INSERT INTO port_logs (switch_id, interface_name, status, poe_supported, tx_mbps, rx_mbps)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [switchId, port.interfaceName, port.status, port.poeSupported ? 1 : 0, port.txMbps, port.rxMbps]
      );

      for (const device of port.devices) {
        await conn.query(
          `INSERT INTO connected_devices (switch_id, interface_name, device_name, mac_address)
           VALUES (?, ?, ?, ?)`,
          [switchId, port.interfaceName, device.name, device.mac]
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('Gagal menyimpan snapshot ke database:', err.message);
  } finally {
    conn.release();
  }
}

/**
 * Menjalankan polling berkala ke switch Mikrotik dan menyiarkan hasilnya
 * lewat Socket.IO, sekaligus menyimpan log ke database.
 */
function startPolling(io) {
  const intervalMs = Number(process.env.POLL_INTERVAL_MS || 5000);

  const tick = async () => {
    try {
      const [[switchRow]] = await pool.query('SELECT id FROM switches ORDER BY id LIMIT 1');
      if (!switchRow) {
        console.warn('Belum ada data switch di tabel `switches`.');
        return;
      }

      const snapshot = await fetchSwitchSnapshot();
      latestSnapshot = snapshot;

      io.emit('ports:update', {
        switchId: switchRow.id,
        timestamp: new Date().toISOString(),
        ports: snapshot,
      });

      // Simpan log tanpa memblokir siklus polling berikutnya.
      saveSnapshotToDb(switchRow.id, snapshot).catch((e) =>
        console.error('saveSnapshotToDb error:', e.message)
      );
    } catch (err) {
      console.error('Polling Mikrotik gagal:', err.message);
      io.emit('ports:error', { message: 'Gagal terhubung ke switch Mikrotik' });
    }
  };

  tick();
  pollTimer = setInterval(tick, intervalMs);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}

module.exports = { startPolling, stopPolling, getLatestSnapshot };
