/**
 * Script CLI untuk super admin membuat user login.
 * Dijalankan manual lewat SSH ke server, contoh:
 *
 *   docker compose exec backend node src/scripts/createUser.js <username> <password>
 *
 * Password akan di-hash dengan bcrypt sebelum disimpan, tidak pernah disimpan plain text.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error('Cara pakai: node src/scripts/createUser.js <username> <password>');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [username, hash]
    );
    console.log(`User "${username}" berhasil dibuat/diupdate.`);
  } catch (err) {
    console.error('Gagal membuat user:', err.message);
  } finally {
    process.exit(0);
  }
}

main();
