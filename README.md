# OTTv2 Multiplayer

Game Oẳn Tù Tì v2 trên bàn cờ 9×9 cho hai người chơi.

[Chơi bản GitHub Pages](https://dashlane04.github.io/btl1-laptrinhmang/)

## Luật

- Mỗi bên có 3 Đấm, 3 Lá và 3 Kéo.
- Mỗi quân đi đúng một ô theo 8 hướng như quân vua trong cờ vua.
- Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm. Hai quân cùng loại chặn nhau.
- Thắng khi đối thủ mất sạch một loại quân, hoặc khi Xanh vào `a1` / Đỏ vào `i9`.

Không có luật thắng do hết giờ, đầu hàng hoặc hết nước đi.

## Chạy server trên laptop

```bash
npm install
npm test
npm start
```

Terminal in ra hai loại địa chỉ:

- `http://localhost:3000` để chơi trên máy host.
- `http://<IP-LAN>:3000` để máy khác cùng Wi-Fi truy cập.

Nếu máy khác không mở được, cho phép Node.js qua Windows Firewall và bảo đảm hai máy cùng mạng. Có thể đổi cổng bằng biến môi trường `PORT`.

Khi chạy bằng `npm start`, Socket.IO giữ trạng thái và server thẩm định mọi nước đi. Bản GitHub Pages không có Node.js nên dùng PlayHTML Cloud; host của phòng thẩm định nước đi trước khi ghi trạng thái dùng chung.

## Deploy GitHub Pages

Workflow `.github/workflows/deploy.yml` chạy test trên Node.js 22 và 24 khi push vào `main-v2`, rồi deploy thư mục `client` lên GitHub Pages.

Trong repository, vào **Settings → Pages → Source** và chọn **GitHub Actions** một lần nếu Pages chưa được bật.
