chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
    if (req.message === "getPhoneNow") {
        console.log("[ContentScript] Bắt đầu lấy SĐT, mode =", req.mode);

        // Chờ trang load đầy đủ
        await new Promise(r => setTimeout(r, 3000));

        // 🧩 BƯỚC 0.5: Chọn “Date range: Last 30 days” và nhấn “Request”
        const rangeSelect = document.querySelector('select[name="numDays-fbmOrdersReport"]');
        if (rangeSelect) {
            rangeSelect.value = "30"; // chọn "Last 30 days"
            rangeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[ContentScript] Đã chọn khoảng thời gian: Last 30 days");

            const requestButton = document.querySelector('[data-test-id="requestButton"] input[type="submit"]');
            if (requestButton) {
                console.log("[ContentScript] Click nút Request...");
                requestButton.click();
                await new Promise(r => setTimeout(r, 10000)); // ⏳ đợi 10s cho request xử lý
            } else {
                console.warn("[ContentScript] Không tìm thấy nút Request");
            }
        } else {
            console.warn("[ContentScript] Không tìm thấy dropdown numDays-fbmOrdersReport");
        }

        // 🧩 BƯỚC 0: Kiểm tra mục “Scheduled Report Settings” đã bật chưa
        const scheduleSectionHeader = document.querySelector('a[data-action="a-expander-toggle"] span span');
        if (scheduleSectionHeader && scheduleSectionHeader.innerText.includes("Scheduled Report Settings")) {
            console.log("[ContentScript] Đã tìm thấy tiêu đề Scheduled Report Settings");

            // Kiểm tra xem section có đang collapsed không
            const icon = document.querySelector('.a-icon.a-icon-section-collapse, .a-icon.a-icon-section-expand');
            const isCollapsed = icon && icon.classList.contains("a-icon-section-expand");

            if (isCollapsed) {
                console.log("[ContentScript] Mục Scheduled Report Settings đang đóng → tiến hành mở...");
                const toggleButton = scheduleSectionHeader.closest("a[data-action='a-expander-toggle']");
                if (toggleButton) {
                    toggleButton.click();
                    console.log("[ContentScript] Đã click để mở Scheduled Report Settings");
                    await new Promise(r => setTimeout(r, 2000)); // đợi load dropdown
                }
            } else {
                console.log("[ContentScript] Scheduled Report Settings đã mở sẵn");
            }
        } else {
            console.warn("[ContentScript] Không tìm thấy mục Scheduled Report Settings — bỏ qua bước mở");
        }

        // 🧩 BƯỚC 1: chọn dropdown “Daily at”
        const intervalSelect = document.querySelector('select[name="scheduleInterval-fbmOrdersReport"]');
        if (intervalSelect) {
            intervalSelect.value = "5"; // chọn option có value = 5 → Daily at
            intervalSelect.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[ContentScript] Đã chọn dropdown khoảng thời gian: Daily at");
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.warn("[ContentScript] Không tìm thấy dropdown scheduleInterval-fbmOrdersReport");
        }

        // 🧩 BƯỚC 2: chọn dropdown “7 PM”
        const timeSelect = document.querySelector('select[name="scheduleCustomerInterval-fbmOrdersReport"]');
        if (timeSelect) {
            timeSelect.value = "19"; // chọn option có value = 19 → 7 PM
            timeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[ContentScript] Đã chọn khung giờ: 7 PM");
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.warn("[ContentScript] Không tìm thấy dropdown scheduleCustomerInterval-fbmOrdersReport");
        }

        // 🧩 BƯỚC 3: Click “Schedule” hoặc “Reschedule” (tùy nút nào có trên trang)
        let scheduleButton = document.querySelector('[data-test-id="scheduleButton"] input[type="submit"]');
        let rescheduleButton = document.querySelector('[data-test-id="rescheduleButton"] input[type="submit"]');

        if (scheduleButton) {
            console.log("[ContentScript] 🔹 Phát hiện nút Schedule → tiến hành click...");
            scheduleButton.click();
        } else if (rescheduleButton) {
            console.log("[ContentScript] 🔹 Phát hiện nút Reschedule → tiến hành click...");
            rescheduleButton.click();
        } else {
            console.warn("[ContentScript] ⚠️ Không tìm thấy cả nút Schedule và Reschedule!");
        }


        // 🕓 CHỜ TRANG REFRESH (vì nhấn Schedule xong Amazon sẽ reload lại danh sách)
        console.log("[ContentScript] Chờ trang refresh hoàn tất...");
        await new Promise(r => setTimeout(r, 8000)); // chờ 8s cho chắc

        // 🧩 BƯỚC 4: Tìm và xử lý nút Download
        const buttons = Array.from(document.querySelectorAll('a, button'))
            .filter(el => el.innerText.trim().toLowerCase() === 'download');

        if (buttons.length === 0) {
            let retryCount = parseInt(sessionStorage.getItem('getPhoneRetryCount') || "0", 10);
            retryCount++;
            sessionStorage.setItem('getPhoneRetryCount', retryCount);

            console.warn(`[GetPhone] ❌ Không thấy nút Download (lần ${retryCount}/5)`);

            if (retryCount <= 5) {
                console.log("[GetPhone] ⏳ Yêu cầu background reload lại tab...");

                chrome.runtime.sendMessage({ message: "reloadCurrentTab" });

                return;
            }

            // --- Nếu quá 5 lần vẫn không thấy nút Download ---
            chrome.runtime.sendMessage({
                action: "reportStatusToServer_action",
                data: {
                    featureName: "syncPhone",
                    status: "FAILED",
                    message: "Không tìm thấy nút Download sau 5 lần thử."
                }
            }, (res) => {
                console.log("[ContentScript] Đã gửi yêu cầu reportStatusToServer_action, phản hồi:", res);
            });

            sessionStorage.removeItem('getPhoneRetryCount');


            sendResponse({ status: "no_download_button" });
            chrome.runtime.sendMessage({
                message: "uploadGetPhoneFile",
                data: {
                    note: "Không tìm thấy nút Download sau 5 lần thử!",
                    fileName: null
                }
            }, (res) => {
                console.log("[ContentScript] Đã gửi message uploadGetPhoneFile xong, phản hồi:", res);
            });

            console.log("[ContentScript] Dừng lại sau 5 lần refresh thất bại");

            // ✅ Đóng tab tại đây
            setTimeout(() => window.close(), 1500);
            return;
        }

        // Nếu đến đây nghĩa là tìm thấy nút Download
        sessionStorage.removeItem('getPhoneRetryCount');


        // get_phone.js
        if (req.mode === "single") {
            // 🔹 Với single mode — tạo batchId riêng
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T.Z]/g, "_").slice(0, 19); 
            // Kết quả ví dụ: 2025_10_10_09_42_52
            const batchId = `batch_${timestamp}`;

            const btn = buttons[0];
            const link = btn.href;

            console.log("[ContentScript] 🟢 Bắt đầu tải 1 file qua fetch:", link);
            const response = await fetch(link);
            const blob = await response.blob();

            const localFileName = `getphone_report_${Date.now()}.txt`;
            const blobBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(",")[1]);
                reader.readAsDataURL(blob);
            });

            const note = `[getPhone.js] Upload file đơn - ${new Date().toLocaleString()}`;

            // 📤 Gửi sang background → upload + sync luôn
            chrome.runtime.sendMessage({
                message: "uploadGetPhoneFile",
                data: { blobBase64, fileName: localFileName, note, batchId },
            }, (res) => console.log("[ContentScript] 📤 Upload result:", res));

            // alert("✅ File đã được tải về và gửi lên server + sync thành công!");
        }

        else {
            console.log(`[ContentScript] Bắt đầu tải tất cả ${buttons.length} file qua fetch...`);

            // 🔹 Tạo batchId duy nhất cho toàn bộ đợt này
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T.Z]/g, "_").slice(0, 19); 
            // Kết quả ví dụ: 2025_10_10_09_42_52
            const batchId = `batch_${timestamp}`;

            // 📦 Mảng chứa các file để upload
            const uploadQueue = [];

            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                const link = btn.href;
                console.log(`[ContentScript] → Fetch file ${i + 1}:`, link);

                const response = await fetch(link);
                const blob = await response.blob();
                const blobBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(",")[1]);
                    reader.readAsDataURL(blob);
                });

                uploadQueue.push({
                    blobBase64,
                    fileName: `getphone_report_${Date.now()}_${i + 1}.txt`,
                    note: `[getPhone.js] Upload file ${i + 1}/${buttons.length} - ${new Date().toLocaleString()}`,
                    batchId // 🔹 Gửi cùng batchId
                });

                await new Promise(r => setTimeout(r, 1000)); // chờ 1s giữa mỗi lần fetch
            }

            // 📤 Upload lần lượt (chỉ upload thôi, chưa sync)
            for (const fileData of uploadQueue) {
                chrome.runtime.sendMessage({
                    message: "uploadGetPhoneFile_only",
                    data: fileData,
                });
                await new Promise(r => setTimeout(r, 1500));
            }

            // 🔁 Sau khi upload hết → yêu cầu background gọi sync 1 lần duy nhất
            chrome.runtime.sendMessage({
                message: "syncBuyerPhonesNow",
                data: { batchId } // ✅ Truyền batchId qua
            }, (res) => {
                console.log("[ContentScript] 🔁 Sync Buyer Phones Result:", res);
                // ✅ Đóng tab sau khi sync hoàn tất
                setTimeout(() => window.close(), 2000);
            });
        }

        sendResponse({ status: "ok", count: buttons.length });
    }
});

