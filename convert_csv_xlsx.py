import pandas as pd
import os
import shutil

# Lấy đường dẫn thư mục hiện tại
current_folder = os.getcwd()

# Tạo thư mục backup cho CSV nếu chưa có
backup_folder = os.path.join(current_folder, "CSV_Backup")
os.makedirs(backup_folder, exist_ok=True)

# Lặp qua các file trong thư mục hiện tại
for file in os.listdir(current_folder):
    if file.endswith(".csv"):
        csv_path = os.path.join(current_folder, file)
        xlsx_path = os.path.join(current_folder, file.replace(".csv", ".xlsx"))

        try:
            # Đọc file CSV và convert sang XLSX
            df = pd.read_csv(csv_path)
            df.to_excel(xlsx_path, index=False)

            # Di chuyển file CSV gốc vào thư mục backup
            shutil.move(csv_path, os.path.join(backup_folder, file))
            print(f"✅ Converted: {file} → {os.path.basename(xlsx_path)}")
        except Exception as e:
            print(f"❌ Error converting {file}: {e}")

print("\n🎉 Hoàn tất chuyển đổi và backup file CSV.")
