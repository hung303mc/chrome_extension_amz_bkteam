# Tính năng Tự động đồng bộ lúc 9:00 sáng cho Amazon BKTeam Extension

Hệ thống lập lịch tự động cho các tác vụ Amazon Seller thông qua JavaScript trong Chrome Extension.

## Tổng quan

Hệ thống tự động hóa này sử dụng JavaScript trực tiếp trong Chrome Extension để lập lịch các tác vụ vào thời điểm cụ thể mỗi ngày:

1. **Đồng bộ đơn hàng** (9:00 AM)
   - Tự động đồng bộ thông tin đơn hàng từ Amazon
   - Sử dụng `auto_sync_scheduler.js`

2. **Kiểm tra sức khỏe tài khoản** (9:15 AM)
   - Giám sát các chỉ số sức khỏe tài khoản và lưu trong cơ sở dữ liệu
   - Được lên lịch bởi `scheduler.js`

3. **Tải báo cáo quảng cáo** (9:30 AM)
   - Tải xuống và xử lý báo cáo quảng cáo
   - Được lên lịch bởi `scheduler.js`

4. **Cập nhật mã theo dõi** (9:45 AM)
   - Tự động cập nhật mã theo dõi cho đơn hàng
   - Được lên lịch bởi `scheduler.js`

## Cách hoạt động

Thay vì sử dụng crontab và shell scripts bên ngoài, hệ thống này hoạt động hoàn toàn trong JavaScript của Chrome Extension:

1. `background.js`: Tải và khởi tạo các file scheduler
2. `scheduler.js`: Lên lịch và thực hiện các tác vụ tự động
3. `auto_sync_scheduler.js`: Xử lý đồng bộ đơn hàng vào 9:00 AM

Các tác vụ được lên lịch bên trong extension, lưu trữ thời gian lên lịch trong chrome.storage.local, và tự khôi phục khi Chrome được khởi động lại.

## Các tập tin

- **scheduler.js**: Bộ lập lịch thống nhất cho tất cả các tác vụ
- **auto_sync_scheduler.js**: Bộ lập lịch đồng bộ đơn hàng (file gốc)
- **background.js**: Tích hợp và khởi tạo các bộ lập lịch
- **popup.js**: Giao diện điều khiển bộ lập lịch cho người dùng


## Cách sử dụng

1. Cài đặt Chrome Extension
2. Kích hoạt tự động hóa qua popup menu của extension:
   - Bật/tắt tự động hóa
   - Chạy riêng lẻ từng tác vụ khi cần

## Ghi chú kỹ thuật

- Hệ thống sử dụng `setTimeout` để lập lịch các tác vụ dựa trên thời gian hệ thống
- Trạng thái và thời gian lên lịch được lưu trong `chrome.storage.local`
- URLSearchParams được sử dụng để kích hoạt tác vụ thông qua tham số URL khi cần
- Tất cả tác vụ được lên lịch theo thời gian cách nhau 15 phút để tránh xung đột 
####