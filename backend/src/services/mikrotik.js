/**
 * Service untuk komunikasi dengan switch Mikrotik lewat RouterOS API.
 *
 * CATATAN PENTING:
 * - Pastikan API service aktif di switch: /ip service enable api
 * - Nama field yang dikembalikan RouterOS API bisa sedikit berbeda tergantung
 *   versi RouterOS dan model switch (CRS vs CSS, dst). Sesuaikan mapping di
 *   bawah ini jika field tidak sesuai dengan output asli perangkat Anda.
 * - Untuk switch murni (mode "switch-chip", misal CSS610/CSS326), beberapa
 *   command interface/bridge mungkin perlu disesuaikan (mis. menggunakan
 *   /interface/ethernet/switch/... alih-alih bridge host table).
 */

const { RouterOSAPI } = require('node-routeros');

let connection = null;

async function getConnection() {
  if (connection && connection.connected) {
    return connection;
  }

  connection = new RouterOSAPI({
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: Number(process.env.MIKROTIK_API_PORT || 8728),
    timeout: 8,
  });

  await connection.connect();
  return connection;
}

/**
 * Mengambil daftar interface ethernet dasar: nama, status (running/disabled).
 */
async function fetchInterfaces(conn) {
  const rows = await conn.write('/interface/print');
  return rows
    .filter((r) => r.type === 'ether' || r['.type'] === 'ether' || /^ether|^sfp/.test(r.name || ''))
    .map((r) => ({
      name: r.name,
      running: r.running === 'true' || r.running === true,
      disabled: r.disabled === 'true' || r.disabled === true,
    }));
}

/**
 * Mengambil daftar port yang mendukung PoE-out.
 * Port yang MUNCUL di hasil /interface/ethernet/poe/print dianggap PoE-capable.
 */
async function fetchPoeCapablePorts(conn) {
  try {
    const rows = await conn.write('/interface/ethernet/poe/print');
    // field nama interface pada beberapa versi bernama "name", pada versi lain
    // baris ini berurutan sesuai index port ethernet - sesuaikan bila perlu.
    return new Set(rows.map((r) => r.name).filter(Boolean));
  } catch (err) {
    // Switch tanpa fitur PoE sama sekali akan melempar error command not found.
    return new Set();
  }
}

/**
 * Mengambil throughput real-time (Mbps) untuk banyak interface sekaligus.
 */
async function fetchTraffic(conn, interfaceNames) {
  if (interfaceNames.length === 0) return {};

  const rows = await conn.write('/interface/monitor-traffic', [
    `=interface=${interfaceNames.join(',')}`,
    '=once=',
  ]);

  const result = {};
  for (const r of rows) {
    const name = r.name || r.interface;
    const rxBps = Number(r['rx-bits-per-second'] || 0);
    const txBps = Number(r['tx-bits-per-second'] || 0);
    result[name] = {
      rxMbps: Number((rxBps / 1_000_000).toFixed(3)),
      txMbps: Number((txBps / 1_000_000).toFixed(3)),
    };
  }
  return result;
}

/**
 * Mengambil mapping MAC address -> interface, dari tabel bridge host.
 */
async function fetchBridgeHosts(conn) {
  try {
    const rows = await conn.write('/interface/bridge/host/print');
    return rows
      .filter((r) => r.local !== 'true' && r.local !== true)
      .map((r) => ({
        mac: r['mac-address'],
        interface: r['on-interface'] || r.interface,
      }));
  } catch (err) {
    return [];
  }
}

/**
 * Mengambil hostname device dari DHCP lease (untuk melengkapi nama device
 * yang terhubung ke tiap port, berdasarkan MAC address).
 */
async function fetchDhcpLeases(conn) {
  try {
    const rows = await conn.write('/ip/dhcp-server/lease/print');
    const map = {};
    for (const r of rows) {
      if (r['mac-address']) {
        map[r['mac-address'].toUpperCase()] = r['host-name'] || null;
      }
    }
    return map;
  } catch (err) {
    return {};
  }
}

/**
 * Fungsi utama: mengambil snapshot lengkap seluruh port switch.
 * Return: array of { interfaceName, status, poeSupported, txMbps, rxMbps, devices: [{name, mac}] }
 */
async function fetchSwitchSnapshot() {
  const conn = await getConnection();

  const [interfaces, poeCapable, bridgeHosts, dhcpLeases] = await Promise.all([
    fetchInterfaces(conn),
    fetchPoeCapablePorts(conn),
    fetchBridgeHosts(conn),
    fetchDhcpLeases(conn),
  ]);

  const traffic = await fetchTraffic(conn, interfaces.map((i) => i.name));

  const devicesByInterface = {};
  for (const host of bridgeHosts) {
    if (!host.interface || !host.mac) continue;
    if (!devicesByInterface[host.interface]) devicesByInterface[host.interface] = [];
    devicesByInterface[host.interface].push({
      mac: host.mac,
      name: dhcpLeases[host.mac.toUpperCase()] || null,
    });
  }

  return interfaces.map((iface) => ({
    interfaceName: iface.name,
    status: !iface.disabled && iface.running ? 'up' : 'down',
    poeSupported: poeCapable.has(iface.name),
    txMbps: traffic[iface.name]?.txMbps ?? 0,
    rxMbps: traffic[iface.name]?.rxMbps ?? 0,
    devices: devicesByInterface[iface.name] || [],
  }));
}

module.exports = { fetchSwitchSnapshot };
