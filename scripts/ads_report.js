// Trong file scripts/ads_report.js

// Biến lưu trữ hẹn giờ cho ads report
let scheduledAdsReportTask = null;

// Hàm đặt lịch tự động tải báo cáo quảng cáo vào 10:30 sáng mỗi ngày
function scheduleAdsReport() {
    const now = new Date();
    const updateTime = new Date();
    
    // Đặt thời gian cập nhật là 10h30 sáng
    updateTime.setHours(10, 30, 0, 0);
    
    // Nếu thời gian hiện tại đã qua 10h00 sáng, đặt lịch cho ngày mai
    if (now > updateTime) {
        updateTime.setDate(updateTime.getDate() + 1);
    }
    
    // Tính toán khoảng thời gian từ hiện tại đến thời điểm cập nhật (milliseconds)
    const timeUntilUpdate = updateTime.getTime() - now.getTime();
    
    console.log(`[ADS REPORT] Lịch tải báo cáo quảng cáo tiếp theo: ${updateTime.toLocaleString()}`);
    console.log(`[ADS REPORT] Còn: ${Math.floor(timeUntilUpdate / (1000 * 60))} phút`);
    
    // Xóa lịch trình cũ nếu có
    if (scheduledAdsReportTask) {
        clearTimeout(scheduledAdsReportTask);
    }
    
    // Đặt lịch mới
    scheduledAdsReportTask = setTimeout(() => {
        console.log('[ADS REPORT] Bắt đầu tự động tải báo cáo quảng cáo lúc 10h00 sáng');
        startAdsReport();
        
        // Đặt lịch cho ngày hôm sau
        scheduleAdsReport();
    }, timeUntilUpdate);
    
    // Lưu trạng thái và thời gian cập nhật tiếp theo
    chrome.storage.local.set({ 
        'nextAdsReportTime': updateTime.toISOString(),
        'autoAdsReportEnabled': true
    });
}

// Function to start ads report process
function startAdsReport() {
    console.log('[ADS REPORT] Bắt đầu quá trình tải báo cáo quảng cáo tự động');
    
    // Kiểm tra xem có đang ở trang Amazon không
    chrome.tabs.query({}, (tabs) => {
        // Tìm tab Amazon đang mở
        const amazonDomains = [
            "https://sellercentral.amazon.com",
            "https://sellercentral-europe.amazon.com",
            "https://sellercentral.amazon.de",
            "https://sellercentral.amazon.co.uk",
        ];
        
        const amazonTab = tabs.find(tab => 
            amazonDomains.some(domain => tab.url && tab.url.includes(domain.replace("https://", "")))
        );
        
        if (amazonTab) {
            // Nếu đã có tab Amazon, kích hoạt nó
            chrome.tabs.update(amazonTab.id, {active: true});
            
            // Gửi message đến background script để reload tab trước khi tải báo cáo
            chrome.runtime.sendMessage({
                message: "reloadTabBeforeAction",
                data: {
                    tabId: amazonTab.id,
                    action: "downloadAdsReports",
                    actionData: { domain: amazonTab.url }
                }
            });
        } else {
            // Nếu chưa có tab Amazon, mở trang Amazon mới
            chrome.tabs.create({ 
                url: "https://sellercentral.amazon.com/orders-v3",
                active: true 
            }, (tab) => {
                // Đợi tab load xong
                chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        // Tab đã load xong, đợi thêm 5 giây để trang hoàn toàn ổn định
                        setTimeout(() => {
                            // Gửi message đến background script để reload tab trước khi tải báo cáo
                            chrome.runtime.sendMessage({
                                message: "reloadTabBeforeAction",
                                data: {
                                    tabId: tab.id,
                                    action: "downloadAdsReports",
                                    actionData: { domain: tab.url }
                                }
                            });
                            
                            // Xóa event listener
                            chrome.tabs.onUpdated.removeListener(listener);
                        }, 5000);
                    }
                });
            });
        }
    });
}

// Khởi tạo lịch tải báo cáo quảng cáo khi extension được load
function initAdsReportScheduler() {
    // Kiểm tra trạng thái tự động cập nhật từ storage
    chrome.storage.local.get(['autoAdsReportEnabled'], function(result) {
        // Mặc định bật tính năng tự động cập nhật
        const enabled = result.autoAdsReportEnabled !== false;
        
        if (enabled) {
            // Khởi tạo lịch trình
            scheduleAdsReport();
            console.log('[ADS REPORT] Đã khởi tạo lịch trình tự động tải báo cáo quảng cáo');
        } else {
            console.log('[ADS REPORT] Tự động tải báo cáo quảng cáo đã bị tắt');
        }
    });
}

// Function to check ads report status
function checkAdsReportStatus(callback) {
    chrome.storage.local.get(['nextAdsReportTime', 'autoAdsReportEnabled'], function(result) {
        // Tính toán thời gian còn lại
        let remainingTime = "";
        let nextRun = "";
        
        if (result.nextAdsReportTime) {
            const nextAdsReportTime = new Date(result.nextAdsReportTime);
            const now = new Date();
            
            // Tính toán thời gian còn lại (phút)
            const timeUntilUpdate = nextAdsReportTime.getTime() - now.getTime();
            const minutesRemaining = Math.floor(timeUntilUpdate / (1000 * 60));
            const hoursRemaining = Math.floor(minutesRemaining / 60);
            const minsRemaining = minutesRemaining % 60;
            
            if (timeUntilUpdate > 0) {
                if (hoursRemaining > 0) {
                    remainingTime = `${hoursRemaining} giờ ${minsRemaining} phút`;
                } else {
                    remainingTime = `${minsRemaining} phút`;
                }
                
                // Định dạng thời gian chạy tiếp theo
                const isToday = nextAdsReportTime.getDate() === now.getDate() && 
                               nextAdsReportTime.getMonth() === now.getMonth() && 
                               nextAdsReportTime.getFullYear() === now.getFullYear();
                
                const timeString = nextAdsReportTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                nextRun = isToday ? `Hôm nay lúc ${timeString}` : `Ngày mai lúc ${timeString}`;
            }
        }
        
        callback({
            enabled: result.autoAdsReportEnabled !== false,
            nextUpdateTime: result.nextAdsReportTime,
            remainingTime: remainingTime,
            nextRun: nextRun
        });
    });
}

// Export for background script
const AdsReportScheduler = {
    init: initAdsReportScheduler,
    schedule: scheduleAdsReport,
    start: startAdsReport,
    checkStatus: checkAdsReportStatus
};

// Export module for background.js to import
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdsReportScheduler;
} else {
    // If not using module, add to global object
    self.AdsReportScheduler = AdsReportScheduler;
}

// The code below will only run in content scripts where jQuery is available
// This check prevents the code from running in the background context
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Wait for jQuery to be available
    function checkJQuery() {
        if (typeof $ !== 'undefined') {
            // Xử lý click trên nút Ads Report trong giao diện
            $(document).on("click", "#ads-report", function () {
                $(this).addClass("loader");
                
                // Lấy tab hiện tại và gửi yêu cầu reload trước khi tải báo cáo
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs.length > 0) {
                        const activeTab = tabs[0];
                        
                        // Gửi message đến background script để reload tab trước khi tải báo cáo
                        chrome.runtime.sendMessage({
                            message: "reloadTabBeforeAction",
                            data: {
                                tabId: activeTab.id,
                                action: "downloadAdsReports",
                                actionData: { domain: activeTab.url }
                            }
                        });
                    } else {
                        // Nếu không tìm thấy tab, gửi message như thường lệ
                        chrome.runtime.sendMessage({
                            message: "runDownloadAdsReports",
                            domain: window.location.origin,
                        });
                    }
                });
            });

            // Lắng nghe sự kiện từ background script
            chrome.runtime.onMessage.addListener(async (req, sender, res) => {
                const { message, data } = req || {};
                
                if (message === "downloadAdsReports") {
                    res({ message: "received" });
                    $(".loader").removeClass("loader");
                    
                    const { error, successCount, reportDetails } = data || {};
                    if (error) {
                        notifyError(error);
                        return;
                    }
                    
                    if (successCount > 0) {
                        if (reportDetails) {
                            notifySuccess(`Đã tải ${successCount} báo cáo: ${reportDetails}`);
                        } else {
                            notifySuccess(`Đã tải ${successCount} báo cáo thành công.`);
                        }
                    } else {
                        notifySuccess("Quá trình tải báo cáo hoàn tất. Không tìm thấy báo cáo nào để tải xuống.");
                    }
                }
                
                // Xử lý khi đang tải báo cáo
                if (message === "downloadingAdsReports") {
                    res({ message: "received" });
                    
                    // Kiểm tra jQuery đã sẵn sàng chưa
                    let countCheck$ = 0;
                    while (true) {
                        if ((typeof jQuery !== 'undefined' && $("#ads-report").length) || countCheck$ === 30) {
                            break;
                        }
                        await sleep(500);
                        countCheck$++;
                    }

                    if (typeof jQuery === 'undefined') return;
                    
                    const { label } = data || {};
                    
                    // Hiển thị thông báo đang xử lý
                    if (label && $(".om-addon").length) {
                        taskProcessing(label);
                        
                        // Kích hoạt tab Ads Report
                        $('[data-name="ads_report"]').click();
                        
                        // Thêm trạng thái loading vào nút
                        $("#ads-report").addClass("loader");
                    }
                }
                
                // Xử lý kiểm tra trạng thái từ popup hoặc background script
                if (message === "checkAdsReportStatus") {
                    // Use the exported function to check status
                    checkAdsReportStatus(function(status) {
                        res(status);
                    });
                    return true; // Giữ kênh mở cho phản hồi bất đồng bộ
                }
            });
            
            console.log("[ADS REPORT] DOM handlers registered");
        } else {
            // If jQuery isn't available yet, try again in 100ms
            setTimeout(checkJQuery, 100);
        }
    }
    
    // Try to register DOM handlers when this script runs in content script context
    setTimeout(checkJQuery, 0);
}