const isProduction = true;
const MBUrl = "https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php";
const ipTrackingKey = "ipTrackingEnabled";

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
let globalMBApiKey = null;
let isSyncing = false;

// Xử lý get_buyer_phone.js lấy thông tin report và gửi về server
importScripts("get_buyer_phone.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gửi trạng thái của một feature về server để monitor.
 * @param {string} featureName - Tên của feature (vd: 'syncOrder').
 * @param {string} status - Trạng thái ('SUCCESS', 'FAILED', 'SKIPPED', 'RUNNING').
 * @param {string} message - Thông điệp chi tiết.
 */
const reportStatusToServer = async (featureName, status, message = '') => {
  try {
    const merchantId = await getMBApiKey();
    if (!merchantId) {
      return;
    }
    const MONITORING_URL = "https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=updateMonitoringStatus";
    await fetch(MONITORING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchantId": merchantId
      },
      body: JSON.stringify({
        merchantId,
        featureName,
        status,
        message
      }),
    });
  } catch (error) {
    console.error(`[Monitor] Failed to report status for ${featureName}:`, error);
  }
};

const setupTestAlarms = async () => {
  // Lấy cài đặt test từ storage
  const { testSettings } = await chrome.storage.local.get("testSettings");
  if (!testSettings) {
    console.log("Không tìm thấy cài đặt test.");
    return;
  }

  const { syncOrder, updateTracking, accountHealth, downloadAds, sendMessageAuto, delay = 1 } = testSettings;

  console.log(`--- CHẠY CHẾ ĐỘ TEST THEO YÊU CẦU ---`);
  console.log(`Cài đặt: Lấy đơn=${syncOrder}, Update Tracking=${updateTracking}, Account Health=${accountHealth}, Gửi Tin Nhắn=${sendMessageAuto}, , Chạy sau=${delay} phút.`);

  // Xóa các alarm test cũ đi để tránh bị trùng lặp
  chrome.alarms.clear("test_syncOrder");
  chrome.alarms.clear("test_updateTracking");
  chrome.alarms.clear("test_accountHealth");
  chrome.alarms.clear("test_downloadAdsReports"); // Thêm dòng này
  chrome.alarms.clear("test_sendMessageAuto");


  let currentDelay = delay;

  if (syncOrder) {
    chrome.alarms.create("test_syncOrder", { delayInMinutes: currentDelay });
    console.log(`- Đã đặt lịch 'test_syncOrder' sau ${currentDelay} phút.`);
    currentDelay += 2; // Tăng delay lên một chút cho tác vụ tiếp theo để tránh xung đột
  }
  if (updateTracking) {
    chrome.alarms.create("test_updateTracking", { delayInMinutes: currentDelay });
    console.log(`- Đã đặt lịch 'test_updateTracking' sau ${currentDelay} phút.`);
    currentDelay += 2;
  }
  if (accountHealth) {
    chrome.alarms.create("test_accountHealth", { delayInMinutes: currentDelay });
    console.log(`- Đã đặt lịch 'test_accountHealth' sau ${currentDelay} phút.`);
  }
  if (downloadAds) {
    chrome.alarms.create("test_downloadAdsReports", { delayInMinutes: currentDelay });
    console.log(`- Đã đặt lịch 'test_downloadAdsReports' sau ${currentDelay} phút.`);
  }
  if (sendMessageAuto) {
    chrome.alarms.create("test_sendMessageAuto", { delayInMinutes: currentDelay });
    console.log(`- Đã đặt lịch 'test_sendMessageAuto' sau ${currentDelay} phút.`);
  }



  console.log("Đã đặt lịch hẹn test thành công!");
};

// Thiết lập alarm để tự động sync order, lấy cấu hình từ server
const setupDailyAlarm = async () => {
  const SETTINGS_URL = "https://bkteam.top/dungvuong-admin/data_files/alarm_setting/alarm-settings.json";

  // Danh sách TẤT CẢ các alarm có thể có trong hệ thống.
  // Thêm hoặc bớt tên alarm ở đây nếu mày muốn.
  const ALL_POSSIBLE_ALARMS = [
    'ipUpdateCheck',
    'syncOrder_1', 'syncOrder_2', 'syncOrder_3', 'syncOrder_4', 'syncOrder_5',
    'updateTracking_1', 'updateTracking_2', 'updateTracking_3', 'updateTracking_4', 'updateTracking_5',
    'accountHealth_1', 'accountHealth_2', 'accountHealth_3', 'accountHealth_4', 'accountHealth_5',
    'downloadAdsReports_1', 'downloadAdsReports_2', 'downloadAdsReports_3', 'downloadAdsReports_4', 'downloadAdsReports_5',
    'sendMessageAuto_1', 'sendMessageAuto_2', 'sendMessageAuto_3', 'sendMessageAuto_4', 'sendMessageAuto_5',
    'paymentRequest_Sunday', 'paymentRequest_Monday', 'paymentRequest_Tue', 'paymentRequest_Wednesday', 'paymentRequest_Thu', 'paymentRequest_Friday'
  ];

  // let savedPaymentAlarm = null;
  // await chrome.alarms.get("autoRequestPayment", (alarm) => {
  //     if (alarm) {
  //         savedPaymentAlarm = alarm;
  //         console.log("[Payment] Đã lưu alarm payment hiện tại");
  //     }
  // });
  let settings = {};
  try {
    const response = await fetch(SETTINGS_URL, { cache: "no-store" });
    if (response.ok) {
      settings = await response.json();
      console.log("Đã tải cài đặt alarm từ server.", settings);

      await chrome.storage.local.set({ alarmSettings: settings });
      console.log("Đã lưu cài đặt vào storage."); // Thêm log để xác nhận
    } else {
      console.error("Lỗi HTTP khi tải cài đặt, sẽ không có alarm nào được đặt.");
      return;
    }
  } catch (error) {
    console.error("Không thể tải cài đặt từ server, sẽ không có alarm nào được đặt:", error);
    await chrome.storage.local.remove('alarmSettings');
    return;
  }

  // Xóa TẤT CẢ các alarm tác vụ cũ (trừ settingsRefresher) để đảm bảo sạch sẽ.
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
      // QUAN TRỌNG: Không xóa alarm payment
      // if (alarm.name === "autoRequestPayment") {
      //     console.log("[Payment] Giữ nguyên alarm autoRequestPayment");
      //     continue;
      // }
      
      if (alarm.name.includes('_') && 
          !alarm.name.startsWith('test_') && 
          !alarm.name.startsWith('retry_')) {
          await chrome.alarms.clear(alarm.name);
      }
  }
  console.log("Đã xoá các alarm tác vụ cũ.");
  // chrome.alarms.get("autoRequestPayment", (alarm) => {
  //       if (!alarm && savedPaymentAlarm) {
  //           console.log("[Payment] Khôi phục alarm payment đã bị xóa");
  //           chrome.alarms.create("autoRequestPayment", {
  //               when: savedPaymentAlarm.scheduledTime
  //           });
  //       } else if (!alarm) {
  //           console.log("[Payment] Tạo mới alarm payment");
  //           scheduleNextPaymentRequest();
  //       }
  //   });
  const now = new Date();
  const GMT7_OFFSET_HOURS = 7;

// Hàm helper để tính toán và đặt lịch
  // const scheduleAlarm = (name, config) => {
  //   const MAX_RANDOM_DELAY_MS = 5 * 60 * 1000; // 5 phút, tính bằng mili giây
  //   // Thêm một khoảng thời gian ngẫu nhiên từ 0 đến 300 giây (5 phút)
  //   const randomDelayInSeconds = Math.floor(Math.random() * 301);

  //   const targetHourUTC = (config.hour - GMT7_OFFSET_HOURS + 24) % 24;
  //   const alarmTime = new Date();
  //   alarmTime.setUTCHours(targetHourUTC, config.minute, 0, 0);

  //   // --- LOGIC SỬA ĐỔI ---
  //   // Chỉ dời sang ngày mai nếu thời gian hiện tại đã qua MỐC ALARM + 5 PHÚT.
  //   // Ví dụ: Alarm đặt lúc 4:00, thì chỉ khi nào sau 4:05 mà nó mới chạy lại, nó mới bị dời.
  //   if (now.getTime() > alarmTime.getTime() + MAX_RANDOM_DELAY_MS) {
  //     alarmTime.setUTCDate(alarmTime.getUTCDate() + 1);
  //   }
  //   // Nếu không, alarmTime vẫn được giữ cho ngày hôm nay.

  //   // Cộng thêm thời gian ngẫu nhiên vào thời gian báo thức
  //   alarmTime.setSeconds(alarmTime.getSeconds() + randomDelayInSeconds);

  //   // Tính toán delay cuối cùng
  //   const delayInMinutes = (alarmTime.getTime() - now.getTime()) / (1000 * 60);

  //   // Nếu vì lý do nào đó mà delay vẫn âm (ví dụ: máy tính bị lag),
  //   // ta sẽ cho nó chạy ngay lập tức thay vì bỏ lỡ.
  //   const finalDelay = Math.max(0.1, delayInMinutes); // Chạy ngay sau 0.1 phút nếu bị âm

  //   chrome.alarms.create(name, {
  //     delayInMinutes: finalDelay,
  //     periodInMinutes: config.periodInMinutes, // Thường sẽ là 1440 (24h)
  //   });

  //   // Cập nhật log để hiển thị cả giây cho chính xác
  //   const scheduledFireTime = new Date(Date.now() + finalDelay * 60 * 1000);
  //   console.log(`✅ Đã đặt lịch cho '${name}' vào khoảng ${scheduledFireTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })} (GMT+7)`);
  // };
const scheduleAlarm = (name, config) => {
    // --- LOGIC MỚI ĐỂ XỬ LÝ CẢ LỊCH HÀNG NGÀY VÀ LỊCH THEO NGÀY CỐ ĐỊNH TRONG TUẦN ---
    const now = new Date();
    const GMT7_OFFSET_HOURS = 7;
    const randomDelayInSeconds = Math.floor(Math.random() * 301); // Thêm độ trễ ngẫu nhiên 0-5 phút

    // Tính toán giờ mục tiêu theo múi giờ UTC
    const targetHourUTC = (config.hour - GMT7_OFFSET_HOURS + 24) % 24;

    let alarmTime = new Date();
    alarmTime.setUTCHours(targetHourUTC, config.minute, randomDelayInSeconds, 0);

    // Kiểm tra xem đây có phải là lịch theo ngày trong tuần không
    if (typeof config.dayOfWeek === 'number') {
        // ---- Đây là logic mới cho lịch theo ngày trong tuần (ví dụ: paymentRequest_*) ----
        const currentDayUTC = now.getUTCDay(); // Lấy ngày hiện tại theo UTC
        let daysToAdd = (config.dayOfWeek - currentDayUTC + 7) % 7;

        // Nếu ngày đặt lịch là hôm nay nhưng thời gian đã qua, thì đặt cho tuần tới
        if (daysToAdd === 0 && alarmTime.getTime() < now.getTime()) {
            daysToAdd = 7;
        }
        
        alarmTime.setUTCDate(now.getUTCDate() + daysToAdd);
        alarmTime.setUTCHours(targetHourUTC, config.minute, randomDelayInSeconds, 0);

        // Đối với lịch hàng tuần, chúng ta không đặt "periodInMinutes"
        // vì hàm setupDailyAlarm sẽ tự động đặt lại lịch cho tuần tiếp theo.
        chrome.alarms.create(name, {
            when: alarmTime.getTime()
        });
        
        console.log(`✅ Đã đặt lịch (theo ngày) cho '${name}' vào lúc: ${alarmTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);

    } else {
        // ---- Đây là logic cũ cho các lịch hàng ngày (ví dụ: syncOrder_*) ----
        if (now.getTime() > alarmTime.getTime()) {
            alarmTime.setUTCDate(alarmTime.getUTCDate() + 1);
        }
        
        const delayInMinutes = (alarmTime.getTime() - now.getTime()) / (1000 * 60);
        const finalDelay = Math.max(0.1, delayInMinutes);

        chrome.alarms.create(name, {
            delayInMinutes: finalDelay,
            periodInMinutes: config.periodInMinutes || 1440, // Mặc định là 24 giờ
        });
        
        const scheduledFireTime = new Date(Date.now() + finalDelay * 60 * 1000);
        console.log(`✅ Đã đặt lịch (hàng ngày) cho '${name}' vào khoảng ${scheduledFireTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })} (GMT+7)`);
    }
};
  // --- LOGIC MỚI: Duyệt qua danh sách và đặt lịch ---
  console.log("--- Bắt đầu kiểm tra và đặt lịch cho các alarm ---");
  for (const alarmName of ALL_POSSIBLE_ALARMS) {
    // Kiểm tra xem trong file JSON tải về có định nghĩa cho alarm này không và không phải là null
    if (settings[alarmName]) {
      // Nếu có, đặt lịch cho nó
      scheduleAlarm(alarmName, settings[alarmName]);
    } else {
      // Nếu không, chỉ log ra để biết là nó bị bỏ qua (có thể bỏ comment nếu cần debug)
      console.log(`❌ Bỏ qua alarm '${alarmName}' vì không được định nghĩa trên server.`);
    }
  }
  console.log("--- Hoàn tất quá trình đặt lịch ---");

  // Tạo hoặc cập nhật alarm 'settingsRefresher'
  await chrome.alarms.clear('settingsRefresher');

  const refresherConfig = settings.settingsRefresher;
  if (refresherConfig && typeof refresherConfig.runAtMinute === 'number' && typeof refresherConfig.periodInHours === 'number') {

    // Lấy các giá trị từ config, hoặc đặt giá trị mặc định an toàn
    const runAtMinute = refresherConfig.runAtMinute;
    const periodInHours = refresherConfig.periodInHours;
    console.log(`[Refresher] Đặt lịch chạy vào phút thứ ${runAtMinute}, lặp lại mỗi ${periodInHours} giờ.`);

    let nextRefreshTime = new Date(); // Bắt đầu tính từ bây giờ

    // Đặt mốc phút và giây mong muốn
    nextRefreshTime.setMinutes(runAtMinute, 0, 0);

    // Vòng lặp để đảm bảo thời gian tính được luôn ở tương lai
    // Nếu thời gian tính ra đã ở trong quá khứ, ta cứ cộng thêm `periodInHours` cho đến khi nó ở tương lai thì thôi.
    while (nextRefreshTime.getTime() <= now.getTime()) {
      nextRefreshTime.setHours(nextRefreshTime.getHours() + periodInHours);
    }

    // Tính toán độ trễ còn lại (tính bằng phút)
    const delayInMinutes = (nextRefreshTime.getTime() - now.getTime()) / (1000 * 60);

    // Tạo alarm một lần duy nhất. Khi nó chạy, nó sẽ tự tính lại mốc tiếp theo.
    chrome.alarms.create('settingsRefresher', {
      delayInMinutes: delayInMinutes
    });

    console.log(`✅ [Refresher] Đã đặt lịch cập nhật tiếp theo vào lúc: ${nextRefreshTime.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);

  } else {
    console.log("❌ [Refresher] Cấu hình không đúng định dạng, sẽ không đặt lịch. Cần có 'runAtMinute' và 'periodInHours'.");
  }

  chrome.alarms.getAll((alarms) => {
    console.log("Danh sách tất cả alarm hiện tại:", alarms);
  });
};

async function fetchAndProcessDesignTasks() {
  // Dùng lại hàm sendLogToServer có sẵn của mày
  const logPrefix = '[SendMessageAuto]';

  try {
    sendLogToServer(`${logPrefix} Bắt đầu kiểm tra task mới từ server...`);
    console.log("[BG] Đang hỏi server xem có task gửi design nào không...");
    const merchantId = await getMBApiKey();

    const response = await fetch("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=getPendingDesignTasks", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "merchant_id": merchantId })
    });

    if (!response.ok) throw new Error(`Server response not OK: ${response.status}`);
    const result = await response.json();

    if (result.status === 'success' && result.data && result.data.length > 0) {
      const tasks = result.data;
      sendLogToServer(`${logPrefix} ✅ Tìm thấy ${tasks.length} task. Bắt đầu xử lý...`);
      console.log(`[BG] Tìm thấy ${tasks.length} task. Bắt đầu xử lý...`);

      for (const task of tasks) {
        const orderNumber = task.order_number;
        try {
          sendLogToServer(`${logPrefix} >> Đang xử lý task cho đơn hàng: ${orderNumber}`);
          await automateSendDesign(task);
          sendLogToServer(`${logPrefix} >> HOÀN TẤT xử lý task cho đơn hàng: ${orderNumber}`);
        } catch (error) {
          // Nếu automateSendDesign báo lỗi, cập nhật status và log
          sendLogToServer(`${logPrefix} >> ❌ LỖI khi xử lý task cho đơn ${orderNumber}: ${error.message}`);
          console.error(`[BG] Lỗi khi tự động hóa cho đơn ${orderNumber}:`, error);
          await updateTaskStatusOnServer(task.task_id, 'error', error.message);
        }
      }
    } else {
      sendLogToServer(`${logPrefix} Không có task mới hoặc server báo lỗi: ${result.message || 'Không có task'}`);
      console.log("[BG] Không có task nào cần xử lý hoặc server báo lỗi:", result.message);
    }

  } catch (error) {
    sendLogToServer(`${logPrefix} ❌ Lỗi nghiêm trọng khi lấy task từ server: ${error.message}`);
    console.error("[BG] Lỗi khi lấy hoặc xử lý task từ server:", error);
    // Ném lỗi ra để alarm listener có thể bắt và báo FAILED
    throw error;
  }
}


async function automateSendDesign(task) {
  const orderNumber = task.order_number;
  const logPrefix = `[SendMessageAuto][Order: ${orderNumber}]`;

  sendLogToServer(`${logPrefix} Mở tab nhắn tin...`);
  const messageUrl = `https://sellercentral.amazon.com/messaging/contact?orderID=${orderNumber}&marketplaceID=ATVPDKIKX0DER`;

  let [tab] = await chrome.tabs.query({ url: "https://sellercentral.amazon.com/messaging/*" });
  if (tab) {
    await chrome.tabs.update(tab.id, { url: messageUrl, active: true });
  } else {
    tab = await chrome.tabs.create({ url: messageUrl, active: true });
  }

  sendLogToServer(`${logPrefix} Đang chờ tab tải xong...`);
  await new Promise(resolve => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 2000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  sendLogToServer(`${logPrefix} ✅ Tab đã tải xong. Gửi task cho content script...`);
  console.log(`[BG] Trang message đã tải xong. Gửi task cho content script.`);

  const response = await chrome.tabs.sendMessage(tab.id, {
    message: "executeSendDesignSteps",
    task: task
  });

  if (response && response.status === 'success') {
    sendLogToServer(`${logPrefix} ✅ Content script báo thành công. Cập nhật status 'sent' lên server.`);
    await updateTaskStatusOnServer(task.task_id, 'sent');
  } else {
    const errorMessage = response ? response.message : "Content script không phản hồi hoặc đã đóng.";
    sendLogToServer(`${logPrefix} ❌ Content script báo lỗi: ${errorMessage}`);
    // Ném lỗi ra để fetchAndProcessDesignTasks có thể bắt được
    throw new Error(errorMessage);
  }
}


// Thêm hàm này vào đâu đó trong background.js
async function updateTaskStatusOnServer(taskId, status, errorMessage = null) {
  try {
    console.log(`[BG] Cập nhật status cho task ${taskId} -> ${status}`);
    const merchantId = await getMBApiKey(); // Lấy merchantId/apiKey

    const payload = {
      task_id: taskId,
      status: status, // 'sent' hoặc 'error'
      error_message: errorMessage
    };

    const response = await fetch("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=updateMessageTaskStatus", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchantId': merchantId // Gửi cả merchantId nếu server cần
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server response not OK: ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
      console.error(`[BG] Lỗi khi cập nhật status task ${taskId} trên server:`, result.message);
    } else {
      console.log(`[BG] Cập nhật status cho task ${taskId} thành công!`);
    }
  } catch (error) {
    console.error(`[BG] Lỗi nghiêm trọng khi gọi API updateTaskStatus:`, error);
  }
}
/**
 * Tính toán và đặt báo thức cho lần rút tiền tiếp theo.
 * Lịch rút: 12:30 các ngày T2, T4, T6 và 8:00 ngày Chủ Nhật.
 */

// async function scheduleNextPaymentRequest() {
//     try {
//         // Xóa alarm cũ nếu có
//         await chrome.alarms.clear("autoRequestPayment");
        
//         const now = new Date();
//         const schedule = [
//             // { day: now.getDay(), hour: now.getHours(), minute: now.getMinutes() + 2 },

//             { day: 1, hour: 12, minute: 30 }, // Thứ 2
//             { day: 3, hour: 12, minute: 30 }, // Thứ 4
//             { day: 5, hour: 12, minute: 30 }, // Thứ 6
//             { day: 0, hour: 8, minute: 0 },   // Chủ Nhật
//         ];

//         let nextAlarmTime = null;

//         // Tìm thời điểm tiếp theo
//         for (let i = 0; i < 7; i++) {
//             const checkDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
//             const dayOfWeek = checkDate.getDay();

//             const dailySchedules = schedule.filter(s => s.day === dayOfWeek)
//                                           .sort((a, b) => a.hour - b.hour || a.minute - b.minute);

//             for (const item of dailySchedules) {
//                 const potentialAlarm = new Date(checkDate);
//                 potentialAlarm.setHours(item.hour, item.minute, 0, 0);

//                 // Chỉ chọn thời điểm trong tương lai (ít nhất 1 phút sau)
//                 if (potentialAlarm.getTime() > (now.getTime() + 60000)) {
//                     nextAlarmTime = potentialAlarm;
//                     break;
//                 }
//             }
//             if (nextAlarmTime) break;
//         }

//         if (nextAlarmTime) {
//             const delayInMinutes = Math.max(1, (nextAlarmTime.getTime() - now.getTime()) / 60000);
            
//             chrome.alarms.create("autoRequestPayment", {
//                 when: nextAlarmTime.getTime() // Dùng when thay vì delayInMinutes cho chính xác hơn
//             });
            
//             console.log(`[Payment] ✅ Đã đặt lịch rút tiền tự động`);
//             console.log(`[Payment] ⏰ Thời gian: ${nextAlarmTime.toLocaleString()}`);
//             console.log(`[Payment] ⏳ Còn ${delayInMinutes.toFixed(0)} phút nữa`);
            
//             // Lưu thông tin alarm vào storage để debug
//             chrome.storage.local.set({
//                 nextPaymentAlarm: {
//                     time: nextAlarmTime.toISOString(),
//                     timestamp: nextAlarmTime.getTime(),
//                     delayMinutes: delayInMinutes
//                 }
//             });
//         } else {
//             console.error("[Payment] ❌ Không tìm thấy lịch hợp lệ trong 7 ngày tới");
//         }
//     } catch (error) {
//         console.error("[Payment] Lỗi khi tạo alarm:", error);
//     }
// }
// Xử lý alarm khi kích hoạt
chrome.alarms.onAlarm.addListener(async (alarm) => {

  const IGNORE_LOGIN_CHECK = [
    'settingsRefresher',
    'ipUpdateCheck'
  ];

  // Nếu tên alarm KHÔNG nằm trong danh sách loại trừ thì mới cần check
  const shouldCheckLogin = !IGNORE_LOGIN_CHECK.includes(alarm.name);

  if (shouldCheckLogin) {
    console.log(`[Alarm] Checking login status for ${alarm.name}...`);
    const isLoggedIn = await checkAmazonLoginStatus();

    if (!isLoggedIn) {
      // Tao cũng sửa lại message log cho nó hợp lý hơn
      const statusMessage = `[${alarm.name}] Stopped: LOGIN REQUIRED.`;
      console.log(statusMessage);
      sendLogToServer(statusMessage);

      const match = alarm.name.match(/^(?:test_)?([a-zA-Z]+)/);
      const featureName = match ? match[1] : alarm.name.split('_')[0];

      await reportStatusToServer(featureName, 'LOGIN_REQUIRED', 'User is not logged in to Amazon Seller Central.');

      // Dọn dẹp tab Amazon đang mở nếu cần
      const amazonTabs = await chrome.tabs.query({ url: "*://sellercentral.amazon.com/*" });
      for (const tab of amazonTabs) {
        if (tab.url.includes('/ap/signin')) {
          await chrome.tabs.remove(tab.id).catch(() => {});
        }
      }
      return; // Dừng xử lý alarm này
    }
  }

  // Nếu là alarm tự cập nhật setting, thì chạy setup và dừng lại ngay
  if (alarm.name === 'settingsRefresher') {
    console.log(`🔥🔥🔥 KÍCH HOẠT ALARM TỰ CẬP NHẬT SETTINGS 🔥🔥🔥`);
    sendLogToServer(`Alarm triggered: ${alarm.name}`);
    await setupDailyAlarm(); // Chạy lại toàn bộ quá trình setup
    return; // Rất quan trọng: Dừng lại ở đây
  }

  if (alarm.name === 'ipUpdateCheck') {
    // Bước 1: Đọc cài đặt từ storage
    const settings = await chrome.storage.local.get({ [ipTrackingKey]: true });

    // Bước 2: Nếu người dùng không bật, thoát ra ngay, KHÔNG làm gì cả
    if (!settings[ipTrackingKey]) {
      console.log("Tính năng gửi IP đang tắt (do người dùng chọn). Bỏ qua.");
      return;
    }

    // Bước 3: Nếu được bật, mới bắt đầu gửi log và chạy hàm
    sendLogToServer(`Alarm triggered: ${alarm.name}`);
    console.log("Đã tới giờ kiểm tra và cập nhật IP (tính năng đang BẬT)...");
    await sendIPUpdateRequest();
    return; // Dừng lại để không chạy vào các khối code bên dưới
  }

  // Check nếu là alarm test thì log khác đi cho dễ nhận biết
  if (alarm.name.startsWith("test_")) {
    sendLogToServer(`Test Alarm triggered: ${alarm.name}`);
    console.log(`🔥🔥🔥 KÍCH HOẠT ALARM TEST: ${alarm.name} 🔥🔥🔥`);
  } else {
    sendLogToServer(`Alarm triggered: ${alarm.name}`);
  }

  if (alarm.name.startsWith("retry_")) {
    const featureName = alarm.name.split('_')[1]; // Lấy ra 'syncOrder' hoặc 'updateTracking'
    const storageKey = alarm.name + '_data';

    console.log(`🔥🔥🔥 KÍCH HOẠT ALARM RETRY: ${alarm.name} 🔥🔥🔥`);
    sendLogToServer(`Retry Alarm triggered: ${alarm.name}`);

    // 1. Lấy dữ liệu đã lưu từ storage
    const result = await chrome.storage.local.get(storageKey);
    const retryData = result[storageKey];

    if (!retryData) {
      console.error(`[Retry] Không tìm thấy dữ liệu để thử lại cho ${alarm.name}`);
      return;
    }

    // 2. Dọn dẹp storage và alarm ngay để tránh chạy lại nhầm
    await chrome.storage.local.remove(storageKey);
    await chrome.alarms.clear(alarm.name);

    // 3. Gọi lại hàm xử lý chính với dữ liệu đã lấy ra
    if (featureName === 'syncOrder' && retryData.orders) {
      handleSyncOrders(
        retryData.orders,
        retryData.options,
        retryData.apiKey,
        retryData.domain,
        retryData.retryCount
      );
    }
    else if (featureName === 'updateTracking' && retryData.orders) {
      // Gọi trực tiếp hàm processTrackingUpdates với dữ liệu đã lưu
      // Vì đây là retry chạy ngầm, không có sender và data ban đầu
      processTrackingUpdates(retryData.orders, retryData.retryCount, {}, {});
    }

    return; // Dừng lại sau khi xử lý alarm retry
  }


  if (alarm.name.startsWith("syncOrder_") || alarm.name === "test_syncOrder") {
    const featureName = 'syncOrder';
    await reportStatusToServer(featureName, 'RUNNING', `Alarm triggered: ${alarm.name}`);
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
      sendLogToServer(`ERROR in dailySyncOrder: ${error.message}`); // Log khi có lỗi
      await reportStatusToServer(featureName, 'FAILED', error.message);
      console.error("[BG] Đã xảy ra lỗi trong quá trình tự động sync order:", error);
    }
  }
  else if (alarm.name.startsWith("updateTracking_") || alarm.name === "test_updateTracking") {
    const featureName = 'updateTracking';
    await reportStatusToServer(featureName, 'RUNNING', `Alarm triggered: ${alarm.name}`);
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
  else if (alarm.name.startsWith("accountHealth_") || alarm.name === "test_accountHealth") {
    const featureName = 'accountHealth';
    const logPrefix = '[AccHealth]';
    await reportStatusToServer(featureName, 'RUNNING', `Alarm triggered: ${alarm.name}`);
    console.log("Đang chạy tự động kiểm tra account health theo lịch.");
    sendLogToServer(`${logPrefix} Bắt đầu quy trình kiểm tra tự động theo lịch.`);

    (async () => {
      try {
        // Dùng await để chờ cho đến khi tab được mở/focus xong
        const tab = await openPerformanceDashboardPage();

        if (!tab || !tab.id) {
          console.error("[BG] Không thể mở hoặc tạo tab Account Health.");
          sendLogToServer(`${logPrefix} LỖI: Không thể mở hoặc tạo tab Account Health.`);
          return;
        }

        console.log(`[BG] Đã mở tab Account Health (ID: ${tab.id}). Chờ tab load xong...`);
        sendLogToServer(`${logPrefix} Đã mở tab (ID: ${tab.id}). Đang chờ tab load xong...`);

        // Tạo một listener để chỉ lắng nghe sự kiện của đúng tab này
        const listener = (tabId, changeInfo, updatedTab) => {
          // Chỉ hành động khi đúng tab và tab đã tải xong hoàn toàn
          if (tabId === tab.id && changeInfo.status === 'complete') {
            console.log(`[BG] Tab ${tab.id} đã load xong. Gửi message 'autoGetAccountHealth'.`);
            sendLogToServer(`${logPrefix} Tab (ID: ${tab.id}) đã load xong. Gửi lệnh 'autoGetAccountHealth'.`);

            // Gửi message đến đúng tab ID đã có
            sendMessage(tab.id, "autoGetAccountHealth");

            // Gỡ bỏ listener này đi để nó không chạy lại nữa
            chrome.tabs.onUpdated.removeListener(listener);
          }
        };

        // Đăng ký listener
        chrome.tabs.onUpdated.addListener(listener);

      } catch (error) {
        console.error("[BG] Lỗi trong quá trình tự động lấy account health:", error);
        sendLogToServer(`${logPrefix} LỖI: ${error.message}`);
        await reportStatusToServer(featureName, 'FAILED', error.message);
      }
    })();
  }

  else if (alarm.name.startsWith("downloadAdsReports_") || alarm.name === "test_downloadAdsReports") {
    const featureName = 'downloadAdsReports';
    const logPrefix = '[AdsReport]'; // Tạo prefix cho dễ lọc log
    await reportStatusToServer(featureName, 'RUNNING', `Alarm triggered: ${alarm.name}`);
    console.log("Đang chạy tự động tải và tải lên báo cáo quảng cáo theo lịch...");
    sendLogToServer(`${logPrefix} Bắt đầu quy trình tự động theo lịch.`);

  // 1. Kiểm tra khóa
  if (isDownloadingAdsReport) {
    const skipMessage = "Bỏ qua vì tác vụ trước đó vẫn đang chạy.";
    console.log(skipMessage);
    sendLogToServer(`${logPrefix} ${skipMessage}`);
    await reportStatusToServer(featureName, 'SKIPPED', skipMessage);
    return;
  }
  // 2. Đặt khóa và bắt đầu
  isDownloadingAdsReport = true;
  console.log("Đã khóa isDownloadingAdsReport.");

  (async () => {
      try {
          console.log("Bắt đầu quá trình tải và tải lên báo cáo quảng cáo tự động...");

          // Lấy API key (merchantId) và URL của máy chủ
          const merchantId = await getMBApiKey();
          if (!merchantId) {
              throw new Error("Không thể lấy được merchantId để chạy tác vụ tự động.");
          }
          const UPLOAD_HANDLER_URL = "https://bkteam.top/dungvuong-admin/api/upload_ads_report_handler.php";
          console.log("Sử dụng merchantId cho URL báo cáo:", merchantId);
          sendLogToServer(`${logPrefix} Đã lấy được merchantId. Bắt đầu mở tab báo cáo.`);

          const reportsUrl = `https://advertising.amazon.com/reports/ref=xx_perftime_dnav_xx?merchantId=${merchantId}&locale=en_US&ref=RedirectedFromSellerCentralByRoutingService&entityId=ENTITY2G3AJUF27SG3C`;

          // Tạo tab mới (không active) để xử lý trong nền
          chrome.tabs.create({ url: reportsUrl, active: false }, async (newTab) => {
              if (!newTab || !newTab.id) {
                  throw new Error("Không thể tạo tab mới cho báo cáo quảng cáo.");
              }

              const reportTabId = newTab.id;
              sendLogToServer(`${logPrefix} Đã tạo tab xử lý (ID: ${reportTabId}). Đang chờ load...`);

              await new Promise(resolve => {
                  let listener = (tabId, changeInfo) => {
                      if (tabId === reportTabId && changeInfo.status === 'complete') {
                          chrome.tabs.onUpdated.removeListener(listener);
                          resolve();
                      }
                  };
                  chrome.tabs.onUpdated.addListener(listener);
                  setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
              });
              sendLogToServer(`${logPrefix} Tab (ID: ${reportTabId}) đã load xong. Đang trích xuất link báo cáo.`);

              await sleep(5000); // Đợi trang render

              // Lấy thông tin URL và tên báo cáo
            chrome.scripting.executeScript({
              target: { tabId: reportTabId },
              function: () => {
                const scheduledReports = [];
                // Lấy tất cả các dòng trong bảng báo cáo
                const allRows = document.querySelectorAll('.ag-row');

                allRows.forEach(row => {
                  // Trong mỗi dòng, tìm thẻ p chứa text của status
                  const statusElements = row.querySelectorAll('div[col-id="status"] p');
                  let isScheduled = false;
                  let isDaily = false;

                  statusElements.forEach(p => {
                    const statusText = p.textContent.trim();
                    if (statusText === 'Scheduled') {
                      isScheduled = true;
                    }
                    if (statusText === 'Daily') {
                      isDaily = true;
                    }
                  });

                  // Nếu dòng này có cả "Scheduled" và "Daily"
                  if (isScheduled && isDaily) {
                    // Thì mới tìm đến link download và report name trong dòng đó
                    const downloadLinkElement = row.querySelector('a[href*="/download-report/"]');
                    const reportNameElement = row.querySelector('a.sc-fqkvVR, a.sc-jdAMXn');

                    if (downloadLinkElement && reportNameElement) {
                      scheduledReports.push({
                        url: downloadLinkElement.href,
                        reportName: reportNameElement.textContent.trim()
                      });
                    }
                  }
                });

                return scheduledReports;
              }
            }, async (injectionResults) => {
                try{
                  // Đóng tab ngay sau khi có dữ liệu
                  try { await chrome.tabs.remove(reportTabId); } catch (e) { console.error("Lỗi khi đóng tab báo cáo:", e); }

                  if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
                      console.error("Tự động: Không thể tìm thấy báo cáo để tải lên.");
                      sendLogToServer(`${logPrefix} LỖI: Không thể tìm thấy link báo cáo trên trang.`);
                      throw new Error("Không tìm thấy link báo cáo trên trang."); // Sửa ở đây
                  }

                  const reportsToUpload = injectionResults[0].result;
                  if (reportsToUpload.length === 0) {
                    const skipMessage = "Không có báo cáo mới nào để xử lý.";
                    console.log(`Tự động: ${skipMessage}`);
                    sendLogToServer(`${logPrefix} ${skipMessage}`);
                    // Gửi trạng thái SKIPPED về server
                    await reportStatusToServer(featureName, 'SKIPPED', skipMessage);
                    // Thoát khỏi hàm ngay tại đây, không chạy code bên dưới nữa
                    return;
                  }
                  sendLogToServer(`${logPrefix} Tìm thấy ${reportsToUpload.length} báo cáo. Bắt đầu tải và upload...`);
                  console.log(`Tự động: Tìm thấy ${reportsToUpload.length} báo cáo để xử lý.`);
                  let successCount = 0;

                  // Tải lên từng báo cáo
                  for (const { url, reportName } of reportsToUpload) {
                      try {
                          const response = await fetch(url);
                          if (!response.ok) throw new Error(`Lỗi tải báo cáo ${reportName}: ${response.statusText}`);
                          console.log("Content-Type:", response.headers.get('Content-Type'));
                          console.log("Content-Disposition:", response.headers.get('Content-Disposition'));
                          let finalFilename = '';

                          // --- BEGIN: LOGIC LẤY TÊN FILE ĐÃ SỬA ---

                          // ƯU TIÊN 1: Lấy từ header 'Content-Disposition'
                          const disposition = response.headers.get('Content-Disposition');
                          if (disposition && disposition.includes('filename=')) {
                            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                            const matches = filenameRegex.exec(disposition);
                            if (matches != null && matches[1]) {
                              finalFilename = matches[1].replace(/['"]/g, '');
                              sendLogToServer(`${logPrefix} Lấy tên file từ Content-Disposition: '${finalFilename}'`);
                            }
                          }

                          // ƯU TIÊN 2: Nếu không có, lấy từ URL cuối cùng (sau khi redirect)
                          if (!finalFilename && response.url) {
                            try {
                              const finalUrl = new URL(response.url);
                              // Tách lấy phần path, ví dụ: /2025/.../report.xlsx
                              const pathParts = finalUrl.pathname.split('/');
                              // Lấy phần cuối cùng
                              const filenameFromUrl = pathParts[pathParts.length - 1];

                              // Kiểm tra xem nó có phải là một tên file hợp lệ không
                              if (filenameFromUrl && (filenameFromUrl.toLowerCase().endsWith('.xlsx') || filenameFromUrl.toLowerCase().endsWith('.csv'))) {
                                finalFilename = filenameFromUrl;
                                sendLogToServer(`${logPrefix} Lấy tên file từ URL cuối cùng: '${finalFilename}'`);
                              }
                            } catch(e) { /* Bỏ qua nếu URL không hợp lệ */ }
                          }

                          // ƯU TIÊN 3: Nếu vẫn không có, dùng tên lấy từ trang web
                          if (!finalFilename) {
                            finalFilename = reportName;
                            sendLogToServer(`${logPrefix} Không có header/URL, dùng tên file từ trang web: '${finalFilename}'`);
                          }

                          // --- END: LOGIC LẤY TÊN FILE ĐÃ SỬA ---

                          // Logic kiểm tra Content-Type và dự phòng giữ nguyên
                          const contentType = response.headers.get('Content-Type');
                          if (contentType) {
                            if (contentType.includes('text/csv') && !finalFilename.toLowerCase().endsWith('.csv')) {
                              finalFilename += '.csv';
                            } else if (contentType.includes('spreadsheetml') && !finalFilename.toLowerCase().endsWith('.xlsx')) {
                              finalFilename += '.xlsx';
                            }
                          }
                          
                          // Nếu tên tệp vẫn không có đuôi, thêm đuôi mặc định là .csv
                          console.log("Kiểm tra cả CSV và XLSX");
                          if (!finalFilename.toLowerCase().endsWith('.csv') && !finalFilename.toLowerCase().endsWith('.xlsx')) {
                              sendLogToServer(`${logPrefix} CẢNH BÁO: Tên file từ Amazon ('${finalFilename}') không có đuôi .csv/.xlsx. Tự động thêm đuôi .csv.`);
                              finalFilename += '.csv';
                          }
                          const fileBlob = await response.blob();
                          
                          const formData = new FormData();
                          // **QUAN TRỌNG: Sử dụng `reportName` để giữ tên tệp gốc**
                          formData.append('report_file', fileBlob, finalFilename);
                          formData.append('merchant_id', merchantId);

                          const uploadResponse = await fetch(UPLOAD_HANDLER_URL, { method: 'POST', body: formData });
                          const uploadResult = await uploadResponse.json();

                          if (uploadResult.status !== 'success') throw new Error(`Lỗi từ máy chủ cho tệp ${reportName}: ${uploadResult.message}`);
                          
                          successCount++;
                          console.log(`Tự động: Tải lên thành công: ${reportName}`);
                          sendLogToServer(`${logPrefix} Đã upload thành công file: ${reportName}`);
                      } catch (error) {
                          console.error(`Tự động: Lỗi xử lý báo cáo ${reportName}:`, error);
                          sendLogToServer(`${logPrefix} LỖI khi xử lý file '${reportName}': ${error.message}`);
                      }
                      await sleep(1000); // Tránh request dồn dập
                  }
                  
                  console.log(`Tự động: Hoàn tất. Đã tải lên thành công ${successCount}/${reportsToUpload.length} báo cáo.`);
                  sendLogToServer(`${logPrefix} Hoàn tất. Đã upload thành công ${successCount}/${reportsToUpload.length} báo cáo.`);
                  const finalMessage = `Hoàn tất. Đã upload thành công ${successCount}/${reportsToUpload.length} báo cáo.`;
                  await reportStatusToServer(featureName, 'SUCCESS', finalMessage);
                  saveLog("adsReportsLog", { type: "Auto Ads Reports Upload", date: new Date().toISOString(), successCount: successCount, totalFound: reportsToUpload.length });
              } catch (error) {
                console.error("Lỗi nghiêm trọng trong quá trình tự động tải báo cáo:", error);
                sendLogToServer(`${logPrefix} LỖI NGHIÊM TRỌNG: ${error.message}`);
                await reportStatusToServer(featureName, 'FAILED', error.message);
              } finally {
                // 3. Mở khóa
                isDownloadingAdsReport = false;
                console.log("[Ads Report] Bỏ khóa isDownloadingAdsReport.");
                sendLogToServer(`${logPrefix} Đã bỏ khóa. Kết thúc quy trình.`);
              }
              });
          });
      } catch (error) {
        console.error("Lỗi nghiêm trọng xảy ra ở bước setup:", error);
        sendLogToServer(`${logPrefix} LỖI NGHIÊM TRỌNG (SETUP): ${error.message}`);
        await reportStatusToServer(featureName, 'FAILED', error.message);
        // Đảm bảo mở khóa nếu có lỗi sớm
        isDownloadingAdsReport = false;
      }
  })();
  }
  // else if (alarm.name === "autoRequestPayment") {
  //     const logPrefix = '[AutoPaymentTrigger]';
  //     console.log(`${logPrefix} Báo thức kích hoạt. Bắt đầu quy trình rút tiền tự động.`);
  //     sendLogToServer(`${logPrefix} Báo thức kích hoạt lúc ${new Date().toLocaleString()}`);
  //     setTimeout(() => {
  //         console.log(`${logPrefix} Đặt lịch cho lần rút tiền tiếp theo`);
  //         scheduleNextPaymentRequest();
  //     }, 5000); // Đợi 5 giây sau khi xử lý xong rồi mới tạo alarm mới

  //     // Hàm helper để inject và trigger payment
  //     const injectAndTriggerPayment = async (tabId) => {
  //         try {
  //             // Đợi thêm để đảm bảo content script đã load
  //             await sleep(3000);
              
  //             // Kiểm tra xem content script đã được inject chưa
  //             const response = await chrome.tabs.sendMessage(tabId, { message: "ping" }).catch(() => null);
              
  //             if (!response || !response.injected) {
  //                 console.log(`${logPrefix} Content script chưa sẵn sàng, đợi thêm...`);
  //                 await sleep(2000);
  //             }
              
  //             console.log(`${logPrefix} Gửi lệnh trigger payment button đến tab ${tabId}`);
  //             sendLogToServer(`${logPrefix} Gửi lệnh triggerAutoPaymentButton đến tab ${tabId}`);
              
  //             chrome.tabs.sendMessage(tabId, {
  //                 message: "triggerAutoPaymentButton",
  //                 data: {
  //                     source: "autoRequestPayment_alarm",
  //                     timestamp: Date.now()
  //                 }
  //             }, (response) => {
  //                 if (chrome.runtime.lastError) {
  //                     console.error(`${logPrefix} Lỗi khi gửi message:`, chrome.runtime.lastError);
  //                     sendLogToServer(`${logPrefix} LỖI: ${chrome.runtime.lastError.message}`);
  //                 } else {
  //                     console.log(`${logPrefix} Đã gửi lệnh thành công, response:`, response);
  //                     sendLogToServer(`${logPrefix} Lệnh đã được gửi và nhận phản hồi`);
  //                 }
  //             });
  //         } catch (error) {
  //             console.error(`${logPrefix} Lỗi trong quá trình inject và trigger:`, error);
  //             sendLogToServer(`${logPrefix} LỖI: ${error.message}`);
  //         }
  //     };

  //     // Tìm hoặc tạo tab Orders
  //     chrome.tabs.query({ url: "*://sellercentral.amazon.com/orders-v3*" }, async (tabs) => {
  //         if (tabs && tabs.length > 0) {
  //             // Đã có tab Orders mở sẵn
  //             const existingTab = tabs[0];
  //             console.log(`${logPrefix} Tìm thấy tab Orders có sẵn (ID: ${existingTab.id})`);
  //             sendLogToServer(`${logPrefix} Sử dụng tab Orders hiện có (ID: ${existingTab.id})`);
              
  //             // Focus vào tab
  //             chrome.tabs.update(existingTab.id, { active: true }, async () => {
  //                 // Reload tab để đảm bảo content script fresh
  //                 chrome.tabs.reload(existingTab.id, {}, () => {
  //                     // Đợi tab reload xong
  //                     const reloadListener = (tabId, changeInfo) => {
  //                         if (tabId === existingTab.id && changeInfo.status === 'complete') {
  //                             chrome.tabs.onUpdated.removeListener(reloadListener);
  //                             console.log(`${logPrefix} Tab đã reload xong, bắt đầu trigger payment`);
  //                             injectAndTriggerPayment(existingTab.id);
  //                         }
  //                     };
  //                     chrome.tabs.onUpdated.addListener(reloadListener);
  //                 });
  //             });
              
  //         } else {
  //             // Không có tab Orders nào, tạo mới
  //             console.log(`${logPrefix} Không tìm thấy tab Orders, tạo tab mới`);
  //             sendLogToServer(`${logPrefix} Tạo tab Orders mới`);
              
  //             const targetUrl = `https://sellercentral.amazon.com/orders-v3?page=1`;
              
  //             chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
  //                 if (chrome.runtime.lastError || !newTab || !newTab.id) {
  //                     const errorMsg = `Không thể tạo tab mới: ${chrome.runtime.lastError?.message}`;
  //                     console.error(`${logPrefix} ${errorMsg}`);
  //                     sendLogToServer(`${logPrefix} LỖI: ${errorMsg}`);
  //                     return;
  //                 }
                  
  //                 console.log(`${logPrefix} Đã tạo tab mới (ID: ${newTab.id}), đợi load xong...`);
                  
  //                 // Listener cho tab mới
  //                 const loadListener = (tabId, changeInfo) => {
  //                     if (tabId === newTab.id && changeInfo.status === 'complete') {
  //                         chrome.tabs.onUpdated.removeListener(loadListener);
  //                         console.log(`${logPrefix} Tab mới đã load xong, bắt đầu trigger payment`);
  //                         injectAndTriggerPayment(newTab.id);
  //                     }
  //                 };
  //                 chrome.tabs.onUpdated.addListener(loadListener);
  //             });
  //         }
  //     });
  // }
  if (alarm.name.startsWith("paymentRequest_")) {
      const logPrefix = '[AutoPaymentTrigger]';
      console.log(`${logPrefix} Báo thức kích hoạt. Bắt đầu quy trình rút tiền tự động.`);
        // sendLogToServer(`${logPrefix} Báo thức kích hoạt lúc ${new Date().toLocaleString()}`);
        // setTimeout(() => {
        //     console.log(`${logPrefix} Đặt lịch cho lần rút tiền tiếp theo`);
        //     scheduleNextPaymentRequest();
        // }, 5000); // Đợi 5 giây sau khi xử lý xong rồi mới tạo alarm mới

      // Hàm helper để inject và trigger payment
      const injectAndTriggerPayment = async (tabId) => {
          try {
              // Đợi thêm để đảm bảo content script đã load
              await sleep(3000);
              
              // Kiểm tra xem content script đã được inject chưa
              const response = await chrome.tabs.sendMessage(tabId, { message: "ping" }).catch(() => null);
              
              if (!response || !response.injected) {
                  console.log(`${logPrefix} Content script chưa sẵn sàng, đợi thêm...`);
                  await sleep(2000);
              }
              
              console.log(`${logPrefix} Gửi lệnh trigger payment button đến tab ${tabId}`);
              sendLogToServer(`${logPrefix} Gửi lệnh triggerAutoPaymentButton đến tab ${tabId}`);
              
              chrome.tabs.sendMessage(tabId, {
                  message: "triggerAutoPaymentButton",
                  data: {
                      source: "autoRequestPayment_alarm",
                      timestamp: Date.now()
                  }
              }, (response) => {
                  if (chrome.runtime.lastError) {
                      console.error(`${logPrefix} Lỗi khi gửi message:`, chrome.runtime.lastError);
                      sendLogToServer(`${logPrefix} LỖI: ${chrome.runtime.lastError.message}`);
                  } else {
                      console.log(`${logPrefix} Đã gửi lệnh thành công, response:`, response);
                      sendLogToServer(`${logPrefix} Lệnh đã được gửi và nhận phản hồi`);
                  }
              });
          } catch (error) {
              console.error(`${logPrefix} Lỗi trong quá trình inject và trigger:`, error);
              sendLogToServer(`${logPrefix} LỖI: ${error.message}`);
          }
      };

      // Tìm hoặc tạo tab Orders
      chrome.tabs.query({ url: "*://sellercentral.amazon.com/orders-v3*" }, async (tabs) => {
          if (tabs && tabs.length > 0) {
              // Đã có tab Orders mở sẵn
              const existingTab = tabs[0];
              console.log(`${logPrefix} Tìm thấy tab Orders có sẵn (ID: ${existingTab.id})`);
              sendLogToServer(`${logPrefix} Sử dụng tab Orders hiện có (ID: ${existingTab.id})`);
              
              // Focus vào tab
              chrome.tabs.update(existingTab.id, { active: true }, async () => {
                  // Reload tab để đảm bảo content script fresh
                  chrome.tabs.reload(existingTab.id, {}, () => {
                      // Đợi tab reload xong
                      const reloadListener = (tabId, changeInfo) => {
                          if (tabId === existingTab.id && changeInfo.status === 'complete') {
                              chrome.tabs.onUpdated.removeListener(reloadListener);
                              console.log(`${logPrefix} Tab đã reload xong, bắt đầu trigger payment`);
                              injectAndTriggerPayment(existingTab.id);
                          }
                      };
                      chrome.tabs.onUpdated.addListener(reloadListener);
                  });
              });
              
          } else {
              // Không có tab Orders nào, tạo mới
              console.log(`${logPrefix} Không tìm thấy tab Orders, tạo tab mới`);
              sendLogToServer(`${logPrefix} Tạo tab Orders mới`);
              
              const targetUrl = `https://sellercentral.amazon.com/orders-v3?page=1`;
              
              chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
                  if (chrome.runtime.lastError || !newTab || !newTab.id) {
                      const errorMsg = `Không thể tạo tab mới: ${chrome.runtime.lastError?.message}`;
                      console.error(`${logPrefix} ${errorMsg}`);
                      sendLogToServer(`${logPrefix} LỖI: ${errorMsg}`);
                      return;
                  }
                  
                  console.log(`${logPrefix} Đã tạo tab mới (ID: ${newTab.id}), đợi load xong...`);
                  
                  // Listener cho tab mới
                  const loadListener = (tabId, changeInfo) => {
                      if (tabId === newTab.id && changeInfo.status === 'complete') {
                          chrome.tabs.onUpdated.removeListener(loadListener);
                          console.log(`${logPrefix} Tab mới đã load xong, bắt đầu trigger payment`);
                          injectAndTriggerPayment(newTab.id);
                      }
                  };
                  chrome.tabs.onUpdated.addListener(loadListener);
              });
          }
      });
  }


  else if (alarm.name === "testPaymentAlarm") {
        console.log("[Payment] Đã đến giờ chạy test payment");
        
        const merchantId = getMBApiKey();
        if (!merchantId) {
            console.error("[Payment] Không lấy được merchantId cho test");
            return;
        }
        
        // Thực hiện test payment (không click button thật)
        chrome.tabs.create({
            url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
            active: true
        }, (tab) => {
            if (chrome.runtime.lastError || !tab || !tab.id) {
                console.error("[Payment] Không thể tạo tab cho test:", chrome.runtime.lastError?.message);
                return;
            }
            
            function handleTestAlarmUpdate(updatedTabId, changeInfo) {
                if (updatedTabId === tab.id && changeInfo.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(handleTestAlarmUpdate);
                    
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['scripts/payment_auto.js']
                    }).then(() => {
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tab.id, {
                                message: "startPaymentProcess",
                                data: { 
                                    tabId: tab.id,
                                    testMode: true,
                                    clickButton: false
                                }
                            });
                        }, 2000);
                    });
                }
            }
            
            chrome.tabs.onUpdated.addListener(handleTestAlarmUpdate);
        });
  }
  else if (alarm.name.startsWith("sendMessageAuto_") || alarm.name === "test_sendMessageAuto") {
    const featureName = 'sendMessageAuto'; // Dùng lại featureName của tính năng gốc để server monitor
    const logPrefix = '[SendMessageAuto]';
    await reportStatusToServer(featureName, 'RUNNING', `Alarm triggered: ${alarm.name}`);
    console.log(`Đang chạy tự động gửi tin nhắn design theo lịch (${alarm.name})...`);
    sendLogToServer(`${logPrefix} Bắt đầu quy trình tự động theo lịch.`);

    try {
      // Gọi hàm xử lý chính của mày
      await fetchAndProcessDesignTasks();
      // Báo cáo thành công nếu hàm chạy xong không lỗi
      const finalMessage = `Hoàn tất tác vụ gửi tin nhắn tự động từ alarm: ${alarm.name}.`;
      await reportStatusToServer(featureName, 'SUCCESS', finalMessage);
      sendLogToServer(`${logPrefix} ${finalMessage}`);

    } catch (error) {
      console.error(`${logPrefix} Lỗi trong quá trình tự động gửi tin nhắn:`, error);
      sendLogToServer(`${logPrefix} LỖI: ${error.message}`);
      await reportStatusToServer(featureName, 'FAILED', error.message);
    }
  }
});

/**
 * Lấy địa chỉ IP public từ dịch vụ bên ngoài.
 */
const getPublicIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) throw new Error(`IP service status: ${response.status}`);
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error("Lỗi khi lấy IP public:", error);
    sendLogToServer(`Lỗi khi lấy IP public: ${error.message}`);
    return null;
  }
};

/**
 * Hàm chính để gửi yêu cầu cập nhật IP.
 * Sẽ kiểm tra cài đặt trước khi gửi.
 */
const sendIPUpdateRequest = async () => {
  // BƯỚC QUAN TRỌNG NHẤT: Đọc cài đặt từ storage
  const settings = await chrome.storage.local.get({ [ipTrackingKey]: true });

  // Nếu người dùng không bật tính năng này, dừng lại ngay
  if (!settings[ipTrackingKey]) {
    console.log("Tính năng gửi IP đang tắt. Bỏ qua.");
    return;
  }

  // Nếu được bật, tiếp tục quy trình như cũ
  console.log("Tính năng gửi IP đang bật. Chuẩn bị gửi yêu cầu...");
  const ip = await getPublicIP();
  const apiKey = await getMBApiKey();

  if (!ip || !apiKey) {
    console.error("Không thể gửi cập nhật vì thiếu IP hoặc API Key.", { ip, apiKey });
    sendLogToServer(`Bỏ qua cập nhật IP do thiếu thông tin: IP=${ip}, APIKey=${apiKey}`);
    return;
  }

  const payload = {
    ip: ip,
    merchantId: apiKey
  };

  const result = await sendRequestToMB("updateIpAddress", apiKey, JSON.stringify(payload));

  if (result && result.status === 'success') {
    console.log("Cập nhật IP lên server thành công:", result.message);
  } else {
    console.error("Cập nhật IP lên server thất bại:", result?.error || result?.message || "Lỗi không xác định");
    sendLogToServer(`Cập nhật IP thất bại: ${JSON.stringify(result)}`);
  }
};

/**
 * Lấy hoặc tạo một ID duy nhất cho mỗi máy/lần cài đặt extension.
 * ID này được lưu trữ trong `chrome.storage.local` để tồn tại lâu dài.
 * @returns {Promise<string>} - The unique machine ID.
 */
const getMachineId = async () => {
  let result = await chrome.storage.local.get('machineId');
  if (result.machineId) {
      return result.machineId;
  } else {
      // Tạo một ID ngẫu nhiên và lưu lại
      const newMachineId = 'machine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      await chrome.storage.local.set({ machineId: newMachineId });
      return newMachineId;
  }
};

// =================================================================
// BẮT ĐẦU: HỆ THỐNG LOGGING TỐI ƯU (BATCHING)
// =================================================================

let logBuffer = [];
let logTimer = null;
const LOG_FLUSH_INTERVAL = 5000; // Gửi log mỗi 5 giây
const LOG_BUFFER_LIMIT = 20; // Hoặc gửi ngay khi có 20 log

/**
 * Hàm này sẽ thực sự gửi log lên server.
 * Nó chỉ được gọi bởi timer hoặc khi buffer đầy.
 */
const flushLogs = async () => {
  // Nếu không có log nào trong buffer thì thôi
  if (logBuffer.length === 0) {
    if(logTimer) clearTimeout(logTimer);
    logTimer = null;
    return;
  }

  // Tạo một bản sao của buffer và xóa buffer gốc ngay lập tức
  const logsToSend = [...logBuffer];
  logBuffer = [];

  // Hủy timer cũ
  if(logTimer) clearTimeout(logTimer);
  logTimer = null;

  console.log(`[Logger] Flushing ${logsToSend.length} log(s) to server...`);

  // Lấy thông tin chung một lần duy nhất cho cả lô
  const merchantId = await getMBApiKey();
  const machineId = await getMachineId();
  const finalMerchantId = merchantId || 'UNKNOWN_MERCHANT';
  const logEndpoint = "https://bkteam.top/dungvuong-admin/api/log_receiver.php";

  // --- THAY ĐỔI Ở ĐÂY ---
  // Lấy version của extension từ file manifest
  const version = chrome.runtime.getManifest().version;

  try {
    const response = await fetch(logEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Gửi một mảng các log
        logs: logsToSend,
        merchantId: finalMerchantId,
        machineId: machineId,
        version: version // Thêm trường version vào đây
      }),
    });
    if (!response.ok) {
      console.error(`Log server returned an error! Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Failed to flush logs to server. Error:", error);
  }
};

/**
 * Hàm này mày sẽ gọi trong code. Nó không có "await".
 * Nó chỉ thêm log vào buffer và hẹn giờ để gửi đi.
 * @param {string} logMessage - Nội dung cần ghi log.
 */
const sendLogToServer = (logMessage) => {
  if (!logMessage) return;

  // Thêm message và timestamp vào buffer
  const timestamp = new Date().toISOString();
  logBuffer.push({ timestamp, message: logMessage });

  // Nếu buffer đầy, gửi đi ngay lập tức
  if (logBuffer.length >= LOG_BUFFER_LIMIT) {
    flushLogs();
  }
  // Nếu chưa có timer nào chạy, hãy tạo một timer mới
  else if (!logTimer) {
    logTimer = setTimeout(flushLogs, LOG_FLUSH_INTERVAL);
  }
};
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
// scheduleNextPaymentRequest();
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

/**
 * Đảm bảo một content script đã được tiêm vào một tab cụ thể.
 * Sử dụng chrome.scripting.executeScript để tiêm nếu cần.
 * @param {number} tabId - ID của tab cần kiểm tra và tiêm script.
 * @param {string} scriptPath - Đường dẫn đến file script cần tiêm (ví dụ: 'scripts/sync_order.js').
 * @returns {Promise<boolean>} - Trả về true nếu script đã được tiêm thành công hoặc đã có sẵn, ngược lại trả về false.
 */
const ensureContentScriptInjected = async (tabId, scriptPath) => {
  try {
    // Thử thực thi một đoạn script rỗng để xem có lỗi không.
    // Nếu script đã tồn tại, nó sẽ không báo lỗi "No script context".
    // Tuy nhiên, cách đáng tin cậy hơn là cứ inject. API scripting sẽ không inject lại nếu script đã có.
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [scriptPath],
    });
    // Nếu không có lỗi, coi như thành công
    console.log(`[BG] Đã tiêm/xác nhận script '${scriptPath}' vào tab ${tabId} thành công.`);
    return true;
  } catch (error) {
    // Lỗi có thể xảy ra nếu không có quyền truy cập vào trang (ví dụ: chrome:// pages)
    // hoặc đường dẫn file script không đúng.
    console.error(`[BG] Lỗi khi tiêm script '${scriptPath}' vào tab ${tabId}:`, error.message);
    return false;
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
                  sendLogToServer(`SendMessage failed for tab ${tabId}. Error: ${chrome.runtime.lastError.message}`);
                  stopInterval(start);
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
                      sendLogToServer(`SendMessage failed for tab ${tabId}. Error: ${chrome.runtime.lastError.message}`);
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

const getMBApiKey = () => {
    return new Promise(async (resolve) => {
        // 1. Ưu tiên lấy từ biến global trước nhất
        if (globalMBApiKey) {
            return resolve( (globalMBApiKey || '').toString().trim() );
        }

        // 2. Nếu global không có, lấy từ storage
        const result = await chrome.storage.local.get("MBApi");
        if (result["MBApi"]) {
          const cleanedKey = (result["MBApi"] || '').toString().trim();
          globalMBApiKey = cleanedKey; // Lưu vào global để lần sau dùng
          return resolve(cleanedKey);
        }

        // 3. Nếu storage cũng không có, mới hỏi content script
        const isSended = await sendToContentScript("getApiKey", null);
        if (!isSended) {
            return resolve(null); // Không gửi được message thì trả về null
        }

        // Listener này chỉ được tạo khi thực sự cần hỏi content script
        const listener = (req) => {
            const { message, data } = req || {};
            if (message === "getApiKey" && data) {
                chrome.runtime.onMessage.removeListener(listener); // Tự hủy sau khi nhận được key

                const cleanedKey = (data || '').toString().trim();
                globalMBApiKey = cleanedKey; // Lưu vào global
                chrome.storage.local.set({ MBApi: cleanedKey }); // Lưu cả vào storage cho lần sau
                resolve(cleanedKey);
            }
        };

        chrome.runtime.onMessage.addListener(listener);
    });
};

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
    const url = `${globalDomain}/orders-v3?page=1&date-range=last-30`;
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
async function checkPaymentAlarm() {
    const alarm = await chrome.alarms.get("autoRequestPayment");
    if (alarm) {
        const nextRun = new Date(alarm.scheduledTime);
        console.log("[Payment] Alarm đang chạy, lần tiếp theo:", nextRun.toLocaleString());
        return true;
    } else {
        console.log("[Payment] Không có alarm nào được set");
        return false;
    }
}
checkPaymentAlarm();

let stopProcess = false;

// Sử dụng hàm async IIFE để xử lý và đảm bảo finally luôn được gọi
async function processTrackingUpdates(ordersToProcess, retryCount = 0, initialSender = {}, initialData = {}) {
  const featureName = 'updateTracking'; // <--- Tên này dùng làm key

  // SỬA ĐOẠN NÀY
  const { alarmSettings } = await chrome.storage.local.get('alarmSettings');
  // Lấy config riêng cho "updateTracking"
  const retryConfig = alarmSettings?.retry_configs?.[featureName];

  // Dùng giá trị riêng, nếu không có thì dùng mặc định
  const MAX_RETRIES = retryConfig?.max_retries || 3;
  const DELAY_MINUTES = retryConfig?.delay_minutes || 1;

  if (retryCount >= MAX_RETRIES) {
    sendLogToServer(`[Update Tracking][Retry] Đã thử lại ${retryCount} lần nhưng vẫn lỗi. Tạm dừng.`);
    await reportStatusToServer(featureName, 'FAILED', `Đã thất bại sau ${MAX_RETRIES} lần thử lại.`);
    await chrome.storage.local.remove('retry_updateTracking_data'); // Dọn dẹp
    isUpdateTrackingRunning = false; // Mở khóa
    return;
  }

  const initialTabId = initialSender.tab ? initialSender.tab.id : null;
  const autoModeFromReq = initialData?.autoMode || false;
  let workerTab = null;

  try {
    // 2. ĐẶT KHÓA và bắt đầu quy trình
    isUpdateTrackingRunning = true;
    console.log(`[BG] Đặt khóa isUpdateTrackingRunning = true (lần chạy #${retryCount})`);

    const startMessage = 'Bắt đầu quy trình Update Tracking.';
    sendLogToServer(`[Update Tracking] ${startMessage}`);
    await reportStatusToServer(featureName, 'RUNNING', startMessage);

    let orders;
    const apiKey = await getMBApiKey();

    // SỬA: Chỉ lấy đơn hàng từ server ở lần chạy đầu tiên
    if (retryCount === 0) {
      const startMessage = 'Bắt đầu quy trình Update Tracking.';
      sendLogToServer(`[Update Tracking] ${startMessage}`);
      await reportStatusToServer(featureName, 'RUNNING', startMessage);

      const result = await sendRequestToMB("OrderNeedUpdateTracking", apiKey, JSON.stringify({ input: apiKey }));
      if (result.error || result.errors?.[0]?.message) throw new Error(result.error || result.errors[0].message);
      orders = result.data;
    } else {
      orders = ordersToProcess; // Lấy danh sách đơn lỗi từ tham số
      sendLogToServer(`[Update Tracking][Retry] Bắt đầu thử lại lần ${retryCount + 1} cho ${orders.length} đơn còn lại.`);
    }

    if (!orders || orders.length === 0) {
      const skipMessage = "Không có đơn hàng nào cần xử lý.";
      console.log("[BG] Không có đơn hàng nào cần cập nhật tracking.");
      sendLogToServer(`[Update Tracking] Hoàn tất: ${skipMessage}`);
      await reportStatusToServer(featureName, 'SKIPPED', skipMessage);

      sendMessage(initialTabId, "updateTracking", {
        error: null,
        message: "Không có đơn hàng nào cần xử lý.",
        autoMode: autoModeFromReq
      });
      isUpdateTrackingRunning = false;
      return; // Kết thúc sớm nếu không có đơn hàng
    }

    sendLogToServer(`[Update Tracking] Tìm thấy ${orders.length} đơn hàng. Bắt đầu xử lý...`);
    console.log(`[BG] Tìm thấy ${orders.length} đơn hàng. Bắt đầu xử lý...`);
    const UnshippedOrders = await new Promise(r => chrome.storage.local.get("UnshippedOrders", res => r(res.UnshippedOrders || [])));

    // Mở một tab làm việc duy nhất
    workerTab = await openAndEnsureTabReady(`${globalDomain}/orders-v3`, null);
    let overallErrorMessage = null;

    let successCount = 0;
    const failedOrdersForRetry = [];

    // 3. SỬ DỤNG VÒNG LẶP FOR...OF
    for (const order of orders) {
      try {
        // --- BƯỚC 1: LẤY TRẠNG THÁI THỰC TẾ TỪ WEB LÀM NGUỒN CHÂN LÝ ---
        sendLogToServer(`[Update Tracking][${order.orderId}] Đang xác minh trạng thái thực tế trên web...`);

        const verifyUrl = `${globalDomain}/orders-v3/order/${order.orderId}`;
        await openAndEnsureTabReady(verifyUrl, workerTab.id);

        const verificationResult = await sendMessageAndPromiseResponse(workerTab.id, "verifyAddTracking", { orderId: order.orderId, trackingCode: "" }, "verifyAddTracking", order.orderId);

        // `isUnshipped` bây giờ đáng tin cậy 100%
        const isUnshipped = verificationResult.status !== 'success';
        console.log(`[BG] Đơn ${order.orderId}: Trạng thái thực tế là ${isUnshipped ? 'Unshipped' : 'Shipped'}.`);

        // --- BƯỚC 2: PHÂN LUỒNG XỬ LÝ DỰA TRÊN TRẠNG THÁI THỰC TẾ ---

        // TÌNH HUỐNG A: Đơn đã SHIP và DB không có tracking => Chỉ cần báo server, không cần làm gì thêm.
        if (!isUnshipped && (!order.tracking || String(order.tracking).trim() === '')) {
          sendLogToServer(`[Update Tracking][${order.orderId}] Tình huống tối ưu: Đơn đã Shipped, tracking rỗng. Bỏ qua điền form.`);

          const queryUpdate = JSON.stringify({ orderId: order.orderId, trackingCode: "" });
          await sendRequestToMB("addedTrackingCode", apiKey, queryUpdate);

          successCount++;
          continue; // Xong, xử lý đơn tiếp theo
        }

        // TÌNH HUỐNG B: Đơn chưa SHIP hoặc Đơn đã SHIP nhưng cần điền tracking mới => Tiến hành điền form.
        order.carrier = detectCarrier(order.carrier?.toLowerCase()) || detectCarrier(detectCarrierCode(order.tracking));

        const actionUrl = isUnshipped
          ? `${globalDomain}/orders-v3/order/${order.orderId}/confirm-shipment`
          : `${globalDomain}/orders-v3/order/${order.orderId}/edit-shipment`;
        const formFillMessageType = isUnshipped ? "forceAddTracking" : "forceEditTracking";

        // Thao tác 1: Điều hướng và điền form
        await openAndEnsureTabReady(actionUrl, workerTab.id);
        const addedTrackingData = await sendMessageAndPromiseResponse(workerTab.id, formFillMessageType, order, "addedTrackingCode", order.orderId);
        if (addedTrackingData.status === 'error') {
          throw new Error(addedTrackingData.message || `Lỗi từ content script khi xử lý đơn ${order.orderId}`);
        }

        // Thao tác 2: Điều hướng lại và xác minh lần cuối
        await openAndEnsureTabReady(verifyUrl, workerTab.id);
        const finalVerificationResult = await sendMessageAndPromiseResponse(workerTab.id, "verifyAddTracking", { orderId: order.orderId, trackingCode: addedTrackingData.trackingCode }, "verifyAddTracking", order.orderId);

        // Thao tác 3: Gửi kết quả về server nếu thành công
        if (finalVerificationResult.status === "success") {
          const queryUpdate = JSON.stringify({ orderId: order.orderId, trackingCode: addedTrackingData.trackingCode });
          await sendRequestToMB("addedTrackingCode", apiKey, queryUpdate);
          successCount++;
          sendLogToServer(`[Update Tracking][${order.orderId}] Xử lý thành công.`);
        } else {
          throw new Error(finalVerificationResult.message || `Xác minh thất bại cho đơn hàng ${order.orderId}`);
        }

      } catch (e) {
        failedOrdersForRetry.push(order);
        sendLogToServer(`[Update Tracking] Lỗi xử lý đơn ${order.orderId}: ${e.message}`);
        console.error(`[BG] Lỗi khi xử lý đơn hàng ${order.orderId}: ${e.message}`);
        await sleep(2000);
      }
    } // Kết thúc vòng lặp for

    const errorCount = failedOrdersForRetry.length;
    const finalMessage = `Hoàn tất lần chạy (thử lại lần ${retryCount}). Tổng: ${orders.length}, Thành công: ${successCount}, Thất bại: ${errorCount}.`;
    sendLogToServer(`[Update Tracking] ${finalMessage}`);
    if (errorCount > 0) {
      const nextRetryCount = retryCount + 1;
      const alarmName = `retry_updateTracking`;
      await reportStatusToServer(featureName, 'RETRYING', `Thất bại ${errorCount} đơn. Chuẩn bị thử lại lần ${nextRetryCount}.`);

      // 1. Lưu dữ liệu retry vào storage
      await chrome.storage.local.set({
        [`${alarmName}_data`]: {
          orders: failedOrdersForRetry,
          // Lưu các tham số khác nếu cần cho lần chạy lại
        }
      });

      // 2. Tạo alarm retry
      await chrome.alarms.create(alarmName, { delayInMinutes: DELAY_MINUTES });
      console.log(`[Update Tracking] Đã đặt alarm '${alarmName}' để retry sau ${DELAY_MINUTES} phút.`);
    } else {
      const successMessage = (retryCount > 0)
        ? `Hoàn tất update tracking tất cả đơn hàng sau ${retryCount + 1} lần chạy.`
        : `Hoàn tất update tracking thành công ${orders.length} đơn.`;
      await reportStatusToServer(featureName, 'SUCCESS', successMessage);
      await chrome.storage.local.remove('retry_updateTracking_data');

      isUpdateTrackingRunning = false; // MỞ KHÓA KHI THÀNH CÔNG VIÊN MÃN
      sendLogToServer('[Update Tracking] Mở khóa và kết thúc quy trình.');
      console.log("[BG] Mở khóa isUpdateTrackingRunning = false");

      sendMessage(initialTabId, "updateTracking", { error: null, autoMode: autoModeFromReq });

    }
  } catch (e) {
    sendLogToServer(`[Update Tracking] Lỗi hệ thống: ${e.message}`);
    await reportStatusToServer(featureName, 'FAILED', e.message);
    console.error("[BG] Lỗi nghiêm trọng trong quy trình 'runUpdateTracking':", e);
    isUpdateTrackingRunning = false; // MỞ KHÓA KHI CÓ LỖI NGHIÊM TRỌNG
    sendMessage(initialTabId, "updateTracking", { error: `Lỗi hệ thống: ${e.message}`, autoMode: autoModeFromReq });
  } finally {
    // 5. MỞ KHÓA VÀ DỌN DẸP
    if (workerTab && workerTab.id) {
      await chrome.tabs.remove(workerTab.id).catch(err => console.warn("Lỗi khi đóng workerTab:", err.message));
    }
    isUpdateTrackingRunning = false;
    sendLogToServer('[Update Tracking] Mở khóa và kết thúc quy trình.');
    console.log("[BG] Mở khóa isUpdateTrackingRunning = false");
  }
}; // Kết thúc IIFE

// capture event from content script
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
  if (req.message === "runTestNow") {
    setupTestAlarms(); // Gọi hàm mới để đặt lịch test
    res({ status: "test_scheduled" });
    return true;
  }

  if (req.message === "runGetPhone") {
      console.log("[BG] Nhận yêu cầu Lấy SĐT từ popup, mode =", req.mode);

      const reportUrl = "https://sellercentral.amazon.com/order-reports-and-feeds/reports/ref=xx_orderrpt_dnav_xx";

      chrome.tabs.create({ url: reportUrl, active: true }, (tab) => {
          console.log("[BG] Đã mở tab Amazon reports:", tab.id);
          // Sau 5s (cho trang load xong) → gửi message sang content script
          setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { message: "getPhoneNow", mode: req.mode });
          }, 5000);
      });

      res({ status: "started_get_phone" });
      return true;
  }

  // Luôn xử lý log trước tiên
  if (req.message === "log_to_server") {
    sendLogToServer(req.data);
    res({ status: "log_received" }); // Phản hồi để đóng message port
    return true; // Báo hiệu sẽ phản hồi bất đồng bộ
  }
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
    // showNotification("success", "Auto update tracking process completed successfully");
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

    // 2. ĐÓNG KHÓA NGAY LẬP TỨC!!!
    isUpdateTrackingRunning = true;
    console.log("[BG] Đã khóa isUpdateTrackingRunning = true (từ onMessage listener).");


    // 3. Bắt đầu xử lý. Giờ thì chỉ có 1 thằng được chạy thôi.
    // Dùng .finally() để đảm bảo khóa luôn được mở dù hàm có lỗi hay không
    processTrackingUpdates(null, 0, sender, data).finally(() => {
      isUpdateTrackingRunning = false;
      console.log("[BG] Đã mở khóa isUpdateTrackingRunning = false (sau khi processTrackingUpdates hoàn tất).");
    });

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
    const message = `Hoàn tất. Total Products: ${syncDetails.totalProducts || 0}, Total Pages: ${syncDetails.totalPages || 1}`;
    await reportStatusToServer('syncOrder', 'SUCCESS', message);

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
    sendLogToServer(`[Sync] Skipped. Reason: ${data?.reason || 'unknown'}`);
    console.log("Tự động đồng bộ đơn hàng bị bỏ qua: " + (data?.reason || "lý do không xác định"));
    doingAuto = false; // Cập nhật trạng thái
    
    // Lưu log thông tin về việc bỏ qua
    saveLog("autoSyncLog", { 
      type: "Auto Sync Skipped", 
      date: new Date().toISOString(),
      reason: data?.reason || "unknown_reason"
    });

    const reason = data?.reason || 'unknown';
    const message = `Bỏ qua. Lý do: ${reason}`;
    await reportStatusToServer('syncOrder', 'SKIPPED', message);
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
    // KIỂM TRA CỜ: Nếu đang sync rồi thì không làm gì cả
    if (isSyncing) {
      console.log("Quy trình sync đang chạy, yêu cầu mới bị bỏ qua.");
      return;
    }

    const { apiKey, orders, options } = data; // Di chuyển ra ngoài để có thể log
    if (!orders || !orders.length) return;

    try {
      // ĐẶT CỜ: Báo hiệu bắt đầu sync
      isSyncing = true;
      await handleSyncOrders(orders, options, apiKey, domain);
    } catch (error) {
      console.error("Lỗi nghiêm trọng trong quá trình sync:", error);
    } finally {
      // GỠ CỜ: Báo hiệu đã sync xong, sẵn sàng cho lần tiếp theo
      isSyncing = false;
      console.log("Quy trình sync đã kết thúc.");
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
      const message = `Tác vụ đã hoàn tất. Đang đóng tab ID: ${sender.tab?.id}`;
      await reportStatusToServer('accountHealth', 'SUCCESS', message);
      sendLogToServer(`[AccHealth] Tác vụ đã hoàn tất. Đang đóng tab ID: ${sender.tab.id}`); // <-- THÊM DÒNG NÀY
      chrome.tabs.remove(sender.tab.id);
    }
    res({ message: "received and tab closed" });
    return true;
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

const pendingDataResolvers = {};

/**
 * Hàm Promise-based để chờ dữ liệu mạng từ inject.js.
 * @param {string} key - Một key duy nhất để xác định yêu cầu này, ví dụ: `order_113-xxx`.
 * @param {number} timeout - Thời gian chờ tối đa (ms).
 * @returns {Promise<any>} - Promise sẽ resolve với dữ liệu tìm thấy hoặc reject khi timeout.
 */
const waitForData = (key, timeout = 30000) => {
    return new Promise((resolve, reject) => {
        // Hủy yêu cầu cũ nếu có key trùng
        if (pendingDataResolvers[key]) {
            pendingDataResolvers[key].reject(new Error(`Yêu cầu mới cho key '${key}' đã được tạo, hủy yêu cầu cũ.`));
        }

        const timeoutId = setTimeout(() => {
            delete pendingDataResolvers[key];
            reject(new Error(`Timeout: Không nhận được dữ liệu cho key '${key}' sau ${timeout / 1000}s.`));
        }, timeout);

        // Lưu lại hàm resolve và reject để listener onMessage có thể gọi
        pendingDataResolvers[key] = { resolve, reject, timeoutId };
    });
};

/**
 * Hàm xử lý chính cho việc đồng bộ đơn hàng (ĐÃ REFACTOR).
 * Loại bỏ hoàn toàn việc sử dụng biến toàn cục OrderInfo và CustomOrder.
 */

const handleSyncOrders = async (orders, options, apiKey, domain, retryCount = 0) => {
  await chrome.storage.local.remove("UnshippedOrders");
  console.log("✅ Đã dọn dẹp UnshippedOrders cũ trước khi bắt đầu sync.");

  const featureName = 'syncOrder'; // <--- Tên này dùng làm key

    // SỬA ĐOẠN NÀY
    const { alarmSettings } = await chrome.storage.local.get('alarmSettings');
    // Lấy config riêng cho "syncOrder"
    const retryConfig = alarmSettings?.retry_configs?.[featureName];

    // Dùng giá trị riêng, nếu không có thì dùng mặc định
    const MAX_RETRIES = retryConfig?.max_retries || 3;
    const DELAY_MINUTES = retryConfig?.delay_minutes || 1;

    if (retryCount >= MAX_RETRIES) {
      sendLogToServer(`[Sync][Retry] Đã thử lại ${retryCount} lần cho các đơn hàng còn lại nhưng vẫn lỗi. Tạm dừng.`);
      await reportStatusToServer('syncOrder', 'FAILED', `Đã thất bại sau ${MAX_RETRIES} lần thử lại.`);
      await chrome.storage.local.remove('retry_syncOrder_data');
      return; // Dừng hẳn
    }

    if (!apiKey) apiKey = await getMBApiKey();
    stopProcess = false;
    const addMockups = {};
    let successCount = 0;
    const failedOrders = [];

    const totalOrders = orders.length;

    // Chỉ log và báo cáo RUNNING ở lần chạy đầu tiên
    if (retryCount === 0) {
      const startMessage = `Bắt đầu xử lý lô ${totalOrders} đơn hàng.`;
      sendLogToServer(`[Sync] ${startMessage}`);
      await reportStatusToServer(featureName, 'RUNNING', startMessage);
    } else {
      sendLogToServer(`[Sync][Retry] Bắt đầu thử lại lần ${retryCount + 1} cho ${totalOrders} đơn còn lại.`);
    }

    for (let i = 0; i < orders.length; i++) {
        if (stopProcess) {
          sendLogToServer(`[Sync] Quy trình bị dừng bởi người dùng.`);
          await reportStatusToServer(featureName, 'FAILED', 'Bị dừng bởi người dùng.');
          break;
        }
        const order = orders[i];
        const orderId = order.id;

        const progressMessage = `Đang xử lý đơn ${i + 1}/${totalOrders} (ID: ${orderId}).`;
        sendLogToServer(`[Sync][${orderId}] Bắt đầu xử lý (đơn ${i + 1}/${orders.length}).`);
        console.log(`Bắt đầu xử lý đơn hàng ${orderId}`);
        await reportStatusToServer(featureName, 'RUNNING', progressMessage);
        const url = `${domain ? domain : AMZDomain}/orders-v3/order/${orderId}`;

        // Điều hướng đến trang chi tiết đơn hàng
        async function redirectToOrderDetail() {
            // Lấy tất cả các tab trong cửa sổ hiện tại
            const allTabs = await chrome.tabs.query({ currentWindow: true });

            // Tìm tab đầu tiên có url chứa "sellercentral."
            const amazonTab = allTabs.find(tab => tab.url && tab.url.includes("sellercentral."));

            const messagePayload = {
                order,
                label: `Syncing orders: ${i + 1}/${orders.length}`,
            };

            if (amazonTab && amazonTab.id) {
                // Nếu tìm thấy, cập nhật URL của tab đó và làm nó active
                console.log(`[BG] Tái sử dụng tab Seller Central (ID: ${amazonTab.id})`);
                await chrome.tabs.update(amazonTab.id, { url, active: true });
                sendMessage(amazonTab.id, "getOrderItemInfo", messagePayload);
            } else {
                // Nếu không tìm thấy, tạo một tab mới
                console.log("[BG] Không tìm thấy tab Seller Central nào, tạo tab mới.");
                const newTab = await chrome.tabs.create({ url, active: true });
                sendMessage(newTab.id, "getOrderItemInfo", messagePayload);
            }
        }
        await redirectToNewURL(redirectToOrderDetail);

        try {
            // Chờ cả 2 thông tin (order và shipping) về, sử dụng key duy nhất
            sendLogToServer(`[Sync][${orderId}] Đang chờ dữ liệu order và shipping từ trang...`);
            const [orderData, shippingData] = await Promise.all([
                waitForData(`order_${orderId}`),
                waitForData(`shipping_${orderId}`)
            ]);

            const orderDetail = orderData.order;
            const shippingDetail = shippingData[orderId].address;

            if (!orderDetail || !shippingDetail) {
                sendLogToServer(`[Sync][${orderId}] Lỗi: Không lấy được orderDetail hoặc shippingDetail.`);
                throw new Error("Không lấy được order hoặc shipping info.");
            }
            sendLogToServer(`[Sync][${orderId}] Đã nhận đủ dữ liệu order và shipping.`);
            const orderInfo = await getOrderInfo(orderDetail, shippingDetail);
            if (!orderInfo) {
                sendLogToServer(`[Sync][${orderId}] Lỗi: getOrderInfo trả về null.`);
                throw new Error("Không xử lý được order info.");
            }

          let isSameProduct = orderInfo.items.every(
            (item, i, items) => item.asin === items[0].asin,
          );
          for (const item of orderInfo.items) {
            if (!item.mockup) {
              if (orderInfo.items.length == 1 || isSameProduct) {
                item.mockup = [order["img"]];
              } else {
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
          }

          // --- Xử lý Customization ---
            let customItems = [];
            for (const item of orderInfo.items) {
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
                    orderId: orderId,
                    itemId: item.lineId,
                    url: `/gestalt/fulfillment/index.html?orderId=${orderInfo.orderId}&orderItemId=${item.lineId}`,
                    hasCustomImg: isCustomImage,
                });
            }

            if (customItems.length > 0) {
                sendLogToServer(`[Sync][${orderId}] Tìm thấy ${customItems.length} item cần xử lý customization.`);
                for (const customItem of customItems) {
                    const customUrl = `${domain ? domain : AMZDomain}${customItem.url}`;
                    chrome.tabs.update({ url: customUrl });

                    // Chờ dữ liệu custom về với key duy nhất
                    sendLogToServer(`[Sync][${orderId}] Đang chờ dữ liệu customization cho item ${customItem.itemId}...`);
                    const personalizedInfo = await waitForData(`custom_${customItem.itemId}`);

                    if (!personalizedInfo || !personalizedInfo.fulfillmentData) {
                        sendLogToServer(`[Sync][${orderId}] Bỏ qua item ${customItem.itemId} do không lấy được personalizedInfo.`);
                        console.error(`Bỏ qua item ${customItem.itemId} do không lấy được personalizedInfo.`);
                        continue;
                    }

                    // (Logic xử lý `personalizedInfo` giữ nguyên như cũ)
                    const { customizationData, previewSnapshotUrlMap } = personalizedInfo.fulfillmentData;
                    const customImages = getCustomImage(personalizedInfo.fulfillmentData);

                  const customDataParsed = JSON.parse(customizationData);
                  const customFields = [];
                  let imgPreviewId = null;

                  if (customDataParsed.children) {
                    for (let c = 0; c < customDataParsed.children.length; c++) {
                      const customWrap = customDataParsed.children[c];
                      if (customWrap.children && customWrap.type == "FlatContainerCustomization") {
                        for (const field of customWrap.children) {
                          if (field && field.label) customFields.push(field.label);
                        }
                      }
                      if (customWrap.type === "PreviewContainerCustomization") {
                        if (c == 0) imgPreviewId = customWrap.identifier;
                        if (previewSnapshotUrlMap && previewSnapshotUrlMap[imgPreviewId]) {
                          // Gán ảnh preview ngay tại đây
                          orderInfo.items.find(i => i.lineId === customItem.itemId).personalizedPreview = previewSnapshotUrlMap[imgPreviewId];
                        }
                      }
                    }
                  }

                  for (const item of orderInfo.items) {
                    if (item.lineId === customItem.itemId) {
                      if (customFields.length > 0) {
                        const existingFields = item.personalized.map(p => p.name);
                        for (const field of customFields) {
                          if (!existingFields.includes(field)) {
                            item.personalized.push({ name: field, value: "" });
                          }
                        }
                      }

                      if (customItem.hasCustomImg && customImages.length > 0) {
                        for (const personal of item.personalized) {
                          for (const customImgItem of customImages) {
                            if (personal.name === customImgItem.label) {
                              personal.value = customImgItem.img;
                              break;
                            }
                          }
                        }
                      }
                      break;
                    }
                  }
                }
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

            // Gửi dữ liệu đã được xử lý chính xác lên server
            sendLogToServer(`[Sync][${orderId}] Đã xử lý xong thông tin, chuẩn bị gửi lên server...`);
            let query = JSON.stringify({ input: orderInfo });
            const result = await sendRequestToMB("createAmazonOrder", apiKey, query);
            const messResp = { data: true, error: null };
            if (result.error) {
              messResp.error = result.error;
            } else if (result.errors?.length) {
              messResp.error = result.errors[0].message;
            }

            if (messResp.error) {
              // LOG: Lỗi từ server
              sendLogToServer(`[Sync][${orderId}] Gửi lên server THẤT BẠI: ${messResp.error}`);
              throw new Error(messResp.error); // Ném lỗi ra để catch xử lý
            } else {
              // LOG: Thành công
              sendLogToServer(`[Sync][${orderId}] Gửi lên server THÀNH CÔNG.`);
              successCount++;
            }

            sendToContentScript("syncedOrderToMB", messResp);
        } catch (error) {
            failedOrders.push(order);
            const errorMessage = `Lỗi đơn ${orderId}: ${error.message}. Tiếp tục xử lý...`;
            await reportStatusToServer(featureName, 'RUNNING', errorMessage);
            sendLogToServer(`[Sync][${orderId}] Lỗi nghiêm trọng: ${error.message}`);
            console.error(`Lỗi khi xử lý đơn hàng ${order.id}:`, error);
            sendToContentScript("syncedOrderToMB", { data: false, error: error.message });
        } finally {
            // Sleep một chút từ 0.5 đến 1.5 giây một cách ngẫu nhiên
            await sleep(500 + Math.random() * 1000);
        }
    }
  const errorCount = failedOrders.length;

  if (!stopProcess) {
    const finalMessage = `Hoàn tất lần chạy (thử lại lần ${retryCount}). Tổng: ${totalOrders}, Thành công: ${successCount}, Thất bại: ${errorCount}.`;
    sendLogToServer(`[Sync] ${finalMessage}`);

    if (errorCount > 0) {
      const nextRetryCount = retryCount + 1;
      const alarmName = `retry_syncOrder`; // Đặt tên cố định cho alarm retry

      // THAY THẾ SETIMEOUT BẰNG ALARM
      sendLogToServer(`[Sync] Sẽ thử lại sau ${DELAY_MINUTES} phút cho ${errorCount} đơn lỗi (lần thử #${nextRetryCount}).`);
      await reportStatusToServer(featureName, 'RETRYING', `Thất bại ${errorCount} đơn. Chuẩn bị thử lại lần ${nextRetryCount}.`);

      // 1. Lưu các thông tin cần thiết cho lần chạy lại vào storage
      await chrome.storage.local.set({
        [alarmName + '_data']: { // Dùng tên alarm làm key để không bị lẫn
          orders: failedOrders,
          options: options,
          apiKey: apiKey,
          domain: domain,
          retryCount: nextRetryCount
        }
      });

      // 2. Tạo một alarm để kích hoạt sau 1 phút
      await chrome.alarms.create(alarmName, { delayInMinutes: DELAY_MINUTES });
      console.log(`[Sync] Đã đặt alarm '${alarmName}' để retry sau ${DELAY_MINUTES} phút.`);

    } else {
      // Chỉ báo cáo SUCCESS khi không còn lỗi nào
      const successMessage = (retryCount > 0)
        ? `Hoàn tất xử lý tất cả đơn hàng sau ${retryCount + 1} lần chạy.`
        : `Hoàn tất xử lý thành công ${totalOrders} đơn.`;

      await reportStatusToServer(featureName, 'SUCCESS', successMessage);
      // Dọn dẹp storage nếu có
      await chrome.storage.local.remove('retry_syncOrder_data');
      // Redirect khi thành công
      const url = `${domain ? domain : AMZDomain}/orders-v3?page=1&date-range=last-30`;
      await redirectToNewURL(tabs => { /* ... code redirect của mày ... */ });
    }
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

      let resolverKey = null;
      let orderId = null;

      // Xác định xem message này dành cho resolver nào
      if (endpoint.includes("/orders-api/order/")) {
          orderId = data?.order?.amazonOrderId;
          if (orderId) resolverKey = `order_${orderId}`;
      } else if (endpoint.includes("/orders-st/resolve")) {
          orderId = Object.keys(data || {})[0];
          if (orderId) resolverKey = `shipping_${orderId}`;
      } else if (endpoint.includes("/gestalt/ajax/fulfillment/init")) {
        if (activeTabId) {
          sendMessage(activeTabId, "syncFile", "");
        }

        // Cần một cách để lấy itemId từ endpoint hoặc data
          const match = endpoint.match(/orderItemId=([^&]+)/);
          const itemId = match ? match[1] : null;
          if (itemId) resolverKey = `custom_${itemId}`;
      }

      // Nếu tìm thấy resolver phù hợp, gọi hàm resolve của nó
      if (resolverKey && pendingDataResolvers[resolverKey]) {
        console.log(`Dữ liệu cho key '${resolverKey}' đã nhận được. Hoàn thành Promise.`);
        clearTimeout(pendingDataResolvers[resolverKey].timeoutId);
        pendingDataResolvers[resolverKey].resolve(data);
        delete pendingDataResolvers[resolverKey];
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

      break;
    default:
      break;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // Nó sẽ xóa cái key "UnshippedOrders" mỗi khi extension được cài mới hoặc cập nhật.
  chrome.storage.local.remove("UnshippedOrders", () => {
    console.log('✅ Đã dọn dẹp UnshippedOrders cũ khi cài đặt/cập nhật extension.');
  });

  // Mở trang chủ sau khi dọn dẹp xong
  openHomePage();
});
chrome.runtime.onInstalled.addListener(() => {
    console.log("[Payment] Extension installed/updated - Khởi tạo lịch rút tiền");
    scheduleNextPaymentRequest();
});
chrome.runtime.onStartup.addListener(() => {
    console.log("[Payment] Extension started - Khởi tạo lịch rút tiền");
    scheduleNextPaymentRequest();
});
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
  if (request.message === "getFeedbackData") {
    chrome.tabs.create({ url: "https://sellercentral.amazon.com/feedback-manager/index.html", active: false }, (tab) => {
      if (!tab || !tab.id) {
        console.error("Không thể tạo tab Feedback Manager.");
        sendResponse({ error: "Failed to create tab." });
        return;
      }
      const tabId = tab.id;

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          // Gỡ bỏ listener này ngay sau khi trang load lần đầu
          chrome.tabs.onUpdated.removeListener(listener);

          // BẮT ĐẦU LOGIC MỚI: Chờ cho đến khi phần tử quan trọng xuất hiện
          let attempts = 0;
          const maxAttempts = 15; // Chờ tối đa 15 giây

          const intervalId = setInterval(() => {
            if (attempts >= maxAttempts) {
              clearInterval(intervalId);
              chrome.tabs.remove(tabId); // Dọn dẹp tab nếu thất bại
              sendResponse({ error: "Timeout: Không tìm thấy bảng feedback sau 15 giây." });
              return;
            }
            attempts++;

            // Thực thi một đoạn code nhỏ để kiểm tra sự tồn tại của bảng feedback
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => document.querySelector("kat-table-body") !== null,
            }, (results) => {
              // Kiểm tra xem phần tử đã tồn tại chưa
              if (results && results[0] && results[0].result === true) {
                clearInterval(intervalId); // Dừng việc kiểm tra lại
                console.log("Tìm thấy bảng feedback! Bắt đầu lấy dữ liệu.");
                sendLogToServer("[AccHealth] Đã tìm thấy bảng Feedback, đang trích xuất dữ liệu."); // <-- THÊM DÒNG NÀY

                // BÂY GIỜ MỚI THỰC SỰ LẤY DỮ LIỆU
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  func: () => { // Code lấy dữ liệu của mày giữ nguyên
                    let result = {};
                    const feedbackSummary = document.querySelector("feedback-summary div div b");
                    if (feedbackSummary) {
                      result.fb_score = feedbackSummary.textContent.trim();
                    }
                    const tableBody = document.querySelector("kat-table-body");
                    if (tableBody) {
                      let rows = tableBody.querySelectorAll("kat-table-row");
                      if (rows.length > 0) {
                        let positiveCells = rows[0].querySelectorAll("kat-table-cell");
                        if (positiveCells.length > 4) {
                          let posText = positiveCells[1].textContent || "";
                          let posMatch = posText.match(/\((\d+)\)/);
                          if (posMatch) result.fb_possitive_last_30 = parseInt(posMatch[1]);
                        }
                      }
                      if (rows.length > 2) {
                        let negativeCells = rows[2].querySelectorAll("kat-table-cell");
                        if (negativeCells.length > 1) {
                          let negText = negativeCells[1].textContent || "";
                          let negMatch = negText.match(/\((\d+)\)/);
                          if (negMatch) result.fb_negative_last_30 = parseInt(negMatch[1]);
                        }
                      }
// THAY THẾ CHO ĐOẠN LẤY fb_count CŨ
                      if (rows.length > 3) {
                        // Lấy TẤT CẢ các ô (cell) trong hàng "Count"
                        let countCells = rows[3].querySelectorAll("kat-table-cell");

                        // Ô "Lifetime" là ô cuối cùng.
                        // Mình kiểm tra xem có đủ 5 ô không (Label + 4 cột giá trị)
                        if (countCells.length > 4) {
                          // Lấy text của ô cuối cùng (index 4)
                          let countText = countCells[4].textContent || "";
                          result.fb_count = parseInt(countText.replace(/[^\d]/g, ""));
                        }
                      }
                    }
                    return result;
                  }
                }, (finalResults) => {
                  if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                  } else {
                    sendResponse(finalResults[0].result);
                  }
                  // Đóng tab sau khi đã hoàn thành tất cả
                  chrome.tabs.remove(tabId);
                });
              }
            });
          }, 1000); // Lặp lại kiểm tra mỗi giây
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
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
    console.log('Bắt đầu lấy Payment Data...');
    sendLogToServer("[AccHealth] Bắt đầu lấy dữ liệu Payment..."); // <-- THÊM DÒNG NÀY
    chrome.tabs.create({
      url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
      active: false
    }, (tab) => {
      if (!tab || !tab.id) {
        console.error("Không thể tạo tab Payment Dashboard.");
        sendResponse({ error: "Failed to create tab." });
        return;
      }
      const tabId = tab.id;

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener); // Gỡ listener ngay

          // Bắt đầu chờ cho đến khi container chính của dữ liệu payment xuất hiện
          let attempts = 0;
          const maxAttempts = 20; // Chờ tối đa 20 giây

          const checkInterval = setInterval(() => {
            if (attempts >= maxAttempts) {
              clearInterval(checkInterval);
              chrome.tabs.remove(tabId); // Dọn dẹp tab
              sendResponse({ error: "Timeout: Dữ liệu Payment không tải xong sau 20 giây." });
              return;
            }
            attempts++;

            // Kiểm tra xem container đã tồn tại chưa
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => document.querySelector(".linkable-multi-row-card-rows-container") !== null,
            }, (results) => {
              if (results && results[0] && results[0].result === true) {
                // Đã tìm thấy, dừng việc kiểm tra lại
                clearInterval(checkInterval);
                console.log("Đã tìm thấy container payment. Bắt đầu lấy dữ liệu.");
                sendLogToServer("[AccHealth] Đã tìm thấy container Payment, đang trích xuất dữ liệu."); // <-- THÊM DÒNG NÀY

                // Chạy script chính để lấy toàn bộ dữ liệu
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  func: () => { // Code cào dữ liệu của mày giữ nguyên
                    let result = {};
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
                    const currencyElements = document.getElementsByClassName("currency-total-amount");
                    if (currencyElements.length > 1) {
                      let span = currencyElements[1].querySelector("span");
                      if (span) {
                        result.payment_today = span.textContent.replace(/\$/g, "").replace(/,/g, "").trim();
                      }
                    }
                    const multiLine = document.getElementsByClassName("multi-line-child-content");
                    if (multiLine.length > 2) {
                      result.payment_amount = multiLine[2].textContent.replace(/\$/g, "").replace(/,/g, "").trim();
                    }
                    const fundElements = document.getElementsByClassName("fund-transfer-primary-message");
                    if (fundElements.length > 0) {
                      let span = fundElements[0].querySelector("span");
                      if (span) {
                        let msg = span.textContent.trim();
                        let dateMatch = msg.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                        if (dateMatch) {
                          let parts = dateMatch[0].split("/");
                          result.payment_date = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                        }
                      }
                    }
                    if (result.balance_com && result.payment_today) {
                      let balance = parseFloat(result.balance_com.replace(/[^\d.-]/g, ""));
                      let today = parseFloat(result.payment_today.replace(/[^\d.-]/g, ""));
                      result.balance_hold = (balance - today).toFixed(2).toString();
                    }
                    return result;
                  }
                }, (finalResults) => {
                  if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                  } else {
                    sendResponse(finalResults[0].result);
                  }
                  chrome.tabs.remove(tabId); // Dọn dẹp tab
                });
              }
            });
          }, 1000); // Lặp lại mỗi giây
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    return true;
  }

  // Handler cho việc navigate trực tiếp đến disbursement page
  if (request.message === "navigateToDisburse") {
    console.log("[Background] Nhận yêu cầu navigate đến disbursement page");
    const { targetUrl, currentTabId } = request.data;
    
    // Option 1: Update current tab
    chrome.tabs.update(currentTabId, { url: targetUrl }).then(() => {
      console.log("[Background] Đã navigate đến:", targetUrl);
      
      // Đợi trang mới load và inject script
      function handleNavigationUpdate(updatedTabId, changeInfo) {
        if (updatedTabId === currentTabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleNavigationUpdate);
          
          // Inject script để handle disbursement page
          setTimeout(() => {
            chrome.tabs.sendMessage(currentTabId, {
              message: "handleDisburseDetailsPage",
              data: { tabId: currentTabId }
            }).catch(error => {
              console.error("[Background] Lỗi khi gửi message cho disbursement page:", error);
            });
          }, 2000);
        }
      }
      
      chrome.tabs.onUpdated.addListener(handleNavigationUpdate);
      
    }).catch(error => {
      console.error("[Background] Lỗi khi navigate:", error);
      
      // Fallback: Tạo tab mới
      chrome.tabs.create({ 
        url: targetUrl, 
        active: false 
      }, (newTab) => {
        // Đóng tab cũ
        chrome.tabs.remove(currentTabId);
        
        // Handle tab mới
        function handleNewTabUpdate(updatedTabId, changeInfo) {
          if (updatedTabId === newTab.id && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(handleNewTabUpdate);
            
            setTimeout(() => {
              chrome.tabs.sendMessage(newTab.id, {
                message: "handleDisburseDetailsPage", 
                data: { tabId: newTab.id }
              });
            }, 2000);
          }
        }
        
        chrome.tabs.onUpdated.addListener(handleNewTabUpdate);
      });
    });
    
    sendResponse({ status: "navigation_started" });
    return true;
  }

  // Handler cho alternative approach - direct disbursement
  if (request.message === "directDisbursementRequest") {
    console.log("[Background] Thực hiện direct disbursement request");
    
    // Tạo tab trực tiếp đến disbursement page
    chrome.tabs.create({
      url: "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE",
      active: false
    }, function(tab) {
      const tabId = tab.id;
      
      function handleDirectTabUpdate(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleDirectTabUpdate);
          
          // Inject script để handle disbursement
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async function() {
              // Inline function để handle disbursement page
              console.log("[Direct Script] Đang xử lý trang disbursement");
              
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Tìm số tiền
              let amount = '0.00';
              const amountSelectors = [
                'div[data-test-id="current-settlement-amount"] span.currency-display-amount',
                '[data-test-id*="amount"] .currency-display-amount',
                '.settlement-amount span',
                '.disbursement-amount span',
                '.currency-display-amount'
              ];
              
              for (const selector of amountSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim()) {
                  amount = el.textContent.trim().replace(/[^0-9.]/g, '');
                  break;
                }
              }
              
              // Tìm button
              const buttonSelectors = [
                'span[data-test-id="request-disbursement-button"] button',
                'button[data-test-id="request-disbursement-button"]',
                '[data-test-id*="disburs"] button:not([disabled])',
                'kat-button[label*="Request"]:not([disabled])'
              ];
              
              let button = null;
              for (const selector of buttonSelectors) {
                const btn = document.querySelector(selector);
                if (btn && !btn.hasAttribute('disabled')) {
                  button = btn;
                  break;
                }
              }
              
              if (button) {
                console.log("[Direct Script] Click disbursement button, amount:", amount);
                button.click();
                return { success: true, amount: parseFloat(amount) || 0 };
              } else {
                return { success: false, error: "Button not found" };
              }
            }
          }).then((results) => {
            const result = results[0].result;
            
            if (result.success) {
              chrome.runtime.sendMessage({
                message: "disbursementSuccess",
                data: {
                  amount: result.amount,
                  tabId: tabId
                }
              });
            } else {
              chrome.runtime.sendMessage({
                message: "disbursementFailed", 
                data: { 
                  reason: `Direct disbursement failed: ${result.error}`,
                  tabId 
                }
              });
            }
          }).catch(error => {
            chrome.runtime.sendMessage({
              message: "disbursementFailed",
              data: { 
                reason: `Script execution error: ${error.message}`,
                tabId 
              }
            });
          });
        }
      }
      
      chrome.tabs.onUpdated.addListener(handleDirectTabUpdate);
    });
    
    sendResponse({ status: "direct_disbursement_started" });
    return true;
  }
 
if (request.message === "manualRequestPayment") {
    console.log("[Background] Nhận yêu cầu manual request payment");

    // ====================================================================
    // HÀM INJECTABLE: Toàn bộ logic của payment_auto.js V5 được đặt ở đây
    // ====================================================================
    function injectedPaymentProcessor() {
        (() => {
            'use strict';
            console.log("[Payment Script V5 - Shadow DOM] Loaded on:", window.location.href);

            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.message === "startPaymentProcess") {
                    initialize(request.data);
                    sendResponse({ status: "processing" });
                }
                return true;
            });

            async function initialize(options) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const url = window.location.href;

                if (url.includes('/payments/dashboard')) {
                    console.log("[Payment V5] Detected Dashboard page.");
                    await processDashboardPage(options);
                } else if (url.includes('/payments/disburse/details')) {
                    console.log("[Payment V5] Detected Disburse Details page.");
                    await processDisburseDetailsPage(options);
                } else {
                    reportFailure({ ...options, reason: "Không thể nhận diện trang thanh toán." });
                }
            }

            async function processDashboardPage(options) {
                const { testMode, clickButton } = options;
                const funds = getAvailableFunds();
                console.log(`[Payment V5] Available Funds: $${funds}`);

                if (funds > 150 || testMode) {
                    const requestButton = findRequestPaymentButton();
                    if (requestButton) {
                        console.log("[Payment V5] ✅ Found 'Request Payment' button.");
                        if (!testMode && clickButton) {
                            requestButton.click();
                        } else {
                            navigateToDisbursePage();
                        }
                    } else {
                        reportFailure({ ...options, reason: "Không tìm thấy nút 'Request Payment' trên Dashboard." });
                    }
                } else {
                    reportFailure({ ...options, reason: `Số tiền $${funds} không đủ (> $150).` });
                }
            }

            async function processDisburseDetailsPage(options) {
                const { testMode, realPayment, clickButton } = options;
                const amount = getSettlementAmount();
                const buttonInfo = findDisburseButton(); // Sử dụng hàm hỗ trợ Shadow DOM

                const { found, enabled, text, element } = buttonInfo;
                console.log(`[Payment V5] Disburse Button -> Found: ${found}, Enabled: ${enabled}, Amount: $${amount}`);

                if (testMode) {
                    reportSuccess({ ...options, found, amount, buttonEnabled: enabled, buttonText: text });
                    return;
                }

                if (realPayment && clickButton && found && enabled) {
                    console.log("[Payment V5] Clicking 'Request Disbursement' button inside Shadow DOM...");
                    element.click();
                    setTimeout(() => reportSuccess({ ...options, clickPerformed: true, amount, found, buttonEnabled: enabled, buttonText: text }), 2000);
                } else {
                    const reason = !found ? "Không tìm thấy nút 'Request Disbursement'" : "Nút bị vô hiệu hóa";
                    reportFailure({ ...options, reason, found, buttonEnabled: enabled, amount });
                }
            }

            // --- CÁC HÀM TIỆN ÍCH ---

            function getAvailableFunds() {
                const el = document.querySelector('.available-currency-total-amount span');
                return el ? (parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0) : 0;
            }

            function getSettlementAmount() {
                const el = document.querySelector('.settlement-amount-balance div');
                return el ? el.textContent.trim().replace(/[^0-9.]/g, '') : '0.00';
            }

            function findRequestPaymentButton() {
                return document.querySelector('.custom-child-available-balance kat-button[label="Request Payment"]');
            }

            /**
             * SỬA LỖI TẠI ĐÂY: Hàm được viết lại hoàn toàn để xử lý Shadow DOM
             */
            function findDisburseButton() {
                const katButtonHost = document.getElementById('request-transfer-button');
                if (!katButtonHost) {
                    console.log("   -> Host <kat-button> #request-transfer-button not found.");
                    return { found: false };
                }
                if (katButtonHost.shadowRoot) {
                    const actualButton = katButtonHost.shadowRoot.querySelector('button[type="submit"]');
                    if (actualButton) {
                        console.log("   -> ✅ Found actual <button> inside Shadow DOM.");
                        const enabled = !actualButton.disabled && !katButtonHost.hasAttribute('disabled');
                        return {
                            found: true,
                            element: actualButton,
                            text: katButtonHost.getAttribute('label') || "Request Disbursement",
                            enabled: enabled
                        };
                    }
                }
                console.log("   -> Host <kat-button> found, but internal button not found in Shadow DOM.");
                return { found: false };
            }

            function navigateToDisbursePage() {
                window.location.href = "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE";
            }

            function reportSuccess(data) {
                const parsedAmount = parseFloat(data.amount) || 0;
                chrome.runtime.sendMessage({
                    message: "sendPaymentLogToServer",
                    data: { ...data, amount: parsedAmount, url: window.location.href, method: 'V5_ShadowDOM' }
                });
            }

            function reportFailure(data) {
                chrome.runtime.sendMessage({ message: "disbursementFailed", data: data });
            }
        })();
    }

    // ====================================================================
    // LOGIC CHÍNH: Tạo tab, chờ load xong, và inject hàm ở trên
    // ====================================================================
    chrome.tabs.create({
        url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
        active: false
    }, function(tab) {
        if (chrome.runtime.lastError || !tab?.id) {
            console.error("[Background] Không thể tạo tab:", chrome.runtime.lastError?.message);
            return;
        }

        const tabId = tab.id;
        let executed = false;

        const executeInjection = (tabIdToInject) => {
            if (executed) return;
            executed = true;
            
            clearTimeout(forcedTimeout);
            chrome.tabs.onUpdated.removeListener(handleTabUpdate);

            console.log(`[Background] Trang payment (tab ${tabIdToInject}) đã sẵn sàng. Bắt đầu inject script...`);

            setTimeout(() => {
                chrome.scripting.executeScript({
                    target: { tabId: tabIdToInject },
                    func: injectedPaymentProcessor
                }).then(() => {
                    console.log("[Background] ✅ Script đã được inject thành công.");
                    setTimeout(() => {
                         chrome.tabs.sendMessage(tabIdToInject, {
                            message: "startPaymentProcess",
                            data: {
                                tabId: tabIdToInject,
                                testMode: false,
                                realPayment: true,
                                clickButton: true
                            }
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error("[Background] ❌ Gửi message thất bại:", chrome.runtime.lastError.message);
                            }
                        });
                    }, 2000);
                }).catch(err => {
                    console.error("[Background] ❌ Inject script gộp thất bại:", err);
                });
            }, 3000);
        };

        const handleTabUpdate = (updatedTabId, changeInfo, updatedTab) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete' && updatedTab.url?.includes('/payments/')) {
                executeInjection(tabId);
            }
        };

        const forcedTimeout = setTimeout(() => executeInjection(tabId), 20000);
        chrome.tabs.onUpdated.addListener(handleTabUpdate);
    });

    sendResponse({ status: "manual_payment_process_started" });
    return true;
}

  // Handler cho direct navigation test
  if (request.message === "directNavigateToDisburse") {
    console.log("[Background] Direct navigate test đến disbursement page");
    
    chrome.tabs.create({
      url: "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE",
      active: false
    }, function(tab) {
      const tabId = tab.id;
      
      function handleDirectTabUpdate(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(handleDirectTabUpdate);
          
          // Inject script để tìm button trên trang disbursement
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async function() {
              console.log("[Direct Test] Đang tìm Request Disbursement button...");
              
              // Đợi trang load
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Tìm button
              const buttonSelectors = [
                'span[data-test-id="request-disbursement-button"] button',
                'button[data-test-id="request-disbursement-button"]',
                '[data-test-id*="disburs"] button',
                'kat-button[label*="Request Disbursement"]',
                'kat-button[label*="Request"]',
                '.disbursement-button button',
                '[class*="disburs"] button'
              ];

              let foundButton = null;
              let foundSelector = null;
              
              for (const selector of buttonSelectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                  foundButton = btn;
                  foundSelector = selector;
                  break;
                }
              }
              
              // Lấy amount
              let amount = '0.00';
              const amountSelectors = [
                'div[data-test-id="current-settlement-amount"] span.currency-display-amount',
                '[data-test-id*="amount"] .currency-display-amount',
                '.settlement-amount span',
                '.currency-display-amount'
              ];
              
              for (const selector of amountSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim()) {
                  amount = el.textContent.trim().replace(/[^0-9.]/g, '');
                  break;
                }
              }
              
              return {
                found: !!foundButton,
                buttonText: foundButton?.textContent?.trim() || '',
                buttonEnabled: foundButton ? !foundButton.hasAttribute('disabled') : false,
                selector: foundSelector,
                amount: parseFloat(amount) || 0,
                url: window.location.href,
                allButtons: Array.from(document.querySelectorAll('button, kat-button')).map(btn => ({
                  text: btn.textContent?.trim(),
                  className: btn.className,
                  disabled: btn.hasAttribute('disabled')
                }))
              };
            }
          }).then((results) => {
            const result = results[0].result;
            
            chrome.runtime.sendMessage({
              message: "directNavigationFinished",
              data: {
                success: true,
                ...result
              }
            });
            
            // Đóng tab sau khi test xong
            setTimeout(() => {
              chrome.tabs.remove(tabId);
            }, 2000);
            
          }).catch(error => {
            chrome.runtime.sendMessage({
              message: "directNavigationFinished",
              data: {
                success: false,
                error: error.message
              }
            });
            
            chrome.tabs.remove(tabId);
          });
        }
      }
      
      chrome.tabs.onUpdated.addListener(handleDirectTabUpdate);
    });
    
    sendResponse({ status: "direct_navigation_started" });
    return true;
  }

  // Modified handler for disbursementSuccess - để handle trường hợp chỉ tìm button
  
if (request.message === "disbursementFailed") {
    const { reason, tabId, testMode, realPayment } = request.data;
    console.error(`[Payment] Thất bại: ${reason}`);
    
    if (testMode) {
        chrome.runtime.sendMessage({
            message: "testPaymentFinished",
            data: { success: false, error: reason }
        });
    } else if (realPayment) {
        chrome.runtime.sendMessage({
            message: "realPaymentFinished", 
            data: { success: false, error: reason }
        });
    }
    
    if (tabId) {
        setTimeout(() => chrome.tabs.remove(tabId).catch(e => {}), 1000);
    }
    sendResponse({ status: "error_logged" });
    return true;
}

  // Modified handler for disbursementFailed
if (request.message === "disbursementFailed") {
    const { reason, tabId, testMode, realPayment } = request.data;
    console.error(`[Payment] Thất bại: ${reason}`);
    
    if (testMode && !realPayment) {
        // Test mode failed
        chrome.runtime.sendMessage({
            message: "testPaymentFinished",
            data: {
                success: false,
                error: reason,
                found: false,
                amount: 0
            }
        });
    } else if (realPayment && !testMode) {
        // Real payment failed
        chrome.runtime.sendMessage({
            message: "realPaymentFinished", 
            data: {
                success: false,
                error: reason,
                amount: 0
            }
        });
    }
    
    // Đóng tab
    if (tabId) {
        setTimeout(() => {
            chrome.tabs.remove(tabId).catch(e => console.error("Lỗi khi đóng tab:", e.message));
        }, 1000);
    }
    
    sendResponse({ status: "error_logged" });
    return true;
}
  // Handler cho payment process success
if (request.message === "paymentProcessSuccess") {
    const { tabId, found, amount, dashboardFunds, buttonText, buttonEnabled } = request.data;
    
    console.log("[Background] ✅ Payment process thành công:", request.data);
    
    // Gửi kết quả về UI
    chrome.runtime.sendMessage({
        message: "paymentRequestFinished",
        data: {
            success: true,
            found: found,
            amount: amount,
            dashboardFunds: dashboardFunds,
            buttonText: buttonText,
            buttonEnabled: buttonEnabled,
            error: null
        }
    });

    // Đóng tab sau khi hoàn tất
    if (tabId) {
        setTimeout(() => {
            chrome.tabs.remove(tabId).catch(e => console.error("Lỗi khi đóng tab:", e.message));
        }, 2000);
    }
    
    sendResponse({ status: "success_processed" });
    return true;
}

// Handler cho payment process failed
if (request.message === "paymentProcessFailed") {
    const { reason, tabId, fundsAmount } = request.data;
    
    console.error(`[Background] ❌ Payment process thất bại: ${reason}`);
    
    // Gửi lỗi về UI
    chrome.runtime.sendMessage({
        message: "paymentRequestFinished", 
        data: {
            success: false,
            found: false,
            error: reason,
            amount: 0,
            dashboardFunds: fundsAmount || 0
        }
    });
    
    // Đóng tab
    if (tabId) {
        setTimeout(() => {
            chrome.tabs.remove(tabId).catch(e => console.error("Lỗi khi đóng tab:", e.message));
        }, 1000);
    }
    
    sendResponse({ status: "error_processed" });
    return true;
}

// Handler để gửi log lên server
if (request.message === "sendPaymentLogToServer") {
    const logDataFromContentScript = request.data;
    console.log("[Background] Received sendPaymentLogToServer:", logDataFromContentScript);
    
    // --- PHẦN SỬA LỖI BẮT ĐẦU TỪ ĐÂY ---
    (async () => {
        try {
            // 1. Lấy merchantId (API Key)
            const merchantId = await getMBApiKey();
            if (!merchantId) {
                throw new Error("Không thể lấy được merchantId để gửi lên server.");
            }

            // 2. Gộp merchantId vào dữ liệu sẽ gửi đi
            const finalPayload = {
                ...logDataFromContentScript, // Dữ liệu từ payment_auto.js
                merchantId: merchantId       // Thêm merchantId vào
            };

            const serverUrl = "https://bkteam.top/dungvuong-admin/api/update_disbursement_handler.php";
            console.log("[Background] Sending to server:", serverUrl, "with payload:", finalPayload);
            
            // 3. Gửi dữ liệu đã có merchantId lên server
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(finalPayload) // Gửi finalPayload
            });

            const resultText = await response.text();
            console.log("[Background] Server raw response:", resultText);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${resultText}`);
            }

            const jsonResult = JSON.parse(resultText);
            if (jsonResult.status !== 'success') {
                throw new Error(jsonResult.message || "Server returned an error status.");
            }

            console.log("[Background] ✅ Dữ liệu payment đã gửi lên server thành công.");
            sendResponse({ status: "log_sent", success: true, serverResponse: jsonResult });

        } catch (error) {
            console.error("[Background] ❌ Lỗi khi gửi dữ liệu payment:", error);
            sendResponse({ status: "log_failed", success: false, error: error.message });
        }
    })();
    // --- KẾT THÚC PHẦN SỬA LỖI ---
    
    return true; // Giữ kênh message mở cho phản hồi bất đồng bộ
}

// Handler cho Test Payment Request
// if (request.message === "testPaymentRequest") {
//     console.log("[Background] Nhận yêu cầu test payment");
    
//     chrome.tabs.create({
//         url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
//         active: false
//     }, function(tab) {
//         const tabId = tab.id;
        
//         function handleTabUpdate(updatedTabId, changeInfo) {
//             if (updatedTabId === tabId && changeInfo.status === "complete") {
//                 chrome.tabs.onUpdated.removeListener(handleTabUpdate);
                
//                 // Inject payment script cho test mode
//                 chrome.scripting.executeScript({
//                     target: { tabId: tabId },
//                     files: ['scripts/payment_auto.js']
//                 }).then(() => {
//                     setTimeout(() => {
//                         chrome.tabs.sendMessage(tabId, {
//                             message: "startPaymentProcess",
//                             data: { 
//                                 tabId: tabId,
//                                 testMode: true,
//                                 clickButton: false // Chỉ tìm, không click
//                             }
//                         }).catch(error => {
//                             console.error("[Background] Lỗi khi gửi test message:", error);
//                         });
//                     }, 2000);
//                 }).catch(error => {
//                     console.error("[Background] Lỗi khi inject script cho test:", error);
//                 });
//             }
//         }
        
//         chrome.tabs.onUpdated.addListener(handleTabUpdate);
//     });
    
//     sendResponse({ status: "test_payment_started" });
//     return true;
// }
if (request.message === "testPaymentRequest") {
    console.log("[Background] Nhận yêu cầu test payment");
    
    chrome.tabs.create({
        url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
        active: false
    }, function(tab) {
        const tabId = tab.id;
        let executed = false;
        
        const forcedTimeout = setTimeout(() => {
            if (!executed) {
                executed = true;
                executeTestScript(tabId);
            }
        }, 15000);
        
        function handleTabUpdate(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete" && !executed) {
                executed = true;
                clearTimeout(forcedTimeout);
                chrome.tabs.onUpdated.removeListener(handleTabUpdate);
                executeTestScript(tabId);
            }
        }
        
        chrome.tabs.onUpdated.addListener(handleTabUpdate);
        
        function executeTestScript(tabId) {
            // Inject payment script cho test
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['scripts/payment_auto.js']
            }).then(() => {
                console.log("[Background] Test script injected successfully");
                
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        message: "startPaymentProcess",
                        data: { 
                            tabId: tabId,
                            testMode: true,
                            realPayment: false,
                            clickButton: false
                        }
                    }).catch(error => {
                        console.error("[Background] Lỗi khi gửi test message:", error);
                        
                        // Fallback cho test mode
                        navigateDirectToDisbursementTest(tabId);
                    });
                }, 3000);
                
            }).catch(error => {
                console.error("[Background] Lỗi khi inject test script:", error);
                navigateDirectToDisbursementTest(tabId);
            });
        }
    });
    
    sendResponse({ status: "test_payment_started" });
    return true;
}
function navigateDirectToDisbursementTest(tabId) {
    console.log("[Background] Test fallback: Navigate trực tiếp đến disbursement");
    
    const disbursementUrl = "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE";
    
    chrome.tabs.update(tabId, { url: disbursementUrl }).then(() => {
        
        function handleTestDisbursementUpdate(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(handleTestDisbursementUpdate);
                
                // Inject script cho test trang disbursement
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['scripts/disbursement_direct.js']
                }).then(() => {
                    
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, {
                            message: "handleDisburseDetailsPage",
                            data: { 
                                tabId: tabId,
                                testMode: true,
                                realPayment: false,
                                clickButton: false
                            }
                        }).catch(error => {
                            console.error("[Background] Lỗi khi test disbursement page:", error);
                        });
                    }, 5000);
                    
                }).catch(error => {
                    console.error("[Background] Lỗi inject test script cho disbursement:", error);
                });
            }
        }
        
        chrome.tabs.onUpdated.addListener(handleTestDisbursementUpdate);
        
    }).catch(error => {
        console.error("[Background] Lỗi test navigate đến disbursement:", error);
    });
}
// Handler mới cho direct disbursement access
if (request.message === "directDisbursementAccess") {
    console.log("[Background] Direct access to disbursement page");
    
    chrome.tabs.create({
        url: "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE",
        active: false
    }, function(tab) {
        const tabId = tab.id;
        const { testMode = false, realPayment = false, clickButton = false } = request.data || {};
        
        function handleDirectDisbursementUpdate(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(handleDirectDisbursementUpdate);
                
                // Đợi thêm để trang load hoàn toàn
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['scripts/payment_auto.js']
                    }).then(() => {
                        
                        // Đợi thêm thời gian cho script được inject
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabId, {
                                message: "handleDisburseDetailsPage",
                                data: { 
                                    tabId: tabId,
                                    testMode: testMode,
                                    realPayment: realPayment,
                                    clickButton: clickButton
                                }
                            }).catch(error => {
                                console.error("[Background] Lỗi direct disbursement message:", error);
                            });
                        }, 3000);
                        
                    }).catch(error => {
                        console.error("[Background] Lỗi inject script direct disbursement:", error);
                    });
                }, 5000); // Tăng thời gian chờ
            }
        }
        
        chrome.tabs.onUpdated.addListener(handleDirectDisbursementUpdate);
    });
    
    sendResponse({ status: "direct_disbursement_access_started" });
    return true;
}

// Cải thiện handler cho các message response
if (request.message === "disbursementSuccess") {
    const { amount, tabId, testMode, realPayment } = request.data;
    console.log(`[Background] ✅ Disbursement thành công: ${amount}`);
    
    // Gửi kết quả về popup/UI
    if (testMode) {
        chrome.runtime.sendMessage({
            message: "testPaymentFinished",
            data: {
                success: true,
                found: true,
                amount: amount,
                buttonEnabled: true
            }
        });
    } else if (realPayment) {
        chrome.runtime.sendMessage({
            message: "realPaymentFinished",
            data: {
                success: true,
                amount: amount
            }
        });
    }
    
    // Đóng tab sau khi thành công
    if (tabId) {
        setTimeout(() => {
            chrome.tabs.remove(tabId).catch(e => console.error("Lỗi khi đóng tab:", e.message));
        }, 3000); // Đợi lâu hơn để user thấy kết quả
    }
    
    sendResponse({ status: "success_processed" });
    return true;
}
// Handler cho Schedule Test Payment
if (request.message === "scheduleTestPayment") {
    console.log("[Background] Đặt lịch test payment");
    const { time, minutes, type } = request.data;
    
    let alarmName = "testPaymentAlarm";
    let delayInMinutes;
    let scheduleTime;
    
    // Clear existing test alarm
    chrome.alarms.clear(alarmName);
    
    if (type === 'specific_time' && time) {
        // Tính toán delay từ thời gian cụ thể
        const now = new Date();
        const [hours, mins] = time.split(':');
        const targetTime = new Date();
        targetTime.setHours(parseInt(hours), parseInt(mins), 0, 0);
        
        // Nếu thời gian đã qua trong ngày, đặt cho ngày mai
        if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
        }
        
        delayInMinutes = (targetTime.getTime() - now.getTime()) / 60000;
        scheduleTime = targetTime.toLocaleString();
    } else {
        // Đặt lịch theo phút
        delayInMinutes = minutes || 5;
        const targetTime = new Date(Date.now() + delayInMinutes * 60000);
        scheduleTime = targetTime.toLocaleString();
    }
    
    if (delayInMinutes > 0) {
        chrome.alarms.create(alarmName, {
            delayInMinutes: delayInMinutes,
        });
        
        console.log(`[Background] Đã đặt lịch test payment sau ${delayInMinutes} phút`);
        
        // Gửi confirmation về popup
        chrome.runtime.sendMessage({
            message: "testScheduled",
            data: {
                success: true,
                scheduleTime: scheduleTime
            }
        });
    }
    
    sendResponse({ status: "test_scheduled" });
    return true;
}
// HÀM MỚI ĐỂ HỢP NHẤT LOGIC
async function executePaymentProcess(options = {}) {
    const { isTest = false } = options;
    console.log(`[Payment Process] Bắt đầu quy trình. Chế độ Test: ${isTest}`);

    try {
        const merchantId = await getMBApiKey();
        if (!merchantId) {
            throw new Error("Không lấy được merchantId, không thể tiếp tục.");
        }

        const tab = await chrome.tabs.create({
            url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
            active: !isTest // Chạy ẩn nếu là tự động, hiện nếu là test hoặc chạy tay
        });

        if (!tab || !tab.id) {
            throw new Error("Không thể tạo tab để xử lý thanh toán.");
        }

        const tabId = tab.id;
        let isProcessFinished = false;

        const cleanup = () => {
            if (isProcessFinished) return;
            isProcessFinished = true;
            chrome.tabs.onUpdated.removeListener(updateListener);
            chrome.runtime.onMessage.removeListener(messageListener);
            // Tự động đóng tab nếu chạy theo lịch (không phải test)
            if (!isTest) {
                setTimeout(() => {
                    chrome.tabs.remove(tabId).catch(e => console.log(`Không thể đóng tab ${tabId}: ${e.message}`));
                }, 5000); // Đợi 5 giây trước khi đóng
            }
        };

        const updateListener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                console.log(`[Payment Process] Tab ${tabId} đã tải xong. Injecting script...`);
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['scripts/payment_auto.js']
                    }).then(() => {
                        console.log(`[Payment Process] Đã inject script. Gửi lệnh bắt đầu...`);
                        chrome.tabs.sendMessage(tabId, {
                            message: "startPaymentProcess",
                            data: {
                                tabId: tabId,
                                testMode: isTest,
                                realPayment: !isTest,
                                clickButton: !isTest
                            }
                        });
                    }).catch(err => {
                        console.error(`[Payment Process] Lỗi inject script: ${err.message}`);
                        cleanup();
                    });
                }, 2000); // Chờ 2 giây để trang ổn định
            }
        };

        const messageListener = (req, sender) => {
            if (sender.tab && sender.tab.id === tabId) {
                if (req.message === "sendPaymentLogToServer" || req.message === "disbursementFailed") {
                    console.log(`[Payment Process] Nhận được tin nhắn cuối cùng '${req.message}'. Dọn dẹp.`);
                    cleanup();
                }
            }
        };

        chrome.tabs.onUpdated.addListener(updateListener);
        chrome.runtime.onMessage.addListener(messageListener);

        // Timeout để tránh treo tiến trình
        setTimeout(() => {
            if (!isProcessFinished) {
                console.warn(`[Payment Process] Quá trình cho tab ${tabId} đã quá thời gian. Tự động dọn dẹp.`);
                cleanup();
            }
        }, 3 * 60 * 1000); // 3 phút timeout

    } catch (error) {
        console.error("[Payment Process] Lỗi nghiêm trọng:", error.message);
    }
}



if (request.message === "executeRealPayment") {
    console.log("[Background] Nhận yêu cầu executeRealPayment (rút tiền thật)");
    const { confirmed, realPayment } = request.data;

    if (!confirmed || !realPayment) {
        sendResponse({ status: "not_confirmed" });
        return true;
    }

    getMBApiKey().then(merchantId => {
        if (!merchantId) {
            console.error("[Background] Không tìm thấy API key");
            chrome.runtime.sendMessage({
                message: "realPaymentFinished",
                data: { success: false, error: "Không tìm thấy API key. Vui lòng cài đặt." }
            });
            return;
        }

        chrome.tabs.create({
            url: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
            active: true // Chuyển thành true để dễ quan sát
        }, function(tab) {
            if (chrome.runtime.lastError || !tab || !tab.id) {
                console.error("[Background] Lỗi tạo tab:", chrome.runtime.lastError?.message);
                return;
            }

            const tabId = tab.id;
            
            // Listener này sẽ quản lý toàn bộ quy trình cho tab này
            const paymentProcessListener = (updatedTabId, changeInfo, updatedTab) => {
                // Chỉ thực thi khi đúng tab và trang đã tải xong hoàn toàn
                if (updatedTabId === tabId && changeInfo.status === "complete") {
                    
                    console.log(`[BG Process Manager] Tab ${tabId} đã tải xong URL: ${updatedTab.url}`);

                    // Chờ một chút để trang ổn định trước khi inject
                    setTimeout(() => {
                        chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['scripts/payment_auto.js']
                        }).then(() => {
                            console.log(`[BG Process Manager] Đã inject script thành công.`);
                            // Gửi lệnh để script tự quyết định hành động dựa trên URL
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, {
                                    message: "startPaymentProcess",
                                    data: {
                                        tabId: tabId,
                                        testMode: false,
                                        realPayment: true,
                                        clickButton: true
                                    }
                                });
                            }, 2000);
                        }).catch(err => {
                            console.error(`[BG Process Manager] Lỗi inject script: ${err.message}`);
                            chrome.tabs.onUpdated.removeListener(paymentProcessListener);
                        });
                    }, 1000);
                }
            };

            // Listener để nhận biết khi nào quy trình kết thúc để dọn dẹp
            const finalMessageListener = (req, sender) => {
                if (sender.tab && sender.tab.id === tabId) {
                    if (req.message === "sendPaymentLogToServer" || req.message === "disbursementFailed") {
                        console.log(`[BG Process Manager] Nhận được tin nhắn cuối cùng '${req.message}'. Dọn dẹp listener.`);
                        chrome.tabs.onUpdated.removeListener(paymentProcessListener);
                        chrome.runtime.onMessage.removeListener(finalMessageListener);
                    }
                }
            };

            // Gắn các listener vào
            chrome.tabs.onUpdated.addListener(paymentProcessListener);
            chrome.runtime.onMessage.addListener(finalMessageListener);
        });
    });

    sendResponse({ status: "real_payment_started" });
    return true;
}
// Handler cho Toggle Auto Schedule
  if (request.message === "toggleAutoSchedule") {
          // Sử dụng async/await để mã dễ đọc hơn
          (async () => {
              try {
                  // Lấy trạng thái hiện tại, mặc định là false (tắt)
                  const result = await chrome.storage.local.get({ autoPaymentEnabled: false });
                  const newState = !result.autoPaymentEnabled;

                  // Lưu trạng thái mới
                  await chrome.storage.local.set({ autoPaymentEnabled: newState });
                  console.log(`[AutoPayment] Trạng thái được cập nhật thành: ${newState ? 'BẬT' : 'TẮT'}`);

                  if (newState) {
                      // Bật: Gọi hàm setup chính để tải và đặt lại tất cả các lịch từ server
                      console.log("[AutoPayment] Đang bật... Gọi setupDailyAlarm() để đặt lịch.");
                      await setupDailyAlarm(); // Hàm này sẽ thiết lập các alarm 'paymentRequest_*'
                      sendResponse({ enabled: true, message: "Đã bật và đặt lịch rút tiền tự động." });
                  } else {
                      // Tắt: Xóa tất cả các alarm liên quan đến rút tiền
                      console.log("[AutoPayment] Đang tắt... Xóa các lịch rút tiền.");
                      const allAlarms = await chrome.alarms.getAll();
                      for (const alarm of allAlarms) {
                          if (alarm.name.startsWith("paymentRequest_")) {
                              await chrome.alarms.clear(alarm.name);
                              console.log(` -> Đã xóa alarm: ${alarm.name}`);
                          }
                      }
                      sendResponse({ enabled: false, message: "Đã tắt và xóa lịch rút tiền tự động." });
                  }
              } catch (error) {
                  console.error("[AutoPayment] Lỗi khi chuyển đổi trạng thái:", error);
                  sendResponse({ error: error.message });
              }
          })();

          return true; // Giữ kênh message mở cho phản hồi bất đồng bộ
      }
// Handler để lấy merchant ID
if (request.message === "getMerchantId") {
    const merchantId = getMBApiKey(); // Sử dụng function có sẵn
    sendResponse({ merchantId: merchantId });
    return true;
}

// Cập nhật handler cho autoRequestPayment alarm

});

// Sửa hàm này để trả về một Promise
const openPerformanceDashboardPage = () => {
  return new Promise((resolve) => {
    const url = `${globalDomain}/performance/dashboard`;
    chrome.tabs.query({ url: `${globalDomain}/performance/dashboard*` }, (tabs) => {
      if (tabs.length > 0) {
        // Nếu đã có, update và trả về tab đó
        chrome.tabs.update(tabs[0].id, { active: true, url }, (tab) => resolve(tab));
      } else {
        // Nếu chưa có, tạo mới và trả về tab đó
        chrome.tabs.create({ active: true, url }, (tab) => resolve(tab));
      }
    });
  });
};

// Mở trang Update Tracking với URL đúng format
const openOrderDetailPage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/orders-v3?page=1&date-range=last-30&sort=order_date_asc&statuses=Update%20Tracking`;
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

/**
 * Hàm chờ một tab tải xong hoàn toàn
 * @param {number} tabId - ID của tab cần chờ.
 * @param {number} [timeout=20000] - Thời gian chờ tối đa (ms).
 * @returns {Promise<chrome.tabs.Tab>}
 */
function waitForTabComplete(tabId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timeout: Tab ${tabId} không tải xong trong ${timeout / 1000}s`));
    }, timeout);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Hàm kiểm tra trạng thái đăng nhập Amazon
 * @returns {Promise<boolean>} - Trả về true nếu đã đăng nhập.
 */
async function checkAmazonLoginStatus() {
  const logPrefix = '[LoginCheck]';
  let checkTab = null;
  let isNewTab = false; // Cờ để biết tab này có phải do mình tạo ra không

  try {
    // Ưu tiên dùng lại tab đang mở để đỡ phải tạo tab mới
    const existingTabs = await chrome.tabs.query({ url: "*://sellercentral.amazon.com/*" });
    if (existingTabs.length > 0) {
      checkTab = existingTabs[0];
      // Điều hướng nó về trang home để kiểm tra, không active
      await chrome.tabs.update(checkTab.id, { url: "https://sellercentral.amazon.com/home", active: false });
    } else {
      isNewTab = true; // Đánh dấu là tab mới
      checkTab = await chrome.tabs.create({ url: "https://sellercentral.amazon.com/home", active: false });
    }

    const loadedTab = await waitForTabComplete(checkTab.id);

    // Cách kiểm tra đơn giản và hiệu quả nhất
    if (loadedTab.url.includes('/ap/signin')) {
      sendLogToServer(`${logPrefix} Login status: NOT LOGGED IN (Redirected)`);
      // Nếu là tab mới tạo ra để check, và không login, thì đóng nó đi
      if (isNewTab) await chrome.tabs.remove(checkTab.id).catch(() => {});
      return false;
    }

    sendLogToServer(`${logPrefix} Login status: LOGGED IN`);
    // Nếu đã login và là tab mới tạo, cũng có thể đóng đi cho gọn
    if (isNewTab) await chrome.tabs.remove(checkTab.id).catch(() => {});
    return true;

  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    sendLogToServer(`${logPrefix} Error: ${error.message}`);
    // Dọn dẹp tab nếu có lỗi và tab đó là do mình tạo ra
    if (checkTab?.id && isNewTab) {
      await chrome.tabs.remove(checkTab.id).catch(() => {});
    }
    return false;
  }
}
