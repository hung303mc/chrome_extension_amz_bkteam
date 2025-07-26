var mbApi = "MBApi";
const ipTrackingKey = "ipTrackingEnabled";

const testSettingsKey = "testSettings";

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
            } else {
                // Nếu không có trong chrome.storage.local, kiểm tra trong localStorage
                const localData = localStorage.getItem(mbApi);
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
    // Mặc định là false (không bật) nếu chưa có cài đặt
    chrome.storage.local.get({ [ipTrackingKey]: false }).then((result) => {
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
        downloadAds: false, // Thêm dòng này
        delay: 0.1,
      }
    }).then((result) => {
      resolve(result[testSettingsKey]);
    });
  });

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

$(document).on("click", "#run_test", async function () {
  const settings = {
    syncOrder: $('#test_sync_order').is(':checked'),
    updateTracking: $('#test_update_tracking').is(':checked'),
    accountHealth: $('#test_account_health').is(':checked'),
    downloadAds: $('#test_download_ads').is(':checked'), // Thêm dòng này
    delay: parseFloat($('#test_delay').val()) || 0.1,
  };

  if (!settings.syncOrder && !settings.updateTracking && !settings.accountHealth && !settings.downloadAds) {
    $('#test_status').text("Chọn ít nhất 1 tác vụ!").css('color', 'red');
    return;
  }

  await saveTestSettings(settings);

  chrome.runtime.sendMessage({ message: "runTestNow" });

  $('#test_status').text("Đã gửi lệnh chạy test!").css('color', 'green');
  setTimeout(() => { $('#test_status').text(''); }, 3000);
});

async function checkApiKey() {
    const key = await getMbApi();
    if (key) {
        console.log("API key retrieved:", key);
        $("#api_key").val(key);
        // Nếu có API key, lưu lại vào storage.local
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
  $('#test_download_ads').prop('checked', settings.downloadAds); // Thêm dòng này
  $('#test_delay').val(settings.delay);
  console.log("Đã load cài đặt test đã lưu.", settings);
}

$(document).ready(function () {
  checkApiKey();
  checkIpTrackingSetting();
  loadTestSettings();
});
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
   if (request.message === "listedSaveApiKey") {
      sendResponse({ message: "received" });
      window.close();
   }
});