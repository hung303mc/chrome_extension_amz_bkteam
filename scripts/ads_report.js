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
                notifySuccess(`Downloaded ${successCount} ads reports: ${reportDetails}`);
            } else {
                notifySuccess(`Downloaded ${successCount} ads reports successfully.`);
            }
        } else {
            notifySuccess("Ads reports processing completed. No reports were found for download.");
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
            await sleep(1000);
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