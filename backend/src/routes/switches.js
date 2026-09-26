const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getLatestSnapshot } = require('../services/poller');

const router = express.Router();
router.use(requireAuth);

// GET /api/switches/current -> snapshot port terbaru (real-time, dari memori)
router.get('/current', (req, res) => {
  res.json({ ports: getLatestSnapshot() });
});

// GET /api/switches/:id/logs?interface=ether1&limit=100 -> histori log port
router.get('/:id/logs', async (req, res) => {
  const { id } = req.params;
  const { interface: ifaceName, limit = 100 } = req.query;

  const params = [id];
  let query = 'SELECT * FROM port_logs WHERE switch_id = ?';

  if (ifaceName) {
    query += ' AND interface_name = ?';
    params.push(ifaceName);
  }

  query += ' ORDER BY recorded_at DESC LIMIT ?';
  params.push(Number(limit));

  try {
    const [rows] = await pool.query(query, params);
    res.json({ logs: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil log' });
  }
});

module.exports = router;
