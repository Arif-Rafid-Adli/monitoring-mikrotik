require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const { ensureSchema, ensureSwitch } = require('./config/schema');
const authRoutes = require('./routes/auth');
const switchRoutes = require('./routes/switches');
const { initSockets } = require('./sockets');
const { startPolling } = require('./services/poller');
const { resetConnection: resetMikrotikConnection } = require('./services/mikrotik');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET belum di-set di .env');
  process.exit(1);
}

// Jaring pengaman: node-routeros bisa melempar error (mis. 'UNKNOWNREPLY' saat
// RouterOS mengirim balasan yang tidak dikenali library) langsung dari dalam
// event handler socket-nya, di luar jalur try/catch services/mikrotik.js,
// yang tanpa ini akan mematikan seluruh proses backend.
// Error lain yang tidak terduga tetap dibiarkan mematikan proses (lebih aman
// daripada diam-diam berjalan dalam kondisi tidak pasti) dan Docker akan
// me-restart container sesuai 'restart: unless-stopped'.
process.on('uncaughtException', (err) => {
  if (err && err.errno === 'UNKNOWNREPLY') {
    console.error('RouterOS API: balasan tidak dikenali, koneksi di-reset:', err.message);
    resetMikrotikConnection();
    return;
  }
  console.error('Uncaught exception, proses dihentikan:', err);
  process.exit(1);
});

// CORS_ORIGIN kosong = izinkan origin mana pun (auth memakai Bearer token, bukan cookie).
const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsOrigin = origins.length ? origins : true;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } });
const trustProxyHops = Number(process.env.TRUST_PROXY || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY harus berupa bilangan bulat nol atau lebih');
}
app.set('trust proxy', trustProxyHops);

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10kb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan login, coba lagi beberapa menit lagi' },
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/switches', switchRoutes);

async function main() {
  await ensureSchema();
  const switchId = await ensureSwitch();

  initSockets(io);
  startPolling(io, switchId);

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Backend berjalan di port ${PORT}`));
}

main().catch((err) => {
  console.error('Backend gagal start:', err);
  process.exit(1);
});
