var mbApi = "MBApi";
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

// Hàm kiểm tra và hiển thị trạng thái của các scheduler
async function updateSchedulerStatus() {
    // Kiểm tra trạng thái của update_tracking scheduler
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length > 0) {
            // Check update tracking scheduler status
            chrome.tabs.sendMessage(tabs[0].id, {
                message: "checkUpdateTrackingStatus"
            }, function(response) {
                updateTrackingStatusDisplay(response);
            });
            
            // Check account health scheduler status
            chrome.tabs.sendMessage(tabs[0].id, {
                message: "checkAccountHealthStatus"
            }, function(response) {
                accountHealthStatusDisplay(response);
            });
            
            // Check ads report scheduler status
            chrome.tabs.sendMessage(tabs[0].id, {
                message: "checkAdsReportStatus"
            }, function(response) {
                adsReportStatusDisplay(response);
            });
        }
    });
}

// Hiển thị trạng thái của update tracking
function updateTrackingStatusDisplay(response) {
    if (!response) return;
    
    const statusContainer = $("#update-tracking-status");
    
    if (!statusContainer.length) {
        // Nếu chưa có container, thêm mới
        const container = `
        <div id="scheduler-status">
            <div id="update-tracking-status" class="scheduler-item">
                <h3>Cập nhật Tracking (9:15 sáng)</h3>
                <div class="status">${response.enabled ? 'Đã kích hoạt' : 'Đã tắt'}</div>
                ${response.nextRun ? `<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>` : ''}
                ${response.remainingTime ? `<div class="remaining-time">Còn lại: ${response.remainingTime}</div>` : ''}
            </div>
        </div>
        `;
        
        // Thêm vào cuối popup nhưng trước footer
        $(container).insertBefore("#footer");
    } else {
        // Cập nhật nội dung nếu container đã tồn tại
        statusContainer.find(".status").text(response.enabled ? 'Đã kích hoạt' : 'Đã tắt');
        if (response.nextRun) {
            if (statusContainer.find(".next-run").length) {
                statusContainer.find(".next-run").text(`Chạy tiếp theo: ${response.nextRun}`);
            } else {
                statusContainer.append(`<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>`);
            }
        }
        
        if (response.remainingTime) {
            if (statusContainer.find(".remaining-time").length) {
                statusContainer.find(".remaining-time").text(`Còn lại: ${response.remainingTime}`);
            } else {
                statusContainer.append(`<div class="remaining-time">Còn lại: ${response.remainingTime}</div>`);
            }
        }
    }
}

// Hiển thị trạng thái của account health
function accountHealthStatusDisplay(response) {
    if (!response) return;
    
    const statusContainer = $("#account-health-status");
    const schedulerContainer = $("#scheduler-status");
    
    if (!schedulerContainer.length) {
        // Nếu chưa có container cha, thì cần đợi update-tracking tạo ra
        return;
    }
    
    if (!statusContainer.length) {
        // Nếu chưa có container cho account health, thêm mới
        const container = `
            <div id="account-health-status" class="scheduler-item">
                <h3>Cập nhật Account Health (9:30 sáng)</h3>
                <div class="status">${response.enabled ? 'Đã kích hoạt' : 'Đã tắt'}</div>
                ${response.nextRun ? `<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>` : ''}
                ${response.remainingTime ? `<div class="remaining-time">Còn lại: ${response.remainingTime}</div>` : ''}
            </div>
        `;
        
        // Thêm vào sau update-tracking-status
        $(container).appendTo("#scheduler-status");
    } else {
        // Cập nhật nội dung nếu container đã tồn tại
        statusContainer.find(".status").text(response.enabled ? 'Đã kích hoạt' : 'Đã tắt');
        if (response.nextRun) {
            if (statusContainer.find(".next-run").length) {
                statusContainer.find(".next-run").text(`Chạy tiếp theo: ${response.nextRun}`);
            } else {
                statusContainer.append(`<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>`);
            }
        }
        
        if (response.remainingTime) {
            if (statusContainer.find(".remaining-time").length) {
                statusContainer.find(".remaining-time").text(`Còn lại: ${response.remainingTime}`);
            } else {
                statusContainer.append(`<div class="remaining-time">Còn lại: ${response.remainingTime}</div>`);
            }
        }
    }
}

// Hiển thị trạng thái của ads report
function adsReportStatusDisplay(response) {
    if (!response) return;
    
    const statusContainer = $("#ads-report-status");
    const schedulerContainer = $("#scheduler-status");
    
    if (!schedulerContainer.length) {
        // Nếu chưa có container cha, thì cần đợi update-tracking tạo ra
        return;
    }
    
    if (!statusContainer.length) {
        // Nếu chưa có container cho ads report, thêm mới
        const container = `
            <div id="ads-report-status" class="scheduler-item">
                <h3>Tải Báo Cáo Quảng Cáo (9:45 sáng)</h3>
                <div class="status">${response.enabled ? 'Đã kích hoạt' : 'Đã tắt'}</div>
                ${response.nextRun ? `<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>` : ''}
                ${response.remainingTime ? `<div class="remaining-time">Còn lại: ${response.remainingTime}</div>` : ''}
            </div>
        `;
        
        // Thêm vào sau account-health-status
        $(container).appendTo("#scheduler-status");
    } else {
        // Cập nhật nội dung nếu container đã tồn tại
        statusContainer.find(".status").text(response.enabled ? 'Đã kích hoạt' : 'Đã tắt');
        if (response.nextRun) {
            if (statusContainer.find(".next-run").length) {
                statusContainer.find(".next-run").text(`Chạy tiếp theo: ${response.nextRun}`);
            } else {
                statusContainer.append(`<div class="next-run">Chạy tiếp theo: ${response.nextRun}</div>`);
            }
        }
        
        if (response.remainingTime) {
            if (statusContainer.find(".remaining-time").length) {
                statusContainer.find(".remaining-time").text(`Còn lại: ${response.remainingTime}`);
            } else {
                statusContainer.append(`<div class="remaining-time">Còn lại: ${response.remainingTime}</div>`);
            }
        }
    }
}

$(document).ready(function () {
    checkApiKey();
    
    // Thêm CSS cho phần hiển thị trạng thái scheduler
    const style = `
    <style>
        #scheduler-status {
            margin-top: 20px;
            border-top: 1px solid #e0e0e0;
            padding-top: 10px;
        }
        .scheduler-item {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 5px;
            background-color: #f5f5f5;
        }
        .scheduler-item h3 {
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: bold;
        }
        .status {
            color: #4CAF50;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .next-run, .remaining-time {
            font-size: 12px;
            color: #555;
            margin-bottom: 3px;
        }
        #footer {
            margin-top: 15px;
        }
    </style>
    `;
    $('head').append(style);
    
    // Cập nhật trạng thái scheduler ban đầu
    setTimeout(updateSchedulerStatus, 500); // Đợi 500ms để DOM và content script sẵn sàng
    
    // Cập nhật trạng thái mỗi 30 giây
    setInterval(updateSchedulerStatus, 30000);
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
   if (request.message === "listedSaveApiKey") {
      sendResponse({ message: "received" });
      window.close();
   }
});
