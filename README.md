# RẠP CHUNG — xem YouTube chung (MVP v2)

## Chạy
    npm install
    npm start            # http://localhost:3000
Đổi cổng: `PORT=8080 npm start`

## Có gì
- Đăng ký / đăng nhập bằng tên + mật khẩu (bcrypt, token ký HMAC, giới hạn thử sai theo IP).
  Tài khoản lưu ở `data/users.json` (nhớ backup thư mục `data/`).
- Rạp 3D trong nhà 152 chỗ, 4 khu (ghế thường, ghế da, ghế đôi, giường nằm), bậc thang; ngồi rồi thì tự chỉnh ngả lưng, gọi món ở Căn tin (nhân viên bưng tới), hoặc Rời ghế để đứng xem. Có 5 chỗ nhảy trên bục (bấm vòng tròn hoặc chọn trong bảng ghế); đủ 1/3 phòng vote "Đèn bar" thì quả cầu disco bắn laser.
- Thời trang: Hồ sơ chọn giới tính + màu da; Cửa hàng mua đồ (áo, quần/váy, giày, tóc, biểu cảm, mũ, kính, balo/cánh, thú cưỡi, skin ghế, bong bóng chat, điệu nhảy — đồ nam/nữ tách riêng, hiện miễn phí); Tủ đồ để mặc. Danh mục đồ ở `public/catalog.json`: mỗi người 1 nhân vật, tên nổi trên đầu, chat hiện bong bóng trên đầu.
  Quá 152 người → đứng xem (vẫn chat được).
- Mở web là vào ngay rạp công cộng: chỉ chat + vote bỏ qua (30%).
- Nút **Phòng**: xem danh sách phòng, vào phòng, hoặc tạo phòng (có thể đặt mật khẩu 4–32 ký tự, hoặc để trống).
  Phòng có chat + voice + ai cũng play/pause/tua. Nút **Thoát phòng** đưa về rạp công cộng.
  Phòng trống 1 phút tự đóng; mỗi tài khoản tối đa 3 phòng; nhập sai mật khẩu phòng quá 6 lần/phút sẽ bị chặn.
- Bấm nút ghế ở thanh bên phải để chọn chỗ: nhân vật đứng dậy, đi bộ theo lối đi rồi ngồi xuống.
- Kéo chuột xoay góc nhìn, lăn chuột để zoom.

## Khi đưa lên mạng (bắt buộc đọc)
1. **HTTPS** — không có HTTPS thì trình duyệt không cho mở mic (voice không chạy).
2. Đặt `AUTH_SECRET=<chuỗi ngẫu nhiên dài>` (nếu không, server tự sinh vào `data/secret.key`).
3. Chạy sau nginx/Cloudflare thì đặt `TRUST_PROXY=1` để giới hạn tốc độ theo đúng IP người dùng.
4. `REG_LIMIT=8` = số lần đăng ký tối đa mỗi giờ mỗi IP (chỉnh nếu cần).
5. Voice mesh ổn ~6 người nói/phòng. Muốn đông hơn → LiveKit. Mạng khó nghe nhau → thêm TURN server.
