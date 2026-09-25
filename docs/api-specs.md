# 📡 ĐẶC TẢ GIAO THỨC SOCKET.IO & API (API SPECS)

Tài liệu này định nghĩa chi tiết toàn bộ các sự kiện Socket.io thời gian thực và REST API giữa Client và Server của hệ thống **OTTv2 Multiplayer**.

---

## 1. Tổng quan Kiến Trúc Giao Tiếp

```
+------------------+                    +--------------------+
|                  | --- HTTP GET API ->|   Express Server   |
|   Client (Web)   |                    |                    |
|                  |<== Socket.io ====> |  Socket.io Server  |
+------------------+    (Bi-directional)|(In-Memory Manager) |
                                        +--------------------+
```

* **Giao thức**: WebSocket / Socket.io Engine v4.
* **Định dạng dữ liệu**: JSON.
* **Trạng thái**: Server quản lý In-Memory State theo từng phòng chơi (`Room`).

---

## 2. REST API Endpoints

### 2.1. Lấy thông tin trạng thái Server & Thống kê phòng
* **Endpoint**: `GET /api/status`
* **Response**:
```json
{
  "status": "online",
  "engine": "Dual-Engine: Node.js REST/Socket + playhtml Serverless P2P",
  "version": "2.2.0",
  "name": "OTTv2 Game Server",
  "stats": {
    "totalRooms": 5,
    "waitingRooms": 2,
    "playingRooms": 3,
    "finishedRooms": 0,
    "totalPlayers": 8,
    "totalSpectators": 4,
    "totalUsers": 12,
    "timestamp": 1726880000000
  },
  "timestamp": 1726880000000
}
```

### 2.2. Lấy danh sách phòng chơi công khai & Thời gian thi đấu
* **Endpoint**: `GET /api/rooms`
* **Query Params**: `?status=WAITING` hoặc `?status=PLAYING` (tuỳ chọn)
* **Response**:
```json
{
  "success": true,
  "count": 2,
  "stats": {
    "totalRooms": 2,
    "waitingRooms": 1,
    "playingRooms": 1,
    "totalPlayers": 3,
    "totalSpectators": 1,
    "totalUsers": 4
  },
  "rooms": [
    {
      "id": "ott-a1b2c3",
      "name": "Đại Chiến OTT Cúp 1",
      "hasPassword": false,
      "status": "WAITING",
      "playerCount": 1,
      "maxPlayers": 2,
      "spectatorCount": 0,
      "playerRed": { "name": "NamPro", "score": 0 },
      "playerBlue": null,
      "timePerTurn": 30,
      "currentTurn": null,
      "createdAt": 1726880000000,
      "gameStartedAt": null,
      "finishedAt": null,
      "elapsedTimeMs": 0,
      "waitingTimeMs": 45000,
      "moveCount": 0,
      "scores": { "red": 0, "blue": 0 }
    },
    {
      "id": "ott-x7y8z9",
      "name": "Chung Kết OTTv2",
      "hasPassword": false,
      "status": "PLAYING",
      "playerCount": 2,
      "maxPlayers": 2,
      "spectatorCount": 3,
      "playerRed": { "name": "Player1", "score": 1 },
      "playerBlue": { "name": "Player2", "score": 0 },
      "timePerTurn": 30,
      "currentTurn": "RED",
      "createdAt": 1726879800000,
      "gameStartedAt": 1726879900000,
      "finishedAt": null,
      "elapsedTimeMs": 245000,
      "waitingTimeMs": 0,
      "moveCount": 14,
      "scores": { "red": 1, "blue": 0 }
    }
  ],
  "timestamp": 1726880145000
}
```

### 2.3. Lấy thống kê nhanh toàn hệ thống
* **Endpoint**: `GET /api/rooms/stats`

---

## 3. Danh sách Sự kiện Socket.io (Socket Events)

### 3.1. Nhóm Quản lý Phòng (Room Management)

#### A. Client $\rightarrow$ Server: `room:create`
Tạo phòng chơi mới.
* **Payload**:
```json
{
  "roomName": "Phòng của Nam",
  "playerName": "NamPro",
  "password": "",
  "timePerTurn": 30
}
```

#### B. Client $\rightarrow$ Server: `room:join`
Tham gia vào một phòng chơi đã tồn tại.
* **Payload**:
```json
{
  "roomId": "room-abc123",
  "playerName": "HùngGame",
  "password": ""
}
```

#### C. Client $\rightarrow$ Server: `room:quick_match`
Tìm và ghép phòng ngẫu nhiên đang chờ người.
* **Payload**:
```json
{
  "playerName": "Gamer123"
}
```

#### D. Server $\rightarrow$ Client: `room:joined`
Phản hồi khi người chơi vào phòng thành công.
* **Payload**:
```json
{
  "roomId": "room-abc123",
  "role": "RED", // "RED" | "BLUE" | "SPECTATOR"
  "room": {
    "id": "room-abc123",
    "name": "Phòng của Nam",
    "status": "PLAYING",
    "playerRed": { "id": "socket-1", "name": "NamPro" },
    "playerBlue": { "id": "socket-2", "name": "HùngGame" },
    "spectators": [],
    "board": [...],
    "currentTurn": "RED",
    "timePerTurn": 30,
    "turnTimeRemaining": 30
  }
}
```

#### E. Server $\rightarrow$ Client: `room:update`
Cập nhật thông tin phòng khi có người vào/rời phòng.
* **Payload**: Đối tượng Room hiện tại.

---

## 3.2. Nhóm Diễn biến Trận đấu (Game Play)

#### A. Client $\rightarrow$ Server: `game:move`
Người chơi gửi nước đi dự kiến.
* **Payload**:
```json
{
  "from": { "row": 1, "col": 1 },
  "to": { "row": 2, "col": 2 }
}
```

#### B. Server $\rightarrow$ Client: `game:move_success`
Server kiểm tra hợp lệ, cập nhật trạng thái bàn cờ và thông báo cho cả phòng.
* **Payload**:
```json
{
  "from": { "row": 1, "col": 1 },
  "to": { "row": 2, "col": 2 },
  "movedPiece": { "type": "ROCK", "side": "RED" },
  "capturedPiece": { "type": "SCISSORS", "side": "BLUE" }, // hoặc null
  "nextTurn": "BLUE",
  "turnTimeRemaining": 30,
  "boardState": [...]
}
```

#### C. Server $\rightarrow$ Client: `game:tick`
Phát định kỳ mỗi giây để đồng bộ đồng hồ đếm ngược lượt đi.
* **Payload**:
```json
{
  "turnTimeRemaining": 24,
  "currentTurn": "RED"
}
```

#### D. Server $\rightarrow$ Client: `game:timeout`
Khi người chơi hiện tại hết thời gian suy nghĩ lượt.
* **Payload**:
```json
{
  "timedOutSide": "RED",
  "winner": "BLUE",
  "reason": "TIMEOUT"
}
```

#### E. Client $\rightarrow$ Server: `game:surrender`
Người chơi chủ động đầu hàng.
* **Payload**: `{}`

#### F. Server $\rightarrow$ Client: `game:over`
Thông báo kết thúc ván cờ.
* **Payload**:
```json
{
  "winner": "RED", // "RED" | "BLUE" | "DRAW"
  "reason": "BASE_INVADED", // "BASE_INVADED" | "ALL_PIECES_CAPTURED" | "NO_VALID_MOVES" | "SURRENDER" | "TIMEOUT"
  "message": "Phe Đỏ đã chiếm được căn cứ i9 và giành chiến thắng!"
}
```

#### G. Client $\rightarrow$ Server: `game:rematch_request`
Yêu cầu đấu lại ván mới.

---

## 3.3. Nhóm Giao tiếp & Tương tác (Chat & Emotes)

#### A. Client $\rightarrow$ Server: `chat:send`
* **Payload**:
```json
{
  "message": "Nước đi hay đấy bạn!"
}
```

#### B. Server $\rightarrow$ Client: `chat:receive`
* **Payload**:
```json
{
  "sender": "NamPro",
  "side": "RED",
  "message": "Nước đi hay đấy bạn!",
  "timestamp": 1726880010000
}
```

---

## 4. Xử lý Lỗi (Error Handling)

Server gửi sự kiện `error:message` khi phát hiện vi phạm:
```json
{
  "code": "INVALID_MOVE",
  "message": "Nước đi không hợp lệ: Đấm không thể đi vào ô có Kéo cùng phe hoặc bị khắc chế!"
}
```

Mã lỗi chuẩn:
* `ROOM_FULL`: Phòng đã đủ 2 người chơi.
* `ROOM_NOT_FOUND`: Mã phòng không tồn tại.
* `WRONG_PASSWORD`: Mật khẩu phòng không đúng.
* `NOT_YOUR_TURN`: Chưa tới lượt đi của bạn.
* `INVALID_MOVE`: Nước đi vi phạm quy tắc 8 hướng hoặc luật ăn quân OTTv2.
