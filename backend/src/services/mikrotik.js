/**
 * Komunikasi dengan perangkat Mikrotik lewat RouterOS API (port 8728).
 * Aktifkan dulu di perangkat:  /ip service enable api
 *
 * Nama field bisa sedikit berbeda antar model/versi RouterOS. Jika hasil di dashboard
 * tidak sesuai, cek output `print` asli di Winbox/terminal lalu sesuaikan mapping di sini.
 */
const { RouterOSAPI } = require('node-routeros');

let connection = null;
let connecting = null;

function resetConnection() {
  const old = connection;
  connection = null;
  connecting = null;
  if (old) {
    try {
      old.close().catch(() => {});
    } catch (e) {
      /* abaikan */
    }
  }
}

async function getConnection() {
  if (connection && connection.connected) return connection;
  if (connecting) return connecting;

  connecting = (async () => {
    const conn = new RouterOSAPI({
      host: process.env.MIKROTIK_HOST,
      user: process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASSWORD,
      port: Number(process.env.MIKROTIK_API_PORT || 8728),
      timeout: 8,
    });
    // Tanpa listener 'error', error socket akan mematikan proses Node.
    conn.on('error', (err) => console.error('RouterOS socket error:', err?.message || err));
    await conn.connect();
    connection = conn;
    return conn;
  })();

  try {
    return await connecting;
  } catch (err) {
    resetConnection();
    throw err;
  } finally {
    connecting = null;
  }
}

const isTrue = (v) => v === true || v === 'true' || v === 'yes';

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Daftar interface fisik (ether*, sfp*) beserta statusnya. */
async function fetchInterfaces(conn) {
  const rows = await conn.write('/interface/print');
  return rows
    .filter((r) => r.type === 'ether' || /^(ether|sfp|qsfp)/i.test(r.name || ''))
    .map((r) => ({
      name: r.name,
      running: isTrue(r.running),
      disabled: isTrue(r.disabled),
    }))
    .sort((a, b) => naturalCompare(a.name, b.name));
}

/**
 * Port yang mendukung PoE-out = port yang muncul di /interface/ethernet/poe/print.
 * Switch tanpa PoE akan error "no such command" -> semua port dianggap non-PoE.
 */
async function fetchPoeCapablePorts(conn) {
  try {
    const rows = await conn.write('/interface/ethernet/poe/print');
    return new Set(rows.map((r) => r.name).filter(Boolean));
  } catch (err) {
    return new Set();
  }
}

/** Throughput real-time (Mbps) untuk banyak interface sekaligus. */
async function fetchTraffic(conn, interfaceNames) {
  if (interfaceNames.length === 0) return {};

  const rows = await conn.write('/interface/monitor-traffic', [
    `=interface=${interfaceNames.join(',')}`,
    '=once=',
  ]);

  const result = {};
  for (const r of rows) {
    const name = r.name || r.interface;
    if (!name) continue;
    result[name] = {
      rxMbps: Number((Number(r['rx-bits-per-second'] || 0) / 1_000_000).toFixed(3)),
      txMbps: Number((Number(r['tx-bits-per-second'] || 0) / 1_000_000).toFixed(3)),
    };
  }
  return result;
}

/** MAC address -> interface, dari tabel host bridge. */
async function fetchBridgeHosts(conn) {
  try {
    const rows = await conn.write('/interface/bridge/host/print');
    return rows
      .filter((r) => !isTrue(r.local))
      .map((r) => ({
        mac: (r['mac-address'] || '').toUpperCase(),
        interface: r['on-interface'] || r.interface,
      }));
  } catch (err) {
    return [];
  }
}

/** MAC address perangkat tetangga yang mengiklankan diri pada tiap interface. */
async function fetchNeighborMacs(conn) {
  try {
    const rows = await conn.write('/ip/neighbor/print');
    const map = {};
    for (const row of rows) {
      const interfaceName = row.interface || row['interface-name'];
      const mac = (row['mac-address'] || '').toUpperCase();
      if (interfaceName && mac && !map[interfaceName]) map[interfaceName] = mac;
    }
    return map;
  } catch (err) {
    return {};
  }
}

/** MAC address -> nama device, dari DHCP lease (host-name, fallback ke comment). */
async function fetchDhcpLeases(conn) {
  try {
    const rows = await conn.write('/ip/dhcp-server/lease/print');
    const map = {};
    for (const r of rows) {
      const mac = (r['mac-address'] || '').toUpperCase();
      if (mac) map[mac] = r['host-name'] || r.comment || null;
    }
    return map;
  } catch (err) {
    return {};
  }
}

/**
 * Snapshot seluruh port:
 * [{ interfaceName, status: 'up'|'down', poeSupported, txMbps, rxMbps, devices: [{ name, mac }] }]
 */
async function fetchSwitchSnapshot() {
  try {
    const conn = await getConnection();

    // Dikirim BERURUTAN (bukan Promise.all) dalam satu koneksi yang sama.
    // Mengirim beberapa perintah bersamaan lewat satu koneksi node-routeros
    // berisiko membuat balasannya tercampur dan memicu error 'UNKNOWNREPLY'
    // yang bisa mematikan seluruh proses Node.js.
    const interfaces = await fetchInterfaces(conn);
    const poeCapable = await fetchPoeCapablePorts(conn);
    const bridgeHosts = await fetchBridgeHosts(conn);
    const neighborMacs = await fetchNeighborMacs(conn);
    const dhcpLeases = await fetchDhcpLeases(conn);

    const traffic = await fetchTraffic(conn, interfaces.map((i) => i.name));

    // Kelompokkan device per port; buang duplikat MAC (mis. muncul di beberapa VLAN).
    const devicesByInterface = {};
    for (const host of bridgeHosts) {
      if (!host.interface || !host.mac) continue;
      const list = (devicesByInterface[host.interface] ||= new Map());
      if (!list.has(host.mac)) list.set(host.mac, { mac: host.mac, name: dhcpLeases[host.mac] || null });
    }

    return interfaces.map((iface) => ({
      interfaceName: iface.name,
      status: !iface.disabled && iface.running ? 'up' : 'down',
      poeSupported: poeCapable.has(iface.name),
      txMbps: traffic[iface.name]?.txMbps ?? 0,
      rxMbps: traffic[iface.name]?.rxMbps ?? 0,
      devices: iface.name === 'ether1'
        ? [{ name: 'Source Internet', mac: neighborMacs[iface.name] || null }]
        : [...(devicesByInterface[iface.name]?.values() || [])],
    }));
  } catch (err) {
    // Paksa koneksi baru pada polling berikutnya.
    resetConnection();
    throw err;
  }
}

module.exports = { fetchSwitchSnapshot, resetConnection };
