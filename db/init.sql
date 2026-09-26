-- Dijalankan otomatis oleh container MariaDB saat pertama kali dibuat.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- Catatan: tabel ini sengaja TIDAK diisi user default.
-- Super admin membuat user login lewat SSH, lihat README (backend/src/scripts/createUser.js).

CREATE TABLE IF NOT EXISTS switches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host VARCHAR(100) NOT NULL,
  api_port INT NOT NULL DEFAULT 8728,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Snapshot histori status tiap port setiap kali polling dijalankan (untuk grafik/log).
CREATE TABLE IF NOT EXISTS port_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  switch_id INT NOT NULL,
  interface_name VARCHAR(50) NOT NULL,
  status ENUM('up','down') NOT NULL,
  poe_supported TINYINT(1) NOT NULL DEFAULT 0,
  tx_mbps DECIMAL(12,3) NOT NULL DEFAULT 0,
  rx_mbps DECIMAL(12,3) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_switch_interface_time (switch_id, interface_name, recorded_at),
  CONSTRAINT fk_port_logs_switch FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Snapshot device yang terhubung ke tiap port setiap polling.
CREATE TABLE IF NOT EXISTS connected_devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  switch_id INT NOT NULL,
  interface_name VARCHAR(50) NOT NULL,
  device_name VARCHAR(150) NULL,
  mac_address VARCHAR(17) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_switch_interface_time (switch_id, interface_name, recorded_at),
  CONSTRAINT fk_devices_switch FOREIGN KEY (switch_id) REFERENCES switches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed 1 switch default berdasarkan konfigurasi .env (MIKROTIK_HOST / MIKROTIK_API_PORT).
INSERT INTO switches (name, host, api_port)
SELECT 'Mikrotik Switch 1', 'PLACEHOLDER_HOST', 8728
WHERE NOT EXISTS (SELECT 1 FROM switches);
