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

// API Trạng thái hệ thống
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    engine: 'playhtml (Serverless Cloud & PartyKit CRDT)',
    version: '2.1.0',
    name: 'OTTv2 Game Server',
    timestamp: Date.now()
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
