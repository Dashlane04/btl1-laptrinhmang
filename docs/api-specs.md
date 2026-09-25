# Đặc tả giao tiếp OTTv2

Ứng dụng có hai chế độ mạng:

- Chạy bằng `npm start`: Express phục vụ giao diện, Socket.IO giữ trạng thái và xác thực nước đi.
- GitHub Pages: trang tĩnh dùng PlayHTML để đồng bộ phòng; host của phòng xác thực nước đi bằng cùng bộ luật dùng chung.

## Tọa độ

Socket.IO dùng `{ "row": 0..8, "col": 0..8 }`. `row: 0` là hàng 9 và `row: 8` là hàng 1; `col: 0` là cột a.

## REST API chỉ đọc

### `GET /api/status`

Trả về trạng thái server, phiên bản, thống kê phòng và thời điểm hiện tại.

### `GET /api/rooms?status=WAITING|PLAYING|FINISHED`

Trả về danh sách phòng công khai. Tham số `status` là tùy chọn.

### `GET /api/rooms/:id`

Trả về tóm tắt một phòng hoặc HTTP `404` nếu phòng không tồn tại.

Server không nhận REST API ghi bàn cờ. Mọi thay đổi trận đấu phải đi qua Socket.IO và được server kiểm tra.

## Sự kiện Socket.IO

### Client gửi

| Sự kiện | Payload | Ý nghĩa |
|---|---|---|
| `room:create` | `{ roomId?, roomName, playerName, password? }` | Tạo phòng. `roomId` phải có dạng `ott-` và 4–12 ký tự chữ thường/số. |
| `room:join` | `{ roomId, playerName, password? }` | Vào phòng có sẵn. Hai người đầu là Đỏ/Xanh; người tiếp theo là khán giả. |
| `room:quick_match` | `{ playerName }` | Vào phòng chờ không mật khẩu hoặc tạo phòng mới. |
| `room:leave` | Không có | Rời phòng hiện tại. |
| `game:move` | `{ from: {row, col}, to: {row, col} }` | Đề nghị một nước đi; dữ liệu bàn cờ do client gửi kèm sẽ bị bỏ qua. |
| `game:rematch_request` | Không có | Đồng ý đấu lại sau khi ván kết thúc. |
| `chat:send` | `{ message }` | Gửi tin nhắn; server cắt tối đa 120 ký tự. |

### Server gửi

| Sự kiện | Nội dung chính |
|---|---|
| `room:list` | Danh sách phòng công khai. |
| `room:joined` | `{ roomId, role, side, room }`. |
| `room:updated` | Trạng thái phòng sau khi người dùng vào/rời. |
| `game:start` | `{ message, room }` khi đủ hai người. |
| `game:move_success` | `{ moveRecord, board, nextTurn, stats }` sau khi server chấp nhận nước đi. |
| `game:over` | `{ winner, reason, message, room }`. |
| `game:rematch_response` | Báo một người đã yêu cầu đấu lại. |
| `game:rematch_start` | `{ message, room }` khi cả hai cùng đồng ý. |
| `chat:receive` | `{ sender, side, message, timestamp }`. |
| `error:message` | `{ message }` khi yêu cầu không hợp lệ. |

## Trạng thái phòng

`room` gồm các trường chính: `id`, `name`, `status`, `playerRed`, `playerBlue`, `spectators`, `board`, `currentTurn`, `moveHistory`, `scores`, `createdAt`, `gameStartedAt`, `finishedAt` và `stats`. Dữ liệu gửi cho client không chứa Socket ID.

Trạng thái là `WAITING`, `PLAYING` hoặc `FINISHED`. Đỏ đi trước. Không có đồng hồ lượt.

## Xác thực nước đi

Server từ chối nước đi khi trận chưa bắt đầu, sai lượt, tọa độ không phải số nguyên trong khoảng 0–8, ô nguồn không có quân đúng phe, hoặc ô đích vi phạm luật di chuyển/ăn quân.

`game:over.reason` có thể là:

- `BASE_INVADED`: Xanh vào `a1` hoặc Đỏ vào `i9`.
- `PIECE_TYPE_ELIMINATED`: một phe mất sạch Đấm, Lá hoặc Kéo.
- `OPPONENT_LEFT`: đối thủ rời khi trận đang diễn ra.

Hết giờ, đầu hàng và hết nước đi không phải điều kiện thắng.
