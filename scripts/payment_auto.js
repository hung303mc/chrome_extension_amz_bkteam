(() => {
    'use strict';

    console.log("[Payment Script - Patient Version] Loaded on:", window.location.href);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.message === "startPaymentProcess") {
            initialize(request.data);
            sendResponse({ status: "processing" });
        }
        return true;
    });

    async function initialize(options) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const url = window.location.href;
        if (url.includes('/payments/dashboard')) {
            await processDashboardPage(options);
        } else if (url.includes('/payments/disburse/details')) {
            await processDisburseDetailsPage(options);
        } else {
            reportFailure({ ...options, reason: `URL không nhận dạng được: ${url}` });
        }
    }

    // --- LOGIC TRANG DASHBOARD (BƯỚC 1) ---
    async function processDashboardPage(options) {
        // Thêm hàm lấy số dư hiện có
        function getAvailableFunds() {
            const el = document.querySelector('.available-currency-total-amount span');
            // Trả về số tiền hoặc 0 nếu không tìm thấy
            return el ? (parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0) : 0;
        }

        const availableFunds = getAvailableFunds();
        console.log(`[Payment Script] Số dư khả dụng trên Dashboard: $${availableFunds}`);

        // Bắt đầu kiểm tra điều kiện
        if (availableFunds >= 150) {
            console.log(`[Payment Script] Số dư $${availableFunds} >= $150. Tiến hành tìm và nhấn nút.`);
            const requestButton = await findRequestPaymentButton();
            if (requestButton.found) {
                console.log("[Payment Script] ✅ Bước 1: Đã tìm thấy và sẽ click nút 'Request Payment'.");
                requestButton.element.click();
            } else {
                reportFailure({ ...options, reason: "Đủ điều kiện nhưng không tìm thấy nút 'Request Payment' trên trang Dashboard." });
            }
        } else {
            // Nếu số tiền không đủ, báo cáo thất bại và không làm gì cả
            const reason = `Số dư không đủ để rút ($${availableFunds} < $150). Tác vụ đã dừng.`;
            console.error(`[Payment Script] ❌ ${reason}`);
            reportFailure({ ...options, reason: reason });
        }
    }

    function findRequestPaymentButton() {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = () => {
                // Bước 1: Tìm tất cả các nút "Request Payment" có thể nhấn được
                const allButtons = document.querySelectorAll(
                    '.custom-child-available-balance kat-button[label="Request Payment"]:not([disabled])'
                );

                if (allButtons.length === 1) {
                    // Trường hợp đơn giản: chỉ có 1 nút, chọn ngay
                    console.log("[Payment Script] Tìm thấy 1 nút Request Payment duy nhất.");
                    resolve({ found: true, element: allButtons[0] });
                    return;
                }

                if (allButtons.length > 1) {
                    // Trường hợp phức tạp: có nhiều nút, cần tìm nút có số dư lớn nhất
                    console.log(`[Payment Script] Tìm thấy ${allButtons.length} nút. Bắt đầu tìm nút có số dư lớn nhất.`);
                    let maxBalance = -1;
                    let bestButton = null;

                    allButtons.forEach(button => {
                        // Đi ngược cây DOM để tìm thẻ cha chứa cả nút và số dư
                        const parentContainer = button.closest('.payment-card-row-container');
                        if (parentContainer) {
                            // Tìm số dư trong thẻ cha đó
                            const balanceElement = parentContainer.querySelector('.currency-display-amount');
                            if (balanceElement) {
                                // Chuyển đổi số dư thành dạng số để so sánh
                                const currentBalance = parseFloat(balanceElement.textContent.replace(/[^0-9.]/g, '')) || 0;

                                if (currentBalance > maxBalance) {
                                    maxBalance = currentBalance;
                                    bestButton = button;
                                }
                            }
                        }
                    });

                    if (bestButton) {
                        console.log(`[Payment Script] Đã chọn nút có số dư cao nhất: $${maxBalance}`);
                        resolve({ found: true, element: bestButton });
                        return;
                    }
                }

                // Nếu không tìm thấy nút nào, hoặc không xác định được nút tốt nhất, thử lại
                if (attempts < 5) {
                    attempts++;
                    setTimeout(check, 1000);
                } else {
                    resolve({ found: false });
                }
            };
            check();
        });
    }

    // --- LOGIC TRANG DISBURSE DETAILS (BƯỚC 2) ---
    async function processDisburseDetailsPage(options) {
        console.log("[Payment Script] BƯỚC 2: Đang xử lý trang Disburse Details...");
        const buttonInfo = await findDisburseButton(); // Sử dụng hàm tìm và chờ mới
        
        if (buttonInfo.found && buttonInfo.enabled) {
            const amount = getSettlementAmount();
            console.log(`[Payment Script] ✅ Bước 2: Nút đã sẵn sàng! Số tiền: $${amount}. Thực hiện click...`);
            buttonInfo.element.click();
            setTimeout(() => {
                reportSuccess({ ...options, clickPerformed: true, amount: parseFloat(amount) || 0 });
            }, 3000);
        } else {
            const reason = buttonInfo.found
                ? "Nút 'Request Disbursement' được tìm thấy nhưng vẫn bị vô hiệu hóa sau khi chờ."
                : "Không tìm thấy nút 'Request Disbursement' ở bước cuối cùng.";
            console.error(`[Payment Script] ❌ Bước 2: THẤT BẠI. Lý do: ${reason}`);
            reportFailure({ ...options, reason: reason });
        }
    }

    function getSettlementAmount() {
        const el = document.querySelector('.settlement-amount-balance div, [data-test-id="current-settlement-amount"]');
        return el ? el.textContent.trim().replace(/[^0-9.]/g, '') : '0.00';
    }

    /**
     * [PHIÊN BẢN NÂNG CẤP] Tìm nút và kiên nhẫn chờ nó được kích hoạt.
     */
    function findDisburseButton() {
        console.log("[Payment Script] Bước 2: Đang tìm nút cuối cùng và chờ nó được kích hoạt...");
        return new Promise((resolve) => {
            let findAttempts = 0;
            const maxFindAttempts = 10; // Tối đa 10 giây để TÌM THẤY phần tử nút

            const findCheck = () => {
                findAttempts++;
                let buttonElement = null;
                let hostElement = null;

                // Thử tìm bằng nhiều cách
                hostElement = document.getElementById('request-transfer-button');
                if (hostElement && hostElement.shadowRoot) { 
                    buttonElement = hostElement.shadowRoot.querySelector('button[type="submit"]'); 
                }
                if (!buttonElement) {
                    buttonElement = document.querySelector('button[data-test-id="request-disbursement-button"]');
                }
                // Thêm các selector khác nếu cần

                if (buttonElement) {
                    console.log("[Payment Script] ✅ Đã tìm thấy phần tử nút. Bắt đầu chờ nút được kích hoạt...");
                    waitForButtonEnabled(buttonElement, hostElement, resolve);
                } else if (findAttempts < maxFindAttempts) {
                    setTimeout(findCheck, 1000);
                } else {
                    console.error("[Payment Script] ❌ Không tìm thấy phần tử nút nào sau " + maxFindAttempts + " giây.");
                    resolve({ found: false });
                }
            };

            const waitForButtonEnabled = (button, host, finalResolve) => {
                let waitAttempts = 0;
                const maxWaitAttempts = 15; // Tối đa 15 giây để CHỜ nút được kích hoạt

                const enableCheck = () => {
                    waitAttempts++;
                    const isEnabled = !button.disabled && !(host && host.hasAttribute('disabled'));

                    if (isEnabled) {
                        console.log(`[Payment Script] ✅ Nút đã được kích hoạt sau ${waitAttempts} giây.`);
                        finalResolve({ found: true, element: button, enabled: true });
                    } else if (waitAttempts < maxWaitAttempts) {
                        console.log(`[Payment Script] Nút đang bị vô hiệu hóa, chờ... (${waitAttempts}/${maxWaitAttempts})`);
                        setTimeout(enableCheck, 1000);
                    } else {
                        console.error(`[Payment Script] ❌ Nút vẫn bị vô hiệu hóa sau khi chờ thêm ${maxWaitAttempts} giây.`);
                        finalResolve({ found: true, element: button, enabled: false });
                    }
                };
                enableCheck();
            };

            findCheck(); // Bắt đầu tìm kiếm
        });
    }

    // --- CÁC HÀM BÁO CÁO (GIỮ NGUYÊN) ---
    function reportSuccess(data) {
        console.log("[Payment Script] Báo cáo THÀNH CÔNG:", data);
        chrome.runtime.sendMessage({ message: "sendPaymentLogToServer", data });
    }

    function reportFailure(data) {
        console.error("[Payment Script] Báo cáo THẤT BẠI:", data);
        chrome.runtime.sendMessage({ message: "disbursementFailed", data });
    }
})();