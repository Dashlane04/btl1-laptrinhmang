# 📖 TÀI LIỆU LUẬT CHƠI OTTv2 (OẲN TÙ TÌ V2 - BÀN CỜ 9x9)

---

## 1. Giới thiệu tổng quan
**OTTv2 (Oẳn Tù Tì phiên bản 2)** là một trò chơi cờ chiến thuật đối kháng 2 người, kết hợp giữa sự quen thuộc của trò chơi dân gian Oẳn Tù Tì (Kéo - Búa - Bao) và tính chiến thuật sâu sắc của cờ bàn trên không gian $9 \times 9$.

Mỗi người chơi điều khiển một đội quân gồm các quân Đấm (Rock/Búa), Lá (Paper/Bao), và Kéo (Scissors). Người chơi cần tính toán đường đi, giương bẫy, bảo vệ căn cứ của mình đồng thời tiến công chiếm căn cứ đối phương hoặc triệt hạ toàn bộ lực lượng địch.

---

## 2. Bàn cờ & Bố trí ban đầu

### 2.1. Cấu trúc bàn cờ
* **Kích thước**: Lưới vuông $9 \times 9$ (tổng cộng 81 ô).
* **Hệ tọa độ**:
  * Trục hoành (cột): Các chữ cái `a`, `b`, `c`, `d`, `e`, `f`, `g`, `h`, `i` (tương ứng chỉ số từ 0 đến 8).
  * Trục tung (hàng): Các chữ số `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9` (tương ứng chỉ số từ 0 đến 8).
* **Hai phe**:
  * **Phe Đỏ (RED)**: Xuất phát ở các hàng dưới (`1` và `2`).
  * **Phe Xanh (BLUE)**: Xuất phát ở các hàng trên (`8` và `9`).
* **Ô Căn Cứ Đặc Biệt (Base Cells)**:
  * 🚩 **Căn cứ Đỏ (RED BASE)**: Ô **`a1`** (Góc dưới bên trái).
  * 🚩 **Căn cứ Xanh (BLUE BASE)**: Ô **`i9`** (Góc trên bên phải).

### 2.2. Quân cờ & Số lượng
Mỗi người chơi sở hữu **9 quân cờ** bao gồm:
* ✊ **3 quân Đấm (Rock / Búa)**
* 🖐️ **3 quân Lá (Paper / Bao)**
* ✌️ **3 quân Kéo (Scissors)**

### 2.3. Vị trí thiết lập ban đầu (Initial Placement)

* **Phe Xanh (BLUE)** - Hàng 8 và 9:
  * Ô `b9`: Đấm | Ô `d9`: Lá | Ô `f9`: Kéo | Ô `h9`: Đấm
  * Ô `a8`: Lá | Ô `c8`: Kéo | Ô `e8`: Đấm | Ô `g8`: Lá | Ô `i8`: Kéo
* **Phe Đỏ (RED)** - Hàng 1 và 2:
  * Ô `a2`: Kéo | Ô `c2`: Lá | Ô `e2`: Đấm | Ô `g2`: Kéo | Ô `i2`: Lá
  * Ô `b1`: Đấm | Ô `d1`: Kéo | Ô `f1`: Lá | Ô `h1`: Đấm

> *Lưu ý: Bố trí đối xứng đan xen giúp đảm bảo tính cân bằng chiến thuật ngay từ nước đi đầu tiên.*

---

## 3. Quy tắc di chuyển (Movement Rules)

* **Số bước**: Mỗi lượt, người chơi chỉ được chọn **1 quân cờ** của phe mình và di chuyển đúng **1 ô**.
* **Hướng di chuyển (8 hướng)**:
  * **4 hướng trực giao**: Tiến (Lên), Lùi (Xuống), Trái, Phải.
  * **4 hướng đường chéo**: Chéo trên-trái, Chéo trên-phải, Chéo dưới-trái, Chéo dưới-phải.
* **Điều kiện ô đích hợp lệ**:
  1. Nằm trong giới hạn bàn cờ $9 \times 9$.
  2. Ô đích là ô trống (không có quân nào).
  3. Hoặc ô đích có quân đối phương mà quân của mình **có thể ăn được** theo quy tắc Oẳn Tù Tì.
  4. **Không được** đi vào ô đang có quân của chính phe mình.

---

## 4. Quy tắc ăn quân (Capture Rules)

Dựa trên nguyên lý tương khắc kinh điển của Oẳn Tù Tì:

$$\begin{aligned}
\text{✊ Đấm (Rock)} &\succ \text{✌️ Kéo (Scissors)} \\
\text{✌️ Kéo (Scissors)} &\succ \text{🖐️ Lá (Paper)} \\
\text{🖐️ Lá (Paper)} &\succ \text{✊ Đấm (Rock)}
\end{aligned}$$

* **Thực hiện ăn quân**: Khi một quân di chuyển vào ô có quân đối phương mà nó khắc chế, quân đối phương bị loại bỏ khỏi bàn cờ (bị bắt), và quân tấn công chiếm giữ ô đó.
* **Trường hợp cùng loại (Đồng chất)**:
  * Đấm **không thể** ăn Đấm.
  * Kéo **không thể** ăn Kéo.
  * Lá **không thể** ăn Lá.
  * Quân cờ **không được phép** di chuyển vào ô có quân đối phương cùng loại (coi như ô bị chặn).
* **Trường hợp bị khắc chế**: Quân cờ không thể tự lao vào ô của quân đối phương đang khắc chế nó.

---

## 5. Điều kiện kết thúc & Xác định Thắng / Thua

Ván cờ kết thúc ngay lập tức khi xảy ra một trong các điều kiện sau:

### 5.1. Thắng bằng cách Chiếm Căn Cứ (Invasion Victory)
* Nếu **Phe Đỏ** di chuyển thành công một quân bất kỳ vào ô căn cứ của Xanh (**`i9`**), **Phe Đỏ Thắng ngay lập tức**.
* Nếu **Phe Xanh** di chuyển thành công một quân bất kỳ vào ô căn cứ của Đỏ (**`a1`**), **Phe Xanh Thắng ngay lập tức**.

### 5.2. Thắng bằng cách Tiêu Diệt Một Loại Quân
* Nếu một phe mất sạch toàn bộ quân **Đấm**, **Lá** hoặc **Kéo**, phe còn lại **Thắng ngay lập tức**.
* Hết giờ, đầu hàng và hết nước đi không phải điều kiện thắng của bài toán này.

---

## 6. Chiến thuật gợi ý
1. **Kiểm soát trung tâm**: Đưa các quân chủ lực lên các hàng 4, 5, 6 để mở rộng tầm kiểm soát 8 hướng.
2. **Hộ vệ căn cứ**: Luôn bố trí ít nhất 1 quân bọc lót bảo vệ ô căn cứ nhà (`a1` / `i9`).
3. **Phối hợp bọc lót theo cặp**: Đặt Đấm cạnh Kéo, Kéo cạnh Lá để nếu đối phương dùng quân khắc chế lao vào sẽ lập tức bị quân còn lại của mình trừng phạt.
