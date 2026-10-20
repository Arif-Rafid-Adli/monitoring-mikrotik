const { verifySocketToken } = require('../middleware/auth');
const {
  getLatestSnapshot,
  getLatestTimestamp,
  getStaleAfterMs,
  getSwitchReachable,
} = require('../services/poller');

function initSockets(io) {
  // Semua koneksi socket wajib membawa JWT yang sama dengan login REST.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.user = verifySocketToken(token);
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket terhubung: ${socket.id} (user: ${socket.user?.username})`);

    // Kirim snapshot terakhir agar client tidak menunggu siklus polling berikutnya.
    const ports = getLatestSnapshot();
    if (ports.length) {
      socket.emit('ports:update', {
        ports,
        timestamp: getLatestTimestamp(),
        staleAfterMs: getStaleAfterMs(),
        switchReachable: getSwitchReachable(),
      });
    }

    socket.on('disconnect', () => console.log(`Socket terputus: ${socket.id}`));
  });
}

module.exports = { initSockets };
