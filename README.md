# 🎮 OTTv2 Multiplayer - Cờ Oẳn Tù Tì 9x9 Thời Gian Thực

<div align="center">

[![Live Demo](https://img.shields.io/badge/🌐_Trải_Nghiệm_Trực_Tuyến-GitHub_Pages-22c55e?style=for-the-badge&logo=githubpages&logoColor=white)](https://thing-or-think.github.io/BT1-WEB/)
[![Real-Time](https://img.shields.io/badge/⚡_Real--Time-playhtml.fun_PartyKit-38bdf8?style=for-the-badge&logo=cloudflare&logoColor=white)](https://playhtml.fun)
[![Node.js](https://img.shields.io/badge/Node.js-18.x+-68a063?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-amber?style=for-the-badge)](LICENSE)

### 🔗 **Trải Nghiệm Game Trực Tiếp Tại**:  
👉 **[https://thing-or-think.github.io/BT1-WEB/](https://thing-or-think.github.io/BT1-WEB/)** 👈

</div>

---

## 📌 Giới Thiệu Dự Án

**OTTv2 Multiplayer** là sản phẩm Bài tập lớn môn **Lập trình Web (Web Application Development)**. Trò chơi kết hợp giữa trò chơi dân gian **Oẳn Tù Tì (Kéo - Búa - Bao)** truyền thống với lối đánh chiến thuật theo lượt trên bàn cờ $9 \times 9$, hỗ trợ đối kháng thời gian thực đa người chơi trên nền tảng Web.

* 🌐 **Chơi Trực Tuyến Không Cần Cài Đặt**: Chạy trực tiếp trên trình duyệt qua **[GitHub Pages](https://thing-or-think.github.io/BT1-WEB/)**.
* ⚡ **Công Nghệ Serverless Real-Time**: Đồng bộ phòng chơi toàn cầu qua **`playhtml.fun` (PartyKit & Yjs CRDT)** kết hợp **WebRTC DataChannel (PeerJS)**.
* 🖥️ **Hỗ Trợ Chạy Local / LAN**: Tích hợp sẵn máy chủ Node.js Express REST API & In-Memory Room Controller.

---

## 🌟 Tính Năng Nổi Bật

### 1. ⚔️ Luật Chơi OTTv2 Chiến Thuật (Bàn Cờ $9 \times 9$)
* **2 Phe Đối Đầu**: Phe Đỏ (**Red** - Căn cứ `a1`) và Phe Xanh (**Blue** - Căn cứ `i9`).
* **9 Quân Cờ Mỗi Bên**: 3 Đấm (Búa), 3 Lá (Bao), 3 Kéo.
* **Quy Tắc Di Chuyển**: Mỗi lượt đi 1 ô theo **8 hướng** xung quanh (ngang, dọc, chéo).
* **Quy Tắc Khắc Chế**: ✊ **Đấm > ✌️ Kéo > 🖐️ Lá > ✊ Đấm**.
* **Đa Dạng Điều Kiện Thắng**:
  * 🚩 **Chiếm Căn Cứ**: Đưa bất kỳ 1 quân cờ nào vào căn cứ đối phương (`i9` với Đỏ, `a1` với Xanh).
  * ⚔️ **Diệt Sạch Quân**: Bắt toàn bộ 9 quân cờ của đối thủ.
  * 🚫 **Khóa Nước Đi**: Khi đối thủ không còn nước đi hợp lệ.
  * ⏱️ Đối thủ hết thời gian suy nghĩ lượt hoặc đầu hàng.

### 2. 🕹️ Các Chế Độ Chơi Đa Dạng
* 🌐 **Online Multiplayer (playhtml Serverless)**:
  * Tạo phòng chơi trực tuyến, tự động sinh mã phòng 6 ký tự và đường link mời bạn bè.
  * **Sảnh Chờ Trực Tiếp (Live Room Hub)**: Danh sách phòng được đồng bộ toàn cầu qua PartyKit Cloud theo thời gian thực; hiển thị trạng thái trận đấu, tỉ số, số nước đi, và đồng hồ đếm giờ trực tiếp.
  * **Chế Độ Khán Giả (Spectator)**: Cho phép người chơi khác vào xem trực tiếp các trận đấu đang diễn ra.
* 👥 **Chơi 2 Người Trên Cùng Máy (Pass & Play)**: Chơi đối kháng trực tiếp trên cùng một thiết bị mà không cần kết nối mạng.
* 🤖 **Đấu Với Máy (Vs AI Bot)**: Thuật toán Bot AI đánh giá thế cờ và tìm nước đi tối ưu để luyện tập kỹ năng.

### 3. 🎨 Giao Diện & Trải Nghiệm Người Dùng (UI/UX)
* Phong cách **Dark Gaming / Cyberpunk** hiện đại kết hợp hiệu ứng Glassmorphism.
* Hiển thị gợi ý nước đi trực quan: chấm xanh cho ô đi được, vòng đỏ phát sáng cho ô có thể bắt quân địch.
* Hệ thống âm thanh sống động được tạo tại chỗ bằng **Web Audio API** (không lo thiếu file âm thanh).
* Khung chat, emoji và bảng ghi nhận lịch sử nước đi trực quan theo chuẩn ký hiệu cờ (`e5 ➔ e6`).

---

## 🏗️ Kiến Trúc Hệ Thống

```
┌────────────────────────────────────────────────────────────────────────┐
│               HẠ TẦNG CLOUD PARTYKIT (playhtml.partykit.dev)            │
│                 Đồng bộ Sảnh chờ (Lobby) & Phòng chơi (CRDT)           │
└────────────────────────────────────────────────────────────────────────┘
                 ▲                                        ▲
                 │ (WebSocket CRDT)                       │ (WebSocket CRDT)
                 ▼                                        ▼
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│             MÁY A                │    │             MÁY B                │
│ • Sảnh chờ:                      │    │ • Sảnh chờ:                      │
│   room: "ottv2-global-lobby"     │    │   room: "ottv2-global-lobby"     │
│   -> Host tạo phòng ott-xxxx     │    │   -> Tự động nhận phòng của A    │
│ • Trận đấu P2P (WebRTC):         │<──>│ • Trận đấu P2P (WebRTC):         │
│   Peer ID: ottv2_match_xxxx      │    │   Kết nối trực tiếp tốc độ cao   │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
BTL-WEB/
│
├── client/                       # Frontend Web UI (Chạy tĩnh trên GitHub Pages)
│   ├── index.html                # Giao diện chính SPA (Sảnh chờ & Đấu trường)
│   ├── assets/
│   │   └── images/pieces/        # Bộ nhận diện 6 Vector SVG quân cờ sắc nét
│   ├── css/
│   │   ├── style.css             # Theme Dark Gaming, responsive đa màn hình
│   │   ├── board.css             # CSS ma trận bàn cờ 9x9, căn cứ, hiệu ứng
│   │   └── lobby.css             # CSS sảnh chờ, thẻ phòng trực tiếp, stats bar
│   └── js/
│       ├── core/                 # Board, Piece, Rules, Constants
│       ├── ui/                   # BoardRenderer, BoardControls, SoundManager
│       ├── network/              # PlayhtmlAdapter (Serverless P2P / PartyKit Cloud)
│       └── main.js               # Controller điều phối ứng dụng
│
├── server/                       # Backend Server Node.js (Tuỳ chọn cho Local/LAN)
│   ├── config/server.config.js   # Cấu hình PORT, CORS
│   ├── controllers/              # RoomController, GameController
│   ├── core/                     # Logic thẩm định nước đi phía server
│   ├── models/Room.js            # Model phòng chơi In-Memory
│   ├── sockets/handler.js        # Socket.io Event Dispatcher
│   └── server.js                 # Entry point máy chủ Express & REST API
│
├── shared/                       # Thư viện luật chơi dùng chung Client & Server
│   └── gameRules.js              # Định nghĩa bàn cờ, 8 hướng, ma trận khắc chế
│
├── docs/                         # Tài liệu báo cáo & đặc tả
│   ├── rules-ottv2.md            # Chi tiết luật chơi OTTv2 mở rộng
│   ├── api-specs.md              # Đặc tả giao thức Socket.io & REST API
│   └── group-report.md           # Báo cáo phân công công việc nhóm
│
├── index.html                    # Root redirect về /client
├── README.md                     # Tài liệu hướng dẫn sử dụng
└── package.json                  # Cấu hình dự án & scripts
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### Cách 1: Chơi Ngay Trên Web (Không Cần Cài Đặt)

Truy cập trực tiếp đường dẫn GitHub Pages:  
👉 **[https://thing-or-think.github.io/BT1-WEB/](https://thing-or-think.github.io/BT1-WEB/)**

---

### Cách 2: Chạy Trên Máy Cục Bộ (Localhost / Mạng LAN)

1. **Yêu cầu môi trường**:
   * Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18.x trở lên).
   * Git.

2. **Clone mã nguồn về máy**:
   ```bash
   git clone https://github.com/thing-or-think/BT1-WEB.git
   cd BT1-WEB
   ```

3. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

4. **Khởi chạy máy chủ**:
   ```bash
   npm start
   ```

5. **Mở trình duyệt**:
   * Truy cập: `http://localhost:3000`
   * Để chơi 2 người qua mạng nội bộ: Mở `http://<IP_MÁY_BẠN>:3000` trên thiết bị khác cùng mạng WiFi (ví dụ: `http://192.168.1.15:3000`).

---

## 👥 Thành Viên Thực Hiện (Nhóm BTL)

| STT | Họ và Tên | Vai Trò | Nhiệm Vụ Chính |
|:---:|:---|:---|:---|
| 1 | **Thành viên 1** | *Leader & Frontend UI* | Thiết kế giao diện SPA, Dark Gaming Theme, Responsive, Vector SVG quân cờ |
| 2 | **Thành viên 2** | *Client Logic & Audio* | Điều khiển click/drag quân cờ, gợi ý 8 hướng, Web Audio API, Bot AI |
| 3 | **Thành viên 3** | *Real-Time Network* | Tích hợp Serverless `playhtml.fun` PartyKit, WebRTC P2P, Room Controller |
| 4 | **Thành viên 4** | *Game Core & QA Lead* | Xây dựng RuleEngine dùng chung, kiểm thử toàn diện, viết tài liệu kỹ thuật |

---

## 📜 Giấy Phép (License)

Dự án được phát hành theo giấy phép [MIT License](LICENSE) phục vụ mục đích học tập và nghiên cứu.
