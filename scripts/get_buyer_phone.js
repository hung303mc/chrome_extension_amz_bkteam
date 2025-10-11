// get_buyer_phone.js
// Chứa code xử lý background nhưng tách ra file riêng
// một lát nữa thêm hàm sync tự động vào đây
chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
    // 📦 Xử lý cả 2 trường hợp upload (single & multi)
    if (req.message === "uploadGetPhoneFile" || req.message === "uploadGetPhoneFile_only") {
        // 🧭 Xác định xem đây là upload-only (multi mode) hay upload + sync (single)
        const uploadOnly = req.message === "uploadGetPhoneFile_only";
        console.log(`[GetPhone] 📩 Nhận message ${req.message}`);

        // 📄 Giải nén dữ liệu gửi từ content script
        const { blobBase64, fileName, note, batchId } = req.data;

        // 🔄 Chuyển base64 → Blob → File (để append vào FormData)
        const blob = Uint8Array.from(atob(blobBase64), c => c.charCodeAt(0));
        const file = new File([blob], fileName, { type: "text/plain" });

        // 🧾 Chuẩn bị formData để gửi lên server
        const formData = new FormData();
        formData.append("merchant_id", "TEST_MERCHANT_123");
        formData.append("log_message", note);
        formData.append("batch_id", batchId || `batch_${Date.now()}`); // 🔹 batch_id: dùng chung cho nhiều file nếu multi
        formData.append("report_file", file);

        try {
            // 🚀 Upload file lên server (upload_getphone_handler.php)
            console.log("[GetPhone] 🔄 Đang upload file...");
            const uploadRes = await fetch("https://bkteam.top/dungvuong-admin/api/upload_getphone_handler.php", {
                method: "POST",
                body: formData,
            });

            const uploadResult = await uploadRes.json();
            console.log("[GetPhone] ✅ Upload thành công:", uploadResult);

            // 🌀 Nếu là single mode → upload xong thì gọi API sync luôn
            if (!uploadOnly) {
                console.log("[GetPhone] 🔁 Gọi API sync buyer phones...");
                const syncRes = await fetch("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=syncBuyerPhones");
                const syncResult = await syncRes.json();
                console.log("[GetPhone] ✅ Sync hoàn tất:", syncResult);

                // 📤 Trả kết quả về content script
                sendResponse({ ok: true, upload: uploadResult, sync: syncResult });
            } 
            // 🧩 Ngược lại (multi mode) thì chỉ upload thôi
            else {
                sendResponse({ ok: true, upload: uploadResult });
            }

        } catch (err) {
            console.error("[GetPhone] 💥 Lỗi khi upload hoặc sync:", err);
            sendResponse({ ok: false, error: err.message });
        }

        return true;
    }


    // 2️⃣ Sync Buyer Phones manually
    if (req.message === "syncBuyerPhonesNow") {
        console.log("[GetPhone] 🔁 Thực hiện syncBuyerPhonesFromFiles...");
        try {
            const syncRes = await fetch("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=syncBuyerPhones");
            const result = await syncRes.json();
            console.log("[GetPhone] ✅ Sync Done:", result);

            sendResponse({ ok: true, result });
        } catch (err) {
            console.error("[GetPhone] 💥 Sync lỗi:", err);
            
            sendResponse({ ok: false, error: err.message });
        }

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