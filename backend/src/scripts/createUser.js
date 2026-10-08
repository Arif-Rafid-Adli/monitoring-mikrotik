/**
 * CLI manajemen user login website (dijalankan super admin lewat SSH/bastion).
 *
 *   node users.js add    <username> [password]
 *   node users.js passwd <username> [password]
 *   node users.js list
 *   node users.js delete <username>
 *
 * Jika password tidak diisi di argumen, akan diminta lewat prompt tersembunyi
 * (lebih aman: tidak tersimpan di shell history / daftar proses).
 * Password disimpan sebagai hash bcrypt, tidak pernah plain text.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const readline = require('readline');
const pool = require('../config/db');
const { ensureSchema } = require('../config/schema');

const USERNAME_RE = /^[A-Za-z0-9._-]{3,50}$/;

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = function (s) {
      if (!rl.stdoutMuted) rl.output.write(s);
    };
    process.stdout.write(question);
    rl.stdoutMuted = true;
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPassword(given) {
  if (given) return given;
  const p1 = await promptHidden('Password: ');
  const p2 = await promptHidden('Ulangi password: ');
  if (p1 !== p2) throw new Error('Password tidak sama.');
  return p1;
}

function validate(username, password) {
  if (!USERNAME_RE.test(username || '')) {
    throw new Error('Username 3-50 karakter: huruf, angka, titik, underscore, atau strip.');
  }
  if (password !== undefined && password.length < 8) {
    throw new Error('Password minimal 8 karakter.');
  }
}

async function main() {
  const [, , cmd, username, passwordArg] = process.argv;
  await ensureSchema();

  switch (cmd) {
    case 'add': {
      validate(username);
      const password = await readPassword(passwordArg);
      validate(username, password);
      const hash = await bcrypt.hash(password, 10);
      try {
        await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw new Error(`User "${username}" sudah ada. Gunakan "passwd" untuk ganti password.`);
        throw err;
      }
      console.log(`User "${username}" berhasil dibuat.`);
      break;
    }
    case 'passwd': {
      validate(username);
      const password = await readPassword(passwordArg);
      validate(username, password);
      const hash = await bcrypt.hash(password, 10);
      const [res] = await pool.query('UPDATE users SET password_hash = ? WHERE username = ?', [hash, username]);
      if (res.affectedRows === 0) throw new Error(`User "${username}" tidak ditemukan.`);
      console.log(`Password user "${username}" berhasil diganti.`);
      break;
    }
    case 'list': {
      const [rows] = await pool.query('SELECT id, username, created_at FROM users ORDER BY id');
      if (rows.length === 0) console.log('(belum ada user)');
      rows.forEach((r) => console.log(`${r.id}\t${r.username}\t${new Date(r.created_at).toISOString()}`));
      break;
    }
    case 'delete': {
      validate(username);
      const [res] = await pool.query('DELETE FROM users WHERE username = ?', [username]);
      if (res.affectedRows === 0) throw new Error(`User "${username}" tidak ditemukan.`);
      console.log(`User "${username}" dihapus.`);
      break;
    }
    default:
      console.log('Cara pakai:\n  add <username> [password]\n  passwd <username> [password]\n  list\n  delete <username>');
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
