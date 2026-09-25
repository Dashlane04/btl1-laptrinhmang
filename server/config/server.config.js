/**
 * Cấu hình hệ thống Server OTTv2
 */
try {
  require('dotenv').config();
} catch (e) {
  // Fallback nếu dotenv chưa được cài đặt
}

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DEFAULT_TURN_TIME: parseInt(process.env.DEFAULT_TURN_TIME, 10) || 30, // 30 giây mỗi lượt
  MAX_ROOMS: 1000,
  CLEANUP_INTERVAL_MS: 60 * 1000 // Quét dọn phòng rác mỗi phút
};
