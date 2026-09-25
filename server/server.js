const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const config = require('./config/server.config');
const roomController = require('./controllers/room.controller');
const { initSocketHandler } = require('./sockets/handler');

function createGameServer() {
  const app = express();
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: '16kb' }));

  const clientPath = path.join(__dirname, '..', 'client');
  app.use(express.static(clientPath));
  app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'online',
      engine: 'Socket.IO authoritative server + PlayHTML static fallback',
      version: '3.0.0',
      stats: roomController.getRoomStats(),
      timestamp: Date.now()
    });
  });

  app.get('/api/rooms', (req, res) => {
    const rooms = roomController.getPublicRoomList({ status: req.query.status });
    res.json({ success: true, count: rooms.length, stats: roomController.getRoomStats(), rooms });
  });

  app.get('/api/rooms/:id', (req, res) => {
    const room = roomController.getRoom(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Phòng không tồn tại hoặc đã đóng!' });
    res.json({ success: true, room: room.toSummaryJSON() });
  });

  app.get('*', (_req, res) => res.sendFile(path.join(clientPath, 'index.html')));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.CORS_ORIGIN, methods: ['GET', 'POST'] }
  });
  initSocketHandler(io);

  return { app, httpServer, io };
}

if (require.main === module) {
  const { httpServer } = createGameServer();
  httpServer.listen(config.PORT, config.HOST, () => {
    console.log(`OTTv2 server: http://localhost:${config.PORT}`);
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const address of interfaces || []) {
        if (address.family === 'IPv4' && !address.internal) {
          console.log(`LAN: http://${address.address}:${config.PORT}`);
        }
      }
    }
  });
}

module.exports = { createGameServer };
