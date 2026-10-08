/**
 * Skema database dibuat idempotent oleh backend (CREATE TABLE IF NOT EXISTS),
 * sehingga tidak perlu file init.sql dan aman dijalankan berulang kali,
 * termasuk dari script CLI super admin.
 */
const pool = require('./db');

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS switches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(100) NOT NULL,
    api_port INT NOT NULL DEFAULT 8728,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS port_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    switch_id INT NOT NULL,
    interface_name VARCHAR(50) NOT NULL,
    status ENUM('up','down') NOT NULL,
    poe_supported TINYINT(1) NOT NULL DEFAULT 0,
    tx_mbps DECIMAL(12,3) NOT NULL DEFAULT 0,
    rx_mbps DECIMAL(12,3) NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_switch_interface_time (switch_id, interface_name, recorded_at),
    INDEX idx_recorded_at (recorded_at),
    CONSTRAINT fk_port_logs_switch FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS connected_devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    switch_id INT NOT NULL,
    interface_name VARCHAR(50) NOT NULL,
    device_name VARCHAR(150) NULL,
    mac_address VARCHAR(17) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_switch_interface_time (switch_id, interface_name, recorded_at),
    INDEX idx_recorded_at (recorded_at),
    CONSTRAINT fk_devices_switch FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,

  // Log kejadian (port naik/turun, switch tidak terjangkau) -> ditampilkan real-time di dashboard.
  `CREATE TABLE IF NOT EXISTS port_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    switch_id INT NOT NULL,
    interface_name VARCHAR(50) NULL,
    event_type VARCHAR(30) NOT NULL,
    message VARCHAR(255) NOT NULL,
    recorded_at DATETIME(3) NOT NULL,
    INDEX idx_events_time (switch_id, recorded_at),
    CONSTRAINT fk_events_switch FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
];

async function ensureSchema() {
  for (const sql of statements) {
    await pool.query(sql);
  }
}

/**
 * Sinkronkan baris tabel `switches` dengan konfigurasi .env, lalu kembalikan id-nya.
 */
async function ensureSwitch() {
  const host = process.env.MIKROTIK_HOST;
  const port = Number(process.env.MIKROTIK_API_PORT || 8728);

  const [rows] = await pool.query('SELECT id FROM switches ORDER BY id LIMIT 1');
  if (rows.length === 0) {
    const [res] = await pool.query(
      'INSERT INTO switches (name, host, api_port) VALUES (?, ?, ?)',
      ['Mikrotik Switch 1', host, port]
    );
    return res.insertId;
  }
  await pool.query('UPDATE switches SET host = ?, api_port = ? WHERE id = ?', [host, port, rows[0].id]);
  return rows[0].id;
}

module.exports = { ensureSchema, ensureSwitch };
