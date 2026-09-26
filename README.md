# Mikrotik Switch Monitor

Website monitoring real-time untuk switch Mikrotik: nama interface, status port
(ON/OFF), dukungan PoE, device yang terhubung (nama + MAC address), serta
throughput TX/RX (Mbps). Dibangun dengan React + Express + MariaDB, dijalankan
lewat satu `docker-compose.yml` tanpa Dockerfile di folder backend/frontend.

## Struktur Project

```
mikrotik-monitor/
├── docker-compose.yml
├── .env.example
├── db/init.sql              # skema tabel MariaDB
├── backend/                 # Express + Socket.IO + RouterOS API client
└── frontend/                # React (CRA) + Socket.IO client
```

## Cara Menjalankan

1. Salin `.env.example` menjadi `.env`, lalu isi:
   - kredensial database
   - `JWT_SECRET` (string acak yang panjang)
   - `MIKROTIK_HOST`, `MIKROTIK_USER`, `MIKROTIK_PASSWORD` sesuai switch Anda
2. Pastikan API service RouterOS aktif di switch:
   ```
   /ip service enable api
   ```
3. Jalankan:
   ```
   docker compose up -d
   ```
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

   Catatan: pada run pertama, `npm install` dijalankan otomatis di dalam
   container (karena tidak ada Dockerfile), jadi start pertama kali akan
   memakan waktu lebih lama.

4. **Membuat user login** (sesuai requirement, dilakukan oleh super admin lewat SSH,
   bukan lewat halaman web):
   ```
   docker compose exec backend node src/scripts/createUser.js <username> <password>
   ```
   Password otomatis di-hash dengan bcrypt sebelum disimpan.

5. Update host switch di tabel `switches` jika perlu (default diisi placeholder
   saat `db/init.sql` pertama kali dijalankan):
   ```sql
   UPDATE switches SET host = '192.168.88.1' WHERE id = 1;
   ```
   (Backend saat ini fokus memonitor satu switch yang dikonfigurasi lewat
   `MIKROTIK_HOST` di `.env`; tabel `switches` disiapkan agar mudah dikembangkan
   ke multi-switch di kemudian hari.)

## Alur Data Real-Time

`backend/src/services/poller.js` melakukan polling ke switch setiap
`POLL_INTERVAL_MS` (default 5 detik) lewat `services/mikrotik.js`, lalu:
- menyiarkan snapshot port ke semua client lewat event Socket.IO `ports:update`
- menyimpan snapshot sebagai log historis ke tabel `port_logs` dan `connected_devices`

Frontend (`Dashboard.jsx`) terhubung ke Socket.IO memakai JWT hasil login, dan
merender ulang tampilan setiap ada event `ports:update`.

## Catatan Teknis / Asumsi Penting

- **Deteksi PoE**: port dianggap "mendukung PoE" jika muncul di hasil
  `/interface/ethernet/poe/print`. Format output ini bisa berbeda tergantung
  model & versi RouterOS — cek `backend/src/services/mikrotik.js` dan sesuaikan
  mapping field bila hasil tidak sesuai dengan switch Anda.
- **Device terhubung**: dipetakan dari `/interface/bridge/host/print` (MAC ↔ port)
  digabung dengan `/ip/dhcp-server/lease/print` (MAC ↔ hostname). Jika switch
  tidak memakai bridge atau tidak ada DHCP server di jaringan tersebut, sesuaikan
  sumber datanya (mis. pakai `/interface/ethernet/switch/host/print` untuk mode
  switch-chip murni pada beberapa model seperti CSS610/CSS326).
- **Throughput TX/RX**: diambil langsung dari `/interface/monitor-traffic`
  (real-time rate), bukan dihitung manual dari selisih counter.
- Backend saat ini didesain untuk **satu switch aktif** (dikonfigurasi lewat
  `.env`). Skema DB sudah menyiapkan tabel `switches` untuk multi-switch, tapi
  UI & poller belum mendukungnya — beri tahu saya jika ingin dikembangkan.
- Library RouterOS API yang dipakai: `node-routeros`. Jika Anda lebih familiar
  dengan library lain (mis. `routeros-client`), service `mikrotik.js` bisa
  diganti tanpa mengubah bagian lain.

## Development

- Backend hot-reload: ubah `command` di `docker-compose.yml` menjadi
  `node --watch src/server.js` (sudah tersedia lewat `npm run dev`).
- Frontend sudah otomatis hot-reload (`CHOKIDAR_USEPOLLING=true` untuk volume Docker).
