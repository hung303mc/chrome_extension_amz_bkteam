# Tính năng Tự động đồng bộ lúc 9:00 sáng cho Amazon BKTeam Extension

Tài liệu này hướng dẫn cách tích hợp tính năng tự động đồng bộ lúc 9:00 sáng vào Chrome extension Amazon BKTeam.

## Tổng quan

Extension này sẽ tự động mở trang Amazon Seller Central và tiến hành đồng bộ đơn hàng vào lúc 9:00 sáng mỗi ngày khi Chrome đang chạy.

### Lưu ý quan trọng
- Giải pháp này **chỉ hoạt động khi Chrome đã được mở** (không thể tự khởi động Chrome).
- Nếu muốn tự động khởi động Chrome, hãy sử dụng file `auto_launch_amz_extension.py` và `install_amz_extension_task.ps1` được cung cấp riêng.

## Hướng dẫn cài đặt

### Bước 1: Thêm các file vào extension

Bạn cần thêm 2 file sau vào thư mục extension:

1. `scripts/auto_sync_scheduler.js` - Module tự động đồng bộ
2. `scripts/use_auto_sync.js` - UI cho popup

### Bước 2: Chỉnh sửa file background.js

Thêm đoạn mã sau vào cuối file `scripts/background.js`:

```javascript
// Tích hợp Auto Sync Scheduler
if (typeof self !== 'undefined') {
  importScripts('/scripts/auto_sync_scheduler.js');
  
  // Khởi tạo auto sync scheduler
  if (typeof AutoSyncScheduler !== 'undefined') {
    console.log('[BACKGROUND] Khởi tạo AutoSyncScheduler...');
    AutoSyncScheduler.init();
  } else {
    console.log('[BACKGROUND] Warning: AutoSyncScheduler không được tìm thấy');
  }
}
```

### Bước 3: Thêm script vào popup

Chỉnh sửa file `popup/index.html` để thêm script `use_auto_sync.js`:

```html
<!-- Thêm sau các scripts khác và trước </body> -->
<script src="../scripts/use_auto_sync.js"></script>
```

### Bước 4: Cập nhật manifest.json

Cập nhật file `manifest.json` để thêm quyền:

```json
"permissions": [
  "storage",
  "scripting",
  "activeTab",
  "webRequest",
  "webRequestBlocking",
  "alarms",
  "notifications"
],
```

## Cách sử dụng

1. Sau khi cài đặt, bạn sẽ thấy phần "Tự động đồng bộ lúc 9:00 sáng" trong popup của extension
2. Bật/tắt tính năng bằng nút toggle
3. Xem thời gian đồng bộ tiếp theo
4. Có thể nhấn "Đồng bộ ngay" để chạy đồng bộ ngay lập tức

## Cách hoạt động

1. Khi Chrome khởi động hoặc extension được cài đặt, extension kiểm tra trạng thái tự động đồng bộ
2. Nếu tính năng được bật, extension sẽ lên lịch chạy vào 9:00 sáng
3. Vào thời điểm lên lịch, extension sẽ:
   - Tìm tab Amazon đang mở hoặc mở tab mới
   - Gửi lệnh đồng bộ đến content script
   - Lên lịch cho ngày hôm sau

## Khắc phục sự cố

- **Không tự động đồng bộ**: Đảm bảo Chrome đang chạy vào lúc 9:00 sáng
- **Hiển thị "Không thể kết nối với extension"**: Thử reload extension
- **Không thấy tùy chọn trong popup**: Kiểm tra xem script đã được thêm đúng cách chưa

## Phát triển thêm

- Có thể tùy chỉnh thời gian đồng bộ trong file `auto_sync_scheduler.js`
- Có thể sửa giao diện UI trong file `use_auto_sync.js` 