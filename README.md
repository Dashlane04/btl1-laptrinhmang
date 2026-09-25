# OTTv2 Multiplayer

Game Oẳn Tù Tì chiến thuật hai người trên bàn cờ 9×9.

- Repository: <https://github.com/Dashlane04/btl1-laptrinhmang/tree/main-v2>
- GitHub Pages: <https://dashlane04.github.io/btl1-laptrinhmang/>

## Tính năng

- Tạo phòng, tham gia bằng mã phòng, chat và đấu lại.
- Đồng bộ bàn cờ, lượt đi và lịch sử nước đi theo thời gian thực.
- Server kiểm tra lượt, tọa độ và luật ăn quân; client không được tự ghi bàn cờ.
- Hai cách chạy: Socket.IO trên máy tự host hoặc PlayHTML trên GitHub Pages.

## Luật chơi

- Mỗi bên có 3 Đấm, 3 Lá và 3 Kéo.
- Mỗi lượt đi đúng một ô theo 8 hướng như quân vua trong cờ vua.
- Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm. Hai quân cùng loại chặn nhau.
- Thắng khi đối thủ mất sạch một loại quân, hoặc khi Xanh vào `a1` / Đỏ vào `i9`.
- Hết giờ, đầu hàng và hết nước đi không phải điều kiện thắng.

## Chạy trên máy và mạng LAN

Yêu cầu Node.js 22 trở lên.

```bash
git clone -b main-v2 https://github.com/Dashlane04/btl1-laptrinhmang.git
cd btl1-laptrinhmang
npm ci
npm test
npm start
```

Terminal sẽ in:

- `http://localhost:3000` cho máy chạy server.
- `http://<IP-LAN>:3000` cho thiết bị khác cùng Wi-Fi.

Nếu thiết bị khác không truy cập được, cho phép Node.js qua Windows Firewall và kiểm tra hai máy đang cùng mạng. Có thể đổi cổng bằng biến môi trường `PORT`.

## Kiểm thử

```bash
npm test
```

Bộ test kiểm tra luật cốt lõi và một phiên Socket.IO giữa hai client, gồm cả trường hợp sai lượt và dữ liệu bàn cờ giả mạo.

## Triển khai GitHub Pages

Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) chạy test trên Node.js 22/24 khi push vào `main-v2`, sau đó deploy thư mục `client`.

Nếu Pages chưa được bật, vào **Settings → Pages → Source → GitHub Actions**. GitHub Pages không chạy Node.js nên bản tĩnh dùng PlayHTML; bản `npm start` dùng Socket.IO và server có thẩm quyền.

## Cấu trúc chính

```text
client/             giao diện và adapter mạng
server/             Express, Socket.IO, phòng và xác thực nước đi
shared/gameRules.js luật dùng chung
tests/              kiểm thử luật và multiplayer
docs/               luật, API và mẫu báo cáo nhóm
```

## Tài liệu

- [Luật OTTv2](docs/rules-ottv2.md)
- [Socket.IO và REST API](docs/api-specs.md)
- [Mẫu báo cáo phân công](docs/group-report.md)
