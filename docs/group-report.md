# Báo cáo bài tập nhóm — OTTv2

* **Học phần:** Lập trình mạng / Lập trình Web
* **Đề bài:** (1) Trang web cho 2 người chơi Oẳn Tù Tì v2 trên bàn 9×9.
  (2) Dùng thư viện playhtml để có server, nhiều người chơi cùng lúc.
* **Sản phẩm:** web tĩnh trên GitHub Pages + đồng bộ thời gian thực qua playhtml.

> Điền tên và mã sinh viên vào bảng bên dưới trước khi nộp.

---

## 1. Phân công

| STT | Họ và tên | MSSV | Phụ trách |
|:--:|---|---|---|
| 1 | | | Luật chơi (`shared/gameRules.js`), unit test |
| 2 | | | Mô hình state & replay (`client/js/core/match.js`), bot AI |
| 3 | | | Tầng mạng playhtml (`client/js/net/net.js`), sảnh chờ, chế độ 2 vs 2 |
| 4 | | | Giao diện (`client/index.html`, CSS, `ui/board.js`), sáng/tối, E2E test |

---

## 2. Đối chiếu yêu cầu đề bài

| Yêu cầu | Thực hiện ở |
|---|---|
| Bàn cờ 9×9 | `shared/gameRules.js` → `BOARD_SIZE`, `createInitialBoard()` |
| Đấm / Lá / Kéo là quân cờ | `PIECE_TYPES`, mỗi bên 3 quân mỗi loại |
| Đi 1 ô theo 8 hướng như quân Vua | `DIRECTIONS`, `getValidMoves()` |
| Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm | `BEATS`, `canCapture()` |
| Cùng loại không ăn nhau, chỉ chặn đường | `getValidMoves()` — ô có quân địch cùng loại không được đưa vào danh sách nước đi |
| **Thắng khi ăn hết sạch một LOẠI quân** | `findEliminatedTypes()`, `checkGameOver()` → `TYPE_ELIMINATED` |
| **Thắng khi đưa quân vào `a1` / `i9` đối phương** | `checkGameOver()` → `BASE_INVADED` |
| Trang web cho 2 người chơi | `client/index.html` + `client/js/main.js` |
| **Dùng playhtml để có server, nhiều người cùng lúc** | `client/js/net/net.js` — `playhtml.init()` + `createPageData()`; nhiều phòng song song, khán giả, giải 2 vs 2 |

---

## 3. Kiến trúc và lý do chọn

### 3.1. Vai trò từng thành phần

| Thành phần | Vai trò |
|---|---|
| GitHub Pages | Host *website* (file tĩnh). Không chạy code, không giữ state. |
| **playhtml** (`api.playhtml.fun`) | Phần *server*: đồng bộ thời gian thực + lưu bền state bằng PartyKit và Yjs CRDT. Đây là host công cộng mặc định của thư viện, nhóm không phải deploy backend. |
| Browser của người chơi | Chạy luật chơi và dựng giao diện. |

Không có Node.js server trong sản phẩm. Đề bài yêu cầu "dùng playhtml để cho phép có
server", và playhtml chính là thứ cung cấp server đó.

### 3.2. Quyết định thiết kế quan trọng: state chỉ lưu nước đi

State chia sẻ của một trận **không lưu bàn cờ**, chỉ lưu **danh sách nước đi**. Bàn cờ
được suy ra bằng replay từ vị trí khởi đầu (`match.js` → `derive()`).

Lý do: nếu đồng bộ cả bàn cờ thì hai máy ghi đồng thời sẽ ghi đè lẫn nhau, làm mất nước
đi và hai bên thấy bàn cờ khác nhau. Với danh sách nước đi:

* Cùng danh sách ⇒ cùng bàn cờ. Hai máy không thể lệch.
* Nước đi sắp theo `seq`; tranh chấp cùng `seq` phân giải theo `(at, id)` nên tất định
  trên mọi máy, không phụ thuộc thứ tự gói tin.
* Nước đi phi luật bị loại lúc replay ⇒ chống gian lận mà không cần server kiểm tra.
* Điểm số suy ra từ bảng kết quả từng ván ⇒ không thể cộng đôi.

Ghế Đỏ / Xanh và vị trí trong giải 2 vs 2 cũng theo nguyên tắc tương tự: mỗi người chỉ
ghi khoá `claims` của chính mình, ghế được suy ra bằng cách sắp xếp ⇒ không có ghi tranh
chấp, không xảy ra cảnh hai người cùng nhận một phe.

### 3.3. Ba vấn đề kỹ thuật đã gặp và cách xử lý

1. **playhtml không nạp được qua unpkg.** Bản dựng của playhtml có `import` bare
   specifier bên trong; unpkg không resolve được nên module không chạy. Phải nạp qua CDN
   có bundle sẵn dependency: `https://cdn.jsdelivr.net/npm/playhtml@2.14.1/+esm`.
   Ngoài ra câu `import` phải ở top-level của module — bọc trong `try { }` là lỗi cú pháp
   nên toàn bộ module bị bỏ mà không báo gì.

2. **playhtml không hoạt động trên `localhost`.** Thư viện đặt tên room theo
   `window.location.hostname`; với `127.0.0.1:5500` thì tên room chứa dấu `:` làm vỡ
   đường dẫn PartyKit, provider không phát event `sync`, và `playhtml.init()` treo vĩnh
   viễn vì nó `await` sync không có timeout. Vì vậy phải chạy trên tên miền thật
   (GitHub Pages). App có timeout và báo lỗi rõ ràng thay vì treo im lặng.

3. **Default của `createPageData` có thể xoá dữ liệu.** Nếu hai người mở cùng một phòng
   mới trong cùng khoảng round-trip đồng bộ, cả hai đều thấy kênh rỗng và cùng ghi giá trị
   default; bên ghi sau xoá sạch nước đi bên kia vừa tạo. Cách xử lý: default chỉ chứa
   metadata vô hại, các container (`moves`, `claims`, `results`, `chat`) được tạo lúc dùng
   tới qua `initFields()` / `ensure()` và không bao giờ ghi đè khoá đã có.

Ngoài ra, draft proxy của playhtml không hỗ trợ toán tử `delete`, và không cho đọc lại
object vừa gán trong cùng một lần `update()` — hai điểm này đều được xử lý trong
`net.js`.

---

## 4. Kiểm thử

| Loại | Số lượng | Thời gian | Lệnh |
|---|---|---|---|
| Unit test (luật chơi + mô hình state) | 94 | ~25 ms | `npm run test:unit` |
| E2E trên browser thật (Playwright) | 68 | ~35 s | `npm run test:e2e` |

Unit test chạy thuần Node, không cần cài dependency, và được dùng làm cổng chặn trong
GitHub Actions trước khi deploy.

E2E mở nhiều browser context thật và kiểm chứng:

* A đi quân thì B thấy ngay; toàn bộ 81 ô của hai máy khớp nhau; lịch sử nước đi giống nhau.
* Phe Xanh thấy bàn cờ quay 180°.
* Thắng do ăn hết sạch một loại quân — hai máy báo kết quả nhất quán, điểm 1–0.
* Nước đi phi luật bơm qua mạng bị loại, không ai thắng được bằng nó.
* Nhiều phòng song song, state tách biệt.
* Giải 2 vs 2: 4 vị trí, hai bàn độc lập, điểm đội đúng.
* Khán giả không chiếm ghế và không đi được quân.
* Chế độ sáng / tối, ghi nhớ lựa chọn sau khi tải lại.

E2E không dùng localhost: nó chặn request cho một hostname `https` giả và phục vụ file
từ đĩa, mô phỏng đúng môi trường GitHub Pages. Có thể trỏ vào URL đã deploy bằng
`OTT_URL=... npm run test:e2e`.

---

## 5. Hạn chế đã biết

* Tất cả phòng dùng chung một room playhtml (`ottv2-hub-v3`), nên mọi client nhận dữ
  liệu của mọi phòng. Đủ dùng ở quy mô lớp học; quy mô lớn hơn nên tách room theo mã phòng.
* Không có xác thực người dùng: danh tính chỉ là một id lưu trong `localStorage`.
* Thời gian mỗi lượt tính theo đồng hồ của máy đi nước cuối; có khoảng bù 3 giây để
  giảm ảnh hưởng của lệch đồng hồ, nhưng không phải đồng hồ tuyệt đối.
* Bot AI chỉ đánh giá một tầng, không phải đối thủ mạnh.
