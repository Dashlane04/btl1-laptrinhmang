# 🎮 OTTv2 Multiplayer - Cờ Oẳn Tù Tì 9x9 Thời Gian Thực

> **Bài tập lớn Môn Lập trình Web**  
> Ứng dụng Web Game chiến thuật đối kháng thời gian thực **OTTv2 (Oẳn Tù Tì v2)** trên bàn cờ $9 \times 9$.  
> ⚡ **Không cần Database** (Lưu trữ RAM In-Memory tốc độ cao)  
> 🌐 **Chơi đa nền tảng**: Hỗ trợ chơi Offline / Single Player vs Bot trên **GitHub Pages** & Chơi Online Multiplayer thời gian thực qua **Node.js & Socket.io**.

---

## 🌟 Tính Năng Nổi Bật

1. **Luật Chơi OTTv2 Chiến Thuật (Bàn cờ $9 \times 9$)**:
   - 2 phe: **Đỏ (Red)** và **Xanh (Blue)**.
   - Mỗi phe sở hữu 9 quân cờ: 3 Đấm (Rock), 3 Lá (Paper), 3 Kéo (Scissors).
   - Di chuyển linh hoạt theo **8 hướng** (ngang, dọc, chéo).
   - Quy tắc ăn quân chuẩn Oẳn Tù Tì: **Đấm > Kéo > Lá > Đấm**.
   - Điều kiện thắng đa dạng: **Chiếm ô căn cứ đối phương (`a1` / `i9`)**, bắt hết quân, đối thủ hết nước đi, hoặc hết giờ.

2. **Chế Độ Chơi Đa Dạng**:
   - 🌐 **Online Multiplayer**: Tạo phòng, mật khẩu riêng tư, ghép cặp ngẫu nhiên (Matchmaking), đồng bộ Socket.io thời gian thực.
   - 👥 **Offline 2 Người (Pass & Play)**: Chơi chung trên một màn hình máy tính hoặc điện thoại không cần kết nối mạng.
   - 🤖 **Đấu với Máy (Vs AI Bot)**: Luyện tập với Bot tính toán nước đi thông minh.
   - 👁️ **Chế độ Khán giả (Spectator)**: Xem trực tiếp các trận đấu đang diễn ra.

3. **Giao Diện & Trải Nghiệm Người Dùng (UI/UX)**:
   - Phong cách Cyberpunk / Dark Gaming hiện đại, hiệu ứng Glassmorphism.
   - Gợi ý nước đi trực quan (chấm xanh khi đi được, vòng đỏ khi có thể ăn quân).
   - Âm thanh sống động tích hợp Web Audio API (không phụ thuộc file ngoài).
   - Chatbox & Emoji thời gian thực, bảng lịch sử nước đi trực quan.

4. **Kiến Trúc Tối Giản - Không Cần Database**:
   - Hoạt động mượt mà với 100% In-Memory State trên Node.js.
   - Không cần cài đặt MySQL, MongoDB hay Redis.

---

## 📁 Cấu Trúc Thư Mục

```
otttv2-multiplayer/
│
├── .github/                      # Cấu hình GitHub Actions CI/CD
│   └── workflows/
│       └── deploy.yml            # CI/CD tự động kiểm tra & deploy
│
├── docs/                         # Tài liệu báo cáo & đặc tả
│   ├── rules-ottv2.md            # Chi tiết luật chơi OTTv2 (9x9, ăn quân, căn cứ)
│   ├── api-specs.md              # Đặc tả sự kiện Socket.io & REST API
│   └── group-report.md           # Báo cáo phân công công việc 4 thành viên
│
├── server/                       # Backend Server Node.js (Socket.io & Express)
│   ├── config/
│   │   └── server.config.js      # Cấu hình PORT, CORS, timeout
│   ├── controllers/
│   │   ├── room.controller.js    # Quản lý tạo phòng, danh sách phòng, ghép nhanh
│   │   └── game.controller.js    # Quản lý nước đi, timer lượt đi, kết thúc ván
│   ├── core/                     # Logic game OTTv2 phía server (chống gian lận)
│   │   ├── Board.js              # Quản lý ma trận bàn cờ 9x9
│   │   ├── Piece.js              # Lớp định nghĩa quân cờ
│   │   └── RuleEngine.js         # Kiểm tra tính hợp lệ & điều kiện thắng
│   ├── models/
│   │   └── Room.js               # Model phòng chơi In-Memory
│   ├── sockets/
│   │   ├── handler.js            # Dispatcher xử lý sự kiện kết nối Socket
│   │   └── events.js             # Danh sách hằng số Socket Event
│   ├── server.js                 # Entry point khởi chạy HTTP + Socket Server
│   └── package.json              # Dependencies backend
│
├── client/                       # Frontend Web UI (Giao diện người chơi)
│   ├── index.html                # Trang chính (Lobby & Game Arena)
│   ├── assets/
│   │   ├── images/pieces/        # 6 Vector SVG quân cờ sắc nét
│   │   └── sounds/               # Âm thanh hiệu ứng
│   ├── css/
│   │   ├── style.css             # Theme Dark Gaming, responsive layout
│   │   ├── board.css             # CSS lưới 9x9, highlight 8 hướng, ô căn cứ
│   │   └── lobby.css             # CSS sảnh chờ, danh sách phòng, chat
│   └── js/
│       ├── core/                 # Engine logic client (constants, rules, board)
│       ├── ui/                   # Render giao diện, điều khiển click/drag, âm thanh
│       ├── network/              # Socket client & playfull adapter
│       └── main.js               # Điều phối toàn bộ hoạt động client
│
├── shared/                       # Logic dùng chung giữa Client & Server
│   └── gameRules.js              # Luật OTTv2 chuẩn hoá
│
├── .gitignore                    # Bỏ qua node_modules, log files
├── README.md                     # Hướng dẫn sử dụng
└── package.json                  # Root npm scripts
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy

### Cách 1: Chạy Server Online Multiplayer (Local / LAN)

1. **Yêu cầu môi trường**:
   - Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 16.x trở lên).

2. **Cài đặt thư viện**:
   ```bash
   npm install
   ```

3. **Khởi chạy ứng dụng**:
   ```bash
   npm start
   ```

4. **Trải nghiệm**:
   - Mở trình duyệt truy cập: `http://localhost:3000`
   - Để test 2 người chơi: Mở 2 tab trình duyệt hoặc gửi link mạng LAN (ví dụ: `http://192.168.1.x:3000`) cho máy khác cùng mạng WiFi!

---

### Cách 2: Chạy trực tiếp trên GitHub Pages (Offline / Single Player)

1. Đẩy mã nguồn lên kho chứa (Repository) GitHub của bạn.
2. Vào **Settings** -> **Pages** -> Chọn nhánh `main` và thư mục `/client` (hoặc cấu hình GitHub Actions từ `.github/workflows/deploy.yml`).
3. Truy cập đường link GitHub Pages được cấp để chơi ngay chế độ Offline và Đấu với AI mà không cần cài đặt bất kỳ server nào!

---

## 📖 Tóm Tắt Luật Chơi OTTv2

* **Kích thước bàn cờ**: $9 \times 9$ (81 ô).
* **Quân cờ mỗi bên**: 3 Đấm (Búa), 3 Lá (Bao), 3 Kéo.
* **Căn cứ**: Phe Đỏ tại `a1`, phe Xanh tại `i9`.
* **Di chuyển**: Quân cờ được đi 1 ô theo 8 hướng xung quanh.
* **Ăn quân**:
  * ✊ **Đấm** ăn ✌️ **Kéo**
  * ✌️ **Kéo** ăn 🖐️ **Lá**
  * 🖐️ **Lá** ăn ✊ **Đấm**
  * Không thể đi vào ô có quân cùng loại hoặc quân cùng phe.
* **Điều kiện thắng**:
  1. Chiếm được ô căn cứ đối phương (`i9` với Đỏ, `a1` với Xanh).
  2. Ăn sạch toàn bộ quân của đối phương.
  3. Đối phương không còn nước đi hợp lệ hoặc hết thời gian lượt đi.

---

## 👥 Thành Viên Thực Hiện (Nhóm BTL)

| STT | Họ và Tên | Vai Trò | Nhiệm Vụ Chính |
|:---:|:---|:---|:---|
| 1 | Thành viên 1 | Leader & Frontend UI | Thiết kế giao diện Web, CSS Animation, Responsive, Bàn cờ 9x9 |
| 2 | Thành viên 2 | Client Logic & Interaction | Xử lý tương tác quân cờ, gợi ý 8 hướng, Web Audio, Bot AI |
| 3 | Thành viên 3 | Backend & Socket.io | Xây dựng Server Express, Room Manager, Đồng bộ Socket thời gian thực |
| 4 | Thành viên 4 | Game Core & Testing | Thuật toán RuleEngine, thẩm định nước đi chống hack, Viết tài liệu |

---

## 📜 Giấy Phép (License)
Dự án được phát triển phục vụ mục đích học tập và nghiên cứu theo giấy phép [MIT](LICENSE).
