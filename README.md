# OTTv2 — Cờ Oẳn Tù Tì trên bàn 9×9

Web game cờ chiến thuật, hai người chơi thời gian thực trên hai máy khác nhau.
Trang web là **web tĩnh** (GitHub Pages), phần đồng bộ nhiều người do thư viện
[**playhtml**](https://playhtml.fun) đảm nhiệm. **Không cần tự viết hay chạy server.**

---

## 1. Luật chơi

**Bàn cờ.** Lưới 9×9. Mỗi bên 9 quân: 3 **Đấm** (Đ, hình tròn), 3 **Lá** (L, hình vuông),
3 **Kéo** (K, hình tam giác). Căn cứ phe Đỏ là ô `a1`, căn cứ phe Xanh là ô `i9`.

**Di chuyển.** Mỗi lượt đi **một quân, đúng một ô**, theo **8 hướng** như quân Vua
trong cờ vua. Không đi vào ô có quân cùng phe.

**Ăn quân.** Đấm ăn Kéo · Kéo ăn Lá · Lá ăn Đấm.
Hai quân **cùng loại không ăn nhau, chỉ đứng chặn đường nhau**.
Quân cũng không được đi vào ô có quân địch đang khắc chế mình.

**Điều kiện thắng.**

| Điều kiện | Ghi chú |
|---|---|
| **Ăn hết sạch một LOẠI quân của đối phương** | Ăn hết cả 3 quân Kéo là thắng ngay, dù đối phương còn nhiều quân khác |
| **Đưa một quân vào căn cứ đối phương** (`a1` / `i9`) | Thắng tức thì |
| Đối phương hết nước đi hợp lệ | luật mở rộng |
| Đối phương hết thời gian lượt, hoặc đầu hàng | luật mở rộng |

> Vì mất sạch một loại quân là thua ngay, giao diện hiển thị **số quân còn lại theo
> từng loại** cho cả hai bên, và tô đỏ cảnh báo khi một loại chỉ còn 1 quân.

Chi tiết đầy đủ: [`docs/rules-ottv2.md`](docs/rules-ottv2.md).

---

## 2. Các chế độ chơi

| Chế độ | Mô tả |
|---|---|
| **1 vs 1 online** | Tạo phòng, gửi link mời. Hai người ở hai máy bất kỳ, đồng bộ qua playhtml. |
| **Giải đấu 2 vs 2** | Hai đội, mỗi đội 2 người. Bàn 1: A1 (Đỏ) vs B1 (Xanh). Bàn 2: B2 (Đỏ) vs A2 (Xanh). Hai bàn đánh song song, tổng hợp điểm đội. |
| **Khán giả** | Người thứ 3 trở đi vào phòng sẽ tự thành khán giả: xem được bàn cờ và lịch sử, không đi được quân. |
| **Luyện tập với máy** | Chơi ngoại tuyến với bot. |
| **Hai người cùng máy** | Luân phiên đi trên cùng thiết bị, không cần mạng. |

Ngoài ra: sảnh chờ hiển thị các phòng đang mở theo thời gian thực, chat trong phòng,
lịch sử nước đi, đồng hồ mỗi lượt, đấu lại nhiều ván, và **chế độ sáng / tối**.

---

## 3. Kiến trúc

```
        GitHub Pages  (chỉ phát file tĩnh: HTML / CSS / JS)
                 |
      +----------+----------+
      |                     |
   Máy A                 Máy B          ... và các máy khác
      |                     |
      +----------+----------+
                 |
        api.playhtml.fun   (PartyKit + Yjs CRDT)
        = phần "server": đồng bộ thời gian thực + lưu bền state
```

Hai vai trò khác nhau, đừng lẫn:

* **GitHub Pages** host *website*.
* **playhtml** cung cấp *backend đồng bộ*. Đây là host PartyKit công cộng, mặc định
  của `playhtml.init()`; nhóm không phải deploy gì thêm.

### State được thiết kế để hai máy không thể lệch nhau

State chia sẻ của một trận **chỉ lưu danh sách nước đi**, không lưu bàn cờ. Bàn cờ
luôn được *suy ra* bằng cách replay từ vị trí khởi đầu
([`client/js/core/match.js`](client/js/core/match.js) → `derive()`).

Hệ quả:

* Cùng danh sách nước đi ⇒ cùng bàn cờ. Hai máy **không thể** lệch bàn cờ.
* Nước đi được sắp theo `seq`, tranh chấp cùng `seq` phân giải theo `(at, id)` ⇒
  tất định trên mọi máy, không phụ thuộc thứ tự gói tin đến.
* Nước đi **phi luật bị loại khi replay**, nên client bị sửa code cũng không đi được
  nước sai luật hay tự cho mình thắng.
* Điểm số suy ra từ bảng kết quả từng ván ⇒ không thể cộng đôi.
* Ghế Đỏ / Xanh cũng **suy ra** từ bảng `claims`, trong đó mỗi người chỉ ghi khoá của
  chính mình ⇒ không có ghi tranh chấp, không xảy ra cảnh hai người cùng nhận phe Đỏ.

### Cấu trúc thư mục

```
shared/gameRules.js        Luật chơi — NGUỒN SỰ THẬT DUY NHẤT (chạy cả Node và browser)
client/
  index.html               Toàn bộ giao diện (SPA một trang)
  css/app.css              Design tokens + layout, hỗ trợ sáng/tối
  css/board.css            Bàn cờ 9x9
  js/core/match.js         Mô hình state trận đấu + replay tất định
  js/core/ai.js            Bot cho chế độ luyện tập
  js/net/net.js            Bọc playhtml: kết nối, kênh dữ liệu, sảnh chờ
  js/ui/board.js           Dựng bàn cờ, xoay bàn theo phe, xử lý chọn/đi quân
  js/ui/theme.js           Chế độ sáng/tối
  js/ui/sound.js           Âm thanh tổng hợp bằng Web Audio API
  js/main.js               Điều phối ứng dụng
tests/
  unit/                    Test luật chơi & mô hình state (Node thuần, không cần cài gì)
  e2e/run-e2e.js           Test browser thật bằng Playwright
docs/rules-ottv2.md        Đặc tả luật chơi
index.html                 Chuyển hướng vào client/
```

---

## 4. Chạy và kiểm thử

### Quan trọng: không dùng `localhost`

playhtml tự đặt tên room theo `window.location.hostname`. Nếu mở trang qua
`http://127.0.0.1:5500` thì tên room chứa dấu `:` làm vỡ đường dẫn PartyKit, provider
không bao giờ phát event `sync`, và `playhtml.init()` **treo vĩnh viễn** (nó `await`
sync mà không có timeout). Vì vậy:

* **Chơi và demo:** mở qua tên miền thật, tức URL GitHub Pages.
* **Test tự động:** bộ E2E dùng Playwright chặn request cho một hostname `https` giả
  và phục vụ file từ đĩa, nên mô phỏng đúng môi trường Pages mà không cần localhost.

Nếu vẫn mở bằng localhost, app sẽ báo lỗi kết nối rõ ràng thay vì treo im lặng; các
chế độ ngoại tuyến (đấu máy, hai người cùng máy) vẫn chơi được bình thường.

### Test

```bash
npm run test:unit    # 94 test luật chơi + mô hình state, chạy ~25ms, không cần cài gì
npm install          # chỉ cần cho E2E (Playwright)
npx playwright install chromium
npm run test:e2e     # 73 kiểm tra trên browser thật, ~35s
npm run test:all
```

E2E kiểm chứng những việc quan trọng nhất:

* A đi quân thì **B thấy ngay**; toàn bộ 81 ô của hai máy khớp nhau; lịch sử nước đi giống nhau.
* Người chơi phe Xanh **thấy bàn cờ quay 180°** (quân nhà ở phía dưới).
* Thắng do **ăn hết sạch một loại quân**, hai máy báo kết quả nhất quán, điểm 1–0 không cộng đôi.
* Nước đi phi luật bơm qua mạng **bị loại**.
* Nhiều phòng tồn tại song song, state tách biệt.
* Giải 2 vs 2: 4 vị trí, hai bàn độc lập, điểm đội cập nhật đúng.
* Khán giả không chiếm ghế, không đi được quân.
* Chế độ sáng / tối và việc ghi nhớ lựa chọn.

Chạy E2E trên URL đã deploy:

```bash
OTT_URL=https://<user>.github.io/<repo> npm run test:e2e
```

### Deploy

Repo đang bật GitHub Pages ở chế độ **Deploy from a branch**: nhánh `main`, thư mục `/`
(gốc repo). Cứ push vào `main` là Pages tự phát bản mới, không cần job deploy trong
workflow. Workflow chỉ chạy unit test.

Pages phải phát **gốc repo**, không phải riêng `client/`, vì `client/index.html` nạp
`../shared/gameRules.js` ở gốc — giữ luật chơi ở một nơi duy nhất cho cả client và test.
File `index.html` ở gốc lo việc chuyển hướng vào `client/`, kèm `.nojekyll` để Pages
phát file nguyên trạng.

URL: **https://dashlane04.github.io/btl1-laptrinhmang/**

## 5. Phân công nhóm

Xem [`docs/group-report.md`](docs/group-report.md).

## 6. Giấy phép

MIT — phục vụ mục đích học tập.
