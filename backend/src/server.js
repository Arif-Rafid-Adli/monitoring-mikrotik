require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const switchRoutes = require('./routes/switches');
const { initSockets } = require('./sockets');
const { startPolling } = require('./services/poller');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/switches', switchRoutes);

initSockets(io);
startPolling(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend berjalan di port ${PORT}`);
});
