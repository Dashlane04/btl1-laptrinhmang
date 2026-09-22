/**
 * File khởi chạy máy chủ phát triển cục bộ (Local Static Server) cho OTTv2 Multiplayer
 * Hệ thống sử dụng playhtml (PartyKit & CRDT) làm cơ chế đồng bộ thời gian thực Serverless.
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config/server.config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Phục vụ tài nguyên tĩnh của Client và Shared
const clientPath = path.join(__dirname, '..', 'client');
const sharedPath = path.join(__dirname, '..', 'shared');

app.use(express.static(clientPath));
app.use('/shared', express.static(sharedPath));

const roomController = require('./controllers/room.controller');

// API Trạng thái hệ thống
app.get('/api/status', (req, res) => {
  const stats = roomController.getRoomStats();
  res.json({
    status: 'online',
    engine: 'Dual-Engine: Node.js REST/Socket + playhtml Serverless P2P',
    version: '2.2.0',
    name: 'OTTv2 Game Server',
    stats,
    timestamp: Date.now()
  });
});

// API Danh sách phòng chơi
app.get('/api/rooms', (req, res) => {
  const { status } = req.query;
  const rooms = roomController.getPublicRoomList({ status });
  const stats = roomController.getRoomStats();
  res.json({
    success: true,
    count: rooms.length,
    stats,
    rooms,
    timestamp: Date.now()
  });
});

// API Thống kê nhanh toàn server
app.get('/api/rooms/stats', (req, res) => {
  res.json({
    success: true,
    stats: roomController.getRoomStats()
  });
});

// API Chi tiết một phòng
app.get('/api/rooms/:id', (req, res) => {
  const room = roomController.getRoom(req.params.id);
  if (!room) {
    return res.status(404).json({ success: false, message: 'Phòng không tồn tại hoặc đã đóng!' });
  }
  res.json({
    success: true,
    room: room.toSummaryJSON()
  });
});

// Điều hướng trang mặc định
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Khởi động server
app.listen(config.PORT, config.HOST, () => {
  console.log(`====================================================`);
  console.log(`🎮 OTTv2 Multiplayer (playhtml Serverless) is running!`);
  console.log(`📡 Local URL: http://localhost:${config.PORT}`);
  console.log(`⚡ Real-Time Engine: playhtml (Zero Backend Server required)`);
  console.log(`====================================================`);
});
