# Mikrotik Switch Monitor

Dashboard web untuk memantau switch MikroTik secara real-time. Aplikasi menampilkan status port, dukungan PoE, perangkat yang terhubung, serta lalu lintas TX/RX. Perubahan status port dan kondisi switch juga dicatat sebagai log kejadian.

## Fitur

- Memantau interface fisik Ethernet, SFP, dan QSFP melalui RouterOS API.
- Menampilkan status port ON/OFF, dukungan PoE, serta TX/RX dalam Mbps.
- Menampilkan MAC address perangkat di port dan nama dari DHCP lease jika tersedia.
- Mengirim snapshot port dan kejadian ke dashboard secara real-time dengan Socket.IO.
- Menyimpan histori port, perangkat, dan kejadian di MariaDB; log lama dibersihkan otomatis.
- Melindungi dashboard dan API dengan login JWT. Akun dibuat oleh admin melalui bastion SSH, bukan dari website.

## Teknologi dan struktur proyek

- Frontend: React 18 (Create React App), Axios, Socket.IO Client.
- Backend: Node.js 20, Express, RouterOS API, Socket.IO.
- Database: MariaDB 11.
- Administrasi: container bastion Alpine dengan OpenSSH.
- Seluruh container dan jaringan didefinisikan di `docker-compose.yml`; backend dan frontend tidak memiliki Dockerfile.

```text
mikrotik-monitor/
├── .env.example
├── docker-compose.yml
├── db/
│   └── init.sql
├── backend/
│   └── src/
│       ├── config/       # koneksi DB dan pembuatan skema
│       ├── routes/       # autentikasi dan API switch
│       ├── services/     # RouterOS API dan polling/log
│       └── scripts/      # CLI manajemen akun
├── frontend/
│   └── src/              # dashboard, halaman login, dan komponen
└── bastion/
    ├── entrypoint.sh
    └── authorized_keys   # public key admin
```

## Persiapan

1. Siapkan Docker Engine dan Docker Compose.
2. Salin `.env.example` menjadi `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Isi nilai di `.env`. Ganti semua nilai contoh dan gunakan rahasia yang kuat.

   | Variabel | Keterangan | Default |
   |---|---|---|
   | `DB_ROOT_PASSWORD` | Password root MariaDB | wajib diisi |
   | `DB_NAME` | Nama database aplikasi | wajib diisi |
   | `DB_USER` | User database aplikasi | wajib diisi |
   | `DB_PASSWORD` | Password user database | wajib diisi |
   | `JWT_SECRET` | Secret untuk menandatangani token; buat nilai acak yang panjang | wajib diisi |
   | `JWT_EXPIRES_IN` | Masa berlaku token JWT | `8h` |
   | `MIKROTIK_HOST` | IP atau hostname perangkat MikroTik yang dapat dijangkau backend | wajib diisi |
   | `MIKROTIK_API_PORT` | Port RouterOS API | `8728` |
   | `MIKROTIK_USER` / `MIKROTIK_PASSWORD` | Akun RouterOS untuk monitoring | wajib diisi |
   | `POLL_INTERVAL_MS` | Jeda polling status switch | `5000` |
   | `LOG_INTERVAL_MS` | Jeda penyimpanan snapshot histori | `60000` |
   | `LOG_RETENTION_DAYS` | Lama penyimpanan log sebelum dibersihkan | `7` |
   | `CORS_ORIGIN` | Origin frontend yang diizinkan; beberapa origin dapat dipisahkan koma | `http://localhost:3000` |
   | `REACT_APP_API_URL` | URL backend yang diakses browser frontend | `http://localhost:5000` |
   | `BASTION_BIND` | Alamat host untuk port SSH bastion | `127.0.0.1` |
   | `BASTION_ROOT_PASSWORD` | Mengaktifkan login password root SSH jika diisi; sebaiknya dikosongkan | kosong |

   Buat nilai `JWT_SECRET` acak, misalnya dengan `openssl rand -hex 32`. Jangan gunakan nilai contoh untuk database, MikroTik, atau JWT.

4. Aktifkan RouterOS API di perangkat:

   ```routeros
   /ip service enable api
   ```

   Buat user khusus dengan hak akses minimum yang diperlukan untuk membaca informasi perangkat. Pastikan port API dapat dijangkau dari jaringan Docker host.

## Menjalankan aplikasi

```sh
docker compose up -d
```

Pada start pertama, Docker mengunduh image, MariaDB menginisialisasi database, dan container backend/frontend memasang dependency dengan `npm install`. Tunggu sampai proses instalasi selesai.

- Dashboard: `http://localhost:3000`
- Backend: `http://localhost:5000`
- Health check backend: `http://localhost:5000/api/health`

Untuk akses dari komputer lain, buka port aplikasi yang diperlukan pada host dan sesuaikan `REACT_APP_API_URL` serta `CORS_ORIGIN` dengan alamat yang benar-benar digunakan browser. `REACT_APP_API_URL` tidak boleh menunjuk ke `localhost` jika browser berjalan di komputer lain.

Perintah Docker yang berguna:

```sh
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mariadb
docker compose down
```

`docker compose down` tidak menghapus volume database. Data MariaDB tersimpan di volume `db_data`; jangan menghapus volume tersebut jika ingin mempertahankan data.

## Membuat akun dashboard

Tidak ada akun default dan registrasi tidak tersedia di website. Admin mengelola akun melalui bastion SSH.

1. Buat pasangan kunci SSH di komputer admin (jika belum ada):

   ```sh
   ssh-keygen -t ed25519 -f bastion_key
   ```

2. Tambahkan isi `bastion_key.pub` ke `bastion/authorized_keys`, lalu buat ulang container bastion:

   ```sh
   docker compose up -d --force-recreate bastion
   ```

3. Hubungkan ke bastion. Di Windows PowerShell atau shell lain:

   ```sh
   ssh -t -p 2222 -i bastion_key root@localhost
   ```

   Jika akses SSH diperlukan dari komputer lain di jaringan, ubah `BASTION_BIND` di `.env` dari `127.0.0.1` ke alamat host yang sesuai (misalnya `0.0.0.0`), lalu buat ulang bastion. Batasi akses port SSH menggunakan firewall.

4. Jalankan perintah admin di bastion:

   | Perintah | Fungsi |
   |---|---|
   | `create-user <username>` | Membuat akun; password diminta secara tersembunyi |
   | `change-password <username>` | Mengganti password |
   | `list-users` | Melihat daftar akun |
   | `delete-user <username>` | Menghapus akun |
   | `dbshell` | Membuka MariaDB untuk administrasi |

Contoh menjalankan perintah tanpa membuka shell interaktif:

```sh
ssh -t -p 2222 -i bastion_key root@localhost create-user budi
```

Username harus 3–50 karakter (huruf, angka, titik, underscore, atau strip), dan password minimal 8 karakter. Password disimpan sebagai hash bcrypt. Gunakan `ssh -t` untuk perintah yang meminta password melalui terminal.

## API dan real-time

Endpoint switch memerlukan JWT. Login melalui `POST /api/auth/login`, lalu kirim token pada header `Authorization: Bearer <token>` saat memanggil endpoint switch. Koneksi Socket.IO juga harus mengirim token melalui `auth.token`.

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | Memeriksa bahwa backend berjalan |
| `POST /api/auth/login` | Login dan mendapatkan JWT |
| `GET /api/switches/current` | Snapshot port terbaru |
| `GET /api/switches/events?limit=50` | Kejadian terbaru; batas maksimum 500 |
| `GET /api/switches/events?from=<ISO>&to=<ISO>` | Kejadian dalam rentang waktu |
| `GET /api/switches/:id/logs?interface=ether1&limit=100` | Histori snapshot port; batas maksimum 1000 |

Socket.IO mengirim event `ports:update`, `ports:error`, dan `events:new`. Login dibatasi 20 percobaan per IP setiap 15 menit. Token kedaluwarsa mengikuti `JWT_EXPIRES_IN`.

## Data dan kompatibilitas MikroTik

- Skema tabel aplikasi dibuat oleh backend saat start. `db/init.sql` dijalankan MariaDB saat volume data pertama kali dibuat; perubahan pada file itu tidak diterapkan ulang ke database yang sudah ada. Backend memastikan tabel yang diperlukannya tersedia.
- Baris switch pertama diselaraskan dengan `MIKROTIK_HOST` dan `MIKROTIK_API_PORT` dari `.env`.
- Status dan traffic dipoll setiap `POLL_INTERVAL_MS`. Snapshot histori port dan perangkat disimpan berdasarkan `LOG_INTERVAL_MS`; log yang lebih lama dari `LOG_RETENTION_DAYS` dihapus otomatis.
- Peristiwa perubahan status ON/OFF dan switch yang terputus/tersambung dicatat di `port_events` dan dikirim ke dashboard.
- Dukungan PoE ditentukan dari port yang muncul di `/interface/ethernet/poe/print`.
- Perangkat terhubung dipetakan dari `/interface/bridge/host/print`; nama perangkat dicari dari DHCP lease (`host-name`, lalu `comment`). Tanpa lease yang cocok, nama dapat tampil sebagai “Unknown device”.
- Port `ether1` ditampilkan sebagai sumber internet, dengan MAC address tetangga jika RouterOS melaporkannya.
- Perangkat harus menyediakan RouterOS API. Perangkat yang berjalan dalam mode SwOS saja, seperti beberapa model CSS, tidak menyediakan API RouterOS yang digunakan aplikasi ini.

## Pengembangan dan produksi

Compose menjalankan React Create React App development server (`npm start`) dan memasang dependency saat container start. Ini cocok untuk pengembangan dan deployment internal sederhana, bukan konfigurasi produksi yang dioptimalkan. Untuk produksi, buat bundle frontend dengan `npm run build` di direktori `frontend`, sajikan `frontend/build` melalui web server produksi, dan tinjau TLS, firewall, rahasia, serta kebijakan akses sebelum mengekspos layanan ke jaringan.

Jangan commit `.env`, private key `bastion_key`, atau SSH host private key. Simpan file-file tersebut dengan izin yang sesuai; gunakan `.env.example` hanya sebagai template, bukan konfigurasi operasional.
