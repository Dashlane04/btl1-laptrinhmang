# Báo cáo phân công nhóm

> Thay tên và mã sinh viên bên dưới bằng thông tin thật trước khi nộp.

## Đề tài

OTTv2 Multiplayer — trò chơi Oẳn Tù Tì chiến thuật hai người trên bàn cờ 9×9.

## Phân công

| Thành viên | Vai trò | Công việc |
|---|---|---|
| `[Họ tên 1]` — `[MSSV]` | Giao diện | Bàn cờ 9×9, màn hình phòng, lịch sử nước đi, chat và giao diện responsive. |
| `[Họ tên 2]` — `[MSSV]` | Luật chơi | Bộ luật dùng chung, bố trí 18 quân, di chuyển 8 hướng, ăn quân và điều kiện thắng. |
| `[Họ tên 3]` — `[MSSV]` | Mạng | Express, Socket.IO, quản lý phòng và xác thực nước đi phía server. |
| `[Họ tên 4]` — `[MSSV]` | Kiểm thử/triển khai | Test tự động, PlayHTML cho bản tĩnh, GitHub Actions, GitHub Pages và tài liệu. |

## Kết quả thực hiện

- Hai người chơi được đồng bộ bàn cờ, lượt đi, lịch sử và chat theo thời gian thực.
- Server là nguồn trạng thái có thẩm quyền khi chạy bằng `npm start`; client không thể ghi trực tiếp bàn cờ qua REST.
- Bản GitHub Pages dùng PlayHTML vì Pages không chạy được Node.js/Socket.IO.
- Luật thắng gồm chiếm căn cứ hoặc làm đối thủ mất sạch một loại quân; không có thắng do hết giờ, đầu hàng hay hết nước đi.
- `npm test` kiểm tra luật cốt lõi và một ván Socket.IO giữa hai client thật.
- Workflow chạy test trên Node.js 22/24 trước khi deploy nhánh `main-v2`.

## Chạy và kiểm thử

```bash
npm install
npm test
npm start
```

Mở `http://localhost:3000` trên máy chạy server. Thiết bị cùng mạng LAN mở địa chỉ được in trong terminal.

## Tài liệu liên quan

- [README](../README.md)
- [Luật OTTv2](rules-ottv2.md)
- [Đặc tả giao tiếp](api-specs.md)
