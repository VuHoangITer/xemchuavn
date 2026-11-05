# Đưa Rạp Chung lên mạng miễn phí (Render + MongoDB Atlas)

Tổng thời gian: khoảng 20–30 phút. Cần: 1 email, không cần thẻ ngân hàng.

| Phần | Dịch vụ | Gói |
|---|---|---|
| Chạy web (Node + Socket.IO, có HTTPS) | Render | Free |
| Lưu tài khoản, đồ, ảnh | MongoDB Atlas | M0 Free (512 MB) |
| Chứa mã nguồn | GitHub | Free (repo riêng tư được) |

---

## Bước 1 — Tạo database MongoDB Atlas

1. Vào **https://www.mongodb.com/cloud/atlas/register** → đăng ký (dùng Google cho nhanh).
2. Khi được hỏi tạo cluster: chọn **M0 (Free)**, nhà cung cấp **AWS**, vùng **Singapore (ap-southeast-1)**, đặt tên tuỳ ý → **Create Deployment**.
3. Hộp **"Connect to Cluster"** hiện ra:
   - Tạo user database: đặt **Username** + bấm **Autogenerate Secure Password** → **copy mật khẩu lại** → **Create Database User**.
4. Menu trái **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) → **Confirm**.
   (Render đổi IP liên tục nên phải mở cho mọi IP; database vẫn được bảo vệ bằng user + mật khẩu.)
5. Menu trái **Database / Clusters** → **Connect** → **Drivers** → copy chuỗi kết nối, dạng:
   ```
   mongodb+srv://TEN_USER:<db_password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
6. Sửa chuỗi đó: thay `<db_password>` bằng mật khẩu ở bước 3, và thêm tên database `rapchung` ngay sau `.net/`:
   ```
   mongodb+srv://TEN_USER:MAT_KHAU@cluster0.xxxxx.mongodb.net/rapchung?retryWrites=true&w=majority&appName=Cluster0
   ```
   Đây là **MONGODB_URI** — giữ bí mật, không gửi cho ai, không dán lên GitHub.

## Bước 2 — Chuyển dữ liệu đang có trên máy lên database (tuỳ chọn)

Muốn giữ các tài khoản, đồ, ảnh đã tạo khi chạy ở máy thì chạy (PowerShell, trong thư mục dự án):

```powershell
$env:MONGODB_URI="dán-chuỗi-ở-bước-1.6"; node scripts/migrate-to-mongo.js
```

Thấy `Xong: N tài khoản, M ảnh đã lên MongoDB` là được. Khoá đăng nhập cũng được chuyển theo nên mọi người không bị đăng xuất.

## Bước 3 — Đưa mã nguồn lên GitHub

1. Đăng ký **https://github.com** → góc phải **+** → **New repository** → đặt tên `rapchung` → chọn **Private** → **Create repository** (không tick thêm README).
2. Trong thư mục dự án chạy (thay `TEN_GITHUB`):
   ```bash
   git init
   git add .
   git commit -m "Rạp Chung"
   git branch -M main
   git remote add origin https://github.com/TEN_GITHUB/rapchung.git
   git push -u origin main
   ```
   File `.gitignore` đã chặn sẵn `data/` (tài khoản, ảnh, khoá) và `node_modules/` nên không bị lộ dữ liệu.

## Bước 4 — Chạy web trên Render

1. Vào **https://render.com** → **Get Started** → đăng ký bằng **GitHub**.
2. **New +** → **Blueprint** → chọn repo `rapchung` (lần đầu bấm *Configure account* để cho Render đọc repo).
3. Render đọc file `render.yaml` → hỏi biến môi trường:
   - **MONGODB_URI**: dán chuỗi ở bước 1.6.
   - **TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL**: để trống (xem bước 5).
4. **Apply** → đợi build 2–4 phút → trạng thái **Live** → bấm link `https://rapchung-xxxx.onrender.com`.

Xong! Gửi link đó cho bạn bè là vào xem chung được. Voice + chia sẻ màn hình chạy được vì Render có sẵn HTTPS.

## Bước 5 — (Nên làm) Máy chủ TURN cho voice / chia sẻ màn hình

Không có TURN, người dùng mạng 4G hoặc mạng công ty đôi khi không nghe / không thấy được nhau.

1. Đăng ký **https://www.metered.ca/tools/openrelay/** (gói miễn phí, có giới hạn dung lượng mỗi tháng) → tạo **App** → mục **TURN credentials** lấy *Username*, *Password* và danh sách URL.
2. Render → service `rapchung` → **Environment** → điền:
   - `TURN_URLS` = các URL cách nhau dấu phẩy, ví dụ `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp`
   - `TURN_USERNAME`, `TURN_CREDENTIAL` = thông tin vừa lấy
3. **Save Changes** → Render tự khởi động lại.

---

## Cập nhật web sau này

Sửa code xong chỉ cần:
```bash
git add .
git commit -m "mô tả thay đổi"
git push
```
Render tự build và đưa bản mới lên (~2–3 phút). Dữ liệu trên MongoDB giữ nguyên.

## Lưu ý về gói miễn phí

- **Render Free tự ngủ sau 15 phút không có ai truy cập.** Người vào đầu tiên sau đó đợi ~30–60 giây để web thức dậy; khi đang có người dùng thì chạy bình thường. Muốn không ngủ: nâng gói Starter (~7 USD/tháng).
- Render Free có 750 giờ chạy / tháng — đủ cho 1 web chạy cả tháng.
- Phòng riêng, hàng chờ, chat đang diễn ra nằm trong bộ nhớ server → khi web ngủ / deploy lại thì các phòng đang mở sẽ đóng (tài khoản, đồ, ảnh vẫn còn vì nằm trong MongoDB).
- MongoDB M0: 512 MB — đủ cho vài nghìn tài khoản kèm ảnh đại diện / ảnh nền.

## Chạy ở máy như cũ

Không đặt `MONGODB_URI` thì app vẫn lưu file trong thư mục `data/` như trước:
```bash
node server.js
```
