$(document).on("click", "#update-tracking", function () {
   $(this).addClass("loader");
   chrome.runtime.sendMessage({
      message: "runUpdateTracking",
      domain: window.location.origin,
   });
});

// caption event form background
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   const { message, data } = req || {};
   
   // Always send a response to prevent connection errors
   if (res) {
      res({ message: "received" });
   }
   
   if (message === "updateTracking") {
      $(".loader").removeClass("loader");
      const { error } = data || {};
      if (error) {
         notifyError(error);
         return;
      }
      notifySuccess("Update tracking completed.");
   } else if (message === "startUpdateTrackingAuto") {
      console.log("[UPDATE TRACKING] Received auto update trigger");
      
      try {
         // Get domain from current window location
         const domain = window.location.origin;
         
         // Send message to background script to start the update process
         chrome.runtime.sendMessage({
            message: "runUpdateTracking",
            domain: domain,
         }, (response) => {
            // Log response if any
            if (response) {
               console.log("[UPDATE TRACKING] Background response:", response);
            }
         });
      } catch (error) {
         console.error("[UPDATE TRACKING] Error starting auto update:", error);
         // Try to show notification if possible
         try {
            notifyError("Failed to start automatic update tracking: " + error.message);
         } catch (e) {
            // In case notifyError isn't available yet
            console.error("[UPDATE TRACKING] Could not show error notification:", e);
         }
      }
   } else if (message === "checkUpdateTrackingStatus") {
      // Handle status check requests from popup or background script
      // This allows the popup to show when the next update is scheduled
      chrome.storage.local.get(['nextUpdateTrackingTime', 'autoUpdateTrackingEnabled'], function(result) {
         if (res) {
            // Calculate remaining time
            let remainingTime = "";
            let nextRun = "";
            
            if (result.nextUpdateTrackingTime) {
               const nextUpdateTime = new Date(result.nextUpdateTrackingTime);
               const now = new Date();
               
               // Calculate remaining time in minutes
               const timeUntilUpdate = nextUpdateTime.getTime() - now.getTime();
               const minutesRemaining = Math.floor(timeUntilUpdate / (1000 * 60));
               const hoursRemaining = Math.floor(minutesRemaining / 60);
               const minsRemaining = minutesRemaining % 60;
               
               if (timeUntilUpdate > 0) {
                  if (hoursRemaining > 0) {
                     remainingTime = `${hoursRemaining} giờ ${minsRemaining} phút`;
                  } else {
                     remainingTime = `${minsRemaining} phút`;
                  }
                  
                  // Format next run time (9:15 AM today or tomorrow)
                  const isToday = nextUpdateTime.getDate() === now.getDate() && 
                                  nextUpdateTime.getMonth() === now.getMonth() && 
                                  nextUpdateTime.getFullYear() === now.getFullYear();
                  
                  const timeString = nextUpdateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                  nextRun = isToday ? `Hôm nay lúc ${timeString}` : `Ngày mai lúc ${timeString}`;
               }
            }
            
            res({
               enabled: result.autoUpdateTrackingEnabled !== false,
               nextUpdateTime: result.nextUpdateTrackingTime,
               remainingTime: remainingTime,
               nextRun: nextRun
            });
         }
      });
      return true; // Keep channel open for async response
   }
});

// Biến lưu trữ hẹn giờ cho update tracking
let scheduledUpdateTrackingTask = null;

// Hàm đặt lịch tự động cập nhật tracking vào 9h15 sáng mỗi ngày
function scheduleUpdateTracking() {
   const now = new Date();
   const updateTime = new Date();
   
   // Đặt thời gian cập nhật là 9h15 sáng
   updateTime.setHours(9, 30, 0, 0);
   
   // Nếu thời gian hiện tại đã qua 9h15 sáng, đặt lịch cho ngày mai
   if (now > updateTime) {
      updateTime.setDate(updateTime.getDate() + 1);
   }
   
   // Tính toán khoảng thời gian từ hiện tại đến thời điểm cập nhật (milliseconds)
   const timeUntilUpdate = updateTime.getTime() - now.getTime();
   
   console.log(`[UPDATE TRACKING] Lịch cập nhật tracking tiếp theo: ${updateTime.toLocaleString()}`);
   console.log(`[UPDATE TRACKING] Còn: ${Math.floor(timeUntilUpdate / (1000 * 60))} phút`);
   
   // Xóa lịch trình cũ nếu có
   if (scheduledUpdateTrackingTask) {
      clearTimeout(scheduledUpdateTrackingTask);
   }
   
   // Đặt lịch mới
   scheduledUpdateTrackingTask = setTimeout(() => {
      console.log('[UPDATE TRACKING] Bắt đầu tự động cập nhật tracking lúc 9h15 sáng');
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
            // Gửi thông báo để bắt đầu cập nhật tracking
            setTimeout(() => {
               chrome.tabs.sendMessage(amazonTab.id, { 
                  message: "startUpdateTrackingAuto"
               });
            }, 2000);
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
                        chrome.tabs.sendMessage(tab.id, { 
                           message: "startUpdateTrackingAuto"
                        });
                        // Xóa event listener
                        chrome.tabs.onUpdated.removeListener(listener);
                     }, 5000);
                  }
               });
            });
         }
      });
      
      // Đặt lịch cho ngày hôm sau
      scheduleUpdateTracking();
   }, timeUntilUpdate);
   
   // Lưu trạng thái và thời gian cập nhật tiếp theo
   chrome.storage.local.set({ 
      'nextUpdateTrackingTime': updateTime.toISOString(),
      'autoUpdateTrackingEnabled': true
   });
}

// Khởi tạo lịch cập nhật tracking khi extension được load
(function initUpdateTrackingScheduler() {
   // Kiểm tra trạng thái tự động cập nhật từ storage
   chrome.storage.local.get(['autoUpdateTrackingEnabled'], function(result) {
      // Mặc định bật tính năng tự động cập nhật
      const enabled = result.autoUpdateTrackingEnabled !== false;
      
      if (enabled) {
         // Khởi tạo lịch trình
         scheduleUpdateTracking();
         console.log('[UPDATE TRACKING] Đã khởi tạo lịch trình tự động cập nhật tracking');
      } else {
         console.log('[UPDATE TRACKING] Tự động cập nhật tracking đã bị tắt');
      }
   });
})();