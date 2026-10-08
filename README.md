# Mikrotik Switch Monitor

Website monitoring real-time untuk switch Mikrotik: nama interface, jumlah port, status port (ON/OFF),
dukungan PoE, device terhubung (nama + MAC address), serta TX/RX (Mbps).

Stack: React (frontend) · Express + Socket.IO (backend) · MariaDB · Docker Compose.
**Semua konfigurasi Docker hanya ada di `docker-compose.yml`** (tidak ada Dockerfile di backend/frontend).

```
mikrotik-monitor/
├── docker-compose.yml
├── .env.example
├── backend/     # Express, RouterOS API client, skema DB (src/config/schema.js), CLI user
├── frontend/    # React (CRA) + Socket.IO client
└── bastion/     # akses SSH super admin (entrypoint.sh, authorized_keys)
```

## Menjalankan

1. `cp .env.example .env`, lalu isi password DB, `JWT_SECRET` (`openssl rand -hex 32`) dan kredensial Mikrotik.
2. Di Mikrotik: `/ip service enable api` (disarankan buat user khusus read-only untuk monitoring).
3. `docker compose up -d`  (start pertama lebih lama karena `npm install` berjalan di dalam container).
   - Dashboard: `http://<ip-server>:3000` · API: `http://<ip-server>:5000`
4. Buat user login lewat SSH (langkah berikut).

## Membuat user login (super admin via SSH)

Tabel `users` **tidak pernah diisi lewat website**. Super admin masuk ke container `bastion` lewat SSH key:

```
ssh-keygen -t ed25519 -f bastion_key            # sekali saja, di komputer admin
# salin isi bastion_key.pub ke bastion/authorized_keys
docker compose up -d --force-recreate bastion
ssh -t -p 2222 -i bastion_key root@localhost
```

Perintah di dalam bastion (password ditanya lewat prompt tersembunyi, disimpan sebagai hash bcrypt):

| Perintah | Fungsi |
|---|---|
| `create-user <username>` | buat user baru |
| `change-password <username>` | ganti password |
| `list-users` / `delete-user <username>` | lihat / hapus user |
| `dbshell` | masuk MariaDB (`SELECT * FROM users;`, dll.) |

Gunakan `ssh -t` bila menjalankan perintah langsung, mis. `ssh -t -p 2222 -i bastion_key root@localhost create-user budi`.
Port SSH hanya di-bind ke `127.0.0.1` (ubah `BASTION_BIND` di `.env` bila admin perlu SSH dari jaringan).
Port MariaDB **tidak dibuka** ke host; akses DB lewat `dbshell`.

**Akses langsung lewat IP container (`10.10.10.40`)** — untuk debug/remote dari dalam server, tanpa lewat port yang dipetakan ke host:

```
ssh -p 22 -i bastion_key root@10.10.10.40
```

Catatan: IP ini hanya bisa dijangkau dari **dalam jaringan Docker yang sama** (mis. dari container lain, atau dari host bila Docker berjalan native di Linux). Bila Docker Desktop berjalan di **Windows/Mac**, IP ini **tidak bisa diakses langsung dari komputer itu sendiri** karena Docker berjalan di dalam VM tersembunyi — tetap gunakan `localhost:2222` di atas. Untuk akses dari komputer *lain* di LAN, ubah `BASTION_BIND=0.0.0.0` di `.env`, bukan lewat IP container ini.

## Alur data & log

- Backend polling switch tiap `POLL_INTERVAL_MS` (5 dtk) → siarkan ke browser via event `ports:update`.
- Tabel `port_logs` + `connected_devices`: snapshot histori tiap `LOG_INTERVAL_MS` (60 dtk).
- Tabel `port_events`: dicatat saat port berubah ON↔OFF atau switch tidak terjangkau → tampil real-time di panel
  **Log Real-time** (riwayat awal dari DB, event baru via `events:new`).
- Log lebih tua dari `LOG_RETENTION_DAYS` (7 hari) dihapus otomatis.
- Skema tabel dibuat otomatis oleh backend saat start (`CREATE TABLE IF NOT EXISTS`); tabel `switches` disinkronkan dengan `.env`.
- API histori: `GET /api/switches/:id/logs?interface=ether1&limit=100`, `GET /api/switches/events`.

## Asumsi yang perlu dicek pada perangkat Anda

- **PoE**: port dianggap mendukung PoE bila muncul di `/interface/ethernet/poe/print`.
- **Device terhubung**: dari `/interface/bridge/host/print` (MAC↔port); nama dari `/ip/dhcp-server/lease/print`
  (`host-name`, fallback `comment`). Jika switch bukan DHCP server, nama tampil "Unknown device" (MAC tetap tampil).
- Switch mode SwOS (mis. CSS3xx/CSS610 di SwOS) **tidak punya RouterOS API**; harus RouterOS (CRS/CSS di RouterOS mode).
- Frontend memakai dev server CRA (hot-reload). Untuk produksi murni, ganti `command` frontend dengan `npm run build`
  lalu sajikan folder `build/` (mis. `npx serve -s build -l 3000`).

## Keamanan singkat

Jangan commit `.env` atau private key (`bastion_key`, `ssh_host_*_key`) — sudah di `.gitignore`. Login dibatasi
20 percobaan / 15 menit per IP; JWT kadaluarsa sesuai `JWT_EXPIRES_IN`.
