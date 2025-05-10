import os
import re
import requests
import mimetypes
import time

# --- Cấu hình ---
# Lấy đường dẫn của thư mục hiện tại chứa file Python này
REPORT_FOLDER = os.path.dirname(os.path.abspath(__file__))
UPLOAD_URL = "https://bkteam.top/dungvuong-admin/ajax.php?page=import_camps_report&act=save"
UPLOAD_DELAY = 1

# --- Hàm upload một file report ---
def upload_report(file_path, merchant_id):
    """Upload file report lên server, gửi kèm merchant_id."""
    filename = os.path.basename(file_path)
    try:
        filename_safe = filename
    except Exception:
        filename_safe = filename

    try:
        mime_type, _ = mimetypes.guess_type(file_path)
        if mime_type is None:
            mime_type = 'application/octet-stream'

        with open(file_path, 'rb') as f:
            files = {
                'file_data_source': (filename, f, mime_type)
            }
            payload = {
                'act': 'save',
                'merchant_id': merchant_id
            }

            response = requests.post(UPLOAD_URL, files=files, data=payload, timeout=120)
            response.raise_for_status()
            response_text = response.text.strip()

            if "[SUCCESS]" in response_text:
                return True
            else:
                return False

    except FileNotFoundError:
        return False
    except requests.exceptions.Timeout:
        return False
    except requests.exceptions.RequestException:
        return False
    except Exception:
        return False

# --- Main Script ---
if __name__ == "__main__":
    # Hiển thị thư mục sẽ quét
    print(f"Thư mục quét file: {REPORT_FOLDER}")
    print("Yêu cầu định dạng tên file: tên-file_MÃ-MERCHANT.csv hoặc tên-file_MÃ-MERCHANT.xlsx")
    print("Trong đó MÃ-MERCHANT phải chứa ít nhất 10 ký tự là chữ HOA hoặc số.")
    print("Ví dụ: Campaign_Report_ATVPDKIKX0DER.xlsx\n")
    
    files_to_process = []
    processed_count = 0
    success_count = 0
    fail_count = 0
    skipped_count = 0

    skipped_files = []
    successful_uploads = []
    failed_uploads = []

    pattern = re.compile(r'.*_([A-Z0-9]{10,})\.(csv|xlsx)$')

    try:
        all_files_raw = os.listdir(REPORT_FOLDER)
        # Chỉ lấy file csv và xlsx
        all_files = [f for f in all_files_raw if os.path.isfile(os.path.join(REPORT_FOLDER, f)) 
                    and f.lower().endswith(('.csv', '.xlsx'))]
    except OSError as e:
        print(f"[ERROR] Không thể đọc danh sách file từ thư mục: {REPORT_FOLDER} - {e}")
        exit()

    # Lọc và trích xuất thông tin
    for filename_raw in all_files:
        file_path = os.path.join(REPORT_FOLDER, filename_raw)
        display_name = filename_raw

        match = pattern.match(filename_raw)
        if match:
            merchant_id = match.group(1)
            files_to_process.append({'path': file_path, 'merchant_id': merchant_id, 'display_name': display_name})
        else:
            skipped_files.append(display_name)
            skipped_count += 1

    # Xử lý upload
    for file_info in files_to_process:
        processed_count += 1
        merchant_id = file_info['merchant_id']

        if upload_report(file_info['path'], merchant_id):
            success_count += 1
            successful_uploads.append(file_info['display_name'])
        else:
            fail_count += 1
            failed_uploads.append(file_info['display_name'])

        if UPLOAD_DELAY > 0 and processed_count < len(files_to_process):
            time.sleep(UPLOAD_DELAY)

    # --- Tổng kết ---
    print("\n--- Kết quả ---")
    print(f"Tổng số file CSV/XLSX tìm thấy: {len(all_files)}")
    print(f"Tổng số file hợp lệ cần xử lý: {len(files_to_process)}")
    print(f"Số file bỏ qua (không đúng định dạng tên): {skipped_count}")
    if skipped_files:
        print("  File bỏ qua:")
        for f in skipped_files:
            print(f"    - {f}")

    print(f"Đã xử lý: {processed_count}")
    print(f"Tải lên thành công: {success_count}")
    if successful_uploads:
        print("  File tải lên thành công:")
        for f in successful_uploads:
            print(f"    - {f}")

    print(f"Tải lên thất bại: {fail_count}")
    if failed_uploads:
        print("  File tải lên thất bại:")
        for f in failed_uploads:
            print(f"    - {f}")

    print("-----------------")
    
    # Giữ cửa sổ console mở để người dùng xem kết quả
    input("Nhấn Enter để thoát...")