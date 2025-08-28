# Tiện ích Bkteam Sync Order Amz

## Giới thiệu
Bkteam Sync Order Amz là một tiện ích mở rộng cho trình duyệt Chrome, được thiết kế để hỗ trợ người bán trên Amazon quản lý và đồng bộ hóa đơn hàng với hệ thống Bkteam một cách dễ dàng và hiệu quả. Tiện ích này tự động hóa nhiều quy trình quan trọng, từ việc đồng bộ đơn hàng, cập nhật mã vận đơn, theo dõi sức khỏe tài khoản đến tải báo cáo quảng cáo.

## Các chức năng chính
### 1. Đồng bộ đơn hàng
- Tự động và thủ công đồng bộ các đơn hàng chưa được xử lý từ Amazon Seller Central về hệ thống Bkteam.

### 2. Cập nhật mã vận đơn
- Tự động điền thông tin mã vận đơn và hãng vận chuyển cho các đơn hàng.

### 3. Theo dõi sức khỏe tài khoản
- Tự động thu thập các chỉ số quan trọng về hiệu suất bán hàng và gửi về máy chủ.

### 4. Quản lý báo cáo quảng cáo
- Tự động tải xuống các báo cáo quảng cáo từ Amazon.

### 5. Đồng bộ tệp tùy chỉnh
- Hỗ trợ tải và đồng bộ các tệp đính kèm của đơn hàng tùy chỉnh (personalized orders).

## Lịch trình hoạt động của các chức năng tự động
Tiện ích sử dụng hệ thống báo thức (Alarms) của Chrome để thực hiện các tác vụ một cách tự động theo lịch trình định sẵn. Dưới đây là chi tiết về thời gian và chức năng tương ứng:

| Thời gian (Sáng) | Tên Alarm               | Chức năng            | Mô tả hoạt động                                                                                             |
|------------------|-------------------------|----------------------|------------------------------------------------------------------------------------------------------------|
| 06:40            | `dailyDownloadAdsReports`| Tải báo cáo quảng cáo | Tự động mở tab báo cáo quảng cáo, tìm và tải xuống các báo cáo có sẵn, sau đó gửi lên máy chủ Bkteam.       |
| 07:00            | `dailyUpdateTracking`    | Cập nhật mã vận đơn   | Lấy danh sách các đơn hàng cần cập nhật mã vận đơn từ Bkteam, điền thông tin và xác nhận cập nhật.        |
| 08:00            | `dailySyncOrder`         | Đồng bộ đơn hàng      | Tự động đồng bộ các đơn hàng chưa được xử lý từ Amazon vào hệ thống Bkteam.                                |
| 08:40            | `dailyAccountHealth`     | Kiểm tra sức khỏe tài khoản | Thu thập các chỉ số về ODR, vi phạm chính sách, hiệu suất giao hàng và gửi về máy chủ Bkteam.             |

**Lưu ý**: Tất cả các thời gian được định cấu hình trong `scripts/background.js` và có thể được điều chỉnh nếu cần thiết.

## Mô tả chi tiết cách hoạt động

### 1. Đồng bộ đơn hàng (Sync Orders)
- **Kích hoạt**: Người dùng nhấn nút "Sync Orders" hoặc được kích hoạt tự động theo lịch.
- **Quy trình**:
  - `sync_order.js` quét danh sách đơn hàng trên Amazon.
  - Xác định các đơn hàng đã bị yêu cầu hủy và gửi thông tin về `background.js`.
  - `background.js` gửi yêu cầu đến máy chủ Bkteam để kiểm tra trạng thái đồng bộ.
  - Hiển thị trạng thái đơn hàng ("Synced", "Not Synced", "Tracking Available", v.v.).
  - Nếu đơn hàng chưa đồng bộ, `background.js` mở từng trang chi tiết và gửi thông tin về máy chủ Bkteam để tạo đơn hàng mới.

### 2. Cập nhật mã vận đơn (Update Tracking)
- **Kích hoạt**: Người dùng nhấn nút "Start Update" hoặc tự động theo lịch.
- **Quy trình**:
  - `update_tracking.js` gửi yêu cầu đến `background.js` để lấy danh sách đơn hàng cần cập nhật.
  - `background.js` mở trang "Confirm Shipment" hoặc "Edit Shipment".
  - `add_tracking.js` điền tự động mã vận đơn, hãng vận chuyển, và dịch vụ vận chuyển.
  - Sau khi điền thông tin, script xác nhận việc cập nhật mã vận đơn trước khi gửi thông báo về máy chủ Bkteam.

### 3. Lấy sức khỏe tài khoản (Account Health)
- **Kích hoạt**: Người dùng nhấn nút "Get account health" hoặc tự động theo lịch.
- **Quy trình**:
  - `get_account_health.js` tự động tải các trang cần thiết (Seller Central, Performance Dashboard, Returns, Feedback, v.v.).
  - Thu thập các chỉ số quan trọng và gửi chúng về máy chủ Bkteam dưới dạng JSON.

### 4. Tải báo cáo quảng cáo (Ads Report)
- **Kích hoạt**: Người dùng nhấn nút "Download Ads Reports" hoặc tự động theo lịch.
- **Quy trình**:
  - `ads_report.js` gửi yêu cầu tải các báo cáo quảng cáo.
  - `background.js` truy cập vào trang quản lý báo cáo quảng cáo và tìm các báo cáo có sẵn.
  - Các báo cáo được tải về dưới dạng Blob và gửi lên máy chủ Bkteam.
  - Báo cáo được lưu ở /home/amazon-ads-system/webapp/ads_report_uploaded/

### 5. Cấu hình (Popup)
- **File liên quan**: `popup/index.html`, `popup/popup.js`.
- **Mô tả**: Giao diện cho phép người dùng nhập và lưu **MB API key**, được lưu trữ trong `chrome.storage.local` để tiện ích sử dụng trong các lệnh gọi API đến máy chủ Bkteam.

---

> **Lưu ý**: Để cài đặt và sử dụng tiện ích, bạn cần quyền truy cập vào Amazon Seller Central và tài khoản Bkteam.
