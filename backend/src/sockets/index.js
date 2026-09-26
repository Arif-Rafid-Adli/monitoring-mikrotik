const { verifySocketToken } = require('../middleware/auth');
const { getLatestSnapshot } = require('../services/poller');

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

    // Kirim snapshot terakhir begitu client connect, agar tidak menunggu polling berikutnya.
    socket.emit('ports:update', { ports: getLatestSnapshot(), timestamp: new Date().toISOString() });

    socket.on('disconnect', () => {
      console.log(`Socket terputus: ${socket.id}`);
    });
  });
}

module.exports = { initSockets };
