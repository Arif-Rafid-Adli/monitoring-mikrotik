const express = require('express');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getLatestSnapshot, getLatestTimestamp } = require('../services/poller');

const router = express.Router();
router.use(requireAuth);

const clampLimit = (value, def, max) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
};

// GET /api/switches/current -> snapshot port terbaru (dari memori)
router.get('/current', (req, res) => {
  res.json({ ports: getLatestSnapshot(), timestamp: getLatestTimestamp() });
});

// GET /api/switches/events?limit=50 -> log kejadian terbaru (port ON/OFF, switch unreachable)
router.get('/events', async (req, res) => {
  const params = [];
  let query = `SELECT id, interface_name, event_type, message, recorded_at
               FROM port_events`;

  if (req.query.from || req.query.to) {
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (!req.query.from || !req.query.to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return res.status(400).json({ message: 'Rentang tanggal tidak valid' });
    }
    query += ' WHERE recorded_at >= ? AND recorded_at < ?';
    params.push(from, to);
  } else {
    params.push(clampLimit(req.query.limit, 50, 500));
  }

  query += ' ORDER BY recorded_at DESC, id DESC';
  if (!req.query.from && !req.query.to) query += ' LIMIT ?';

  try {
    const [rows] = await pool.query(query, params);
    res.json({ events: rows.map((r) => ({ ...r, recorded_at: new Date(r.recorded_at).toISOString() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil log kejadian' });
  }
});

// GET /api/switches/:id/logs?interface=ether1&limit=100 -> histori traffic per port
router.get('/:id/logs', async (req, res) => {
  const { id } = req.params;
  const limit = clampLimit(req.query.limit, 100, 1000);

  const params = [id];
  let query = 'SELECT * FROM port_logs WHERE switch_id = ?';
  if (req.query.interface) {
    query += ' AND interface_name = ?';
    params.push(String(req.query.interface));
  }
  query += ' ORDER BY recorded_at DESC LIMIT ?';
  params.push(limit);

  try {
    const [rows] = await pool.query(query, params);
    res.json({ logs: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil log' });
  }
});

module.exports = router;
