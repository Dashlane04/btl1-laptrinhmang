/**
 * File khởi chạy máy chủ chính của OTTv2 Multiplayer
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const config = require('./config/server.config');
const { initSocketHandler } = require('./sockets/handler');
const roomController = require('./controllers/room.controller');

const app = express();
const server = http.createServer(app);

// Cấu hình Socket.io
const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Phục vụ tài nguyên tĩnh của Client và Shared
const clientPath = path.join(__dirname, '..', 'client');
const sharedPath = path.join(__dirname, '..', 'shared');

app.use(express.static(clientPath));
app.use('/shared', express.static(sharedPath));

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    name: 'OTTv2 Game Server',
    activeRooms: roomController.rooms.size,
    timestamp: Date.now()
  });
});

app.get('/api/rooms', (req, res) => {
  res.json(roomController.getPublicRoomList());
});

// Điều hướng trang mặc định
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Khởi tạo Socket.io Handler
initSocketHandler(io);

// Khởi động server
server.listen(config.PORT, config.HOST, () => {
  console.log(`====================================================`);
  console.log(`🎮 OTTv2 Multiplayer Server is running!`);
  console.log(`📡 URL: http://localhost:${config.PORT}`);
  console.log(`⚡ In-Memory state enabled (Zero Database required)`);
  console.log(`====================================================`);
});
