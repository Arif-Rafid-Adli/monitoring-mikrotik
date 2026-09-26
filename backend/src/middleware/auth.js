const jwt = require('jsonwebtoken');

/**
 * Middleware Express: memverifikasi JWT pada header Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
}

/**
 * Verifikasi token untuk koneksi Socket.IO (dikirim lewat handshake.auth.token)
 */
function verifySocketToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { requireAuth, verifySocketToken };
