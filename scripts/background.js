const isProduction = true;
const MBUrl = "http://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php";
//  "http://127.0.0.1:8080/query";
const AMZDomain = "https://sellercentral.amazon.com";
const AMZDomains = [
  "https://sellercentral.amazon.com",
  "https://sellercentral-europe.amazon.com",
  "https://sellercentral.amazon.de",
  "https://sellercentral.amazon.co.uk/",
];
let isUpdateTrackingRunning = false;
let isDownloadingAdsReport = false;
let doingAuto = false;
let globalDomain = AMZDomain;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thiết lập alarm để tự động sync order vào 9h sáng mỗi ngày
const setupDailyAlarm = () => {
  // Xoá alarm cũ nếu có
  chrome.alarms.clear("dailySyncOrder");
  chrome.alarms.clear("dailyUpdateTracking");
  chrome.alarms.clear("dailyAccountHealth");
  chrome.alarms.clear("dailyDownloadAdsReports");

  // Tính toán thời gian cho 9h sáng hôm nay
  const now = new Date();
  const syncTime = new Date();
  syncTime.setHours(8, 0, 0, 0); // 8:00:00 AM

  // Tính toán thời gian cho 9h10 sáng
  const updateTrackingTime = new Date();
  updateTrackingTime.setHours(7, 0, 0, 0); // 7:00:00 AM

  // Tính toán thời gian cho 9h20 sáng (get_account_health)
  const accountHealthTime = new Date();
  accountHealthTime.setHours(8, 40, 0, 0); // 9:0:00 AM
  
  // Tính toán thời gian cho 9h40 sáng (download_ads_reports)
  const adsReportsTime = new Date();
  adsReportsTime.setHours(6, 40, 0, 0); // 9:40:00 AM

  // Nếu đã qua 9h sáng, đặt cho ngày mai
  if (now > syncTime) {
    syncTime.setDate(syncTime.getDate() + 1);
  }
  
  // Nếu đã qua 9h10 sáng, đặt cho ngày mai
  if (now > updateTrackingTime) {
    updateTrackingTime.setDate(updateTrackingTime.getDate() + 1);
  }

  // Nếu đã qua 9h20 sáng, đặt cho ngày mai
  if (now > accountHealthTime) {
    accountHealthTime.setDate(accountHealthTime.getDate() + 1);
  }
  
  // Nếu đã qua 9h40 sáng, đặt cho ngày mai
  if (now > adsReportsTime) {
    adsReportsTime.setDate(adsReportsTime.getDate() + 1);
  }

  // Tính thời gian còn lại tính bằng phút
  const minutesUntilSync = (syncTime.getTime() - now.getTime()) / (1000 * 60);
  const minutesUntilUpdateTracking = (updateTrackingTime.getTime() - now.getTime()) / (1000 * 60);
  const minutesUntilAccountHealth = (accountHealthTime.getTime() - now.getTime()) / (1000 * 60);
  const minutesUntilAdsReports = (adsReportsTime.getTime() - now.getTime()) / (1000 * 60);

  // Tạo alarm cho sync order
  chrome.alarms.create("dailySyncOrder", {
    delayInMinutes: minutesUntilSync,
    periodInMinutes: 8 * 60 // Lặp lại mỗi 24 giờ
  });

  // Tạo alarm cho update tracking
  chrome.alarms.create("dailyUpdateTracking", {
    delayInMinutes: minutesUntilUpdateTracking,
    periodInMinutes: 8 * 60 // Lặp lại mỗi 24 giờ
  });

  // Tạo alarm cho account health
  chrome.alarms.create("dailyAccountHealth", {
    delayInMinutes: minutesUntilAccountHealth,
    periodInMinutes: 8 * 60 // Lặp lại mỗi 24 giờ
  });

  // Tạo alarm cho download ads reports
  chrome.alarms.create("dailyDownloadAdsReports", {
    delayInMinutes: minutesUntilAdsReports,
    periodInMinutes: 24 * 60 // Lặp lại mỗi 24 giờ
  });

  console.log(`Đã đặt lịch sync order vào lúc ${syncTime.toLocaleString()}`);
  console.log(`Đã đặt lịch update tracking vào lúc ${updateTrackingTime.toLocaleString()}`);
  console.log(`Đã đặt lịch get account health vào lúc ${accountHealthTime.toLocaleString()}`);
  console.log(`Đã đặt lịch tải báo cáo quảng cáo vào lúc ${adsReportsTime.toLocaleString()}`);
  console.log(`Đã đặt lịch chạy 2 lần/ngày:`);
  console.log(`- Lần 1: ${syncTime.toLocaleString()}`);
  console.log(`- Lần 2: ${new Date(syncTime.getTime() + 12*60*60*1000).toLocaleString()}`);
  
  // Tạo một alarm test để thử nghiệm ngay sau 1 phút
  chrome.alarms.create("testSyncOrder", {
    delayInMinutes: 1
  });
  console.log("Đã đặt alarm test sau 1 phút");
  
  // Hiển thị tất cả alarm đã thiết lập
  chrome.alarms.getAll((alarms) => {
    console.log("Danh sách tất cả alarm:", alarms);
  });
};

// Xử lý alarm khi kích hoạt

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "dailySyncOrder") {
    console.log("Đã tới giờ tự động sync order...");

    try {
      // Bước 1: Dùng `await` để chờ hàm openOrderPage() hoàn thành và lấy về đối tượng tab
      const tab = await openOrderPage();

      if (tab && tab.id) {
        console.log(`[BG] Đã mở/focus tab Orders (ID: ${tab.id}). Bắt đầu quá trình reload.`);
        
        // Bước 2: Tạo một trình lắng nghe để bắt sự kiện sau khi reload xong
        const reloadListener = (tabId, changeInfo) => {
          // Chỉ hành động khi đúng tab đó và tab đã tải xong hoàn toàn
          if (tabId === tab.id && changeInfo.status === 'complete') {
            console.log(`[BG] Tab ${tabId} đã reload xong. Chờ 3 giây trước khi gửi lệnh sync.`);
            
            // Gỡ bỏ listener này để tránh bị gọi lại
            chrome.tabs.onUpdated.removeListener(reloadListener);

            // Chờ một vài giây để đảm bảo tất cả script trên trang đã chạy
            setTimeout(() => {
              console.log("[BG] Gửi lệnh 'autoSyncOrders' đến content script.");
              // Bước 4: Gửi lệnh sync tới content script
              sendMessage(tab.id, "autoSyncOrders", {
                autoMark: true,
                useSelectAllSync: true
              });
            }, 3000); // Đợi 3 giây
          }
        };

        // Đăng ký listener TRƯỚC KHI reload
        chrome.tabs.onUpdated.addListener(reloadListener);

        // Bước 3: Thực hiện reload tab
        chrome.tabs.reload(tab.id, () => {
          if (chrome.runtime.lastError) {
            console.error(`[BG] Lỗi khi reload tab: ${chrome.runtime.lastError.message}`);
            // Gỡ listener nếu reload thất bại
            chrome.tabs.onUpdated.removeListener(reloadListener);
          }
        });

      } else {
        console.error("Không thể mở hoặc tìm thấy tab order page để reload.");
      }
    } catch (error) {
      console.error("[BG] Đã xảy ra lỗi trong quá trình tự động sync order:", error);
    }
  } 
  else if (alarm.name === "dailyUpdateTracking") {
    console.log("Đang chạy tự động update tracking theo lịch lúc 9h10 sáng...");
    // Mở trang order details
    openOrderDetailPage(); // Reverted to correct function call for update tracking
    
    // Chờ 5 giây để trang load xong
    setTimeout(() => {
      // Gửi message đến content script để thực hiện auto update tracking
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
          sendMessage(tabs[0].id, "autoUpdateTracking", {
            autoMark: true  // Đánh dấu auto update tracking
          });
        }
      });
    }, 5000);
  }
  else if (alarm.name === "dailyAccountHealth") {
    console.log("Đang chạy tự động kiểm tra account health theo lịch.");
    
    // This function handles opening or navigating to the performance dashboard page.
    openPerformanceDashboardPage(); 

    // Save the log for this activity.
    saveLog("accountHealthLog", { type: "Auto Account Health Check", date: new Date().toISOString() });
    
    // Wait a few seconds for the page to open and become active before sending the message.
    setTimeout(() => {
        // Find the currently active tab.
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0 && tabs[0].id) {
                const activeTabId = tabs[0].id;

                // Ensure the active tab is the correct one before sending the message.
                if (tabs[0].url && tabs[0].url.includes("/performance/dashboard")) {
                    console.log(`Sending 'autoGetAccountHealth' to active tab ID: ${activeTabId}`);
                    
                    // Send the message to the content script to start the automated process.
                    sendMessage(activeTabId, "autoGetAccountHealth");
                } else {
                    console.error("The active tab is not the Performance Dashboard. The 'autoGetAccountHealth' message was not sent.");
                }
            } else {
                console.error("Could not find an active tab to send the 'autoGetAccountHealth' message.");
            }
        });
    }, 5000); // A 5-second delay to allow the page to load. This can be adjusted if needed.
}
  else if (alarm.name === "dailyDownloadAdsReports") {
    console.log("Đang chạy tự động tải báo cáo quảng cáo theo lịch lúc 9h40 sáng...");
    //1 kiểm tra isDownloadingAdsReport
    if (isDownloadingAdsReport) {
      console.log("Đã có quá trình tải báo cáo quảng cáo đang chạy, bỏ qua.");
      return;
    }
    // 2 đặt khóa và bắt đầu
    isDownloadingAdsReport = true;
    console.log("Đã khóa isDownloadingAdsReport.");
    try {
        console.log("Bắt đầu quá trình tải báo cáo quảng cáo...");
        
        try {
            if (extendedLogSystem) {
                extendedLogSystem.info('AdsReports', 'Bắt đầu quá trình tải báo cáo quảng cáo theo lịch tự động');
            }
        } catch (logError) {
            console.error("Logging error:", logError);
        }
        
        // Gửi thông báo đang tải đến tab hiện tại (nếu có)
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs && tabs.length > 0) {
            sendMessage(tabs[0].id, "downloadingAdsReports", {
              label: `Đang tải báo cáo quảng cáo...`,
            });
          }
        });
        
        // Lấy API key để dùng trong URL
        const merchantId = await getMBApiKey();
        console.log("Sử dụng merchantId cho URL báo cáo:", merchantId);
        
        try {
            if (extendedLogSystem) {
                extendedLogSystem.info('AdsReports', 'Sử dụng merchantId cho URL báo cáo', { merchantId });
            }
        } catch (logError) {
            console.error("Logging error:", logError);
        }
        
        // URL đến trang báo cáo quảng cáo
        const reportsUrl = `https://advertising.amazon.com/reports/ref=xx_perftime_dnav_xx?merchantId=${merchantId}&locale=en_US&ref=RedirectedFromSellerCentralByRoutingService&entityId=ENTITY2G3AJUF27SG3C`;
        
        // Tạo tab mới thay vì cập nhật tab hiện tại
        chrome.tabs.create({ url: reportsUrl, active: true }, async (newTab) => {
            if (!newTab || !newTab.id) {
                const errorMsg = "Không thể tạo tab mới cho báo cáo quảng cáo";
                console.error(errorMsg);
                
                try {
                    if (extendedLogSystem) {
                        extendedLogSystem.error('AdsReports', errorMsg);
                    }
                } catch (logError) {
                    console.error("Logging error:", logError);
                }
                
                // Thông báo lỗi trên tab hiện tại
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                  if (tabs && tabs.length > 0) {
                    sendMessage(tabs[0].id, "downloadAdsReports", { 
                      error: errorMsg
                    });
                  }
                });
                return;
            }
            
            // Lưu ID của tab báo cáo
            const reportTabId = newTab.id;
            
            // Đợi trang báo cáo tải hoàn tất
            await new Promise(resolve => {
                let listener = function(tabId, changeInfo) {
                    if (tabId === reportTabId && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
                
                // Thêm timeout phòng trường hợp tab không tải hoàn tất
                setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }, 30000); // 30 giây timeout
            });
            
            // Thêm độ trễ ngắn để đảm bảo nội dung đã tải
            await sleep(3000);
            
            // Kiểm tra xem tab còn tồn tại không
            let tabExists = true;
            try {
                await chrome.tabs.get(reportTabId);
            } catch (err) {
                console.error("Tab báo cáo không còn tồn tại");
                tabExists = false;
                
                // Thông báo lỗi
                sendMessage(sender.tab.id, "downloadAdsReports", { 
                  error: "Tab báo cáo đã bị đóng" 
                });
                return;
            }
            
            if (!tabExists) return;
            
            // Thực hiện script để tìm và tải xuống báo cáo
            chrome.scripting.executeScript({
                target: { tabId: reportTabId },
                function: async () => {
                    // Hàm đợi ngắn hơn
                    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                    
                    // Tạo tên thư mục dựa trên ngày hiện tại (DD-MM-YYYY)
                    const today = new Date();
                    const day = String(today.getDate()).padStart(2, '0');
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const year = today.getFullYear();
                    const folderName = `${day}-${month}-${year}`;
                    
                    // Phương pháp tìm nút tải xuống hiệu quả hơn
                    const findDownloadButtons = () => {
                        // Trực tiếp tìm các liên kết tải xuống dựa trên URL
                        const buttons = Array.from(document.querySelectorAll('a[href*="/download-report/"]'));
                        console.log(`Tìm thấy ${buttons.length} nút tải xuống`);
                        return buttons;
                    };
                    
                    // Tìm tất cả các nút tải xuống
                    let downloadButtons = findDownloadButtons();
                    
                    // Nếu không tìm thấy nút tải, thử một lần nữa sau một khoảng thời gian ngắn
                    if (downloadButtons.length === 0) {
                        await wait(2000);
                        downloadButtons = findDownloadButtons();
                    }
                    
                    console.log(`Tìm thấy ${downloadButtons.length} nút tải xuống để xử lý`);
                    
                    let successCount = 0;
                    const reportNames = [];
                    const downloadUrls = [];
                    
                    // Thu thập URL tải xuống và tên báo cáo
                    downloadButtons.forEach((button, index) => {
                        try {
                            // Tìm tên báo cáo từ cùng hàng
                            let reportName = "Báo cáo " + (index + 1);
                            try {
                                // Tìm kiếm theo nhiều selector để tăng khả năng tìm thấy tên báo cáo
                                const parentRow = button.closest('.ag-row, tr, [role="row"]');
                                if (parentRow) {
                                    const reportLink = parentRow.querySelector('a.sc-fqkvVR, a, .cell-value, td');
                                    if (reportLink) {
                                        reportName = reportLink.textContent.trim();
                                    }
                                }
                            } catch (e) {
                                console.error("Lỗi lấy tên báo cáo:", e);
                            }
                            
                            reportNames.push(reportName);
                            // Lưu URL tải xuống để gửi về background script xử lý
                            downloadUrls.push({
                                url: button.href,
                                reportName: reportName
                            });
                        } catch (error) {
                            console.error(`Lỗi xử lý nút ${index + 1}:`, error);
                        }
                    });
                    
                    // Trả về dữ liệu URL và tên báo cáo để background script xử lý
                    return { 
                        downloadUrls,
                        reportNames,
                        folderName
                    };
                }
            }, async (results) => {
                if (!results || results.length === 0 || !results[0].result) {
                    // Thông báo lỗi nếu không tìm thấy kết quả
                    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                        if (tabs && tabs.length > 0) {
                            sendMessage(tabs[0].id, "downloadAdsReports", { 
                                error: "Không thể tìm thấy báo cáo để tải xuống" 
                            });
                        }
                    });
                    
                    // Đóng tab báo cáo
                    try {
                        chrome.tabs.remove(reportTabId);
                    } catch (err) {
                        console.error("Lỗi khi đóng tab báo cáo:", err);
                    }
                    return;
                }
                
                const { downloadUrls, reportNames, folderName } = results[0].result;
                let successCount = 0;
                
                // Tải xuống từng báo cáo sử dụng chrome.downloads.download API
                for (let i = 0; i < downloadUrls.length; i++) {
                    try {
                        const { url, reportName } = downloadUrls[i];
                        // Làm sạch tên báo cáo để dùng làm tên file
                        const safeReportName = reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        
                        // Kiểm tra xem chrome.downloads API có sẵn không
                        if (chrome.downloads && typeof chrome.downloads.download === 'function') {
                            // Lấy phần mở rộng của file từ URL
                            let fileExtension = '.csv'; // Mặc định là .csv
                            
                            // Thử lấy phần mở rộng từ URL
                            try {
                                const urlPath = new URL(url).pathname;
                                // Nếu URL chứa phần mở rộng, lấy phần mở rộng đó
                                if (urlPath.includes('.')) {
                                    const urlExt = urlPath.split('.').pop().toLowerCase();
                                    // Kiểm tra phần mở rộng hợp lệ
                                    if (['csv', 'xlsx', 'xls', 'txt', 'pdf'].includes(urlExt)) {
                                        fileExtension = '.' + urlExt;
                                    }
                                }
                            } catch (e) {
                                console.log("Không thể lấy phần mở rộng từ URL:", e);
                            }
                            
                            // Tạo tên file với đường dẫn thư mục và phần mở rộng đúng
                            const filename = `reports/${folderName}/${safeReportName}${fileExtension}`;
                            
                            // Tạo thư mục nếu chưa tồn tại bằng cách lưu một file nhỏ làm đánh dấu
                            if (i === 0) {
                                try {
                                    // Tạo một file .keep để đảm bảo thư mục tồn tại
                                    chrome.downloads.download({
                                        url: URL.createObjectURL(new Blob([' '], {type: 'text/plain'})),
                                        filename: `reports/${folderName}/.keep`,
                                        conflictAction: 'uniquify',
                                        saveAs: false
                                    }, () => {
                                        console.log(`Đã tạo thư mục ${folderName}`);
                                    });
                                } catch (err) {
                                    console.error("Lỗi khi tạo thư mục:", err);
                                }
                            }
                            
                            // Sử dụng chrome.downloads.download để tải xuống file
                            chrome.downloads.download({
                                url: url,
                                filename: filename,
                                conflictAction: 'uniquify',
                                saveAs: false
                            }, (downloadId) => {
                                if (chrome.runtime.lastError) {
                                    console.error("Lỗi tải xuống:", chrome.runtime.lastError);
                                } else {
                                    successCount++;
                                    console.log(`Đã bắt đầu tải báo cáo ${i+1}/${downloadUrls.length} vào thư mục ${folderName}`);
                                }
                            });
                        } else {
                            // Phương pháp thay thế: Mở URL trong tab mới (phương pháp cũ)
                            console.log(`Sử dụng phương pháp thay thế để tải báo cáo #${i+1}: ${reportName}`);
                            const newTab = window.open(url, '_blank');
                            
                            // Đóng tab sau khi đã bắt đầu tải xuống
                            setTimeout(() => {
                                try {
                                    if (newTab && !newTab.closed) {
                                        newTab.close();
                                    }
                                } catch (e) {
                                    // Bỏ qua lỗi khi đóng tab
                                }
                            }, 3000);
                            
                            successCount++;
                        }
                        
                        // Đợi một chút giữa các lần tải để tránh quá tải
                        await sleep(1000);
                    } catch (error) {
                        console.error(`Lỗi khi tải báo cáo #${i+1}:`, error);
                    }
                }
                
                // Thông báo kết quả
                let data = { 
                    successCount: downloadUrls.length, 
                    reportNames,
                    folderPath: `reports/${folderName}/`
                };
                
                // Nếu có báo cáo được tải xuống, hiển thị chi tiết tên các báo cáo
                if (data.reportNames && data.reportNames.length > 0) {
                    // Chỉ hiển thị 3 báo cáo đầu tiên và số lượng còn lại
                    if (data.reportNames.length > 3) {
                        const firstThree = data.reportNames.slice(0, 3).join(", ");
                        data.reportDetails = `${firstThree} và ${data.reportNames.length - 3} báo cáo khác`;
                    } else {
                        data.reportDetails = data.reportNames.join(", ");
                    }
                }
                
                // Thông báo kết quả cho người dùng
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs && tabs.length > 0) {
                        sendMessage(tabs[0].id, "downloadAdsReports", {
                            ...data,
                            message: `Đã tải ${downloadUrls.length} báo cáo vào thư mục: ${data.folderPath}`
                        });
                    }
                });
                
                // Lưu thông tin về thư mục tải xuống vào storage để có thể sử dụng sau này
                chrome.storage.local.set({ 
                    lastReportDownload: {
                        date: new Date().toISOString(),
                        folderPath: `reports/${folderName}/`,
                        count: downloadUrls.length
                    }
                });
                
                // Đóng tab báo cáo và quay lại trang orders
                try {
                    chrome.tabs.remove(reportTabId, () => {
                        // Quay lại trang orders sau khi hoàn tất
                        setTimeout(() => {
                            chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
                        }, 1000);
                    });
                } catch (err) {
                    console.error("Lỗi khi đóng tab báo cáo:", err);
                    // Tạo tab trang orders mới nếu không thể đóng tab báo cáo
                    chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
                }
            });
        });
        
        // Lưu log hoạt động
        saveLog("adsReportsLog", { 
            type: "Auto Ads Reports Download", 
            date: new Date().toISOString(),
            folderPath: `reports/${new Date().getDate()}-${new Date().getMonth()+1}-${new Date().getFullYear()}/`
        });
    } catch (error) {
        console.error("Lỗi trong quá trình tải báo cáo quảng cáo:", error);
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs && tabs.length > 0) {
            sendMessage(tabs[0].id, "downloadAdsReports", { 
              error: `Lỗi khi tải báo cáo quảng cáo: ${error.message || "Lỗi không xác định"}` 
            });
          }
        });
    }finally {
      // // 3. Mở khóa sau khi hoàn tất
      isDownloadingAdsReport = false;
      console.log("[Ads Report] Bỏ khóa isDownloadingAdsReport.");
    }
  }
  else if (alarm.name === "testSyncOrder") {
    console.log("Đang chạy test alarm...");
    // Test thông báo
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs && tabs.length > 0) {
        sendMessage(tabs[0].id, "showToast", {
          type: "success",
          message: "Alarm test đã kích hoạt thành công!"
        });
      }
    });
  }
});

// Helper function to send message after tab loads
function sendMessageToTabWhenLoaded(tabId, messagePayload) {
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo, tab) {
        // Ensure the tab is fully loaded and is the performance dashboard page
        if (updatedTabId === tabId && changeInfo.status === 'complete' && tab.url && tab.url.includes("/performance/dashboard")) {
            chrome.tabs.onUpdated.removeListener(listener); // Important: remove listener to prevent multiple triggers
            chrome.tabs.sendMessage(tabId, messagePayload, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(`Error sending message to tab ${tabId} (${tab.url}):`, chrome.runtime.lastError.message);
                } else {
                    console.log(`Message sent to tab ${tabId} (${tab.url}), response:`, response);
                }
            });
        }
    });
}

// Chạy thiết lập alarm khi extension được tải
setupDailyAlarm();

const isImage = (filename) => {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(filename);
};

const isCustomImgLabel = (label) => {
  return /(photo|image|picture)/.test(label.toLowerCase());
};

const stopInteval = (params) => {
  clearInterval(params);
};

var activeTabId;
chrome.tabs.onActivated.addListener(function (activeInfo) {
  activeTabId = activeInfo?.tabId;
});

// Utility function for showing error notifications
const notifyError = (message) => {
  // Send error notification to active tab
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      message: "showNotification",
      type: "error",
      text: message
    });
  }
  console.error(message);
};

// Correctly defined stopInterval function
const stopInterval = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
  }
};

const sendMessage = async (tabId, message, data) => {
  if (!tabId) return;
  
  // Đảm bảo content script đã được tiêm nếu là message quan trọng liên quan đến đơn hàng
  if (message === 'getOrderItemInfo') {
    try {
      console.log(`[BG] Đảm bảo content script đã được tiêm trước khi gửi message ${message} to tab ${tabId}`);
      const scriptInjected = await ensureContentScriptInjected(tabId, 'scripts/sync_order.js');
      if (!scriptInjected) {
        console.error(`[BG] Không thể tiêm content script vào tab ${tabId}`);
      }
    } catch (error) {
      console.error(`[BG] Lỗi khi tiêm content script:`, error);
    }
  }
  
  let timeOut = 0;
  let start = setInterval(() => {
    timeOut++;
    
    // First check if the tab exists
    try {
      chrome.tabs.get(tabId, function (tabInner) {
        if (tabInner && !chrome.runtime.lastError) {
          // Tab exists, send message to it
          try {
            chrome.tabs.sendMessage(
              tabId,
              {
                message,
                data,
              },
              (resp) => {
                // Check for errors and handle them
                if (chrome.runtime.lastError) {
                  console.log(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
                } else if (resp?.message === "received") {
                  stopInterval(start);
                }
              }
            );
          } catch (error) {
            console.error(`Error in sendMessage to tab ${tabId}:`, error);
          }
        } else if (typeof activeTabId !== 'undefined' && activeTabId) {
          // Original tab doesn't exist, try sending to active tab
          try {
            chrome.tabs.get(activeTabId, function (tab) {
              if (tab?.id && !chrome.runtime.lastError) {
                chrome.tabs.sendMessage(
                  tab.id,
                  {
                    message,
                    data,
                  },
                  (resp) => {
                    // Check for errors and handle them
                    if (chrome.runtime.lastError) {
                      console.log(`Error sending message to activeTab ${activeTabId}:`, chrome.runtime.lastError);
                    } else if (resp?.message === "received") {
                      stopInterval(start);
                    }
                  }
                );
              }
            });
          } catch (error) {
            console.error(`Error in sendMessage to activeTab ${activeTabId}:`, error);
          }
        }
      });
    } catch (error) {
      console.error("Error in chrome.tabs.get:", error);
    }

    // Stop after 120 seconds to prevent infinite loops
    if (timeOut >= 120) {
      console.log("Timeout reached for message sending, stopping interval");
      stopInterval(start);
    }
  }, 1000);
  
  return start; // Return the interval ID for external stopping if needed
};

const sendToContentScript = (msg, data) =>
  new Promise(async (resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error("Error querying tabs:", chrome.runtime.lastError);
          return resolve(false);
        }
        
        if (!tabs || !tabs.length || !tabs[0].id) {
          if (typeof activeTabId !== 'undefined' && activeTabId) {
            try {
              chrome.tabs.get(activeTabId, function (tab) {
                if (chrome.runtime.lastError) {
                  console.error("Error getting active tab:", chrome.runtime.lastError);
                  return resolve(false);
                }
                
                if (tab && tab.id) {
                  sendMessage(tab.id, msg, data);
                  return resolve(true);
                }
                return resolve(false);
              });
            } catch (error) {
              console.error("Error in chrome.tabs.get for activeTabId:", error);
              return resolve(false);
            }
          } else {
            return resolve(false);
          }
        } else {
          sendMessage(tabs[0].id, msg, data);
          resolve(true);
        }
      });
    } catch (error) {
      console.error("Error in sendToContentScript:", error);
      resolve(false);
    }
  });

const getMBApiKey = () =>
  new Promise(async (resolve) => {
    await chrome.storage.local.get("MBApi").then((result) => {
      if (result["MBApi"]) {
        resolve(result["MBApi"]);
      }
    });
    const isSended = await sendToContentScript("getApiKey", null);
    if (!isSended) resolve(null);
    chrome.runtime.onMessage.addListener(async (req, sender, res) => {
      const { message, data } = req || {};
      if (message === "getApiKey" && data) resolve(data);
    });
  });

const sendRequestToMB = async (endPoint, apiKey, data) => {
  const res = {
    error: null,
  };
  if (!apiKey) apiKey = await getMBApiKey();

  let url = MBUrl;
  if (endPoint) {
    url += `?case=${endPoint}`;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchantId": apiKey, // Sử dụng merchantId như một apiKey
      },
      body: data,
    });
    return await resp.json();
  } catch (error) {
    res.error = error.message;
  }
  return res;
};

const redirectToNewURL = (fn) => {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      fn(tabs);
      // Thêm một khoảng thời gian ngắn để đảm bảo trình duyệt có thởi gian để bắt đầu quá trình điều hướng
      setTimeout(resolve, 500);
    });
  });
};


// 
const openOrderPage = () => {
  return new Promise((resolve) => {
    const url = `${globalDomain}/orders-v3?page=1`;
    // Tìm xem có tab orders nào đang mở không
    chrome.tabs.query({ url: `${globalDomain}/orders-v3*` }, (tabs) => {
      if (tabs.length > 0) {
        // Nếu có, update và focus vào nó
        chrome.tabs.update(tabs[0].id, { active: true, url }, (tab) => {
          resolve(tab);
        });
      } else {
        // Nếu không, tạo tab mới
        chrome.tabs.create({ active: true, url }, (tab) => {
          resolve(tab);
        });
      }
    });
  });
};

const openHomePage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/orders-v3/ref=xx_myo_favb_xx`;
  chrome.tabs.query({}, (tabs) => {
    let found = false;

    for (let tab of tabs) {
      if (found) break;
      if (tab?.url?.includes("/orders-v3")) {
        found = tab.id;
        break;
      }
    }

    if (found) {
      chrome.tabs.update(found, {
        active: true,
        url,
      });
    } else {
      chrome.tabs.create({
        active: true,
        url,
      });
    }
  });
};

const downloadFiles = async (fieldValues, apiKey) => {
  try {
    const result = await Promise.allSettled(
        fieldValues.map(async (item) => {
          const fileKey =
              Array.from({ length: 2 })
                  .map(() => Math.random().toString(36).slice(2))
                  .join("_") + "_.jpg";

          const req = new Request(item.fileUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000 * 300); // 5m
          const res = await fetch(req, { signal: controller.signal });

          if (res.ok) {
            const fileBlob = await res.blob();
            if (fileBlob.type && fileBlob.size) {
              // Sử dụng FileReader để chuyển đổi Blob thành chuỗi base64
              const reader = new FileReader();

              return new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                  const base64Data = reader.result.split(',')[1]; // Lấy phần base64 sau 'data:image/jpeg;base64,'

                  // Chuẩn bị payload JSON để gửi qua sendRequestToMB
                  const payload = {
                    fileName: fileKey,
                    fileData: base64Data, // Sử dụng chuỗi base64 đã chuyển đổi
                    mimeType: fileBlob.type,
                    folder: "desgin_images_data", // Chỉ cần subfolder tới đây
                  };

                  // Gửi yêu cầu qua sendRequestToMB
                  const uploadResponse = await sendRequestToMB("createUploadUrl", apiKey, JSON.stringify(payload));

                  if (uploadResponse && uploadResponse.fileUrl) {
                    resolve({ [item.name]: uploadResponse.fileUrl });
                  } else {
                    console.error("Upload failed:", uploadResponse.error || "Unknown error");
                    reject(null);
                  }
                };

                reader.onerror = (error) => {
                  console.error("Error reading file:", error);
                  reject(null);
                };

                reader.readAsDataURL(fileBlob); // Đọc file dướidạng Data URL (base64)
              });
            }
          }

          return null;
        })
    );

    return result
        .filter((i) => i.status === "fulfilled")
        .map(({ value }) => value);
  } catch (err) {
    console.log("download file error: ", err);
  }

  return [];
};



let stopProcess = false;

// Tạo một interval để giữ service worker luôn hoạt động
let keepAliveInterval = null;

// Hàm để giữ service worker không bị Chrome tắt
function keepServiceWorkerAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  console.log("[BG] Setting up keep-alive mechanism for service worker");
  
  // Ping định kỳ mỗi 20 giây để giữ service worker hoạt động
  keepAliveInterval = setInterval(() => {
    console.log("[BG] Service worker keep-alive ping");
    // Tạo một hoạt động nhỏ để service worker không bị tắt
    chrome.storage.local.get(["lastActivityTime"], (result) => {
      chrome.storage.local.set({ "lastActivityTime": Date.now() });
    });
  }, 20000);
}

// Bắt đầu giữ service worker hoạt động ngay khi script được tải
keepServiceWorkerAlive();

// capture event from content script
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
  const { message, data, domain: oldDomain, action } = req || {};
  
  // Xử lý thông báo khi quá trình tự động update tracking hoàn tất
  if (message === "autoUpdateTrackingFinished") {
    console.log("[BG] Nhận thông báo autoUpdateTrackingFinished");
    
    // Đánh dấu đã hoàn thành quá trình auto update tracking
    doingAuto = false;
    
    // Lưu log hoạt động
    saveLog("updateTrackingLog", { 
      type: "Auto Update Tracking Finished", 
      date: new Date().toISOString(),
      status: "completed"
    });
    
    // Thông báo thành công
    showNotification("success", "Auto update tracking process completed successfully");
    console.log("[BG] Quá trình tự động update tracking đã hoàn tất thành công");
    
    // Đóng tab hiện tại sau khi hoàn thành (nếu có)
    if (sender.tab && sender.tab.id) {
      console.log(`[BG] Đóng tab ${sender.tab.id} sau khi hoàn thành update tracking`);
      chrome.tabs.remove(sender.tab.id);
    }
    
    if (res) res({ message: "received", status: "completed" });
    return true;
  }
  
  // Xử lý tin nhắn keep-alive từ content script
  if (action === "userInteraction") {
    console.log("[BG] Received user interaction notification, service worker refreshed");
    keepServiceWorkerAlive(); // Khởi động lại cơ chế keep-alive
    if (res) res({ status: "Service worker active" });
    return true; // Trả về true để cho biết sẽ gọi callback res bất đồng bộ
  }

  if (message === "runUpdateTracking") {
    // 1. KIỂM TRA KHÓA: Nếu quy trình đang chạy, từ chối yêu cầu mới
    if (isUpdateTrackingRunning) {
        console.warn("[BG] 'runUpdateTracking' đang chạy. Yêu cầu mới bị từ chối.");
        sendMessage(sender.tab.id, "updateTracking", { error: "Update tracking process is already running. Please wait." });
        return true;
    }

    // 2. ĐẶT KHÓA và bắt đầu quy trình
    isUpdateTrackingRunning = true;
    console.log("[BG] Đặt khóa isUpdateTrackingRunning = true");

    // Sử dụng hàm async IIFE để xử lý và đảm bảo finally luôn được gọi
    (async () => {
        const initialTabId = sender.tab ? sender.tab.id : null;
        const autoModeFromReq = data?.autoMode || false;
        let workerTab = null; // Tab duy nhất được sử dụng cho tất cả các thao tác

        try {
            // Lấy danh sách đơn hàng cần cập nhật
            const apiKey = await getMBApiKey();
            const query = JSON.stringify({ input: apiKey });
            const result = await sendRequestToMB("OrderNeedUpdateTracking", apiKey, query);

            if (result.error || result.errors?.[0]?.message) {
                throw new Error(result.error || result.errors[0].message);
            }

            const orders = result.data;
            if (!orders || orders.length === 0) {
                console.log("[BG] Không có đơn hàng nào cần cập nhật tracking.");
                sendMessage(initialTabId, "updateTracking", {
                    error: null,
                    message: "Không có đơn hàng nào cần xử lý.",
                    autoMode: autoModeFromReq
                });
                return; // Kết thúc sớm nếu không có đơn hàng
            }

            console.log(`[BG] Tìm thấy ${orders.length} đơn hàng. Bắt đầu xử lý...`);
            const UnshippedOrders = await new Promise(r => chrome.storage.local.get("UnshippedOrders", res => r(res.UnshippedOrders || [])));

            // Mở một tab làm việc duy nhất
            workerTab = await openAndEnsureTabReady(`${globalDomain}/orders-v3`, null);
            let overallErrorMessage = null;

            // 3. SỬ DỤNG VÒNG LẶP FOR...OF
            for (const order of orders) {
                try {
                    console.log(`[BG] Đang xử lý đơn hàng: ${order.orderId} trên tab ${workerTab.id}`);
                    // =================================================================Add commentMore actions
                    // LOGIC MỚI: XỬ LÝ ĐƠN CÓ TRACKING RỖNG - Confirm đơn
                    // =================================================================
                    // Nếu tracking rỗng, thử xác minh trực tiếp xem đơn đã được ship chưa.
                    if (!order.tracking || String(order.tracking).trim() === '') {
                      console.log(`[BG] Tracking rỗng cho đơn ${order.orderId}. Thử xác minh trạng thái 'Shipped' trước.`);

                      // Thao tác 2 (Xác minh): Điều hướng và kiểm tra trạng thái
                      const verifyUrl = `${globalDomain}/orders-v3/order/${order.orderId}`;
                      await openAndEnsureTabReady(verifyUrl, workerTab.id);

                      // Gửi yêu cầu xác minh với tracking rỗng. Content script sẽ hiểu là cần check status "Shipped".
                      const verificationResult = await sendMessageAndPromiseResponse(workerTab.id, "verifyAddTracking", { orderId: order.orderId, trackingCode: "" }, "verifyAddTracking", order.orderId);

                      // Nếu xác minh thành công (tức là đã "Shipped")
                      if (verificationResult.status === "success") {
                          console.log(`[BG] Đơn ${order.orderId} đã ở trạng thái "Shipped". Bỏ qua bước điền form.`);

                          // Thao tác 3 (Gửi kết quả về server): Báo cho server là đã xong
                          const queryUpdate = JSON.stringify({ orderId: order.orderId, trackingCode: "" });
                          await sendRequestToMB("addedTrackingCode", apiKey, queryUpdate);
                          console.log(`[BG] Order ${order.orderId} - Cập nhật trạng thái (đã ship, không tracking) lên MB thành công.`);

                          // Chuyển sang xử lý đơn hàng tiếp theo
                          continue;
                      } else {
                          // Nếu xác minh thất bại (chưa "Shipped"), sẽ tiếp tục quy trình điền form như bình thường bên dưới
                          console.log(`[BG] Xác minh trực tiếp thất bại cho đơn ${order.orderId}. Tiến hành quy trình điền form để confirm.`);
                      }
                  }
                  // =================================================================
                  // KẾT THÚC LOGIC MỚI
                  // =================================================================
                    // Chuẩn bị thông tin
                    order.carrier = detectCarrier(order.carrier?.toLowerCase()) || detectCarrier(detectCarrierCode(order.tracking));
                    const isUnshipped = UnshippedOrders.includes(order.orderId);
                    const actionUrl = isUnshipped 
                        ? `${globalDomain}/orders-v3/order/${order.orderId}/confirm-shipment` 
                        : `${globalDomain}/orders-v3/order/${order.orderId}/edit-shipment`;
                    const formFillMessageType = isUnshipped ? "forceAddTracking" : "forceEditTracking";
                    
                    // Thao tác 1: Điều hướng và điền form
                    await openAndEnsureTabReady(actionUrl, workerTab.id);
                    const addedTrackingData = await sendMessageAndPromiseResponse(workerTab.id, formFillMessageType, order, "addedTrackingCode", order.orderId);
                    
                    if(addedTrackingData.status === 'error'){
                        throw new Error(addedTrackingData.message || `Lỗi từ content script khi xử lý đơn ${order.orderId}`);
                    }

                    // Thao tác 2: Điều hướng và xác minh
                    const verifyUrl = `${globalDomain}/orders-v3/order/${order.orderId}`;
                    await openAndEnsureTabReady(verifyUrl, workerTab.id);
                    const verificationResult = await sendMessageAndPromiseResponse(workerTab.id, "verifyAddTracking", { orderId: order.orderId, trackingCode: addedTrackingData.trackingCode }, "verifyAddTracking", order.orderId);

                    // Thao tác 3: Gửi kết quả về server nếu thành công
                    if (verificationResult.status === "success") {
                        const queryUpdate = JSON.stringify({ orderId: order.orderId, trackingCode: addedTrackingData.trackingCode });
                        await sendRequestToMB("addedTrackingCode", apiKey, queryUpdate);
                        console.log(`[BG] Order ${order.orderId} - Cập nhật tracking lên MB thành công.`);
                    } else {
                        throw new Error(verificationResult.message || `Xác minh thất bại cho đơn hàng ${order.orderId}`);
                    }

                } catch (e) {
                    // 4. XỬ LÝ LỖI CHO TỪNG ĐƠN HÀNG
                    console.error(`[BG] Lỗi khi xử lý đơn hàng ${order.orderId}: ${e.message}`);
                    overallErrorMessage = e.message; // Lưu lỗi cuối cùng để báo cáo
                    saveLog("trackingProcessingError", { orderId: order.orderId, error: e.message });
                    await sleep(2000); // Chờ một chút trước khi tiếp tục
                }
            } // Kết thúc vòng lặp for

            // Thông báo hoàn tất về tab ban đầu
            sendMessage(initialTabId, "updateTracking", { error: overallErrorMessage, autoMode: autoModeFromReq });

        } catch (e) {
            console.error("[BG] Lỗi nghiêm trọng trong quy trình 'runUpdateTracking':", e);
            sendMessage(initialTabId, "updateTracking", { error: `Lỗi hệ thống: ${e.message}`, autoMode: autoModeFromReq });
        } finally {
            // 5. MỞ KHÓA VÀ DỌN DẸP
            if (workerTab && workerTab.id) {
                await chrome.tabs.remove(workerTab.id).catch(err => console.warn("Lỗi khi đóng workerTab:", err.message));
            }
            isUpdateTrackingRunning = false;
            console.log("[BG] Mở khóa isUpdateTrackingRunning = false");
        }
    })(); // Kết thúc IIFE

    return true; // Giữ message port mở
}

  
  let domain = AMZDomain;
  if (AMZDomains.includes(oldDomain)) {
    domain = oldDomain;
  }
  globalDomain = domain;

  if (message === "listedSaveApiKey") {
    sendToContentScript("listedSaveApiKey", null);
  }
  if (message === "stopProcess") {
    stopProcess = true;
  }
  if (message === "autoSyncFinished") {
    console.log("Tự động đồng bộ đơn hàng đã hoàn tất");
    doingAuto = false; // Cập nhật trạng thái
    
    // Lưu log chi tiết về kết quả đồng bộ tự động
    const syncDetails = data || {};
    saveLog("autoSyncLog", { 
      type: "Auto Sync Completed", 
      date: new Date().toISOString(),
      totalProducts: syncDetails.totalProducts || 0,
      totalPages: syncDetails.totalPages || 1,
      status: syncDetails.status || "completed"
    });
    
    // Kiểm tra nếu còn đơn hàng để sync không
    chrome.storage.local.get(["UnshippedOrders"], function(result) {
      const unshippedOrders = result.UnshippedOrders || [];
      
      // Nếu không còn đơn hàng nào để sync hoặc đã sync tất cả
      if (unshippedOrders.length === 0) {
        console.log("Không còn đơn hàng nào để sync, chuyển đến trang chi tiết đơn hàng để update tracking");
        // Chờ 2 giây rồi mở trang chi tiết đơn hàng
        setTimeout(() => {
          openOrderDetailPage();
        }, 2000);
      }
    });
  }
  if (message === "autoSyncSkipped") {
    console.log("Tự động đồng bộ đơn hàng bị bỏ qua: " + (data?.reason || "lý do không xác định"));
    doingAuto = false; // Cập nhật trạng thái
    
    // Lưu log thông tin về việc bỏ qua
    saveLog("autoSyncLog", { 
      type: "Auto Sync Skipped", 
      date: new Date().toISOString(),
      reason: data?.reason || "unknown_reason"
    });
  }
  if (message === "checkSyncedOrders") {
    const query = JSON.stringify({
      originIds: JSON.stringify(data.map((o) => o["id"]))
    });
    const result = await sendRequestToMB("checkSyncedOrders", null, query);
    const resp = {
      orders: data,
      data: result.data,
      error: result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null,
    };
    // get img for order
    for (const order of data) {
      if (!Object.keys(resp.data).length) break;
      const orderInfo = resp.data[order["id"]];
      // only get product image if order not synced and order has't image
      if (!orderInfo || orderInfo.status != "Not Synced") continue;
      const { img, productUrl } = order;
      if (img) continue;
      let mockup = await getProductImg(productUrl);
      order.img = mockup;
    }
    sendMessage(sender.tab.id, "checkSyncedOrders", resp);
  }
  if (message === "syncOrderToMB") {
    const { apiKey, orders, options, markSynced } = data;
    if (!orders || !orders.length) return;
    await handleSyncOrders(orders, options, apiKey, domain);
    if (markSynced) {
      sendToContentScript("auto_synced");
    }
  }
  if (message === "deleteIgnoreOrder") {
    const { apiKey, orders } = data;
    if (!apiKey || !orders || !orders.length || !domain) return;
    let query = JSON.stringify({
      operationName: "deleteIgnoreAmazonOrder",
      variables: {
        originOrderIds: orders.map((o) => o.id),
      },
      query:
        "mutation deleteIgnoreAmazonOrder($originOrderIds: [ID!]!) {deleteIgnoreAmazonOrder(originOrderIds: $originOrderIds)}",
    });
    const result = await sendRequestToMB(null, apiKey, query);
    const resp = {
      orders,
      data: result.data ? result.data.deleteIgnoreAmazonOrder : null,
      error: result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null,
    };
    sendMessage(sender.tab.id, "deleteIgnoreAmazonOrder", resp);
    await sleep(3000);
    chrome.tabs.update({
      // url: `${AMZDomain}/orders-v3?page=1`,
      url: `${domain}/orders-v3?page=1`,
    });
  }
  // if (message === "forceAddTracking") {
  //   // const url = `${AMZDomain}/orders-v3/order/${data.orderId}/confirm-shipment`;
  //   const url = `${domain}/orders-v3/order/${data.orderId}/confirm-shipment`;
  //   chrome.tabs.update({ url }, (tab) =>
  //     sendMessage(tab.id, "forceAddTracking", data),
  //   );
  // }
  if (message === "forceAddTracking") {
    // const url = `${AMZDomain}/orders-v3/order/${data.orderId}/confirm-shipment`;
    const url = `${domain}/orders-v3/order/${data.orderId}/confirm-shipment`;
    chrome.tabs.update({ url }, (tab) =>
      sendMessage(tab.id, "forceAddTracking", data),
    );
  }




  // Thêm case mới để xử lý đơn hàng bị hủy
  if (message === "updateCancelledOrders") {
    const { apiKey, orderIds, cancelledOrders } = data;
    if (!orderIds || !orderIds.length) return;

    try {
      // Chuẩn bị dữ liệu cho request API
      let query = JSON.stringify({
        case: "updateCancelledOrders",
        input: {
          merchantId: apiKey,
          orderIds: orderIds,
          cancelledOrders: cancelledOrders.map(order => ({
            orderId: order.id,
            cancelReason: order.cancelReason || "Unknown"
          }))
        }
      });

      // Gửi request API đến server
      const result = await sendRequestToMB("updateCancelledOrders", apiKey, query);
      
      // Gửi kết quả trở lại content script
      const resp = {
        success: true,
        message: `Đã cập nhật ${orderIds.length} đơn hàng bị hủy`,
        error: result.error
          ? result.error
          : result.errors
            ? result.errors[0].message
            : null,
      };
      
      sendMessage(sender.tab.id, "updateCancelledOrdersResponse", resp);
    } catch (error) {
      console.error("Error updating cancelled orders:", error);
      sendMessage(sender.tab.id, "updateCancelledOrdersResponse", {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật đơn hàng bị hủy",
        error: error.message
      });
    }
  }

  if (message === "runUpdateGrandTotal") {
    let query = JSON.stringify({
      query: `
            query {
               getAmazonOrdersNeedUpdateGrandTotalV2{
                  nodes{
                     amazonOrderId
                  }
               }
            }`,
    });
    const result = await sendRequestToMB(null, null, query);
    let error = null;
    if (result.error || result.errors?.[0].message) {
      error = result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null;
      sendMessage(sender.tab.id, "updateGrandTotal", { error });
      return;
    }
    const orderIds =
      result.data.getAmazonOrdersNeedUpdateGrandTotalV2.nodes.map(
        (i) => i.amazonOrderId,
      );

    if (orderIds.length) {
      await handleUpdateGrandTotal_NEW(orderIds, domain);
    }
    sendMessage(sender.tab.id, "updateGrandTotal", { error });
  }
  // auto close tab when finish update account health 
  if (message === "accountHealthProcessFinished") {
    if (sender.tab && sender.tab.id) {
      console.log(`[BG] Tác vụ Account Health đã hoàn tất, đóng tab ID: ${sender.tab.id}`);
      chrome.tabs.remove(sender.tab.id);
    }
    res({ message: "received and tab closed" });
    return true;
  }
//   if (message === "runDownloadAdsReports") {
//     //1. kiểm tra khóa 
//     if (isDownloadingAdsReport){
//       console.warn("[Ads Report] Tiến trình đang chạy. Yêu cầu mới bị từ chối.");
//         sendMessage(sender.tab.id, "downloadAdsReports", { 
//             error: "A download process is already running. Please wait." 
//         });
//         return true;
//     }
//      // 2. Đặt khóa và bắt đầu
//     isDownloadingAdsReport = true;
//     console.log("[Ads Report] Đặt khóa isDownloadingAdsReport = true.");
//     (async () => {
//     try {
//         console.log("Bắt đầu quá trình tải báo cáo quảng cáo...");
        
//         try {
//             if (extendedLogSystem) {
//                 extendedLogSystem.info('AdsReports', 'Bắt đầu quá trình tải báo cáo quảng cáo theo lịch tự động');
//             }
//         } catch (logError) {
//             console.error("Logging error:", logError);
//         }
        
//         sendMessage(sender.tab.id, "downloadingAdsReports", {
//             label: `Đang tải báo cáo quảng cáo...`,
//         });
        
//         // Lấy API key để dùng trong URL
//         const merchantId = await getMBApiKey();
//         console.log("Sử dụng merchantId cho URL báo cáo:", merchantId);
        
//         try {
//             if (extendedLogSystem) {
//                 extendedLogSystem.info('AdsReports', 'Sử dụng merchantId cho URL báo cáo', { merchantId });
//             }
//         } catch (logError) {
//             console.error("Logging error:", logError);
//         }
        
//         // URL đến trang báo cáo quảng cáo
//         const reportsUrl = `https://advertising.amazon.com/reports/ref=xx_perftime_dnav_xx?merchantId=${merchantId}&locale=en_US&ref=RedirectedFromSellerCentralByRoutingService&entityId=ENTITY2G3AJUF27SG3C`;
        
//         // Tạo tab mới thay vì cập nhật tab hiện tại
//         chrome.tabs.create({ url: reportsUrl, active: true }, async (newTab) => {
//             if (!newTab || !newTab.id) {
//                 const errorMsg = "Không thể tạo tab mới cho báo cáo quảng cáo";
//                 console.error(errorMsg);
                
//                 try {
//                     if (extendedLogSystem) {
//                         extendedLogSystem.error('AdsReports', errorMsg);
//                     }
//                 } catch (logError) {
//                     console.error("Logging error:", logError);
//                 }
                
//                 // Thông báo lỗi trên tab hiện tại
//                 chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//                   if (tabs && tabs.length > 0) {
//                     sendMessage(tabs[0].id, "downloadAdsReports", { 
//                       error: "Không thể tạo tab mới cho báo cáo quảng cáo" 
//                     });
//                   }
//                 });
//                 return;
//             }
            
//             // Lưu ID của tab báo cáo
//             const reportTabId = newTab.id;
            
//             // Đợi trang báo cáo tải hoàn tất
//             await new Promise(resolve => {
//                 let listener = function(tabId, changeInfo) {
//                     if (tabId === reportTabId && changeInfo.status === 'complete') {
//                         chrome.tabs.onUpdated.removeListener(listener);
//                         resolve();
//                     }
//                 };
//                 chrome.tabs.onUpdated.addListener(listener);
                
//                 // Thêm timeout phòng trường hợp tab không tải hoàn tất
//                 setTimeout(() => {
//                     chrome.tabs.onUpdated.removeListener(listener);
//                     resolve();
//                 }, 30000); // 30 giây timeout
//             });
            
//             // Thêm độ trễ ngắn để đảm bảo nội dung đã tải
//             await sleep(3000);
            
//             // Kiểm tra xem tab còn tồn tại không
//             let tabExists = true;
//             try {
//                 await chrome.tabs.get(reportTabId);
//             } catch (err) {
//                 console.error("Tab báo cáo không còn tồn tại");
//                 tabExists = false;
                
//                 // Thông báo lỗi
//                 sendMessage(sender.tab.id, "downloadAdsReports", { 
//                   error: "Tab báo cáo đã bị đóng" 
//                 });
//                 return;
//             }
            
//             if (!tabExists) return;
            
//             // Thực hiện script để tìm và tải xuống báo cáo
//             chrome.scripting.executeScript({
//                 target: { tabId: reportTabId },
//                 function: async () => {
//                     // Hàm đợi ngắn hơn
//                     const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                    
//                     // Tạo tên thư mục dựa trên ngày hiện tại (DD-MM-YYYY)
//                     const today = new Date();
//                     const day = String(today.getDate()).padStart(2, '0');
//                     const month = String(today.getMonth() + 1).padStart(2, '0');
//                     const year = today.getFullYear();
//                     const folderName = `${day}-${month}-${year}`;
                    
//                     // Phương pháp tìm nút tải xuống hiệu quả hơn
//                     const findDownloadButtons = () => {
//                         // Trực tiếp tìm các liên kết tải xuống dựa trên URL
//                         const buttons = Array.from(document.querySelectorAll('a[href*="/download-report/"]'));
//                         console.log(`Tìm thấy ${buttons.length} nút tải xuống`);
//                         return buttons;
//                     };
                    
//                     // Tìm tất cả các nút tải xuống
//                     let downloadButtons = findDownloadButtons();
                    
//                     // Nếu không tìm thấy nút tải, thử một lần nữa sau một khoảng thởi gian ngắn
//                     if (downloadButtons.length === 0) {
//                         await wait(2000);
//                         downloadButtons = findDownloadButtons();
//                     }
                    
//                     console.log(`Tìm thấy ${downloadButtons.length} nút tải xuống để xử lý`);
                    
//                     let successCount = 0;
//                     const reportNames = [];
//                     const downloadUrls = [];
                    
//                     // Thu thập URL tải xuống và tên báo cáo
//                     downloadButtons.forEach((button, index) => {
//                         try {
//                             // Tìm tên báo cáo từ cùng hàng
//                             let reportName = "Báo cáo " + (index + 1);
//                             try {
//                                 // Tìm kiếm theo nhiều selector để tăng khả năng tìm thấy tên báo cáo
//                                 const parentRow = button.closest('.ag-row, tr, [role="row"]');
//                                 if (parentRow) {
//                                     const reportLink = parentRow.querySelector('a.sc-fqkvVR, a, .cell-value, td');
//                                     if (reportLink) {
//                                         reportName = reportLink.textContent.trim();
//                                     }
//                                 }
//                             } catch (e) {
//                                 console.error("Lỗi lấy tên báo cáo:", e);
//                             }
                            
//                             reportNames.push(reportName);
//                             // Lưu URL tải xuống để gửi về background script xử lý
//                             downloadUrls.push({
//                                 url: button.href,
//                                 reportName: reportName
//                             });
//                         } catch (error) {
//                             console.error(`Lỗi xử lý nút ${index + 1}:`, error);
//                         }
//                     });
                    
//                     // Trả về dữ liệu URL và tên báo cáo để background script xử lý
//                     return { 
//                         downloadUrls,
//                         reportNames,
//                         folderName
//                     };
//                 }
//             }, async (results) => {
//                 if (!results || results.length === 0 || !results[0].result) {
//                     // Thông báo lỗi nếu không tìm thấy kết quả
//                     chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//                         if (tabs && tabs.length > 0) {
//                             sendMessage(tabs[0].id, "downloadAdsReports", { 
//                                 error: "Không thể tìm thấy báo cáo để tải xuống" 
//                             });
//                         }
//                     });
                    
//                     // Đóng tab báo cáo
//                     try {
//                         chrome.tabs.remove(reportTabId);
//                     } catch (err) {
//                         console.error("Lỗi khi đóng tab báo cáo:", err);
//                     }
//                     return;
//                 }
                
//                 const { downloadUrls, reportNames, folderName } = results[0].result;
//                 let successCount = 0;
                
//                 // Tải xuống từng báo cáo sử dụng chrome.downloads.download API
//                 for (let i = 0; i < downloadUrls.length; i++) {
//                     try {
//                         const { url, reportName } = downloadUrls[i];
//                         // Làm sạch tên báo cáo để dùng làm tên file
//                         const safeReportName = reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        
//                         // Kiểm tra xem chrome.downloads API có sẵn không
//                         if (chrome.downloads && typeof chrome.downloads.download === 'function') {
//                             // Lấy phần mở rộng của file từ URL
//                             let fileExtension = '.csv'; // Mặc định là .csv
                            
//                             // Thử lấy phần mở rộng từ URL
//                             try {
//                                 const urlPath = new URL(url).pathname;
//                                 // Nếu URL chứa phần mở rộng, lấy phần mở rộng đó
//                                 if (urlPath.includes('.')) {
//                                     const urlExt = urlPath.split('.').pop().toLowerCase();
//                                     // Kiểm tra phần mở rộng hợp lệ
//                                     if (['csv', 'xlsx', 'xls', 'txt', 'pdf'].includes(urlExt)) {
//                                         fileExtension = '.' + urlExt;
//                                     }
//                                 }
//                             } catch (e) {
//                                 console.log("Không thể lấy phần mở rộng từ URL:", e);
//                             }
                            
//                             // Tạo tên file với đường dẫn thư mục và phần mở rộng đúng
//                             const filename = `reports/${folderName}/${safeReportName}${fileExtension}`;
                            
//                             // Tạo thư mục nếu chưa tồn tại bằng cách lưu một file nhỏ làm đánh dấu
//                             if (i === 0) {
//                                 try {
//                                     // Tạo một file .keep để đảm bảo thư mục tồn tại
//                                     chrome.downloads.download({
//                                         url: URL.createObjectURL(new Blob([' '], {type: 'text/plain'})),
//                                         filename: `reports/${folderName}/.keep`,
//                                         conflictAction: 'uniquify',
//                                         saveAs: false
//                                     }, () => {
//                                         console.log(`Đã tạo thư mục ${folderName}`);
//                                     });
//                                 } catch (err) {
//                                     console.error("Lỗi khi tạo thư mục:", err);
//                                 }
//                             }
                            
//                             // Sử dụng chrome.downloads.download để tải xuống file
//                             chrome.downloads.download({
//                                 url: url,
//                                 filename: filename,
//                                 conflictAction: 'uniquify',
//                                 saveAs: false
//                             }, (downloadId) => {
//                                 if (chrome.runtime.lastError) {
//                                     console.error("Lỗi tải xuống:", chrome.runtime.lastError);
//                                 } else {
//                                     successCount++;
//                                     console.log(`Đã bắt đầu tải báo cáo ${i+1}/${downloadUrls.length} vào thư mục ${folderName}`);
//                                 }
//                             });
//                         } else {
//                             // Phương pháp thay thế: Mở URL trong tab mới (phương pháp cũ)
//                             console.log(`Sử dụng phương pháp thay thế để tải báo cáo #${i+1}: ${reportName}`);
//                             const newTab = window.open(url, '_blank');
                            
//                             // Đóng tab sau khi đã bắt đầu tải xuống
//                             setTimeout(() => {
//                                 try {
//                                     if (newTab && !newTab.closed) {
//                                         newTab.close();
//                                     }
//                                 } catch (e) {
//                                     // Bỏ qua lỗi khi đóng tab
//                                 }
//                             }, 3000);
                            
//                             successCount++;
//                         }
                        
//                         // Đợi một chút giữa các lần tải để tránh quá tải
//                         await sleep(1000);
//                     } catch (error) {
//                         console.error(`Lỗi khi tải báo cáo #${i+1}:`, error);
//                     }
//                 }
                
//                 // Thông báo kết quả
//                 let data = { 
//                     successCount: downloadUrls.length, 
//                     reportNames,
//                     folderPath: `reports/${folderName}/`
//                 };
                
//                 // Nếu có báo cáo được tải xuống, hiển thị chi tiết tên các báo cáo
//                 if (data.reportNames && data.reportNames.length > 0) {
//                     // Chỉ hiển thị 3 báo cáo đầu tiên và số lượng còn lại
//                     if (data.reportNames.length > 3) {
//                         const firstThree = data.reportNames.slice(0, 3).join(", ");
//                         data.reportDetails = `${firstThree} và ${data.reportNames.length - 3} báo cáo khác`;
//                     } else {
//                         data.reportDetails = data.reportNames.join(", ");
//                     }
//                 }
                
//                 // Thông báo kết quả cho người dùng
//                 chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//                     if (tabs && tabs.length > 0) {
//                         sendMessage(tabs[0].id, "downloadAdsReports", {
//                             ...data,
//                             message: `Đã tải ${downloadUrls.length} báo cáo vào thư mục: ${data.folderPath}`
//                         });
//                     }
//                 });
                
//                 // Lưu thông tin về thư mục tải xuống vào storage để có thể sử dụng sau này
//                 chrome.storage.local.set({ 
//                     lastReportDownload: {
//                         date: new Date().toISOString(),
//                         folderPath: `reports/${folderName}/`,
//                         count: downloadUrls.length
//                     }
//                 });
                
//                 // Đóng tab báo cáo và quay lại trang orders
//                 try {
//                     chrome.tabs.remove(reportTabId, () => {
//                         // Quay lại trang orders sau khi hoàn tất
//                         setTimeout(() => {
//                             chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
//                         }, 1000);
//                     });
//                 } catch (err) {
//                     console.error("Lỗi khi đóng tab báo cáo:", err);
//                     // Tạo tab trang orders mới nếu không thể đóng tab báo cáo
//                     chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
//                 }
//             });
//         });
        
//         // Lưu log hoạt động
//         saveLog("adsReportsLog", { 
//             type: "Auto Ads Reports Download", 
//             date: new Date().toISOString(),
//             folderPath: `reports/${new Date().getDate()}-${new Date().getMonth()+1}-${new Date().getFullYear()}/`
//         });
//     } catch (error) {
//         console.error("Lỗi trong quá trình tải báo cáo quảng cáo:", error);
//         chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
//           if (tabs && tabs.length > 0) {
//             sendMessage(tabs[0].id, "downloadAdsReports", { 
//               error: `Lỗi khi tải báo cáo quảng cáo: ${error.message || "Lỗi không xác định"}` 
//             });
//           }
//         });
//     }finally {
//       isDownloadingAdsReport = false;
//       console.log("[Ads Report] Bỏ khóa isDownloadingAdsReport.");
//     }
//   })();
//   return true; // Giữ message port mở
// }
// gửi lên server 
if (message === "runDownloadAdsReports") {
  //1. kiểm tra khóa 
  if (isDownloadingAdsReport){
    console.warn("[Ads Report] Tiến trình đang chạy. Yêu cầu mới bị từ chối.");
      sendMessage(sender.tab.id, "downloadAdsReports", { 
          error: "A download process is already running. Please wait." 
      });
      return true;
  }
   // 2. Đặt khóa và bắt đầu
  isDownloadingAdsReport = true;
  console.log("[Ads Report] Đặt khóa isDownloadingAdsReport = true.");
  (async () => {
  try {
      console.log("Bắt đầu quá trình tải báo cáo quảng cáo...");
      
      try {
          if (extendedLogSystem) {
              extendedLogSystem.info('AdsReports', 'Bắt đầu quá trình tải báo cáo quảng cáo theo lịch tự động');
          }
      } catch (logError) {
          console.error("Logging error:", logError);
      }
      
      sendMessage(sender.tab.id, "downloadingAdsReports", {
          label: `Đang tải báo cáo quảng cáo...`,
      });
      
      // Lấy API key để dùng trong URL
      const merchantId = await getMBApiKey();
      const UPLOAD_HANDLER_URL = "https://bkteam.top/dungvuong-admin/api/upload_ads_report_handler.php";
      console.log("Sử dụng merchantId cho URL báo cáo:", merchantId);
      
      try {
          if (extendedLogSystem) {
              extendedLogSystem.info('AdsReports', 'Sử dụng merchantId cho URL báo cáo', { merchantId });
          }
      } catch (logError) {
          console.error("Logging error:", logError);
      }
      
      // URL đến trang báo cáo quảng cáo
      const reportsUrl = `https://advertising.amazon.com/reports/ref=xx_perftime_dnav_xx?merchantId=${merchantId}&locale=en_US&ref=RedirectedFromSellerCentralByRoutingService&entityId=ENTITY2G3AJUF27SG3C`;
      
      // Tạo tab mới thay vì cập nhật tab hiện tại
      chrome.tabs.create({ url: reportsUrl, active: true }, async (newTab) => {
          if (!newTab || !newTab.id) {
              const errorMsg = "Không thể tạo tab mới cho báo cáo quảng cáo";
              console.error(errorMsg);
              
              try {
                  if (extendedLogSystem) {
                      extendedLogSystem.error('AdsReports', errorMsg);
                  }
              } catch (logError) {
                  console.error("Logging error:", logError);
              }
              
              // Thông báo lỗi trên tab hiện tại
              chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs && tabs.length > 0) {
                  sendMessage(tabs[0].id, "downloadAdsReports", { 
                    error: "Không thể tạo tab mới cho báo cáo quảng cáo" 
                  });
                }
              });
              return;
          }
          
          // Lưu ID của tab báo cáo
          const reportTabId = newTab.id;
          
          // Đợi trang báo cáo tải hoàn tất
          await new Promise(resolve => {
              let listener = function(tabId, changeInfo) {
                  if (tabId === reportTabId && changeInfo.status === 'complete') {
                      chrome.tabs.onUpdated.removeListener(listener);
                      resolve();
                  }
              };
              chrome.tabs.onUpdated.addListener(listener);
              
              // Thêm timeout phòng trường hợp tab không tải hoàn tất
              setTimeout(() => {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
              }, 30000); // 30 giây timeout
          });
          
          // Thêm độ trễ ngắn để đảm bảo nội dung đã tải
          await sleep(3000);
          
          // Kiểm tra xem tab còn tồn tại không
          let tabExists = true;
          try {
              await chrome.tabs.get(reportTabId);
          } catch (err) {
              console.error("Tab báo cáo không còn tồn tại");
              tabExists = false;
              
              // Thông báo lỗi
              sendMessage(sender.tab.id, "downloadAdsReports", { 
                error: "Tab báo cáo đã bị đóng" 
              });
              return;
          }
          
          if (!tabExists) return;
          
          // Thực hiện script để tìm và tải xuống báo cáo
          chrome.scripting.executeScript({
              target: { tabId: reportTabId },
              function: async () => {
                  // Hàm đợi ngắn hơn
                  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                  
                  // Tạo tên thư mục dựa trên ngày hiện tại (DD-MM-YYYY)
                  const today = new Date();
                  const day = String(today.getDate()).padStart(2, '0');
                  const month = String(today.getMonth() + 1).padStart(2, '0');
                  const year = today.getFullYear();
                  const folderName = `${day}-${month}-${year}`;
                  
                  // Phương pháp tìm nút tải xuống hiệu quả hơn
                  const findDownloadButtons = () => {
                      // Trực tiếp tìm các liên kết tải xuống dựa trên URL
                      const buttons = Array.from(document.querySelectorAll('a[href*="/download-report/"]'));
                      console.log(`Tìm thấy ${buttons.length} nút tải xuống`);
                      return buttons;
                  };
                  
                  // Tìm tất cả các nút tải xuống
                  let downloadButtons = findDownloadButtons();
                  
                  // Nếu không tìm thấy nút tải, thử một lần nữa sau một khoảng thởi gian ngắn
                  if (downloadButtons.length === 0) {
                      await wait(2000);
                      downloadButtons = findDownloadButtons();
                  }
                  
                  console.log(`Tìm thấy ${downloadButtons.length} nút tải xuống để xử lý`);
                  
                  let successCount = 0;
                  const reportNames = [];
                  const downloadUrls = [];
                  
                  // Thu thập URL tải xuống và tên báo cáo
                  downloadButtons.forEach((button, index) => {
                      try {
                          // Tìm tên báo cáo từ cùng hàng
                          let reportName = "Báo cáo " + (index + 1);
                          try {
                              // Tìm kiếm theo nhiều selector để tăng khả năng tìm thấy tên báo cáo
                              const parentRow = button.closest('.ag-row, tr, [role="row"]');
                              if (parentRow) {
                                  const reportLink = parentRow.querySelector('a.sc-fqkvVR, a, .cell-value, td');
                                  if (reportLink) {
                                      reportName = reportLink.textContent.trim();
                                  }
                              }
                          } catch (e) {
                              console.error("Lỗi lấy tên báo cáo:", e);
                          }
                          
                          reportNames.push(reportName);
                          // Lưu URL tải xuống để gửi về background script xử lý
                          downloadUrls.push({
                              url: button.href,
                              reportName: reportName
                          });
                      } catch (error) {
                          console.error(`Lỗi xử lý nút ${index + 1}:`, error);
                      }
                  });
                  
                  // Trả về dữ liệu URL và tên báo cáo để background script xử lý
                  return { 
                      downloadUrls,
                      reportNames,
                      folderName
                  };
              }
          }, async (results) => {
              if (!results || results.length === 0 || !results[0].result) {
                  // Thông báo lỗi nếu không tìm thấy kết quả
                  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                      if (tabs && tabs.length > 0) {
                          sendMessage(tabs[0].id, "downloadAdsReports", { 
                              error: "Không thể tìm thấy báo cáo để tải xuống" 
                          });
                      }
                  });
                  
                  // Đóng tab báo cáo
                  try {
                      chrome.tabs.remove(reportTabId);
                  } catch (err) {
                      console.error("Lỗi khi đóng tab báo cáo:", err);
                  }
                  return;
              }
              
              const { downloadUrls, reportNames, folderName } = results[0].result;
              let successCount = 0;
              const uploadedReportNames = [];
              // Tải xuống từng báo cáo sử dụng chrome.downloads.download API
              for (let i = 0; i < downloadUrls.length; i++) {
                  try {
                      const { url, reportName } = downloadUrls[i];
                      // Làm sạch tên báo cáo để dùng làm tên file
                      const safeReportName = reportName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                      
                      // Kiểm tra xem chrome.downloads API có sẵn không
                      if (chrome.downloads && typeof chrome.downloads.download === 'function') {
                          // Lấy phần mở rộng của file từ URL
                          let fileExtension = '.csv'; // Mặc định là .csv
                          
                          // Thử lấy phần mở rộng từ URL
                          try {
                              const urlPath = new URL(url).pathname;
                              // Nếu URL chứa phần mở rộng, lấy phần mở rộng đó
                              if (urlPath.includes('.')) {
                                  const urlExt = urlPath.split('.').pop().toLowerCase();
                                  // Kiểm tra phần mở rộng hợp lệ
                                  if (['csv', 'xlsx', 'xls', 'txt', 'pdf'].includes(urlExt)) {
                                      fileExtension = '.' + urlExt;
                                  }
                              }
                          } catch (e) {
                              console.log("Không thể lấy phần mở rộng từ URL:", e);
                          }
                          
                          // Tạo tên file với đường dẫn thư mục và phần mở rộng đúng
                          const filename = `reports/${folderName}/${safeReportName}${fileExtension}`;
                          
                          // Tạo thư mục nếu chưa tồn tại bằng cách lưu một file nhỏ làm đánh dấu
                          if (i === 0) {
                              try {
                                  // Tạo một file .keep để đảm bảo thư mục tồn tại
                                  chrome.downloads.download({
                                      url: URL.createObjectURL(new Blob([' '], {type: 'text/plain'})),
                                      filename: `reports/${folderName}/.keep`,
                                      conflictAction: 'uniquify',
                                      saveAs: false
                                  }, () => {
                                      console.log(`Đã tạo thư mục ${folderName}`);
                                  });
                              } catch (err) {
                                  console.error("Lỗi khi tạo thư mục:", err);
                              }
                          }
                          
                          // Sử dụng chrome.downloads.download để tải xuống file
                          chrome.downloads.download({
                              url: url,
                              filename: filename,
                              conflictAction: 'uniquify',
                              saveAs: false
                          }, (downloadId) => {
                              if (chrome.runtime.lastError) {
                                  console.error("Lỗi tải xuống:", chrome.runtime.lastError);
                              } else {
                                  successCount++;
                                  console.log(`Đã bắt đầu tải báo cáo ${i+1}/${downloadUrls.length} vào thư mục ${folderName}`);
                              }
                          });
                      } else {
                          // Phương pháp thay thế: Mở URL trong tab mới (phương pháp cũ)
                          console.log(`Sử dụng phương pháp thay thế để tải báo cáo #${i+1}: ${reportName}`);
                          const newTab = window.open(url, '_blank');
                          
                          // Đóng tab sau khi đã bắt đầu tải xuống
                          setTimeout(() => {
                              try {
                                  if (newTab && !newTab.closed) {
                                      newTab.close();
                                  }
                              } catch (e) {
                                  // Bỏ qua lỗi khi đóng tab
                              }
                          }, 3000);
                          
                          successCount++;
                      }
                      
                      // Đợi một chút giữa các lần tải để tránh quá tải
                      await sleep(1000);
                  } catch (error) {
                      console.error(`Lỗi khi tải báo cáo #${i+1}:`, error);
                  }
              }
              
              // Thông báo kết quả
              let data = { 
                  successCount: downloadUrls.length, 
                  reportNames,
                  folderPath: `reports/${folderName}/`
              };
              
              // Nếu có báo cáo được tải xuống, hiển thị chi tiết tên các báo cáo
              if (data.reportNames && data.reportNames.length > 0) {
                  // Chỉ hiển thị 3 báo cáo đầu tiên và số lượng còn lại
                  if (data.reportNames.length > 3) {
                      const firstThree = data.reportNames.slice(0, 3).join(", ");
                      data.reportDetails = `${firstThree} và ${data.reportNames.length - 3} báo cáo khác`;
                  } else {
                      data.reportDetails = data.reportNames.join(", ");
                  }
              }
              
              // Thông báo kết quả cho người dùng
              chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                  if (tabs && tabs.length > 0) {
                      sendMessage(tabs[0].id, "downloadAdsReports", {
                          ...data,
                          message: `Đã tải ${downloadUrls.length} báo cáo vào thư mục: ${data.folderPath}`
                      });
                  }
              });
              
              // Lưu thông tin về thư mục tải xuống vào storage để có thể sử dụng sau này
              chrome.storage.local.set({ 
                  lastReportDownload: {
                      date: new Date().toISOString(),
                      folderPath: `reports/${folderName}/`,
                      count: downloadUrls.length
                  }
              });
              
              // Đóng tab báo cáo và quay lại trang orders
              try {
                  chrome.tabs.remove(reportTabId, () => {
                      // Quay lại trang orders sau khi hoàn tất
                      setTimeout(() => {
                          chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
                      }, 1000);
                  });
              } catch (err) {
                  console.error("Lỗi khi đóng tab báo cáo:", err);
                  // Tạo tab trang orders mới nếu không thể đóng tab báo cáo
                  chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
              }
          });
      });
      
      // Lưu log hoạt động
      saveLog("adsReportsLog", { 
          type: "Auto Ads Reports Download", 
          date: new Date().toISOString(),
          folderPath: `reports/${new Date().getDate()}-${new Date().getMonth()+1}-${new Date().getFullYear()}/`
      });
  } catch (error) {
      console.error("Lỗi trong quá trình tải báo cáo quảng cáo:", error);
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
          sendMessage(tabs[0].id, "downloadAdsReports", { 
            error: `Lỗi khi tải báo cáo quảng cáo: ${error.message || "Lỗi không xác định"}` 
          });
        }
      });
  }finally {
    isDownloadingAdsReport = false;
    console.log("[Ads Report] Bỏ khóa isDownloadingAdsReport.");
  }
})();
return true; // Giữ message port mở
}
  if (message === "getProductImage") {
    productImg = data;
  }

  // Auto sync order
  if (message === "autoReady") {
    if (doingAuto) return;

    doingAuto = true;
    openOrderPage();
    return;
  }
  // Sync Files
  if (message === "syncFiletoMB") {
    if (!data) return;
    const { apiKey, ...rest } = data;

    if (rest.fieldValues && rest.fieldValues.length > 0) {
      const fileDownloaded = await downloadFiles(rest.fieldValues, apiKey);
      if (fileDownloaded.length > 0) {
        const ob = fileDownloaded.reduce((acc, cur) => {
          acc = { ...acc, ...cur };
          return acc;
        }, {});

        for (let i = 0; i < rest.fieldValues.length; i++) {
          let item = rest.fieldValues[i];
          const val = ob[item.name];
          if (val) {
            item = {
              ...item,
              fileUrl: val,
            };
          }

          rest.fieldValues[i] = item;
        }
      }
    }

    let query = JSON.stringify({
      operationName: "syncAmazonPersonalizedFile",
      variables: {
        input: rest,
      },
      query:
        "mutation syncAmazonPersonalizedFile($input: AmazonPersonalizedFileInput!) {syncAmazonPersonalizedFile(input: $input)}",
    });

    const result = await sendRequestToMB(null, null, query);

    let error = "";
    if (result && result.syncAmazonPersonalizedFile === false) {
      error = "Could not sync file to MB";
    }

    if (error || result.error || result.errors?.[0].message) {
      error = result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null;
      sendMessage(sender.tab.id, "syncFileCompleted", { error });
      return;
    }
    sendMessage(sender.tab.id || activeTabId, "syncFileCompleted", {});
  }


});

// Thêm vào handleUpdateCancelledOrders hoặc có thể sử dụng hàm sendRequestToMB hiện có
const handleUpdateCancelledOrders = async (orderIds, cancelReasons, apiKey, domain) => {
  if (!orderIds || !orderIds.length) return;
  if (!apiKey) apiKey = await getMBApiKey();
  
  try {
    // Chuẩn bị dữ liệu gửi lên server
    let query = JSON.stringify({
      orderIds: orderIds,
      cancelReasons: cancelReasons
    });
    
    // Gửi request
    const result = await sendRequestToMB("updateCancelledOrders", apiKey, query);
    return result;
  } catch (error) {
    console.error("Error in handleUpdateCancelledOrders:", error);
    return { error: error.message };
  }
};

// capture event from popup
chrome.runtime.onMessage.addListener((req, sender, res) => {
  const { message, data } = req || {};
  switch (message) {
    case "saveApiKey":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.length > 0 && tabs[0].id) {
          // send order info to content script
          sendMessage(tabs[0].id, "popupSaveApiKey", data);
        }
      });
      break;
    default:
      break;
  }
});

// capture event from devtool
var OrderInfo = {
  locked: false,
  orderId: null,
  order: null,
  shipping: null,
};
const resetOrderInfo = () =>
  (OrderInfo = {
    locked: false,
    orderId: null,
    order: null,
    shipping: null,
  });

var OrderGrandTotal = {
  locked: false,
  isListed: false,
  orderId: null,
  grandTotal: 0,
  marketplaceFee: 0,
};
const resetOrderGrandTotal = () =>
  (OrderGrandTotal = {
    locked: false,
    isListed: false,
    orderId: null,
    grandTotal: 0,
    marketplaceFee: 0,
  });
var CustomOrder = {
  locked: false,
  isListed: false,
  orderId: null,
  itemId: null,
  personalizedInfo: null,
};
const resetCustomOrder = () =>
  (CustomOrder = {
    locked: false,
    isListed: false,
    orderId: null,
    itemId: null,
    personalizedInfo: null,
  });
chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "captureRequest") return;
  port.onMessage.addListener((msg) => {
    return;
    const { message, endPoint, data } = msg || {};
    if (message !== "response" || !data) return;
    // capture order info
    if (endPoint.includes("/orders-api/order/")) {
      const { order } = data;
      if (!order || order["amazonOrderId"] != OrderInfo.orderId) return;
      OrderInfo.order = order;
      saveLog("orderLog - dev tool", { type: "Order Information", data: order });
    }
    // capture shipping order info
    if (endPoint.includes("/orders-st/resolve")) {
      if (!data || !data[OrderInfo.orderId]) return;
      OrderInfo.shipping = data[OrderInfo.orderId].address;
    }
    // capture order grand totals
    if (
      endPoint.includes("payments/api/events-view") &&
      endPoint.includes(OrderGrandTotal.orderId)
    ) {
      OrderGrandTotal.isListed = true;
      if (!data) return;
      if (!data.tableRows || !data.tableRows.length) {
        OrderGrandTotal.grandTotal = -1;
        OrderGrandTotal.marketplaceFee = -1;
        return;
      }
      for (const row of data.tableRows) {
        if (row.tableCells?.length) {
          for (const item of row.tableCells) {
            if (item.columnIdentifier === "TOTAL") {
              let grandTotals = item.value.linkBody.currency.amount;
              if (grandTotals) OrderGrandTotal.grandTotal = grandTotals;
            }
            if (item.columnIdentifier === "FEES_TOTAL") {
              let marketFee = item.value.currency.amount;
              if (marketFee < 0) marketFee = marketFee * -1;
              if (marketFee >= 0) OrderGrandTotal.marketplaceFee = marketFee;
            }
          }
        }
      }
    }
    // capture personalized info
    if (
      endPoint.includes("/gestalt/ajax/fulfillment/init") &&
      endPoint.includes(CustomOrder.orderId) &&
      endPoint.includes(CustomOrder.itemId)
    ) {
      if (!data) return;
      CustomOrder.personalizedInfo = data;
    }
  });
});

// Hàm lưu log vào Chrome Storage
const saveLog = (key, message) => {
  chrome.storage.local.get([key], (result) => {
    const logs = result[key] || [];
    logs.push(message);
    const data = {};
    data[key] = logs;
    chrome.storage.local.set(data);
  });
};

const PT_ADDRESS = /\s(unit|stage|apt|ln|ste|ave)\s/i;
const getOrderInfo = async (order, shipping) => {

  // Lưu log vào localStorage
  // saveLog("orderLog", { type: "Order Information", data: order });
  // saveLog("shippingLog", { type: "Shipping Information", data: shipping });


  if (
    !order ||
    !shipping ||
    typeof order !== "object" ||
    typeof shipping !== "object"
  )
    return null;

  // Lấy MB API Key để sử dụng làm merchantId
  const merchantId = await getMBApiKey();

  let line1 = shipping.line1 || "";
  let line2 = shipping.line2 || "";
  const matcher = line1.match(PT_ADDRESS);
  if (matcher && matcher.index != null) {
    const remain = line1.substring(matcher.index);
    line1 = line1.substring(0, matcher.index);
    line2 = [remain.trim(), line2.trim()].filter(Boolean).join(" ");
  }

  const info = {
    orderId: order.amazonOrderId,
    merchantId,  // Thêm merchantId vào info
    items: [],
    shipping: {
      name: shipping.name,
      address: line1,
      address2: line2,
      city: shipping.city,
      state: shipping.stateOrRegion,
      zipCode: shipping.postalCode,
      phone: shipping.phoneNumber,
      country: shipping.countryCode,
    },
    discountTotal: 0,
    itemsTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal: 0,
    shippingService: order.shippingService,
    orderCreated: null,
    orderShipByDate: null,
    orderDeliveryByDate: null,
  };
  if (!info.shipping.address && info.shipping.address2) {
    info.shipping.address = info.shipping.address2;
    info.shipping.address2 = null;
  }
  if (order.orderCost) {
    const cost = order.orderCost;
    if (cost.PromotionTotal?.Amount)
      info.discountTotal = cost.PromotionTotal.Amount;
    if (cost.Total?.Amount) info.itemsTotal = cost.Total.Amount;
    if (cost.ShippingTotal?.Amount)
      info.shippingTotal = cost.ShippingTotal.Amount;
    if (cost.TaxTotal?.Amount) info.taxTotal = cost.TaxTotal.Amount;
    if (cost.GrandTotal?.Amount) info.grandTotal = cost.GrandTotal.Amount;
  }
  const getDate = (dateNumber, isPurchase) => {
    let dateStr = String(dateNumber).replace(",", "").replace(".", "").trim();
    if (dateStr.length < 13) {
      const limitAdd = 13 - dateStr.length;
      for (let i = 0; i < limitAdd; i++) {
        dateStr += "0";
      }
    }
    if (isPurchase) {
      // time locale
      return getRealTime(dateStr);
    }

    const formatDate = new Date(
      new Date(parseInt(dateStr)).toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
      }),
    ).setHours(-17, 0, 0);
    return new Date(formatDate).toISOString();
  };
  info.orderCreated = getDate(order.purchaseDate, true);
  info.orderShipByDate = getDate(order.latestShipDate);
  info.orderDeliveryByDate = getDate(order.latestDeliveryDate);
  const productWithContent = await getProductInfoString(order.orderItems);
  for (const item of order.orderItems) {
    if (item.QuantityOrdered < 1) continue; // case: qty = 0 => order can cancelled
    const newItem = {
      lineId: item.OrderItemId,
      name: item.Title,
      sku: item.SellerSKU,
      asin: item.ASIN,
      alwayMapping: false,
      isPersonalized: false,
      personalized: [],
      personalizedPreview: null,
      qty: item.QuantityOrdered,
      price: 0,
      itemSubtotal: 0,
      itemShippingTotal: 0,
      itemTaxTotal: 0,
      tax: 0,
      itemTotal: 0,
      itemDiscountTotal: 0,
      itemShippingTaxTotal: 0,
      itemMarketplaceFee: 0,
      mockup: item.ImageUrl
        ? [item.ImageUrl.replace("._SCLZZZZZZZ__SX55_.", ".")]
        : null,
      allVariations: {},
      variation: [],
    };
    // get personalized
    if (item.ItemCustomizations?.ModificationGroups?.length) {
      newItem.alwayMapping = true;
      newItem.isPersonalized = true;
      for (const gr of item.ItemCustomizations.ModificationGroups) {
        if (gr.Modifications?.length > 0) {
          for (const ct of gr.Modifications) {
            newItem.personalized.push({
              name: ct.Name,
              value: ct.Value,
            });
          }
        }
      }
    }
    // get item cost
    if (item.ItemCost) {
      const cost = item.ItemCost;
      if (cost.UnitPrice?.Amount) newItem.price = cost.UnitPrice.Amount;
      if (cost.Subtotal?.Amount) newItem.itemSubtotal = cost.Subtotal.Amount;
      if (cost.Shipping?.Amount)
        newItem.itemShippingTotal = cost.Shipping.Amount;
      if (cost.Tax?.Amount) {
        newItem.itemTaxTotal = cost.Tax.Amount;
        newItem.tax = cost.Tax.Amount;
      }
      if (cost.Total?.Amount) newItem.itemTotal = cost.Total.Amount;
      if (cost.Promotion?.Amount)
        newItem.itemDiscountTotal = cost.Promotion.Amount;
      if (cost.ShippingTax?.Amount)
        newItem.itemShippingTaxTotal = cost.ShippingTax.Amount;
      if (cost.PaymentMethodFee?.Amount)
        newItem.itemMarketplaceFee = cost.PaymentMethodFee.Amount;
    }
    // get product info
    const productInfo = await getProductInfo(
      item.ProductLink,
      newItem.asin,
      productWithContent,
    );
    if (productInfo) {
      newItem.allVariations = productInfo.variantItems;
      newItem.variation = productInfo.variantItem;
      let isMultiProduct = false;
      for (const v of productInfo.variantItem) {
        if (v.value?.toLowerCase()?.includes("multi")) {
          isMultiProduct = true;
          break;
        }
      }
      if (isMultiProduct && newItem.allVariations.asinVariationValues)
        newItem.allVariations.asinVariationValues = [];
    }
    info.items.push(newItem);
  }
  return info;
};

var productImg = null;
const getProductImg = async (url) => {
  let img = "";
  try {
    const htmlString = await fetch(url).then((res) => res.text());
    if (!htmlString) return img;
    sendToContentScript("getProductImage", htmlString);
    let timeOut = 0;
    while (true) {
      if (productImg != null || timeOut == 60) break;
      await sleep(500);
    }
    img = productImg;
    productImg = null;
  } catch (error) {}
  return img;
};

const getProductInfoString = async (items) => {
  const res = {};
  if (!items || !Array.isArray(items) || items.length === 0) return {};

  const urls = Array.from(
    new Set(items.map((i) => i?.ProductLink)).values(),
  ).filter(Boolean);

  try {
    const data = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(url);
        return { [url]: await res.text() };
      }),
    );

    return data.reduce((acc, cur) => ({ ...acc, ...cur }), {});
  } catch {}

  return res;
};

const getProductInfo = async (url, asinCurrent, productWithContent) => {
  // amzapi-1590c83f-eef4-4fcb-8b64-b10474e0dee2
  // 111-7907232-8321008
  const res = {
    mockups: [],
    variantItems: {
      variationValues: [],
      attributes: [],
      asinVariationValues: [],
    },
    variantItem: [],
  };
  try {
    let htmlString = productWithContent[url];
    if (!htmlString) {
      htmlString = await fetch(url).then((res) => res.text());
    }
    if (!htmlString) return res;
    // get variants info
    if (
      !htmlString.includes("var dataToReturn =") ||
      !htmlString.includes("return dataToReturn;")
    )
      return res;
    const indexStartCut = htmlString.indexOf("var dataToReturn =");
    const indexEndCut = htmlString.indexOf("return dataToReturn;");
    let dataString = htmlString
      .slice(indexStartCut, indexEndCut)
      .split(";")[0]
      .replace("var dataToReturn =", "")
      .trim();
    if (!dataString) return res;
    const getObjValue = (key, lastIndex) => {
      if (!dataString.includes(key)) return null;
      let valueStr = dataString.split(key)[1];
      let endCut = valueStr.indexOf(lastIndex) + lastIndex.length;
      valueStr = valueStr.slice(0, endCut).trim();
      if (valueStr.slice(-1) === ",") valueStr = valueStr.slice(0, -1);
      return JSON.parse(valueStr);
    };
    // get variant value
    const variantValues = getObjValue('"variationValues" :', "]},\n");
    for (const [key, values] of Object.entries(variantValues)) {
      res.variantItems.variationValues.push({
        slug: key,
        options: values,
      });
    }
    // get attribute
    const attrValues = getObjValue('"variationDisplayLabels" :', "},\n");
    for (const [key, values] of Object.entries(attrValues)) {
      res.variantItems.attributes.push({
        slug: key,
        label: values,
      });
    }
    // get asin Variation Values
    const dimensions = getObjValue('"dimensions" :', "],\n");
    const dimensionValues = getObjValue(
      '"dimensionValuesDisplayData" :',
      "]},\n",
    );
    const colorImages = getObjValue('"colorImages" :', "]},\n");
    if (!dimensionValues) return res;
    for (const asin in dimensionValues) {
      if (asin == asinCurrent) {
        for (const keyName of dimensions) {
          res.variantItem.push({
            option: keyName,
            value: dimensionValues[asin][0],
          });
        }
        continue;
      }
      let item = {
        asin,
        attributes: [],
        mockup: null,
      };
      let checkName = "";
      for (const keyName of dimensions) {
        if (keyName != "size_name") checkName += ` ${dimensionValues[asin][0]}`;
        item.attributes.push({
          slug: keyName,
          option: dimensionValues[asin][0],
        });
      }
      if (colorImages) {
        for (const keyColor in colorImages) {
          if (
            checkName.trim().replace(/\s/g, "").replace(/\\/g, "") ===
            keyColor.replace(/\s/g, "").replace(/\\/g, "")
          )
            if (colorImages[keyColor][0].hiRes)
              item.mockup = colorImages[keyColor][0].hiRes;
        }
      }
      if (!item.mockup && res.mockups.length) item.mockup = res.mockups[0];
      res.variantItems.asinVariationValues.push(item);
    }

    for (const attr of res.variantItems.attributes) {
      for (const v of res.variantItem) {
        if (attr.slug === v.option) v.option = attr.label;
      }
    }
  } catch (error) {}
  return res;
};

const getCustomImage = (data) => {
  const customImages = [];
  if (!data) return customImages;
  const { buyerImageUrlMap, customizationData: customDataString } = data;
  if (!buyerImageUrlMap || !customDataString) return customImages;
  const { children: customWraps } = JSON.parse(customDataString);
  if (!customWraps || !customWraps.length) return customImages;
  // get list custom image info
  const getImage = (customList) => {
    if (customList.type == "FlatContainerCustomization") {
      for (const flatItem of customList.children) {
        if (flatItem.type === "PlacementContainerCustomization")
          for (const item of flatItem.children) {
            if (item?.type === "ImageCustomization") {
              if (buyerImageUrlMap[item.identifier]) {
                customImages.push({
                  label: item.label,
                  img: buyerImageUrlMap[item.identifier],
                });
              }
            }
          }
      }
    }
  };
  for (const customWrap of customWraps) {
    if (customWrap.type == "FlatContainerCustomization") {
      getImage(customWrap);
    }
    if (customWrap.type === "PreviewContainerCustomization") {
      for (const previewItem of customWrap.children) {
        if (previewItem.type == "FlatContainerCustomization") {
          getImage(previewItem);
        }
      }
    }
  }
  return customImages;
};
// Hàm helper để mở hoặc cập nhật tab và chờ nó load xong
async function openAndEnsureTabReady(url, tabIdToUpdate = null) {
  return new Promise((resolve, reject) => {
      let targetTabId; // Khai báo ở đây để cả hai nhánh if/else đều dùng được
      const onUpdatedListener = (updatedTabId, changeInfo, tab) => {
          // Chỉ xử lý khi targetTabId đã được gán và khớp với updatedTabId
          if (targetTabId && updatedTabId === targetTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpdatedListener);
              clearTimeout(tabLoadTimeout);
              console.log(`[BG - openTab] Tab ${targetTabId} ready with URL: ${tab.url}`);
              resolve(tab);
          }
      };

      const tabLoadTimeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);
          reject(new Error(`Timeout loading tab for URL: ${url}`));
      }, 30000); // 30 giây timeout cho tab load

      chrome.tabs.onUpdated.addListener(onUpdatedListener); // Đăng ký listener trước khi action

      if (tabIdToUpdate) {
          targetTabId = tabIdToUpdate;
          console.log(`[BG - openTab] Updating tab ${targetTabId} to URL: ${url}`);
          chrome.tabs.update(tabIdToUpdate, { url, active: true }, (tab) => {
              if (chrome.runtime.lastError || !tab) {
                  clearTimeout(tabLoadTimeout);
                  chrome.tabs.onUpdated.removeListener(onUpdatedListener);
                  return reject(new Error(`Failed to update tab ${tabIdToUpdate} to ${url}: ${chrome.runtime.lastError?.message}`));
              }
              // Nếu tab đã complete ngay sau update (ví dụ cache), onUpdatedListener sẽ xử lý
              // Hoặc nếu không, onUpdatedListener sẽ chờ event 'complete'
          });
      } else {
          console.log(`[BG - openTab] Creating new tab for URL: ${url}`);
          chrome.tabs.create({ url, active: true }, (tab) => {
              if (chrome.runtime.lastError || !tab) {
                  clearTimeout(tabLoadTimeout);
                  chrome.tabs.onUpdated.removeListener(onUpdatedListener);
                  return reject(new Error(`Failed to create tab for ${url}: ${chrome.runtime.lastError?.message}`));
              }
              targetTabId = tab.id;
              // Nếu tab đã complete ngay sau create, onUpdatedListener sẽ xử lý
          });
      }
  });
}

// Hàm helper để gửi message và chờ một message phản hồi cụ thể (Promise-based)
function sendMessageAndPromiseResponse(tabId, messageToSend, dataToSend, expectedResponseMessage, expectedOrderId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
      let listener; // Sẽ được gán ở dưới
      const timeoutId = setTimeout(() => {
          if (listener) { // Kiểm tra listener tồn tại trước khi gỡ
              chrome.runtime.onMessage.removeListener(listener);
          }
          reject(new Error(`Timeout (${timeoutMs/1000}s) waiting for '${expectedResponseMessage}' for order ${expectedOrderId || 'any'} from tab ${tabId}`));
      }, timeoutMs);

      listener = (request, senderDetails, sendResponseFunc) => {
          if (senderDetails.tab && senderDetails.tab.id === tabId && request.message === expectedResponseMessage) {
              if (expectedOrderId && (!request.data || request.data.orderId !== expectedOrderId)) {
                  // console.log(`[BG - promise] Ignored '${expectedResponseMessage}' for wrong orderId. Expected: ${expectedOrderId}, Got: ${request.data?.orderId}`);
                  return false;
              }

              clearTimeout(timeoutId);
              chrome.runtime.onMessage.removeListener(listener);
              console.log(`[BG - promise] Received '${expectedResponseMessage}' for order ${expectedOrderId || 'any'} from tab ${tabId}:`, request.data);
              resolve(request.data);
              return false;
          }
          return false;
      };

      chrome.runtime.onMessage.addListener(listener);

      console.log(`[BG - promise] Sending '${messageToSend}' to tab ${tabId} for order ${dataToSend?.orderId || expectedOrderId || 'any'}`);
      // Giả sử hàm sendMessage của mày đã tồn tại và hoạt động đúng
      // Nó cần đảm bảo message được gửi tới content script trên tabId đó.
      sendMessage(tabId, messageToSend, dataToSend);
  });
}

// Hàm chính để xử lý update tracking cho nhiều đơn hàng
// async function runUpdateTrackingMain(ordersFromApi, initialSenderTabId, autoMode, domainToUse, apiKey) {
//   // apiKey có thể chưa dùng trực tiếp ở đây nhưng vẫn truyền vào cho giống handleSyncOrders
//   // và có thể dùng sau này nếu cần tương tác API MB bên trong vòng lặp mà không muốn gọi getMBApiKey() nhiều lần.

//   const UnshippedOrders = await new Promise(resolve => chrome.storage.local.get("UnshippedOrders", r => resolve(r.UnshippedOrders || [])));
//   let overallErrorMessage = null;

//   console.log(`[BG] Bắt đầu runUpdateTrackingMain với ${ordersFromApi.length} đơn hàng. Domain sử dụng: ${domainToUse}`);

//   for (const order of ordersFromApi) {
//       console.log(`[BG] Đang xử lý đơn hàng: ${order.orderId}`);
//       try {
//           // Bước 1: Chuẩn bị thông tin và gửi lệnh cho content script xử lý form
//           const isUnshipped = UnshippedOrders.includes(order.orderId);
//           const actionUrl = isUnshipped ?
//               `${domainToUse}/orders-v3/order/${order.orderId}/confirm-shipment` :
//               `${domainToUse}/orders-v3/order/${order.orderId}/edit-shipment`;
//           const formFillMessageType = isUnshipped ? "forceAddTracking" : "forceEditTracking";

//           console.log(`[BG] Order ${order.orderId} - Action URL: ${actionUrl}, Message Type: ${formFillMessageType}`);

//           let actionTab = await openAndEnsureTabReady(actionUrl);

//           const addedTrackingData = await sendMessageAndPromiseResponse(
//               actionTab.id,
//               formFillMessageType,
//               order,
//               "addedTrackingCode",
//               order.orderId
//           );

//           console.log(`[BG] Order ${order.orderId} - Form đã xử lý. Tracking code: '${addedTrackingData.trackingCode}'`);

//           // Bước 2: Mở tab chi tiết đơn hàng để xác minh
//           const verifyUrl = `${domainToUse}/orders-v3/order/${order.orderId}`;
//           console.log(`[BG] Order ${order.orderId} - Verify URL: ${verifyUrl}`);
//           let verifyTab = await openAndEnsureTabReady(verifyUrl, actionTab.id); // Có thể update tab cũ

//           // Bước 3: Gửi lệnh cho content script xác minh và chờ kết quả
//           const verificationResult = await sendMessageAndPromiseResponse(
//               verifyTab.id,
//               "verifyAddTracking",
//               { orderId: order.orderId, trackingCode: addedTrackingData.trackingCode },
//               "verifyAddTracking",
//               order.orderId
//           );

//           console.log(`[BG] Order ${order.orderId} - Kết quả xác minh:`, verificationResult);

//           // >>>>>>>>> ĐÓNG TAB verifyTab SAU KHI BƯỚC 3 HOÀN TẤT <<<<<<<<<<
//           if (verifyTab && verifyTab.id) {
//               const tabIdToClose = verifyTab.id; // Lưu ID lạiเผื่อ `verifyTab` bị thay đổi
//               console.log(`[BG] Order ${order.orderId} - Chuẩn bị đóng verifyTab (ID: ${tabIdToClose}).`);
//               try {
//                   await chrome.tabs.remove(tabIdToClose);
//                   console.log(`[BG] Order ${order.orderId} - Đã đóng verifyTab (ID: ${tabIdToClose}) thành công.`);
//               } catch (closeTabError) {
//                   console.warn(`[BG] Order ${order.orderId} - Lỗi khi đóng verifyTab (ID: ${tabIdToClose}): ${closeTabError.message}`);
//               } finally {
//                   // Đánh dấu là đã xử lý (hoặc cố gắng xử lý) việc đóng tab này
//                   // để khối catch lớn không cố đóng lại một tab không còn tồn tại hoặc đã được xử lý.
//                   if (actionTab && actionTab.id === tabIdToClose) {
//                       actionTab = null; // Nếu actionTab và verifyTab là một, actionTab cũng coi như đã xử lý.
//                   }
//                   verifyTab = null; // Quan trọng: set verifyTab về null.
//               }
//           }
//           // >>>>>>>>> KẾT THÚC PHẦN ĐÓNG TAB <<<<<<<<<<

//           // Bước 4: Xử lý kết quả xác minh
//           if (verificationResult && verificationResult.status === "success") {
//               const query = JSON.stringify({ orderId: order.orderId, trackingCode: addedTrackingData.trackingCode });
//               // Giả sử sendRequestToMB tự lấy apiKey nếu không được truyền
//               await sendRequestToMB("addedTrackingCode", null, query);
//               console.log(`[BG] Order ${order.orderId} - Đã cập nhật tracking lên MB thành công.`);
//               saveLog("trackingVerificationLog", {
//                   type: "Tracking Verification Success (Refactored)",
//                   date: new Date().toISOString(),
//                   orderId: order.orderId,
//                   trackingCode: addedTrackingData.trackingCode,
//                   verificationMessage: verificationResult.message
//               });
//           } else {
//               const errorMessage = verificationResult ? verificationResult.message : "Không có phản hồi xác minh hoặc phản hồi không hợp lệ.";
//               console.warn(`[BG] Order ${order.orderId} - Xác minh thất bại hoặc có lỗi: ${errorMessage}`);
//               saveLog("trackingVerificationLog", {
//                   type: "Tracking Verification Failed (Refactored)",
//                   date: new Date().toISOString(),
//                   orderId: order.orderId,
//                   trackingCode: addedTrackingData.trackingCode,
//                   error: errorMessage
//               });
//           }

//           await sleep(2000 + Math.random() * 1000);

//       } catch (error) {
//           console.error(`[BG] Lỗi nghiêm trọng khi xử lý đơn hàng ${order.orderId}: ${error.message}`, error.stack);
//           overallErrorMessage = error.message;
//           saveLog("trackingProcessingError", {
//               orderId: order.orderId,
//               error: error.message,
//               stack: error.stack // Log cả stack trace để dễ debug
//           });
//           // Cân nhắc có nên `break;` vòng lặp ở đây không nếu lỗi quá nghiêm trọng
//           await sleep(3000);
//       }
//   }

//   console.log("[BG] Đã xử lý xong tất cả đơn hàng trong runUpdateTrackingMain.");
//   if (initialSenderTabId) {
//       try {
//           // Kiểm tra xem tab có còn tồn tại không
//           const tabExists = await new Promise(resolve => {
//               chrome.tabs.get(initialSenderTabId, (tab) => {
//                   if (chrome.runtime.lastError || !tab) {
//                       resolve(false);
//                   } else {
//                       resolve(true);
//                   }
//               });
//           });

//           if (tabExists) {
//               await chrome.tabs.update(initialSenderTabId, { active: true });
//               console.log(`[BG] Đã quay lại tab ban đầu: ${initialSenderTabId}`);
//           } else {
//               console.warn(`[BG] Tab ban đầu ${initialSenderTabId} không còn tồn tại, không thể quay lại.`);
//           }
//       } catch (e) {
//           console.warn(`[BG] Lỗi khi cố gắng quay lại tab ban đầu ${initialSenderTabId}:`, e);
//       }

//       // Gửi message kết quả về cho tab gốc
//       // Hàm sendMessage tùy chỉnh của mày đã đóng gói đúng cấu trúc { message: "tên", data: payload } rồi.
//       console.log(`[BG] Gửi 'updateTracking' về tab ${initialSenderTabId} với data:`, { error: overallErrorMessage, autoMode });
//       sendMessage(initialSenderTabId, "updateTracking", { error: overallErrorMessage, autoMode: autoMode });
//       //                                                                                      ^^^^^^^^
//       //                                                                                      Đảm bảo biến autoMode này có giá trị đúng
//       //                                                                                      (nó được truyền vào runUpdateTrackingMain)
//   } else {
//       console.warn("[BG] Không có initialSenderTabId để gửi thông báo hoàn tất updateTracking.");
//   }
// }
async function runUpdateTrackingMain(ordersFromApi, initialSenderTabId, autoMode, domainToUse, apiKey) {
  const UnshippedOrders = await new Promise(resolve => chrome.storage.local.get("UnshippedOrders", r => resolve(r.UnshippedOrders || [])));
  let overallErrorMessage = null;
  let trackingTab = null; // Biến để giữ tab được tái sử dụng

  console.log(`[BG] Bắt đầu runUpdateTrackingMain với ${ordersFromApi.length} đơn hàng. Domain sử dụng: ${domainToUse}`);

  try {
      // Mở một tab duy nhất để thực hiện tất cả các tác vụ
      trackingTab = await openAndEnsureTabReady(`${domainToUse}/orders-v3`);
      
      for (const order of ordersFromApi) {
          console.log(`[BG] Đang xử lý đơn hàng: ${order.orderId} trên tab ${trackingTab.id}`);
          try {
              // Bước 1: Điều hướng đến trang action và điền form
              const isUnshipped = UnshippedOrders.includes(order.orderId);
              const actionUrl = isUnshipped 
                  ? `${domainToUse}/orders-v3/order/${order.orderId}/confirm-shipment` 
                  : `${domainToUse}/orders-v3/order/${order.orderId}/edit-shipment`;
              const formFillMessageType = isUnshipped ? "forceAddTracking" : "forceEditTracking";

              await openAndEnsureTabReady(actionUrl, trackingTab.id); // Tái sử dụng tab

              const addedTrackingData = await sendMessageAndPromiseResponse(
                  trackingTab.id,
                  formFillMessageType,
                  order,
                  "addedTrackingCode",
                  order.orderId
              );

              // Bước 2: Điều hướng đến trang chi tiết để xác minh
              const verifyUrl = `${domainToUse}/orders-v3/order/${order.orderId}`;
              await openAndEnsureTabReady(verifyUrl, trackingTab.id); // Tái sử dụng tab

              // Bước 3: Gửi lệnh xác minh và chờ kết quả
              const verificationResult = await sendMessageAndPromiseResponse(
                  trackingTab.id,
                  "verifyAddTracking",
                  { orderId: order.orderId, trackingCode: addedTrackingData.trackingCode },
                  "verifyAddTracking",
                  order.orderId
              );

              // Bước 4: Xử lý kết quả
              if (verificationResult && verificationResult.status === "success") {
                  const query = JSON.stringify({ orderId: order.orderId, trackingCode: addedTrackingData.trackingCode });
                  await sendRequestToMB("addedTrackingCode", apiKey, query);
              } else {
                  const errorMessage = verificationResult ? verificationResult.message : "Xác minh thất bại.";
                  console.warn(`[BG] Order ${order.orderId} - Lỗi: ${errorMessage}`);
              }
              await sleep(2000);

          } catch (error) {
              console.error(`[BG] Lỗi khi xử lý đơn hàng ${order.orderId}: ${error.message}`);
              overallErrorMessage = error.message;
              // Nếu có lỗi với một đơn hàng, ghi log và tiếp tục với đơn hàng tiếp theo
              saveLog("trackingProcessingError", { orderId: order.orderId, error: error.message });
              await sleep(3000);
          }
      }
  } catch (e) {
      console.error(`[BG] Lỗi nghiêm trọng trong runUpdateTrackingMain: ${e.message}`);
      overallErrorMessage = e.message;
  } finally {
      // **QUAN TRỌNG**: Đóng tab công việc sau khi hoàn tất hoặc gặp lỗi nghiêm trọng
      if (trackingTab && trackingTab.id) {
          console.log(`[BG] Đóng tab công việc tracking (ID: ${trackingTab.id})`);
          await chrome.tabs.remove(trackingTab.id).catch(err => console.warn("Lỗi khi đóng tab tracking:", err));
      }

      // Quay lại tab gốc và gửi thông báo kết quả
      if (initialSenderTabId) {
          try {
              await chrome.tabs.update(initialSenderTabId, { active: true });
          } catch (e) {
              console.warn(`[BG] Không thể quay lại tab gốc ${initialSenderTabId}:`, e);
          }
          sendMessage(initialSenderTabId, "updateTracking", { error: overallErrorMessage, autoMode: autoMode });
      }
  }
}
const handleSyncOrders = async (orders, options, apiKey, domain) => {
  const results = [];
  resetOrderInfo();
  if (!apiKey) apiKey = await getMBApiKey();
  stopProcess = false;
  const addMockups = {};
  for (let i = 0; i < orders.length; i++) {
    if (OrderInfo.locked) break;
    if (stopProcess) break;
    const order = orders[i];
    OrderInfo.orderId = order["id"];
    OrderInfo.locked = true;
    // const url = `${AMZDomain}/orders-v3/order/${order["id"]}`;
    const url = `${domain ? domain : AMZDomain}/orders-v3/order/${order["id"]}`;
    // chrome.tabs.update({ url }, (tab) => {
    //    if (tab?.id) {
    //       sendMessage(tab.id, "getOrderItemInfo", {
    //          order,
    //          label: `Syncing orders: ${i + 1}/${orders.length}`,
    //       });
    //    } else if (activeTabId) {
    //       chrome.tabs.get(activeTabId, function (tabInner) {
    //          if (tabInner) {
    //             chrome.tabs.update(
    //                activeTabId || tabInner?.id,
    //                { url },
    //                (tab) => {
    //                   sendMessage(tab.id, "getOrderItemInfo", {
    //                      order,
    //                      label: `Syncing orders: ${i + 1}/${orders.length}`,
    //                   });
    //                },
    //             );
    //          }
    //       });
    //    }
    // });

    function redirectToOrderDetail(tabs) {
      let tab = (tabs || []).find((item) => item?.active);
      if (tab?.id) {
        chrome.tabs.update(tab.id, { url }, (tabInner) => {
          if (tabInner?.id) {
            sendMessage(tabInner.id, "getOrderItemInfo", {
              order,
              label: `Syncing orders: ${i + 1}/${orders.length}`,
            });
          }
        });
      } else if (activeTabId) {
        chrome.tabs.get(activeTabId, function (tabInner) {
          if (tabInner) {
            chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
              sendMessage(tab.id, "getOrderItemInfo", {
                order,
                label: `Syncing orders: ${i + 1}/${orders.length}`,
              });
            });
          }
        });
      }
    }

    await redirectToNewURL(redirectToOrderDetail);
    // wait info order
    let countSleep = 0;
    while (true) {
      if ((OrderInfo.order && OrderInfo.shipping) || countSleep == 30) break;
      countSleep++;
      await sleep(1000);
    }
    if (!OrderInfo.order || !OrderInfo.shipping) {
      sendToContentScript("syncOrderToMB", {
        data: false,
        error: "Could not get order info or shipping info.",
      });
      await sleep(1000);
      resetOrderInfo();
      continue;
    }
    const orderInfo = await getOrderInfo(OrderInfo.order, OrderInfo.shipping);
    if (!orderInfo) {
      sendToContentScript("syncOrderToMB", {
        data: false,
        error: "Could not get order info.",
      });
      await sleep(1000);
      resetOrderInfo();
      continue;
    }
    // check all item are same product
    let isSameProduct = orderInfo.items.every(
      (item, i, items) => item.asin === items[0].asin,
    );
    let customItems = [];
    for (const item of orderInfo.items) {
      // check has image per order item
      if (!item.mockup) {
        if (orderInfo.items.length == 1 || isSameProduct) {
          item.mockup = [order["img"]];
        } else {
          // check the same product that has image
          if (addMockups[item.asin]) {
            item.mockup = addMockups[item.asin];
          } else {
            item.mockup = [
              await getProductImg(
                `https://www.amazon.com/gp/product/${item.asin}`,
              ),
            ];
          }
        }
      }
      addMockups[item.asin] = item.mockup;
      // check order has custom info
      if (!item.isPersonalized || item.personalized.length === 0) continue;
      let isCustomImage = false;
      for (const personal of item.personalized) {
        if (!personal || !personal.name) continue;
        if (isCustomImgLabel(personal.name) || isImage(personal.value)) {
          isCustomImage = true;
          break;
        }
      }
      customItems.push({
        orderId: order.id,
        itemId: item.lineId,
        // url: `${AMZDomain}/gestalt/fulfillment/index.html?orderId=${orderInfo.orderId}&orderItemId=${item.lineId}`,
        url: `${
          domain ? domain : AMZDomain
        }/gestalt/fulfillment/index.html?orderId=${
          orderInfo.orderId
        }&orderItemId=${item.lineId}`,
        hasCustomImg: isCustomImage,
      });
    }
    if (customItems.length > 0) {
      resetCustomOrder();
      for (const custom of customItems) {
        if (CustomOrder.locked) break;
        CustomOrder.locked = true;
        CustomOrder.orderId = orderInfo.orderId;
        CustomOrder.itemId = custom.itemId;

        chrome.tabs.update({ url: custom.url }, (tab) => {
          if (tab?.id) {
            sendMessage(tab.id, "getOrderItemInfo", {
              order,
              label: `Syncing orders: ${i + 1}/${orders.length}`,
            });
          } else {
            chrome.tabs.get(activeTabId, function (tabInner) {
              if (tabInner) {
                chrome.tabs.update(
                  activeTabId || tabInner?.id,
                  { url: custom.url },
                  (tab) => {
                    sendMessage(tab?.id, "getOrderItemInfo", {
                      order,
                      label: `Syncing orders: ${i + 1}/${orders.length}`,
                    });
                  },
                );
              }
            });
          }
        });
        // wait custom info
        let countSleep = 0;
        while (true) {
          if (CustomOrder.personalizedInfo || countSleep == 30) break;
          countSleep++;
          await sleep(1000);
        }
        const handelErr = async () => {
          sendToContentScript("syncOrderToMB", {
            data: false,
            error: "Could not get personalized info.",
          });
          await sleep(3000);
          resetCustomOrder();
        };
        if (!CustomOrder.personalizedInfo) {
          handelErr();
          continue;
        }
        if (
          !CustomOrder.personalizedInfo ||
          !CustomOrder.personalizedInfo.fulfillmentData
        ) {
          handelErr();
          continue;
        }
        const { customizationData, previewSnapshotUrlMap } =
          CustomOrder.personalizedInfo.fulfillmentData;
        // get alls custom field
        const customFiled = [];
        const { children: customWraps } = JSON.parse(customizationData);
        let imgPreviewId = null;
        if (customWraps)
          for (let c = 0; c < customWraps.length; c++) {
            const customWrap = customWraps[c];
            if (
              customWrap.children &&
              customWrap.type == "FlatContainerCustomization"
            ) {
              for (const field of customWrap.children) {
                if (field && field.label) customFiled.push(field.label);
              }
            }
            if (customWrap.type === "PreviewContainerCustomization") {
              if (c == 0) {
                imgPreviewId = customWrap.identifier;
              }
              for (const previewItem of customWrap.children) {
                if (previewItem.type == "FlatContainerCustomization")
                  for (const field of customWrap.children) {
                    if (field && field.label) customFiled.push(field.label);
                  }
              }
            }
          }
        // check order miss custom field
        if (customFiled.length)
          for (const item of orderInfo.items) {
            if (item.lineId != custom.itemId) continue;
            const orderField = [];
            for (const personal of item.personalized) {
              orderField.push(personal.name);
            }
            for (const field of customFiled)
              if (!orderField.includes(field))
                item.personalized.push({
                  name: field,
                  value: "",
                });
          }
        // get personalized preview image
        if (previewSnapshotUrlMap) {
          for (const item of orderInfo.items) {
            if (item.lineId != custom.itemId) continue;
            if (imgPreviewId && previewSnapshotUrlMap[imgPreviewId]) {
              item.personalizedPreview = previewSnapshotUrlMap[imgPreviewId];
            } else {
              const previewImgs = Object.values(previewSnapshotUrlMap);
              if (previewImgs.length) {
                item.personalizedPreview = previewImgs[0];
              }
            }
          }
        }
        // get custom image
        if (custom.hasCustomImg) {
          const customImages = getCustomImage(
            CustomOrder.personalizedInfo.fulfillmentData,
          );
          if (customImages.length)
            // map custom image info into order item
            for (const item of orderInfo.items) {
              if (item.lineId != custom.itemId) continue;
              for (const personal of item.personalized) {
                for (const customImgItem of customImages) {
                  if (personal.name === customImgItem.label) {
                    personal.value = customImgItem.img;
                    break;
                  }
                }
              }
            }
        }
        resetCustomOrder();
      }
      resetCustomOrder();
    }
    if (options) {
      const {
        isAlwayMapping,
        isMultiProduct,
        isSplitOrder,
        numberOrdersSplit,
        qtyPreItem,
        applyAllItems,
      } = options;
      if (isAlwayMapping)
        orderInfo.items.forEach((i) => (i.alwayMapping = true));
      if (isMultiProduct)
        orderInfo.items.forEach(
          (i) => (i.allVariations.asinVariationValues = []),
        );
      if (isSplitOrder) {
        const newItems = [];

        // prev split first item => improve split all items via `applyAllItems` value
        if (applyAllItems) {
          for (let originItem of orderInfo.items) {
            originItem.qty = qtyPreItem;
            newItems.push(originItem);
            for (let i = 1; i < numberOrdersSplit; i++) {
              const newItem = { ...originItem };
              newItem.lineId = newItem.lineId + `-${i + 1}`;
              newItem.itemDiscountTotal = 0;
              newItem.itemShippingTaxTotal = 0;
              newItem.itemShippingTotal = 0;
              newItem.itemMarketplaceFee = 0;
              newItem.tax = 0;
              newItem.itemTaxTotal = 0;
              newItem.itemTotal = 0;
              newItem.itemSubtotal = 0;
              newItems.push(newItem);
            }
            orderInfo.items = newItems;
          }
        } else {
          const originItem = orderInfo.items[0];
          originItem.qty = qtyPreItem;
          newItems.push(originItem);
          for (let i = 1; i < numberOrdersSplit; i++) {
            const newItem = { ...originItem };
            newItem.lineId = newItem.lineId + `-${i + 1}`;
            newItem.itemDiscountTotal = 0;
            newItem.itemShippingTaxTotal = 0;
            newItem.itemShippingTotal = 0;
            newItem.itemMarketplaceFee = 0;
            newItem.tax = 0;
            newItem.itemTaxTotal = 0;
            newItem.itemTotal = 0;
            newItem.itemSubtotal = 0;
            newItems.push(newItem);
          }
          orderInfo.items = newItems;
        }
      }
    }

    orderInfo.items = (orderInfo.items || []).map((item) => {
      const { mockup } = item || {};
      const newMockup = (mockup || []).map((s) => {
        const pt = /\.\_.*\_\./gi;
        return (s || "").replace(pt, ".");
      });

      return {
        ...item,
        mockup: newMockup,
      };
    });

    const fieldValues = [];
    const filePT = /https?:\/\/gestalt/gi;
    for (let i = 0; i < orderInfo.items.length; i++) {
      const item = orderInfo.items[i];
      if (!item || typeof item !== "object") continue;

      const key = "__key" + i;
      if (
        item.personalizedPreview &&
        !!item.personalizedPreview.match(filePT)
      ) {
        fieldValues.push({
          name: `${key}_personalizedPreview`,
          fileUrl: item.personalizedPreview,
        });
      }

      if (item.personalized?.length > 0) {
        for (let p of item.personalized) {
          if (!p || !p.value || !p.value.match(filePT)) continue;
          fieldValues.push({ name: `${key}_${p.name}`, fileUrl: p.value });
        }
      }
    }

    console.log("fieldValues", fieldValues);
    if (fieldValues.length > 0) {
      const fileDownloaded = await downloadFiles(fieldValues, apiKey);

      if (fileDownloaded.length > 0) {
        const ob = fileDownloaded.reduce((acc, cur) => {
          acc = { ...acc, ...cur };
          return acc;
        }, {});

        for (let i = 0; i < orderInfo.items.length; i++) {
          let item = orderInfo.items[i];
          if (!item || typeof item !== "object") continue;

          const key = "__key" + i;
          const personalizedPreview = ob[`${key}_personalizedPreview`];

          const newPersonalized = [];
          for (let p of item.personalized) {
            const newVal = ob[`${key}_${p.name}`];
            const newP = p;
            if (newVal) {
              newP.value = newVal;
            }

            newPersonalized.push(newP);
          }

          item = {
            ...item,
            personalizedPreview,
            personalized: newPersonalized,
          };

          orderInfo.items[i] = item;
        }
      }
    }

    // sync order to MB
    let query = JSON.stringify({
        input: orderInfo
    });
    const result = await sendRequestToMB("createAmazonOrder", apiKey, query);
    const messResp = { data: true, error: null };
    if (result.error) messResp.error = result.error;
    else if (result.errors?.length) messResp.error = result.errors[0].message;
    sendToContentScript("syncOrderToMB", messResp);
    resetOrderInfo();
    await sleep(200);
  }
  stopProcess = false;
  // back to home page
  const url = `${domain ? domain : AMZDomain}/orders-v3?page=1`;
  //  chrome.tabs.update(
  //     {
  //        // url: `${AMZDomain}/orders-v3?page=1`,
  //        url,
  //     },
  //     (tab) => {
  //        if (!tab && activeTabId) {
  //           chrome.tabs.get(activeTabId, function (tabInner) {
  //              if (tabInner) {
  //                 chrome.tabs.update(activeTabId || tabInner?.id, {
  //                    url,
  //                 });
  //              }
  //           });
  //        }
  //     },
  //  );

  function redirectToOrder(tabs) {
    let tab = (tabs || []).find((item) => item?.active);
    if (tab?.id) {
      chrome.tabs.update(
        tab.id,
        {
          url,
        },
        (tab) => {
          if (!tab && activeTabId) {
            chrome.tabs.get(activeTabId, function (tabInner) {
              if (tabInner) {
                chrome.tabs.update(activeTabId || tabInner?.id, {
                  url,
                });
              }
            });
          }
        },
      );
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, { url });
        }
      });
    }
  }

  await redirectToNewURL(redirectToOrder);
  return results;
};

const handleUpdateGrandTotal = async (orderIds, domain) => {
  if (!orderIds || !orderIds.length) return;
  let apiKey = await getMBApiKey();
  if (!apiKey) apiKey = await getMBApiKey();

  if (!apiKey) return;
  resetOrderGrandTotal();
  stopProcess = false;
  let countTemporaryStop = 0;
  for (let i = 0; i < orderIds.length; i++) {
    if (OrderGrandTotal.locked) break;
    if (stopProcess) break;
    countTemporaryStop++;
    const orderId = orderIds[i];
    OrderGrandTotal.locked = true;
    OrderGrandTotal.orderId = orderId;
    // const url = `${AMZDomain}/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;
    const url = `${
      domain ? domain : AMZDomain
    }/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;
    chrome.tabs.update({ url }, (tab) => {
      if (tab?.id) {
        sendMessage(tab.id, "getGrandTotal", {
          orderId,
          label: `Updating grand totals: ${i + 1}/${orderIds.length}`,
        });
      } else if (activeTabId) {
        chrome.tabs.get(activeTabId, function (tabInner) {
          if (tabInner) {
            chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
              sendMessage(tab.id, "getGrandTotal", {
                orderId,
                label: `Updating grand totals: ${i + 1}/${orderIds.length}`,
              });
            });
          }
        });
      }
    });
    // wait info order
    let countSleep = 0;
    while (true) {
      if (OrderGrandTotal.isListed || countSleep == 20) break;
      countSleep++;
      await sleep(1000);
    }
    if (!OrderGrandTotal.isListed || OrderGrandTotal.grandTotal <= 0) {
      await sleep(3000);
      resetOrderGrandTotal();
      continue;
    }
    // sync order grand total to MB
    let query = JSON.stringify({
      query: `mutation{
            updateGrandTotal(orderId: "${OrderGrandTotal.orderId}", grandTotal: ${OrderGrandTotal.grandTotal}, marketplaceFee: ${OrderGrandTotal.marketplaceFee})}`,
    });
    const result = await sendRequestToMB(null, apiKey, query);
    resetOrderGrandTotal();
    if (countTemporaryStop == 10) {
      await sleep(1000 * 15);
      countTemporaryStop = 0;
    } else await sleep(1000 * 3);
  }
  stopProcess = false;
  // back to home page
  chrome.tabs.update({
    // url: `${AMZDomain}/orders-v3?page=1`,
    url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
  });
  return;
};

const handleUpdateGrandTotalImpl = async ({
  orderId,
  index,
  len,
  domain,
  countTemporaryStop,
  apiKey,
}) => {
  if (OrderGrandTotal.locked) return;
  if (stopProcess) return;

  countTemporaryStop++;
  OrderGrandTotal.locked = true;
  OrderGrandTotal.orderId = orderId;

  const url = `${
    domain ? domain : AMZDomain
  }/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;

  const dataSendMessage = {
    orderId,
    label: `Updating grand totals: ${index + 1}/${len}`,
  };

  function redirectToOrderDetail(tabs) {
    let tab = (tabs || []).find((item) => item?.active);
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url }, (tabInner) => {
        sendMessage(tabInner?.id, "getGrandTotal", dataSendMessage);
      });
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
            sendMessage(tab.id, "getGrandTotal", dataSendMessage);
          });
        }
      });
    }
  }

  await redirectToNewURL(redirectToOrderDetail);
  // wait info order
  let countSleep = 0;
  while (true) {
    if (OrderGrandTotal.isListed || countSleep == 10) break;
    countSleep++;
    await sleep(1000);
  }
  if (!OrderGrandTotal.isListed || OrderGrandTotal.grandTotal <= 0) {
    await sleep(2000);
    resetOrderGrandTotal();
    return;
  }

  let query = JSON.stringify({
    query: `mutation{
         updateGrandTotal(orderId: "${OrderGrandTotal.orderId}", grandTotal: ${OrderGrandTotal.grandTotal}, marketplaceFee: ${OrderGrandTotal.marketplaceFee})}`,
  });

  await sendRequestToMB(null, apiKey, query);
  resetOrderGrandTotal();

  if (countTemporaryStop == 10) {
    await sleep(1000 * 10);
    countTemporaryStop = 0;
  } else await sleep(1000 * 3);

  return;
};

async function* handleUpdateGrandTotalGen(orderIds, domain, apiKey) {
  let countTemporaryStop = 0;
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];
    yield await handleUpdateGrandTotalImpl({
      orderId,
      index: i,
      len: orderIds.length,
      domain,
      countTemporaryStop,
      apiKey,
    });
    // Reset OrderGrandTotal.locked after each iteration 
    // to allow processing of the next order
    resetOrderGrandTotal();
  }
}

const handleUpdateGrandTotal_NEW = async (orderIds, domain) => {
  if (!orderIds || !orderIds.length) return;
  let apiKey = await getMBApiKey();
  if (!apiKey) apiKey = await getMBApiKey();

  if (!apiKey) return;
  resetOrderGrandTotal();
  stopProcess = false;

  for await (const _order of handleUpdateGrandTotalGen(
    orderIds,
    domain,
    apiKey,
  )) {
    console.log("_order:", _order);
  }

  stopProcess = false;
  // back to home page
  // chrome.tabs.update({
  //    url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
  // });

  function updateFirstTab(tabs) {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.update(tabs[0].id, {
        active: true,
        url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
      });
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, {
            url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
          });
        }
      });
    }
  }

  let querying = chrome.tabs.query({ currentWindow: true });
  querying.then(updateFirstTab);

  return;
};

// message from `content_script`
chrome.runtime.onMessage.addListener(async (req) => {
  const { message, data, endpoint, sender } = req || {};
  if (sender !== "OMG") return;
  switch (message) {
    case "response":
      // Capture merchant ID from "get-merchant-marketplaces-for-partner-account"
      const mbApiKey = await getMBApiKey();
      if (!mbApiKey) return;
      if (!data) break;
      if (endpoint.includes("/orders-api/order/")) {
        const { order } = data;
        if (!order || order["amazonOrderId"] != OrderInfo.orderId) return;
        OrderInfo.order = order;
        saveLog("orderLog - inject js", { type: "Order Information", data: order });
      }

      if (endpoint.includes("/orders-st/resolve")) {
        if (!data || !data[OrderInfo.orderId]) return;
        OrderInfo.shipping = data[OrderInfo.orderId].address;
      }
      // capture order grand totals
      if (
        endpoint.includes("payments/api/events-view") &&
        endpoint.includes(OrderGrandTotal.orderId)
      ) {
        OrderGrandTotal.isListed = true;
        if (!data) return;
        if (!data.tableRows || !data.tableRows.length) {
          OrderGrandTotal.grandTotal = -1;
          OrderGrandTotal.marketplaceFee = -1;
          return;
        }
        for (const row of data.tableRows) {
          if (row.tableCells?.length) {
            for (const item of row.tableCells) {
              if (item.columnIdentifier === "TOTAL") {
                let grandTotals = item.value.linkBody.currency.amount;
                if (grandTotals) OrderGrandTotal.grandTotal = grandTotals;
              }
              if (item.columnIdentifier === "FEES_TOTAL") {
                let marketFee = item.value.currency.amount;
                if (marketFee < 0) marketFee = marketFee * -1;
                if (marketFee >= 0) OrderGrandTotal.marketplaceFee = marketFee;
              }
            }
          }
        }
      }
      // capture personalized info
      if (endpoint.includes("/gestalt/ajax/fulfillment/init")) {
        if (activeTabId) {
          sendMessage(activeTabId, "syncFile", "");
        }
        if (
          endpoint.includes(CustomOrder.orderId) &&
          endpoint.includes(CustomOrder.itemId)
        ) {
          if (!data) return;
          CustomOrder.personalizedInfo = data;
        }
      }

      break;
    default:
      break;
  }
});

chrome.runtime.onInstalled.addListener(openHomePage);

function getRealTime(dateStr) {
  const myDate = new Date(parseInt(dateStr));
  var pstDate = myDate.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
  });

  // const formatVal = (val) => {
  //   val = String(val);
  //   if (val.length === 1) {
  //     val = "0" + val;
  //   }
  //   return val;
  // };

  // const [T1, T2] = pstDate.split(/,/).map((i) => i.trim());
  // let [mo, d, y] = T1.split(/\//g).map((i) => formatVal(i));
  // let [h, m, s] = T2.split(/\:/g).map((i) => formatVal(i));
  // [s] = s.split(" ");
  // const pt = /PM/gi;
  // if (!!pstDate.match(pt)) {
  //   h = parseInt(h) + 12;
  //   if (h >= 24) {
  //     h = h - 24;
  //     d = parseInt(d) + 1;
  //     if (d == 32) {
  //       mo = parseInt(mo) + 1;
  //       d = 1;
  //     }
  //   }
  // }

  // h = formatVal(h);
  // m = formatVal(m);
  // s = formatVal(s);
  // mo = formatVal(mo);
  // d = formatVal(d);

  // const result = `${[y, mo, d].join("-")}T${[h, m, s].join(":")}.000Z`;
  const result = new Date(pstDate + " PDT").toISOString();
  return result;
}

// V2
((data) => {
  try {
    const { chrome } = data;

    chrome.runtime.onInstalled.addListener(async () => {
      //  chrome.storage.local.clear(function (...args) {
      //    var error = chrome.runtime.lastError;
      //    if (error) {
      //      console.error(error);
      //    }
      //    // do something more
      //  });

      chrome.storage.local.get(["_mb_auto", "_mb_auto_key"], function () {
        chrome.storage.local.remove(
          ["_mb_auto", "_mb_auto_key"],
          function () {},
        );
        var error = chrome.runtime.lastError;
        if (error) {
          console.error(error);
        }
      });

      const script = {
        id: "inject",
        js: ["inject/inject.js"],
        matches: ["<all_urls>"],
        runAt: "document_start",
        world: "MAIN",
      };

      await chrome.scripting
        .unregisterContentScripts({ ids: [script.id] })
        .catch(() => {});

      await chrome.scripting.registerContentScripts([script]).catch(() => {});
      await chrome.storage.local.set({ omgActive: true });
    });
  } catch (e) {}
})({ chrome });
// Remove this line since we're calling openHomePage in the onInstalled listener above
// chrome.runtime.onInstalled.addListener(openHomePage);

const detectCarrierCode = (tracking = "") => {
  tracking = String(tracking).trim();
  const trackingLen = tracking.length;
  if (tracking.startsWith("RS")) {
    return "deutsche-post";
  }
  if (tracking.startsWith("LG")) {
    return "royal-mail";
  }
  if (tracking.startsWith("92")) {
    return "usps";
  }

  if (tracking.startsWith("420") && trackingLen === 34) {
    return "usps";
  }

  const allowedString = [
    "GM",
    "LX",
    "RX",
    "UV",
    "CN",
    "SG",
    "TH",
    "IN",
    "HK",
    "MY",
    "42",
    "92",
  ];
  if (tracking.length < 2) {
    return "";
  }
  tracking = tracking.toUpperCase();
  const start = tracking.slice(0, 2);
  if (tracking.startsWith("1Z") || start.includes("80")) {
    return "ups";
  }
  if (tracking.startsWith("303")) {
    return "4px";
  }
  if (
      (start === "94" || start === "93" || start === "92") &&
      tracking.length !== 10
  ) {
    return "usps";
  }
  if (allowedString.includes(start)) {
    if (tracking.length > 12) {
      return "dhlglobalmail";
    }
  }
  if (start === "UE" || start === "UF") {
    return "yanwen";
  }
  if (start === "SF") {
    return "sfb2c";
  }
  if (start === "61" || (start === "77" && tracking.length == 12)) {
    return "fedex";
  }
  if (start === "23") {
    return "japan-post";
  }
  if (start === "YT") {
    return "yunexpress";
  }
  if (start === "US") {
    return "jetlogistic";
  }
  if (
      ["82", "69", "30", "75"].includes(start) ||
      tracking.length === 10 ||
      tracking.length === 8
  ) {
    return "dhl";
  }
  return "usps";
};

const detectCarrier = (carrierCode = "") => {
  switch (carrierCode) {
    case "4px":
      return "4PX";
    case "yanwen":
      return "Yanwen";
    case "sfb2c":
      return "SF Express";
    case "fedex":
      return "FedEx";
    case "usps":
      return "USPS";
    case "ups":
      return "UPS";
    case "yunexpress":
      return "Yun Express";
    case "dhl":
      return "DHL";
    case "china-ems":
      return "China Post";
    case "dhlglobalmail":
    case "dhl_ecommerce":
      return "DHL eCommerce";
    case "dhl_express":
      return "DHL Express";
    case "xyex":
      return "XYEX";
    default:
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "runDownloadAdsReports") {
    console.log("Nhận yêu cầu tải báo cáo quảng cáo thủ công từ UI");
    globalDomain = request.domain || "https://sellercentral.amazon.com";
    
    try {
      if (extendedLogSystem) {
        extendedLogSystem.info('AdsReports', 'Bắt đầu quá trình tải báo cáo quảng cáo theo yêu cầu thủ công');
      }
    } catch (logError) {
      console.error("Logging error:", logError);
    }
    
    // Gửi thông báo đang tải đến tab hiện tại
    if (sender.tab && sender.tab.id) {
      sendMessage(sender.tab.id, "downloadingAdsReports", {
        label: `Đang tải báo cáo quảng cáo...`,
      });
    }
    
    // Sử dụng Promise để đảm bảo các thao tác bất đồng bộ được thực hiện đúng thứ tự
    (async () => {
      try {
        // Lấy API key để dùng trong URL
        const merchantId = await getMBApiKey();
        console.log("Sử dụng merchantId cho URL báo cáo:", merchantId);
        
        try {
          if (extendedLogSystem) {
            extendedLogSystem.info('AdsReports', 'Sử dụng merchantId cho URL báo cáo', { merchantId });
          }
        } catch (logError) {
          console.error("Logging error:", logError);
        }
        
        // URL đến trang báo cáo quảng cáo
        const reportsUrl = `https://advertising.amazon.com/reports/ref=xx_perftime_dnav_xx?merchantId=${merchantId}&locale=en_US&ref=RedirectedFromSellerCentralByRoutingService&entityId=ENTITY2G3AJUF27SG3C`;
        
        // Tạo tab mới thay vì cập nhật tab hiện tại
        chrome.tabs.create({ url: reportsUrl, active: true }, async (newTab) => {
          if (!newTab || !newTab.id) {
            const errorMsg = "Không thể tạo tab mới cho báo cáo quảng cáo";
            console.error(errorMsg);
            
            try {
              if (extendedLogSystem) {
                extendedLogSystem.error('AdsReports', errorMsg);
              }
            } catch (logError) {
              console.error("Logging error:", logError);
            }
            
            // Thông báo lỗi trên tab hiện tại
            if (sender.tab && sender.tab.id) {
              sendMessage(sender.tab.id, "downloadAdsReports", { 
                error: errorMsg
              });
            }
            return;
          }
          
          // Lưu ID của tab báo cáo
          const reportTabId = newTab.id;
          
          // Đợi trang báo cáo tải hoàn tất
          await new Promise(resolve => {
            let listener = function(tabId, changeInfo) {
              if (tabId === reportTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            
            // Thêm timeout phòng trường hợp tab không tải hoàn tất
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }, 30000); // 30 giây timeout
          });
          
          // Thêm độ trễ ngắn để đảm bảo nội dung đã tải
          await sleep(3000);
          
          // Thực hiện script để tìm và tải xuống báo cáo
          chrome.scripting.executeScript({
            target: { tabId: reportTabId },
            function: async () => {
              // Hàm đợi ngắn hơn
              const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
              
              // Tạo tên thư mục dựa trên ngày hiện tại (DD-MM-YYYY)
              const today = new Date();
              const day = String(today.getDate()).padStart(2, '0');
              const month = String(today.getMonth() + 1).padStart(2, '0');
              const year = today.getFullYear();
              const folderName = `${day}-${month}-${year}`;
              
              // Phương pháp tìm nút tải xuống hiệu quả hơn
              const findDownloadButtons = () => {
                // Trực tiếp tìm các liên kết tải xuống dựa trên URL
                const buttons = Array.from(document.querySelectorAll('a[href*="/download-report/"]'));
                console.log(`Tìm thấy ${buttons.length} nút tải xuống`);
                return buttons;
              };
              
              // Tìm tất cả các nút tải xuống
              let downloadButtons = findDownloadButtons();
              
              // Nếu không tìm thấy nút tải, thử một lần nữa sau một khoảng thời gian ngắn
              if (downloadButtons.length === 0) {
                await wait(2000);
                downloadButtons = findDownloadButtons();
              }
              
              console.log(`Tìm thấy ${downloadButtons.length} nút tải xuống để xử lý`);
              
              let successCount = 0;
              const reportNames = [];
              const downloadUrls = [];
              
              // Thu thập URL tải xuống và tên báo cáo
              downloadButtons.forEach((button, index) => {
                try {
                  // Tìm tên báo cáo từ cùng hàng
                  let reportName = "Báo cáo " + (index + 1);
                  try {
                    // Tìm kiếm theo nhiều selector để tăng khả năng tìm thấy tên báo cáo
                    const parentRow = button.closest('.ag-row, tr, [role="row"]');
                    if (parentRow) {
                      const reportLink = parentRow.querySelector('a.sc-fqkvVR, a, .cell-value, td');
                      if (reportLink) {
                        reportName = reportLink.textContent.trim();
                      }
                    }
                  } catch (e) {
                    console.error("Lỗi lấy tên báo cáo:", e);
                  }
                  
                  reportNames.push(reportName);
                  // Lưu URL tải xuống để gửi về background script xử lý
                  downloadUrls.push({
                    url: button.href,
                    reportName: reportName
                  });
                } catch (error) {
                  console.error(`Lỗi xử lý nút ${index + 1}:`, error);
                }
              });
              
              // Trả về dữ liệu URL và tên báo cáo để background script xử lý
              return { 
                downloadUrls,
                reportNames,
                folderName
              };
            }
          }, async (results) => {
            if (!results || results.length === 0 || !results[0].result) {
              // Thông báo lỗi nếu không tìm thấy kết quả
              if (sender.tab && sender.tab.id) {
                sendMessage(sender.tab.id, "downloadAdsReports", { 
                  error: "Không thể tìm thấy báo cáo để tải xuống" 
                });
              }
              
              // Đóng tab báo cáo
              try {
                chrome.tabs.remove(reportTabId);
              } catch (err) {
                console.error("Lỗi khi đóng tab báo cáo:", err);
              }
              return;
            }
            
            const { downloadUrls, reportNames, folderName } = results[0].result;
            let successCount = 0;
            
            // Tải xuống từng báo cáo sử dụng chrome.downloads.download API
            for (let i = 0; i < downloadUrls.length; i++) {
              const { url, reportName } = downloadUrls[i];
              try {
                  // 1. Fetch file content as a Blob
                  const response = await fetch(url);
                  if (!response.ok) {
                      throw new Error(`Failed to fetch report ${reportName}: ${response.statusText}`);
                  }
                  const fileBlob = await response.blob();

                  // 2. Create FormData to send
                  const formData = new FormData();
                  formData.append('report_file', fileBlob, reportName); // Gửi file với tên gốc
                  formData.append('merchant_id', merchantId);

                  // 3. Upload to your PHP server
                  const uploadResponse = await fetch(UPLOAD_HANDLER_URL, {
                      method: 'POST',
                      body: formData,
                  });

                  const uploadResult = await uploadResponse.json();

                  if (uploadResult.status === 'success') {
                      successCount++;
                      uploadedReportNames.push(reportName);
                      console.log(`Successfully uploaded: ${reportName}`);
                  } else {
                      throw new Error(`Server error for ${reportName}: ${uploadResult.message}`);
                  }
              } catch (error) {
                  console.error(`Error processing report #${i + 1} (${reportName}):`, error);
                  // Thông báo lỗi cho file cụ thể nếu cần
              }
              await sleep(500); // Thêm độ trễ nhỏ giữa các lần upload
          }
            
            // Thông báo kết quả
            let data = {
              successCount: successCount,
              reportNames: uploadedReportNames,
              folderPath: `reports/${folderName}/ (trên server)`
          };
            
            // Nếu có báo cáo được tải xuống, hiển thị chi tiết tên các báo cáo
            if (data.reportNames.length > 0) {
              if (data.reportNames.length > 3) {
                 const firstThree = data.reportNames.slice(0, 3).join(", ");
                 data.reportDetails = `${firstThree} và ${data.reportNames.length - 3} báo cáo khác`;
             } else {
                 data.reportDetails = data.reportNames.join(", ");
             }
         }
            
            // Thông báo kết quả cho người dùng
            sendMessage(sender.tab.id, "downloadAdsReports", {
              ...data,
              message: `Đã tải ${successCount} báo cáo lên server vào thư mục: ${data.folderPath}`
          });
            
            // Lưu thông tin về thư mục tải xuống vào storage để có thể sử dụng sau này
            chrome.storage.local.set({ 
              lastReportDownload: {
                date: new Date().toISOString(),
                folderPath: `reports/${folderName}/`,
                count: downloadUrls.length
              }
            });
            try {
              console.log(`[Ads Report] Tác vụ hoàn tất, đang đóng tab báo cáo ID: ${reportTabId}`);
              chrome.tabs.remove(reportTabId);
          } catch (err) {
              console.error("Lỗi khi đóng tab báo cáo:", err);
          }
            // Đóng tab báo cáo và quay lại trang orders
            // try {
            //   chrome.tabs.remove(reportTabId, () => {
            //     // Quay lại trang orders sau khi hoàn tất
            //     setTimeout(() => {
            //       chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
            //     }, 1000);
            //   });
            // } catch (err) {
            //   console.error("Lỗi khi đóng tab báo cáo:", err);
            //   // Tạo tab trang orders mới nếu không thể đóng tab báo cáo
            //   chrome.tabs.create({ url: `${globalDomain}/orders-v3?page=1`, active: true });
            // }
          });
        });
        
        // Lưu log hoạt động
        saveLog("adsReportsLog", { 
          type: "Manual Ads Reports Download", 
          date: new Date().toISOString(),
          folderPath: `reports/${new Date().getDate()}-${new Date().getMonth()+1}-${new Date().getFullYear()}/`
        });
      } catch (error) {
        console.error("Lỗi trong quá trình tải báo cáo quảng cáo:", error);
        if (sender.tab && sender.tab.id) {
          sendMessage(sender.tab.id, "downloadAdsReports", { 
            error: `Lỗi khi tải báo cáo quảng cáo: ${error.message || "Lỗi không xác định"}` 
          });
        }
      }
    })();
    
    return true; // Đảm bảo sendResponse được gọi bất đồng bộ
  }
  
  if (request.message === "getFeedbackData") {
    // Mở tab ẩn với URL Feedback Manager
    chrome.tabs.create({ url: "https://sellercentral.amazon.com/feedback-manager/index.html", active: false }, function(tab) {
      const tabId = tab.id;

      // Lắng nghe khi tab được cập nhật
      function handleUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          // Khi trang load xong, thực hiện injection script để lấy dữ liệu
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              let result = {};
              // Lấy điểm feedback
              const feedbackSummary = document.querySelector("feedback-summary div div b");
              if (feedbackSummary) {
                result.fb_score = feedbackSummary.textContent.trim();
              }
              // Lấy dữ liệu từ feedback table (giả sử có tag kat-table-body)
              const tableBody = document.querySelector("kat-table-body");
              result.tableBody = tableBody;
              if (tableBody) {
                let rows = tableBody.querySelectorAll("kat-table-row");
                // Positive row: hàng đầu tiên (index 0), lấy ô dữ liệu thứ 2 (index 1)
                if (rows.length > 0) {
                  let positiveCells = rows[0].querySelectorAll("kat-table-cell");
                  if (positiveCells.length > 4) {
                    let posText = positiveCells[1].textContent || "";
                    let posMatch = posText.match(/\((\d+)\)/);
                    if (posMatch) result.fb_possitive_last_30 = parseInt(posMatch[1]);
                  }
                }
                // Negative row: hàng thứ ba (index 2), lấy ô dữ liệu thứ 2 (index 1)
                if (rows.length > 2) {
                  let negativeCells = rows[2].querySelectorAll("kat-table-cell");
                  if (negativeCells.length > 1) {
                    let negText = negativeCells[1].textContent || "";
                    let negMatch = negText.match(/\((\d+)\)/);
                    if (negMatch) result.fb_negative_last_30 = parseInt(negMatch[1]);
                  }
                }

                if (rows.length > 3) {
                  let countText = rows[3].querySelector(".rating-count")?.textContent || "";
                  result.fb_count = parseInt(countText.replace(/[^\d]/g, ""));
                }
              }
              return result;
            }
          }, (results) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse(results[0].result);
            }
            // Loại bỏ listener và đóng tab sau khi hoàn thành
            setTimeout(() => {
              chrome.tabs.onUpdated.removeListener(handleUpdated);
              chrome.tabs.remove(tabId);
            }, 1000);
          });
        }
      }
      chrome.tabs.onUpdated.addListener(handleUpdated);
    });
    // Trả về true để thông báo sendResponse được gọi bất đồng bộ
    return true;
  }

  // Xử lý message lấy thông tin Payment
  if (request.message === "autoUpdateTrackingFinished") {
    console.log("Tự động update tracking đã hoàn thành");
    // Xử lý sau khi update tracking tự động hoàn tất
    try {
      // Lưu log hoạt động
      saveLog("updateTrackingLog", { 
        type: "Auto Update Tracking", 
        date: new Date().toISOString(),
        status: "Completed"
      });
      
      // Các xử lý khác nếu cần
    } catch (error) {
      console.error("Lỗi khi xử lý sau update tracking:", error);
    }
    
    return true;
  }
  
  if (request.message === "getPaymentData") {
    console.log('getPaymentData');
    chrome.tabs.create({ 
      url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx", 
      active: false 
    }, function(tab) {
      const tabId = tab.id;
      let executed = false;
      // Buộc timeout sau 10 giây nếu trang không chuyển sang complete
      const forcedTimeout = setTimeout(() => {
        if (!executed) {
          executed = true;
          executePaymentScript(tabId);
        }
      }, 10000);
  
      function handleUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete" && !executed) {
          executed = true;
          clearTimeout(forcedTimeout);
          executePaymentScript(tabId);
        }
      }
      chrome.tabs.onUpdated.addListener(handleUpdated);
  
      function executePaymentScript(tabId) {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            let result = {};
            // Lấy Payment Blocks
            const paymentBlocks = document.getElementsByClassName("linkable-multi-row-card-rows-container");
            if (paymentBlocks.length > 0) {
              let paymentBlock = paymentBlocks[1] || paymentBlocks[0];
              let rows = paymentBlock.getElementsByClassName("linkable-multi-row-card-row");
              if (rows.length === 4) {
                result.standard_orders = rows[0].querySelector(".underline-link")?.textContent.trim() || "";
                result.invoiced_orders = rows[1].querySelector(".underline-link")?.textContent.trim() || "";
                result.deferred_transactions = rows[2].querySelector(".underline-link #link-target")?.getAttribute("label")?.trim() || "";
                result.balance_com = rows[3].querySelector(".currency-total-amount")?.textContent.trim() || "";
              } else if (rows.length === 3) {
                result.standard_orders = rows[0].querySelector(".underline-link")?.textContent.trim() || "";
                result.deferred_transactions = rows[1].querySelector(".underline-link #link-target")?.getAttribute("label")?.trim() || "";
                result.balance_com = rows[2].querySelector(".currency-total-amount")?.textContent.trim() || "";
              } else if (rows.length === 2) {
                result.standard_orders = rows[0].querySelector(".underline-link")?.textContent.trim() || "";
                result.balance_com = rows[1].querySelector(".currency-total-amount")?.textContent.trim() || "";
              }
            }
            // Lấy thông tin payment_today
            const currencyElements = document.getElementsByClassName("currency-total-amount");
            if (currencyElements.length > 1) {
              let span = currencyElements[1].querySelector("span");
              if (span) {
                result.payment_today = span.textContent.replace(/\$/g, "").replace(/,/g, "").trim();
              }
            }
            // Lấy payment_amount
            const multiLine = document.getElementsByClassName("multi-line-child-content");
            if (multiLine.length > 2) {
              result.payment_amount = multiLine[2].textContent.replace(/\$/g, "").replace(/,/g, "").trim();
            }
            // Lấy payment_date từ thông điệp hiển thị
            const fundElements = document.getElementsByClassName("fund-transfer-primary-message");
            if (fundElements.length > 0) {
              let span = fundElements[0].querySelector("span");
              if (span) {
                let msg = span.textContent.trim();
                let dateMatch = msg.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                if (dateMatch) {
                  let parts = dateMatch[0].split("/");
                  result.payment_date = `${parts[2]}-${parts[0]}-${parts[1]}`;
                }
              }
            }
            // Tính balance_hold = balance_com - payment_today (nếu có)
            if (result.balance_com && result.payment_today) {
              let balance = parseFloat(result.balance_com.replace(/\$/g, "").replace(/,/g, ""));
              let today = parseFloat(result.payment_today.replace(/\$/g, "").replace(/,/g, ""));
              result.balance_hold = (balance - today).toString();
            }
            return result;
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(results[0].result);
          }
          chrome.tabs.onUpdated.removeListener(handleUpdated);
          chrome.tabs.remove(tabId);
        });
      }
    });
    return true;
  }
});

// Mở trang Performance Dashboard (Account Health)
const openPerformanceDashboardPage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/performance/dashboard`;
  chrome.tabs.query({}, (tabs) => {
    let found = false;
    for (let tab of tabs) {
      if (found) break;
      // Check if the tab is already on the performance dashboard
      if (tab?.url?.includes("/performance/dashboard")) {
        found = tab.id;
        break;
      }
    }

    if (found) {
      chrome.tabs.update(found, {
        active: true,
        url, // Ensure it navigates to the base dashboard URL if already on a sub-page
      });
    } else {
      chrome.tabs.create({
        active: true,
        url,
      });
    }
  });
  console.log("Đã mở trang Performance Dashboard (Account Health)");
};

// Mở trang Update Tracking với URL đúng format
const openOrderDetailPage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/orders-v3?statuses=Update%20Tracking`;
  chrome.tabs.query({}, (tabs) => {
    let found = false;

    for (let tab of tabs) {
      if (found) break;
      if (tab?.url?.includes("/orders-v3") && tab?.url?.includes("Update%20Tracking")) {
        found = tab.id;
        break;
      }
    }

    if (found) {
      chrome.tabs.update(found, {
        active: true,
        url,
      });
    } else {
      chrome.tabs.create({
        active: true,
        url,
      });
    }
  });
  console.log("Đã mở trang Update Tracking");
};

// Thiết lập alarm khi trình duyệt khởi động
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension starting up - setting up daily alarms");
  setupDailyAlarm();
});