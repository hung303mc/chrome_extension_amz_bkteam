/**
 * AUTO SYNC SCHEDULER FOR AMAZON BKTEAM EXTENSION
 * 
 * Script này sẽ tự động chạy extension lúc 9:00 sáng mỗi ngày khi Chrome đang chạy.
 * Đặt script này trong thư mục scripts của extension và import vào background.js
 */

// Biến lưu trữ hẹn giờ
let scheduledSyncTask = null;

// Danh sách các domain Amazon
const AMAZON_DOMAINS = [
  "https://sellercentral.amazon.com",
  "https://sellercentral-europe.amazon.com",
  "https://sellercentral.amazon.de",
  "https://sellercentral.amazon.co.uk",
];

// Hàm đặt lịch tự động đồng bộ vào 9h sáng mỗi ngày
function scheduleAutoSync() {
  const now = new Date();
  const syncTime = new Date();
  
  // Đặt thời gian đồng bộ là 10h sáng
  syncTime.setHours(9, 0, 0, 0);
  
  // Nếu thời gian hiện tại đã qua 10h sáng, đặt lịch cho ngày mai
  if (now > syncTime) {
    syncTime.setDate(syncTime.getDate() + 1);
  }
  
  // Tính toán khoảng thời gian từ hiện tại đến thời điểm đồng bộ (milliseconds)
  const timeUntilSync = syncTime.getTime() - now.getTime();
  
  console.log(`[AUTO SYNC] Lịch đồng bộ tiếp theo: ${syncTime.toLocaleString()}`);
  console.log(`[AUTO SYNC] Còn: ${Math.floor(timeUntilSync / (1000 * 60))} phút`);
  
  // Xóa lịch trình cũ nếu có
  if (scheduledSyncTask) {
    clearTimeout(scheduledSyncTask);
  }
  
  // Đặt lịch mới
  scheduledSyncTask = setTimeout(() => {
    console.log('[AUTO SYNC] Bắt đầu tự động đồng bộ lúc 15h chiều');
    // Kiểm tra xem có đang ở trang Amazon không
    chrome.tabs.query({}, (tabs) => {
      // Tìm tab Amazon đang mở
      const amazonTab = tabs.find(tab => 
        AMAZON_DOMAINS.some(domain => tab.url && tab.url.includes(domain.replace("https://", "")))
      );
      
      if (amazonTab) {
        // Nếu đã có tab Amazon, kích hoạt nó
        chrome.tabs.update(amazonTab.id, {active: true});
        
        // Gửi message đến background script để reload tab trước khi đồng bộ
        chrome.storage.local.get(['MBApi'], function(result) {
          chrome.runtime.sendMessage({
            message: "reloadTabBeforeAction",
            data: {
              tabId: amazonTab.id,
              action: "autoSync",
              actionData: { apiKey: result.MBApi }
            }
          });
        });
      } else {
        // Nếu chưa có tab Amazon, mở trang orders mới
        openAmazonOrderPage();
        // Đợi tab mở và load xong, sẽ bắt đầu đồng bộ thông qua event listener
      }
    });
    
    // Đặt lịch cho ngày hôm sau
    scheduleAutoSync();
  }, timeUntilSync);
  
  // Lưu trạng thái và thời gian đồng bộ tiếp theo
  chrome.storage.local.set({ 
    'nextSyncTime': syncTime.toISOString(),
    'autoSyncEnabled': true
  });
}

// Hàm mở trang Amazon Orders
function openAmazonOrderPage() {
  const url = "https://sellercentral.amazon.com/orders-v3";
  
  chrome.tabs.create({ url: url, active: true }, (tab) => {
    console.log(`[AUTO SYNC] Mở tab mới với ID: ${tab.id}`);
    
    if (!tab || !tab.id) {
      console.error('[AUTO SYNC] Lỗi khi mở tab Amazon mới');
      return;
    }
    
    // Đợi tab load xong rồi mới bắt đầu đồng bộ
    let loadTimeout = null;
    
    function handleTabUpdate(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        // Tab đã load xong, đợi thêm 5 giây để trang hoàn toàn ổn định và nội dung của DOM được khởi tạo
        console.log('[AUTO SYNC] Tab đã load xong, đợi trang ổn định...');
        
        // Xóa timeout nếu có
        if (loadTimeout) {
          clearTimeout(loadTimeout);
        }
        
        // Đợi lâu hơn để đảm bảo trang hoàn toàn ổn định
        setTimeout(() => {
          console.log('[AUTO SYNC] Gửi yêu cầu reload tab trước khi đồng bộ...');
          
          // Lấy API key để sử dụng trong đồng bộ
          chrome.storage.local.get(['MBApi'], function(result) {
            // Gửi message đến background script để reload tab trước khi đồng bộ
            chrome.runtime.sendMessage({
              message: "reloadTabBeforeAction",
              data: {
                tabId: tab.id,
                action: "autoSync",
                actionData: { apiKey: result.MBApi }
              }
            });
          });
          
          // Xóa event listener để tránh gọi nhiều lần
          chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        }, 5000);
      }
    }
    
    // Thiết lập timeout để tránh trường hợp tab không bao giờ load xong
    loadTimeout = setTimeout(() => {
      console.log('[AUTO SYNC] Timeout khi đợi tab load, thử bắt đầu đồng bộ...');
      
      // Lấy API key để sử dụng trong đồng bộ
      chrome.storage.local.get(['MBApi'], function(result) {
        // Gửi message đến background script để reload tab trước khi đồng bộ
        chrome.runtime.sendMessage({
          message: "reloadTabBeforeAction",
          data: {
            tabId: tab.id,
            action: "autoSync",
            actionData: { apiKey: result.MBApi }
          }
        });
      });
      
      // Xóa event listener để tránh gọi nhiều lần
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    }, 30000); // 30 giây timeout
    
    // Lắng nghe sự kiện tab load xong
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
  });
}

// Hàm thực hiện đồng bộ tự động
function startAutoSync(tabId) {
  console.log(`[AUTO SYNC] Bắt đầu quá trình đồng bộ tự động trên tab ID: ${tabId}`);
  
  chrome.storage.local.get(['MBApi'], function(result) {
    const apiKey = result.MBApi;
    
    if (apiKey) {
      // Cơ chế thử lại với số lần tối đa
      let retryCount = 0;
      const maxRetries = 10; // Tăng số lần thử lại lên 10
      
      const sendSyncMessage = () => {
        console.log(`[AUTO SYNC] Kiểm tra tình trạng tab ${tabId}...`);
        
        // Kiểm tra xem tab còn tồn tại không
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('[AUTO SYNC] Tab không còn tồn tại:', chrome.runtime.lastError);
            
            // Mở tab mới nếu tab không còn tồn tại
            openAmazonOrderPage();
            return;
          }
          
          // Thử inject script để kiểm tra xem content script đã sẵn sàng chưa
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: () => {
              return {
                url: window.location.href,
                ready: typeof $ !== 'undefined' && $('.om-addon').length > 0
              };
            }
          }).then((results) => {
            const pageInfo = results?.[0]?.result;
            
            if (pageInfo && pageInfo.ready) {
              // Content script đã sẵn sàng, gửi thông báo
              console.log('[AUTO SYNC] Content script đã sẵn sàng, gửi lệnh đồng bộ');
              
              // Gửi thông báo đến content script để bắt đầu đồng bộ
              chrome.tabs.sendMessage(tabId, { 
                message: "triggerAutoSync", 
                data: { apiKey } 
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('[AUTO SYNC] Lỗi khi gửi tin nhắn:', chrome.runtime.lastError);
                  
                  // Thử lại nếu chưa đạt số lần tối đa
                  retryCount++;
                  if (retryCount < maxRetries) {
                    const delay = 3000 + (retryCount * 1000); // Tăng thời gian chờ mỗi lần thử
                    console.log(`[AUTO SYNC] Thử lại lần ${retryCount}/${maxRetries} sau ${delay/1000} giây...`);
                    setTimeout(sendSyncMessage, delay);
                  } else {
                    console.error('[AUTO SYNC] Đã thử lại tối đa số lần. Không thể đồng bộ tự động.');
                    
                    // Hiển thị thông báo thất bại
                    chrome.notifications.create({
                      type: 'basic',
                      iconUrl: '/assets/images/48.png',
                      title: 'Amazon BKTeam Extension',
                      message: 'Không thể đồng bộ tự động. Vui lòng thử lại sau.'
                    });
                    
                    // Thử khởi động lại tab và đồng bộ lại sau một thời gian
                    setTimeout(() => {
                      console.log('[AUTO SYNC] Thử lại sau khi tải lại tab...');
                      chrome.tabs.reload(tabId, {}, () => {
                        setTimeout(() => openAmazonOrderPage(), 5000);
                      });
                    }, 10000);
                  }
                } else if (response) {
                  console.log('[AUTO SYNC] Phản hồi:', response);
                } else {
                  // Nếu không có phản hồi mà cũng không có lỗi, có thể content script chưa sẵn sàng
                  retryCount++;
                  if (retryCount < maxRetries) {
                    const delay = 3000 + (retryCount * 1000);
                    console.log(`[AUTO SYNC] Không nhận được phản hồi, thử lại lần ${retryCount}/${maxRetries} sau ${delay/1000} giây...`);
                    setTimeout(sendSyncMessage, delay);
                  } else {
                    console.error('[AUTO SYNC] Đã thử tối đa số lần nhưng không nhận được phản hồi.');
                  }
                }
              });
            } else {
              // Content script chưa sẵn sàng, chờ thêm
              console.log('[AUTO SYNC] Content script chưa sẵn sàng, đợi thêm...');
              retryCount++;
              if (retryCount < maxRetries) {
                const delay = 3000 + (retryCount * 1000);
                console.log(`[AUTO SYNC] Đợi lần ${retryCount}/${maxRetries} trong ${delay/1000} giây...`);
                setTimeout(sendSyncMessage, delay);
              } else {
                // Sau số lần thử tối đa, thử reload tab
                console.log('[AUTO SYNC] Tải lại tab và thử lại...');
                chrome.tabs.reload(tabId, {}, () => {
                  // Reset retry count và thử lại sau khi reload
                  retryCount = 0;
                  setTimeout(sendSyncMessage, 5000);
                });
              }
            }
          }).catch(error => {
            console.error('[AUTO SYNC] Lỗi khi kiểm tra script:', error);
            
            retryCount++;
            if (retryCount < maxRetries) {
              setTimeout(sendSyncMessage, 3000);
            } else {
              openAmazonOrderPage();
            }
          });
        });
      };
      
      // Bắt đầu gửi với cơ chế thử lại
      sendSyncMessage();
      
    } else {
      console.log('[AUTO SYNC] Không thể đồng bộ tự động - không có API key');
      
      // Hiển thị thông báo trong trình duyệt
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/assets/images/48.png',
        title: 'Amazon BKTeam Extension',
        message: 'Không thể đồng bộ tự động - Vui lòng thiết lập merchant ID.'
      });
    }
  });
}

// Thiết lập lịch tự động khi extension được tải
function initAutoSyncScheduler() {
  console.log('[AUTO SYNC] Khởi tạo auto sync scheduler');
  
  // Kiểm tra trạng thái tự động đồng bộ
  chrome.storage.local.get(['autoSyncEnabled'], function(result) {
    // Mặc định bật tự động đồng bộ nếu chưa thiết lập
    const isEnabled = result.autoSyncEnabled !== false;
    
    if (isEnabled) {
      scheduleAutoSync();
    } else {
      console.log('[AUTO SYNC] Tự động đồng bộ đang bị tắt.');
    }
  });
  
  // Lắng nghe các yêu cầu lập lịch/hủy lịch
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === "toggleAutoSync") {
      chrome.storage.local.set({ 'autoSyncEnabled': request.enabled });
      
      if (request.enabled) {
        scheduleAutoSync();
        sendResponse({ 
          success: true, 
          message: "Đã bật tự động đồng bộ lúc 15:00 chiều mỗi ngày" 
        });
      } else {
        if (scheduledSyncTask) {
          clearTimeout(scheduledSyncTask);
          scheduledSyncTask = null;
        }
        chrome.storage.local.set({ 'nextSyncTime': null });
        sendResponse({ 
          success: true, 
          message: "Đã tắt tự động đồng bộ" 
        });
      }
      return true;
    }
    
    if (request.message === "checkAutoSyncStatus") {
      chrome.storage.local.get(['autoSyncEnabled', 'nextSyncTime'], function(result) {
        const enabled = result.autoSyncEnabled !== false;
        const nextSyncTime = result.nextSyncTime ? new Date(result.nextSyncTime) : null;
        
        let nextSyncMessage = "Chưa lập lịch";
        if (nextSyncTime) {
          const now = new Date();
          const minutesUntilSync = Math.floor((nextSyncTime - now) / (1000 * 60));
          
          if (minutesUntilSync > 0) {
            const hours = Math.floor(minutesUntilSync / 60);
            const minutes = minutesUntilSync % 60;
            nextSyncMessage = `${nextSyncTime.toLocaleString()} (còn ${hours}h ${minutes}m)`;
          } else {
            nextSyncMessage = "Đang chuẩn bị đồng bộ...";
          }
        }
        
        sendResponse({ 
          enabled: enabled,
          nextSync: nextSyncMessage
        });
      });
      return true;
    }
    
    if (request.message === "runSyncNow") {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          
          // Lấy API key để sử dụng trong đồng bộ
          chrome.storage.local.get(['MBApi'], function(result) {
            // Gửi message đến background script để reload tab trước khi đồng bộ
            chrome.runtime.sendMessage({
              message: "reloadTabBeforeAction",
              data: {
                tabId: activeTab.id,
                action: "autoSync",
                actionData: { apiKey: result.MBApi }
              }
            });
          });
          
          sendResponse({ success: true, message: "Bắt đầu đồng bộ ngay lập tức" });
        } else {
          sendResponse({ success: false, message: "Không tìm thấy tab đang mở" });
        }
      });
      return true;
    }
  });
}

// Export các hàm để background.js có thể sử dụng
const AutoSyncScheduler = {
  init: initAutoSyncScheduler,
  schedule: scheduleAutoSync,
  start: startAutoSync,
  openOrderPage: openAmazonOrderPage
};

// Export module để background.js có thể import
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutoSyncScheduler;
} else {
  // Nếu không dùng module, thêm vào global window
  self.AutoSyncScheduler = AutoSyncScheduler;
} 