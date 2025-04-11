// Trong file scripts/ads_report.js
$(document).on("click", "#ads-report", function () {
    $(this).addClass("loader");
    chrome.runtime.sendMessage({
        message: "runDownloadAdsReports",
        domain: window.location.origin,
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
});