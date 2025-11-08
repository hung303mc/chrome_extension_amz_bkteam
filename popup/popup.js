var mbApi = "MBApi";
const ipTrackingKey = "ipTrackingEnabled";
const testSettingsKey = "testSettings";
const asinMonitoringDebugKey = "asinMonitoringDebugEnabled";

// ====================================================================
// CÁC HÀM LƯU TRỮ TỪ CODE 2 (GIỮ NGUYÊN)
// ====================================================================

const saveMbApi = (apiKey) =>
    new Promise((resolve) => {
        const cleanedApiKey = (apiKey || '').toString().trim();
        chrome.storage.local.set({ [mbApi]: cleanedApiKey }).then(() => {
            localStorage.setItem(mbApi, cleanedApiKey);
            resolve(cleanedApiKey);
        });
    });

const getMbApi = () =>
    new Promise((resolve) => {
        chrome.storage.local.get(mbApi).then((result) => {
            if (result[mbApi] !== undefined) {
                resolve((result[mbApi] || '').toString().trim());
                resolve((result[mbApi] || '').toString().trim());
            } else {
                const localData = localStorage.getItem(mbApi);
                resolve((localData || '').toString().trim());
                resolve((localData || '').toString().trim());
            }
        });
    });

const removeMbApi = () =>
    new Promise((resolve) => {
        chrome.storage.local.remove(mbApi).then(() => {
            localStorage.removeItem(mbApi);
            resolve();
        });
    });

const saveIpTrackingSetting = (isEnabled) =>
    new Promise((resolve) => {
        chrome.storage.local.set({ [ipTrackingKey]: isEnabled }).then(() => {
            console.log(`Đã lưu cài đặt gửi IP là: ${isEnabled}`);
            resolve();
        });
    });

const getIpTrackingSetting = () =>
    new Promise((resolve) => {
        chrome.storage.local.get({ [ipTrackingKey]: true }).then((result) => {
            resolve(result[ipTrackingKey]);
        });
    });

const saveTestSettings = (settings) =>
    new Promise((resolve) => {
        chrome.storage.local.set({ [testSettingsKey]: settings }).then(() => {
            console.log("Đã lưu cài đặt test:", settings);
            resolve();
        });
    });

const getTestSettings = () =>
    new Promise((resolve) => {
        chrome.storage.local.get({
            [testSettingsKey]: {
                syncOrder: false,
                updateTracking: false,
                accountHealth: false,
                downloadAds: false,
                sendMessageAuto: false,
                delay: 0.1,
            }
        }).then((result) => {
            resolve(result[testSettingsKey]);
        });
    });

const saveAsinMonitoringDebugSetting = (isEnabled) =>
    new Promise((resolve) => {
        chrome.storage.local.set({ [asinMonitoringDebugKey]: isEnabled }).then(() => resolve(isEnabled));
    });

const getAsinMonitoringDebugSetting = () =>
    new Promise((resolve) => {
        chrome.storage.local.get({ [asinMonitoringDebugKey]: false }).then((result) => resolve(Boolean(result[asinMonitoringDebugKey])));
    });

// ====================================================================
// CÁC HÀM TIỆN ÍCH UI TỪ CODE 1 (THÊM MỚI)
// ====================================================================

function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.style.display = 'block';
    element.textContent = message;
    element.className = `status-${type}`;
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

function setButtonLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    if (loading) {
        button.disabled = true;
        button.style.opacity = '0.6';
        const originalText = button.getAttribute('data-original-text') || button.innerHTML;
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = '⏳ Đang xử lý...';
    } else {
        button.disabled = false;
        button.style.opacity = '1';
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
        }
    }
}

// ====================================================================
// CÁC TRÌNH XỬ LÝ SỰ KIỆN GỐC TỪ CODE 2 (GIỮ NGUYÊN)
// ====================================================================

$(document).on("click", "#save", async function () {
    const value = $("#api_key").val().trim();
    var $doc = $(this);
    $doc.addClass("loader");
    await removeMbApi();
    await saveMbApi(value);

    chrome.runtime.sendMessage({
        message: "saveApiKey",
        data: value,
    });
});

$(document).on('change', '#enable_ip_tracking', async function() {
    const isEnabled = $(this).is(':checked');
    await saveIpTrackingSetting(isEnabled);
});

$(document).on("click", "#start_variation_sync", function () {
    setButtonLoading("start_variation_sync", true);
    showStatus("variation_sync_status", "Đang mở trang Variation Wizard...", "info");

    chrome.runtime.sendMessage({ message: "startVariationSync" }, (response) => {
        setButtonLoading("start_variation_sync", false);

        if (chrome.runtime.lastError) {
            showStatus("variation_sync_status", chrome.runtime.lastError.message || "Không thể kích hoạt đồng bộ.", "error");
            return;
        }

        if (!response || response.status !== "scheduled") {
            const errorMessage = response && response.message
                ? response.message
                : "Không thể bắt đầu đồng bộ variation.";
            showStatus("variation_sync_status", errorMessage, "error");
            return;
        }

        showStatus(
            "variation_sync_status",
            "Đã mở Variation Wizard. Vui lòng theo dõi tab mới để monitor.",
            "success"
        );
    });
});

$(document).on("click", "#start_asin_monitoring", function () {
    setButtonLoading("start_asin_monitoring", true);
    showStatus("asin_monitoring_status", "Đang bắt đầu quy trình ASIN Monitoring...", "info");

    const debugMode = $('#asin_monitoring_debug').is(':checked');
    $('#asin_monitoring_debug_hint').toggle(debugMode);

    chrome.runtime.sendMessage({ message: "startAsinMonitoring", debugMode }, (response) => {
        setButtonLoading("start_asin_monitoring", false);

        if (chrome.runtime.lastError) {
            showStatus(
                "asin_monitoring_status",
                chrome.runtime.lastError.message || "Không thể bắt đầu quy trình ASIN Monitoring.",
                "error"
            );
            return;
        }

        if (!response) {
            showStatus("asin_monitoring_status", "Không nhận được phản hồi từ background.", "error");
            return;
        }

        if (response.status === "busy") {
            showStatus("asin_monitoring_status", "Một quy trình ASIN Monitoring khác đang chạy.", "error");
            return;
        }

        if (response.status !== "started") {
            const message = response.message || "Không thể bắt đầu quy trình ASIN Monitoring.";
            showStatus("asin_monitoring_status", message, "error");
            return;
        }

        const statusMessage = debugMode
            ? "Đã bắt đầu ở chế độ debug. Các tab sẽ được giữ mở cho tới khi bạn tự đóng."
            : "Đã bắt đầu. Vui lòng theo dõi các tab Amazon đang mở để xem tiến trình.";
        showStatus("asin_monitoring_status", statusMessage, debugMode ? "info" : "success");
    });
});

$(document).on('change', '#asin_monitoring_debug', async function() {
    const isEnabled = $(this).is(':checked');
    await saveAsinMonitoringDebugSetting(isEnabled);
    $('#asin_monitoring_debug_hint').toggle(isEnabled);
});

chrome.runtime.onMessage.addListener((request) => {
    if (!request || request.message !== "asinMonitoringStatus") {
        return;
    }

    if (request.status === "completed") {
        const details = request.details || {};
        const asinCount = details.asinProcessed ?? 0;
        const reviewCount = details.reviewProcessed ?? 0;
        const message = `Hoàn tất! Đã xử lý ${asinCount} ASIN và ${reviewCount} review.`;
        showStatus("asin_monitoring_status", message, "success");
        setButtonLoading("start_asin_monitoring", false);
        return;
    }

    if (request.status === "error") {
        const message = request.error || "Quy trình ASIN Monitoring gặp lỗi.";
        showStatus("asin_monitoring_status", message, "error");
        setButtonLoading("start_asin_monitoring", false);
    }
});

// $(document).on("click", "#run_test", async function () {

//     // Đọc trạng thái của tất cả 5 checkbox
//     const settings = {
//         syncOrder: $('#test_sync_order').is(':checked'),
//         updateTracking: $('#test_update_tracking').is(':checked'),
//         accountHealth: $('#test_account_health').is(':checked'),
//         downloadAds: $('#test_download_ads').is(':checked'),
//         sendMessageAuto: $('#test_send_message_auto').is(':checked'), 
//         payment: $('#test_payment').is(':checked') // Thêm checkbox mới
//     };

//     // Đọc giá trị thời gian chờ (delay)
//     const delayMinutes = parseFloat($('#test_delay').val()) || 0.1;

//     // Kiểm tra xem có tác vụ nào được chọn không
//     const isAnyTaskSelected = Object.values(settings).some(status => status === true);

//     if (!isAnyTaskSelected) {
//         $('#test_status').text("Vui lòng chọn ít nhất 1 tác vụ!").css('color', 'red');
//         setTimeout(() => { $('#test_status').text(''); }, 3000);
//         return;
//     }

//     // Xử lý 4 tác vụ cũ
//     const otherTasks = settings.syncOrder || settings.updateTracking || settings.accountHealth || settings.downloadAds || settings.sendMessageAuto;
//     if (otherTasks) {
//         const otherSettings = { ...settings };
//         delete otherSettings.payment; // Xóa key payment khỏi object này
//         otherSettings.delay = delayMinutes;

//         await saveTestSettings(otherSettings);
//         chrome.runtime.sendMessage({ message: "runTestNow" });
//     }

//     // Xử lý tác vụ Test Rút tiền
//     if (settings.payment) {
//         console.log(`[Popup] Scheduling payment test in ${delayMinutes} minutes.`);
//         chrome.runtime.sendMessage({
//             message: "scheduleTestPayment",
//             data: {
//                 minutes: delayMinutes,
//                 type: 'delay_minutes',
//                 testMode: true
//             }
//         });
//     }

//     $('#test_status').text("Đã gửi lệnh chạy test!").css('color', 'green');
//     setTimeout(() => { $('#test_status').text(''); }, 3000);
// });
$(document).on("click", "#run_test", async function () {
    // Đọc trạng thái của tất cả các checkbox
    const settings = {
        syncOrder: $('#test_sync_order').is(':checked'),
        updateTracking: $('#test_update_tracking').is(':checked'),
        accountHealth: $('#test_account_health').is(':checked'),
        downloadAds: $('#test_download_ads').is(':checked'),
        sendMessageAuto: $('#test_send_message_auto').is(':checked'), 
        payment: $('#test_payment').is(':checked'), // Thêm checkbox mới
        syncPhone: $('#test_get_phone').is(':checked'), // thêm get sdt
    };

    // Đọc giá trị thời gian chờ (delay)
    const delayMinutes = parseFloat($('#test_delay').val()) || 0.1;

    // Kiểm tra xem có tác vụ nào được chọn không
    const isAnyTaskSelected = Object.values(settings).some(status => status === true);

    if (!isAnyTaskSelected) {
        $('#test_status').text("Vui lòng chọn ít nhất 1 tác vụ!").css('color', 'red');
        setTimeout(() => { $('#test_status').text(''); }, 3000);
        return;
    }

    // Xử lý các tác vụ cũ (Lấy đơn, Update tracking, v.v.)
    const otherTasks = settings.syncOrder || settings.updateTracking || settings.accountHealth || settings.downloadAds || settings.sendMessageAuto || settings.syncPhone;
    if (otherTasks) {
        const otherSettings = { ...settings };
        delete otherSettings.payment; // Xóa key payment khỏi object này để không ảnh hưởng logic cũ
        otherSettings.delay = delayMinutes;

        await saveTestSettings(otherSettings);
        chrome.runtime.sendMessage({ message: "runTestNow" });
    }

    // Xử lý riêng cho tác vụ Test Rút tiền
    if (settings.payment) {
        console.log(`[Popup] Scheduling payment test in ${delayMinutes} minutes.`);
        chrome.runtime.sendMessage({
            message: "scheduleTestPayment",
            data: {
                minutes: delayMinutes,
                type: 'delay_minutes',
                testMode: true // Luôn là test mode
            }
        });
    }

    // Nếu tick “Test Lấy sđt” thì hiển thị alert test
    // if (settings.syncPhone) {
    //     console.log("[POPUP] Tự động chạy chế độ tải TẤT CẢ file (mode: all)");

    //     chrome.runtime.sendMessage(
    //         { 
    //             message: "runGetPhone",
    //             mode: "all" // luôn auto tải tất cả
    //         },
    //         (response) => {
    //             console.log("[POPUP] Đã gửi xong message runGetPhone. Phản hồi:", response);
    //         }
    //     );
    // }



    $('#test_status').text("Đã gửi lệnh chạy test!").css('color', 'green');
    setTimeout(() => { $('#test_status').text(''); }, 3000);
});


// Gọi thử API NCNAS để lấy JSON product
$(document).on("click", "#btn_test_ncnas", function () {
    const productName = $("#ncnas_product_name").val().trim();
    if (!productName) {
        alert("Nhập SKU trước đã (vd: SKU_ABC)");
        return;
    }

    console.log("Bắt đầu gửi yêu cầu test cho product:", productName);
    alert(`Gửi yêu cầu chạy Tool Auto Add Listing với SKU: ${productName}`);

    // gửi lên background
    chrome.runtime.sendMessage(
        {
            message: "testNCNAS",
            productName: productName
        },
        (resp) => {
            console.log("Nhận phản hồi từ background:", resp);

            if (!resp) {
                alert("Không nhận được phản hồi từ server!");
                return;
            }

            const $pre = $("#ncnas_result");
            $pre.show();

            if (resp.error) {
                console.warn("Lỗi:", resp.error);
                alert(`Lỗi: ${resp.error}`);
                $pre.text("Error: " + resp.error);
            } else {
                const pretty = JSON.stringify(resp.data, null, 2);
                console.log("[POPUP][NCNAS] Dữ liệu JSON nhận được:", pretty);
                alert("Tool Đã chạy xong!!!");
                $pre.text(pretty);
            }
        }
    );
});


$(document).on("click", "#btn_check_order", async function() {
    const orderId = $("#check_order_id").val().trim();
    if (!orderId) {
        alert("Vui lòng nhập Order ID cần kiểm tra!");
        return;
    }

    $("#check_order_result").text("⏳ Đang kiểm tra...").show();

    // Gửi message sang background để fetch dữ liệu từ server
    chrome.runtime.sendMessage(
        {
            message: "checkOrderInfo",
            orderId: orderId
        },
        (response) => {
            if (!response) {
                $("#check_order_result").text("❌ Không nhận được phản hồi từ background.").show();
                return;
            }

            if (response.ok && response.data) {
                $("#check_order_result").text(JSON.stringify(response.data, null, 2)).show();
            } else {
                $("#check_order_result").text("❌ Lỗi: " + (response.error || "Không rõ")).show();
            }

            $("#check_order_result").text(JSON.stringify(response.data, null, 2)).show();
        }
    );
});

// 🆕 Nút cập nhật SĐT
$(document).on("click", "#btn_update_phone", async function() {
    const orderId = $("#check_order_id").val().trim();
    const phone = $("#update_phone_input").val().trim();

    if (!orderId) {
        alert("Vui lòng nhập Order ID!");
        return;
    }
    if (!phone) {
        alert("Vui lòng nhập số điện thoại!");
        return;
    }

    $("#update_phone_result").text("⏳ Đang cập nhật...").show();

    chrome.runtime.sendMessage(
        {
            message: "updateBuyerPhone",
            orderId: orderId,
            phone: phone
        },
        (response) => {
            if (!response) {
                $("#update_phone_result").text("❌ Không nhận được phản hồi từ background.").show();
                return;
            }

            if (response.ok && response.data) {
                $("#update_phone_result").text(JSON.stringify(response.data, null, 2)).show();
            } else {
                $("#update_phone_result").text("❌ Lỗi: " + (response.error || "Không rõ")).show();
            }
        }
    );
});
// ====================================================================
// CÁC TRÌNH XỬ LÝ SỰ KIỆN MỚI TỪ CODE 1 (THÊM MỚI)
// ====================================================================

// Pending Payment Checkbox
$(document).on('change', '#pending_payment_request_cb', function() {
    const isChecked = $(this).is(':checked');
    chrome.runtime.sendMessage({ 
        message: "updatePendingStatus", 
        data: { status: isChecked } 
    }, (response) => {
        if (response && response.status === 'success') {
            showStatus('test_status', `Pending Payment: ${isChecked ? 'Bật' : 'Tắt'}`, 'success');
        } else {
            showStatus('test_status', 'Lỗi khi cập nhật trạng thái pending', 'error');
            $(this).prop('checked', !isChecked); // Revert
        }
    });
});


// ====================================================================
// CÁC HÀM KHỞI TẠO TỪ CODE 2 (GIỮ NGUYÊN)
// ====================================================================

async function checkApiKey() {
    const key = await getMbApi();
    if (key) {
        console.log("API key retrieved:", key);
        $("#api_key").val(key);
        await saveMbApi(key);
        console.log("API key has been saved to storage.local");
    } else {
        console.log("No API key found.");
    }
}

async function checkIpTrackingSetting() {
    const isEnabled = await getIpTrackingSetting();
    $('#enable_ip_tracking').prop('checked', isEnabled);
    console.log(`Trạng thái gửi IP hiện tại: ${isEnabled}`);
}

async function loadTestSettings() {
    const settings = await getTestSettings();
    $('#test_sync_order').prop('checked', settings.syncOrder);
    $('#test_update_tracking').prop('checked', settings.updateTracking);
    $('#test_account_health').prop('checked', settings.accountHealth);
    $('#test_send_message_auto').prop('checked', settings.sendMessageAuto);
    $('#test_download_ads').prop('checked', settings.downloadAds);
    $('#test_delay').val(settings.delay);
    console.log("Đã load cài đặt test đã lưu.", settings);
}

async function loadAsinMonitoringDebugSetting() {
    const isEnabled = await getAsinMonitoringDebugSetting();
    $('#asin_monitoring_debug').prop('checked', isEnabled);
    $('#asin_monitoring_debug_hint').toggle(isEnabled);
}

$(document).ready(function () {
    checkApiKey();
    checkIpTrackingSetting();
    loadTestSettings();
    loadAsinMonitoringDebugSetting();

    // Tải thêm trạng thái pending từ code 1
    chrome.runtime.sendMessage({ message: "getPendingStatus" }, (response) => {
        if (response && typeof response.status === 'boolean') {
            $('#pending_payment_request_cb').prop('checked', response.status);
        }
    });
});
$(document).on('click', '#test-server-connection', function() {
    setButtonLoading('test-server-connection', true);
    showStatus('server-test-result', 'Đang test connection...', 'info');
    
    // Lấy merchant ID từ API key
    getMbApi().then(merchantId => {
        if (!merchantId) {
            setButtonLoading('test-server-connection', false);
            showStatus('server-test-result', 'Vui lòng nhập MB API Key trước', 'error');
            return;
        }

        // Gửi test data
        const testData = {
            merchantId: merchantId,
            amount: 123.45,
            status: 'test_connection',
            timestamp: new Date().toISOString(),
            testMode: true,
            realPayment: false,
            source: 'popup_test_button'
        };

        console.log("[Popup] Sending test data:", testData);

        chrome.runtime.sendMessage({
            message: "sendPaymentLogToServer",
            data: testData
        }, (response) => {
            setButtonLoading('test-server-connection', false);
            
            console.log("[Popup] Server response:", response);
            
            if (response && response.status === 'log_sent' && response.success) {
                showStatus('server-test-result', 'Test thành công - Server nhận được dữ liệu', 'success');
            } else if (response && response.error) {
                showStatus('server-test-result', `Test thất bại: ${response.error}`, 'error');
            } else {
                showStatus('server-test-result', 'Test thất bại - Không có phản hồi từ server', 'error');
            }
        });
    }).catch(error => {
        setButtonLoading('test-server-connection', false);
        showStatus('server-test-result', `Lỗi: ${error.message}`, 'error');
    });
});
// ====================================================================
// TRÌNH LẮNG NGHE TIN NHẮN (NÂNG CẤP TỪ CODE 1)
// ====================================================================

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    const { message, data } = request || {};
    let isMatch = false;

    switch (message) {
        case "listedSaveApiKey":
            setTimeout(() => window.close(), 1000);
            isMatch = true; // Đánh dấu là đã khớp
            break;

        case "testPaymentFinished":
            setButtonLoading('test_now', false);
            const msg = data?.success
                ? (data.found 
                    ? `✅ Test thành công! Tìm thấy button (${data.buttonEnabled ? 'Enabled' : 'Disabled'}). Amount: $${data.amount || 0}`
                    : `⚠️ Test hoàn thành nhưng không tìm thấy disbursement button.`)
                : `❌ Test thất bại: ${data?.error || 'Unknown error'}`;
            showStatus('test_status', msg, data?.success ? 'success' : 'error');
            isMatch = true; // Đánh dấu là đã khớp
            break;

        case "realPaymentFinished":
            setButtonLoading('execute-real-payment', false);
            if (data && data.success) {
                const successMsg = `🎉 RÚT TIỀN THÀNH CÔNG!\n💰 Số tiền: $${data.amount || 0}\n📅 Thời gian: ${new Date().toLocaleString()}`;
                showStatus('real_status', successMsg, 'success');
                if (window.Notification && Notification.permission === 'granted') {
                    new Notification('Rút Tiền Thành Công!', {
                        body: `Đã rút thành công $${data.amount || 0}`,
                        icon: '../assets/images/48.png'
                    });
                }
            } else {
                const errorMsg = `❌ RÚT TIỀN THẤT BẠI: ${data?.error || 'Unknown error'}`;
                showStatus('real_status', errorMsg, 'error');
            }
            isMatch = true; // Đánh dấu là đã khớp
            break;

        case "testScheduled":
            if (data && data.success) {
                showStatus('test_status', `⏰ Test đã được đặt lịch: ${data.scheduleTime}`, 'success');
            }
            isMatch = true; // Đánh dấu là đã khớp
            break;

        case "autoScheduleStatus":
            if (data) {
                const button = document.getElementById('enable_auto_schedule');
                if (button) {
                    button.textContent = data.enabled ? 'Tắt Lịch Tự Động' : 'Bật Lịch Tự Động';
                }
            }
            isMatch = true; // Đánh dấu là đã khớp
            break;

        default:
            // console.log("Unhandled message:", message);
            break;
    }

    // 2. Chỉ sendResponse và return true nếu message được xử lý
    if (isMatch) {
        sendResponse({ message: "received" });
        return true; // Giữ kênh mở cho các phản hồi bất đồng bộ
    }

});

