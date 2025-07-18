var mbApi = "MBApi";
const ipTrackingKey = "ipTrackingEnabled";

const saveMbApi = (apiKey) =>
    new Promise((resolve) => {
        chrome.storage.local.set({ [mbApi]: apiKey }).then(() => {
            localStorage.setItem(mbApi, apiKey);
            resolve(apiKey);
        });
    });

const getMbApi = () =>
    new Promise((resolve) => {
        chrome.storage.local.get(mbApi).then((result) => {
            if (result[mbApi] !== undefined) {
                resolve(result[mbApi]);
            } else {
                // Nếu không có trong chrome.storage.local, kiểm tra trong localStorage
                const localData = localStorage.getItem(mbApi);
                resolve(localData);
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


$(document).on("click", "#save", async function () {
    const value = $("#api_key").val();
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


$(document).ready(function () {
  checkApiKey();
  checkIpTrackingSetting();
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
   if (request.message === "listedSaveApiKey") {
      sendResponse({ message: "received" });
      window.close();
   }
});