// get_buyer_phone.js
// Chứa code xử lý background nhưng tách ra file riêng
// một lát nữa thêm hàm sync tự động vào đây
chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
  const featureName = "syncPhone"; // tên feature dùng khi report trạng thái lên server
  try {
    // ========== CASE 1: Upload file (single & multi) ==========
    if (req.message === "uploadGetPhoneFile" || req.message === "uploadGetPhoneFile_only") {
      const uploadOnly = req.message === "uploadGetPhoneFile_only";
      console.log(`[GetPhone] 📩 Nhận message ${req.message}`);

      const { blobBase64, fileName, note, batchId } = req.data || {};

      // Validate input tối thiểu
      if (!blobBase64 || !fileName) {
        const errMsg = "[Get_Buyer_Phone] Không có data để download.";
        console.error(errMsg);
        sendLogToServer(errMsg);
        await reportStatusToServer(featureName, "FAILED", errMsg);
        sendResponse({ ok: false, error: errMsg });
        return true;
      }

      // Chuyển base64 -> Blob -> File
      const blob = Uint8Array.from(atob(blobBase64), c => c.charCodeAt(0));
      const file = new File([blob], fileName, { type: "text/plain" });

      const merchantId = "TEST_MERCHANT_123"; // nếu có thể, replace bằng giá trị thực từ storage hoặc req.data
      const formData = new FormData();
      formData.append("merchant_id", merchantId);
      formData.append("log_message", note || "");
      formData.append("batch_id", batchId || `batch_${Date.now()}`);
      formData.append("report_file", file);

      try {
        // Start upload
        sendLogToServer(`[GetPhone] 🔄 Đang upload file: ${fileName}`);
        await reportStatusToServer(featureName, "RUNNING", "Bắt đầu upload file tới Server.");

        const uploadRes = await fetch("https://bkteam.top/dungvuong-admin/api/upload_getphone_handler.php", {
          method: "POST",
          body: formData,
        });

        const uploadResult = await uploadRes.json();
        console.log("[GetPhone] ✅ Upload thành công:", uploadResult);

        // Nếu là single mode -> sync ngay
        if (!uploadOnly) {
          try {
            sendLogToServer("[GetPhone] 🔁 Gọi API sync buyer phones...");
            await reportStatusToServer(featureName, "RUNNING", "Bắt đầu sync buyer phones...");

            const syncRes = await fetch("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=syncBuyerPhones", {
              method: "GET"
            });
            const syncResult = await syncRes.json();
            console.log("[GetPhone] ✅ Sync hoàn tất:", syncResult);

            sendLogToServer("[GetPhone] ✅ Sync hoàn tất.");
            await reportStatusToServer(featureName, "SUCCESS", "Sync buyer phones hoàn tất.");

            sendResponse({ ok: true, upload: uploadResult, sync: syncResult });
          } catch (syncErr) {
            console.error("[GetPhone] 💥 Lỗi khi sync:", syncErr);
            sendLogToServer(`[GetPhone] 💥 Sync error: ${syncErr.message || syncErr}`);
            await reportStatusToServer(featureName, "FAILED", `Sync error: ${syncErr.message || syncErr}`);
            sendResponse({ ok: false, upload: uploadResult, error: syncErr.message || String(syncErr) });
          }
        } else {
          // multi-mode -> chỉ upload
          sendResponse({ ok: true, upload: uploadResult });
        }
      } catch (uploadErr) {
        console.error("[GetPhone] 💥 Lỗi khi upload:", uploadErr);
        sendLogToServer(`[GetPhone] 💥 Upload error: ${uploadErr.message || uploadErr}`);
        await reportStatusToServer(featureName, "FAILED", `Upload error: ${uploadErr.message || uploadErr}`);
        sendResponse({ ok: false, error: uploadErr.message || String(uploadErr) });
      }

      return true; // giữ channel mở cho sendResponse async
    }

    // ========== CASE 2: Sync Buyer Phones manually ==========
    if (req.message === "syncBuyerPhonesNow") {
        console.log("[GetPhone] 🔁 Thực hiện syncBuyerPhonesFromFiles...");
        sendLogToServer("[GetPhone] 🔁 Manual sync requested.");

        // 🧩 Gửi trạng thái RUNNING
        console.log("[GetPhone][reportStatusToServer] → Gửi trạng thái RUNNING...");
        await reportStatusToServer(featureName, "RUNNING", "Đang thực hiện Sync Phone-number");
        console.log("[GetPhone][reportStatusToServer] ✅ RUNNING sent.");

        try {
            const syncRes = await fetch(
                "https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=syncBuyerPhones",
                { method: "GET" }
            );
            const result = await syncRes.json();
            console.log("[GetPhone] ✅ Sync Done:", result);

            sendLogToServer("[GetPhone] ✅ Manual sync completed.");

            // 🧩 Gửi trạng thái SUCCESS
            console.log("[GetPhone][reportStatusToServer] → Gửi trạng thái SUCCESS...");
            await reportStatusToServer(featureName, "SUCCESS", "Sync Phone-number thành công.");
            console.log("[GetPhone][reportStatusToServer] ✅ SUCCESS sent.");

            sendResponse({ ok: true, result });
        } catch (err) {
            console.error("[GetPhone] 💥 Sync lỗi:", err);
            sendLogToServer(`[GetPhone] 💥 Manual sync error: ${err.message || err}`);

            // 🧩 Gửi trạng thái FAILED
            console.log("[GetPhone][reportStatusToServer] → Gửi trạng thái FAILED...");
            await reportStatusToServer(featureName, "FAILED", `Sync Phone-number thất bại: ${err.message || err}`);
            console.log("[GetPhone][reportStatusToServer] ✅ FAILED sent.");

            sendResponse({ ok: false, error: err.message || String(err) });
        }

        return true;
    }



    // Nếu không phải case liên quan -> trả về false để không chiếm channel
    return false;
  } catch (outerErr) {
    console.error("[GetPhone] 💥 Unexpected error in message handler:", outerErr);
    sendLogToServer(`[GetPhone] 💥 Unexpected error: ${outerErr.message || outerErr}`);
    // Cố gắng báo server nếu có thể
    try { await reportStatusToServer(featureName, "FAILED", `Unexpected error: ${outerErr.message || outerErr}`); } catch(e){/* ignore */ }
    sendResponse({ ok: false, error: outerErr.message || String(outerErr) });
    return true;
  }
});






// Kiểm tra order ID có hợp lệ không và cập nhật SĐT để test
chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
    if (req.message === "checkOrderInfo") {
        console.log("[GetPhone] 🕵️ Kiểm tra order ID:", req.orderId);

        try {
            const res = await fetch(`https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=checkOrderInfo&order_id=${encodeURIComponent(req.orderId)}`);
            const text = await res.text(); // Lấy phản hồi thô
            console.log("[GetPhone] 🧾 Phản hồi thô từ server:", text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("[GetPhone] ❌ Không parse được JSON:", e);
                data = { status: "error", raw: text };
            }

            console.log("[GetPhone] ✅ Kết quả kiểm tra:", data);
            sendResponse({ ok: true, data });
        } catch (err) {
            console.error("[GetPhone] ❌ Lỗi khi gọi API:", err);
            sendResponse({ ok: false, error: err.message });
        }

        return true; // Để giữ sendResponse async
    }

    // 🆕 Cập nhật SĐT thực
    if (req.message === "updateBuyerPhone") {
        console.log("[GetPhone] ✏️ Cập nhật SĐT:", req.orderId, req.phone);

        try {
            const res = await fetch(
                `https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=updateBuyerPhone&order_id=${encodeURIComponent(req.orderId)}&phone=${encodeURIComponent(req.phone)}`
            );
            const text = await res.text();
            console.log("[GetPhone] 📤 Phản hồi cập nhật:", text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error("[GetPhone] ❌ Không parse được JSON:", e);
                data = { status: "error", raw: text };
            }

            sendResponse({ ok: true, data });
        } catch (err) {
            console.error("[GetPhone] ❌ Lỗi khi gọi API cập nhật:", err);
            sendResponse({ ok: false, error: err.message });
        }

        return true;
    }
});