#!/bin/sh
set -e

echo "[bastion] Menginstall paket (openssh, mariadb-client, bash, shadow, nodejs)..."
apk add --no-cache openssh-server mariadb-client bash shadow nodejs >/dev/null

# Login shell root = bash supaya /etc/profile ikut dibaca saat SSH.
chsh -s /bin/bash root

# --- SSH key admin ---
mkdir -p /root/.ssh && chmod 700 /root/.ssh
if [ -f /bastion/authorized_keys ]; then
  cp /bastion/authorized_keys /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi
if ! grep -qE '^(ssh-|ecdsa-|sk-)' /root/.ssh/authorized_keys 2>/dev/null; then
  echo "[bastion] WARNING: bastion/authorized_keys belum berisi public key yang valid."
fi

# Host key disimpan di volume agar tidak berubah tiap container dibuat ulang.
[ -f /etc/ssh/ssh_host_ed25519_key ] || ssh-keygen -A

# Akun root di Alpine terkunci secara default; sshd menolak akun terkunci meski login pakai key.
# Beri password acak (tidak dipakai) kecuali BASTION_ROOT_PASSWORD diisi.
if [ -n "$BASTION_ROOT_PASSWORD" ]; then
  echo "root:${BASTION_ROOT_PASSWORD}" | chpasswd
  PASSAUTH=yes
  echo "[bastion] Login password root DIAKTIFKAN (BASTION_ROOT_PASSWORD di-set)."
else
  echo "root:$(head -c 32 /dev/urandom | base64)" | chpasswd
  PASSAUTH=no
fi

cat > /etc/ssh/sshd_config << EOC
Port 22
PermitRootLogin yes
PubkeyAuthentication yes
AuthorizedKeysFile /root/.ssh/authorized_keys
PasswordAuthentication ${PASSAUTH}
KbdInteractiveAuthentication no
AllowTcpForwarding no
X11Forwarding no
EOC

# --- Environment untuk sesi SSH (SSH tidak mewarisi env container) ---
esc() { printf "%s" "$1" | sed "s/'/'\\\\''/g"; }
{
  echo "export DB_HOST='$(esc "$DB_HOST")'"
  echo "export DB_PORT='$(esc "$DB_PORT")'"
  echo "export DB_USER='$(esc "$DB_USER")'"
  echo "export DB_PASSWORD='$(esc "$DB_PASSWORD")'"
  echo "export DB_NAME='$(esc "$DB_NAME")'"
  echo "export JWT_SECRET='unused-in-cli'"
} > /etc/mikrotik-env
chmod 600 /etc/mikrotik-env
echo '. /etc/mikrotik-env' > /etc/profile.d/mikrotik-env.sh

# --- Perintah admin (script asli, jadi juga jalan via `ssh -t host perintah`) ---
wrap() { # $1=nama perintah, $2=isi perintah
  printf '#!/bin/sh\n. /etc/mikrotik-env\ncd /app\nif [ ! -d /app/node_modules/mysql2 ]; then\n  echo "Backend belum selesai npm install, coba lagi sebentar lagi."; exit 1\nfi\n%s\n' "$2" > "/usr/local/bin/$1"
  chmod +x "/usr/local/bin/$1"
}
wrap create-user 'exec node src/scripts/createUser.js add "$@"'
wrap change-password 'exec node src/scripts/createUser.js passwd "$@"'
wrap list-users 'exec node src/scripts/createUser.js list'
wrap delete-user 'exec node src/scripts/createUser.js delete "$@"'

cat > /usr/local/bin/dbshell << 'EOC'
#!/bin/sh
. /etc/mikrotik-env
export MYSQL_PWD="$DB_PASSWORD"
exec mysql --skip-ssl -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" "$@"
EOC
chmod +x /usr/local/bin/dbshell

cat > /etc/motd << 'EOC'

  Mikrotik Monitor - bastion admin
    create-user <username>      buat user login (password ditanya via prompt)
    change-password <username>  ganti password
    list-users                  daftar user
    delete-user <username>      hapus user
    dbshell                     masuk ke MariaDB

EOC

echo "[bastion] Siap. Menjalankan sshd di port 22..."
exec /usr/sbin/sshd -D -e
