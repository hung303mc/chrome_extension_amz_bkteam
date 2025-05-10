(function(){
// jQuery code - runs only in content script context
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Wait for jQuery to be available
    function checkJQuery() {
        if (typeof $ !== 'undefined') {
            $(document).on("click", "#account-health", function () {
                console.log('Clicked!');
                $(this).addClass("loader");
                
                // Get the current tab and use the central reload function
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs.length > 0) {
                        // Send message to background script to reload tab before account health check
                        chrome.runtime.sendMessage({
                            message: "reloadTabBeforeAction",
                            data: {
                                tabId: tabs[0].id,
                                action: "accountHealth"
                            }
                        }, function(response) {
                            // Check if the background script handled the reload request
                            if (!response || !response.success) {
                                // Fallback: run account health check directly if background script doesn't respond
                                getAccountHealth().then((accountHealth) => {
                                    $(".loader").removeClass("loader");
                                    const { error } = accountHealth;
                                    if (error) {
                                        notifyError(error);
                                        return;
                                    }
                                    notifySuccess("Account health completed.");
                                });
                            }
                        });
                    } else {
                        // If no active tab, run account health directly
                        getAccountHealth().then((accountHealth) => {
                            $(".loader").removeClass("loader");
                            const { error } = accountHealth;
                            if (error) {
                                notifyError(error);
                                return;
                            }
                            notifySuccess("Account health completed.");
                        });
                    }
                });
            });

            // caption event form background
            chrome.runtime.onMessage.addListener(async (req, sender, res) => {
                const { message, data } = req || {};
               
                // Always send a response to prevent connection errors
                if (res) {
                    res({ message: "received" });
                }
               
                if (message === "updateAccountHealth") {
                    $(".loader").removeClass("loader");
                    const { error } = data || {};
                    if (error) {
                        notifyError(error);
                        return;
                    }
                    notifySuccess("Account health completed.");
                } else if (message === "startAccountHealthAuto") {
                    console.log("[ACCOUNT HEALTH] Received auto update trigger");
                    
                    try {
                        // Thực hiện cập nhật account health
                        await getAccountHealth();
                        console.log("[ACCOUNT HEALTH] Auto update completed successfully");
                    } catch (error) {
                        console.error("[ACCOUNT HEALTH] Error performing auto update:", error);
                        // Cố gắng hiển thị thông báo lỗi nếu có thể
                        try {
                            notifyError("Failed to perform automatic account health update: " + error.message);
                        } catch (e) {
                            console.error("[ACCOUNT HEALTH] Could not show error notification:", e);
                        }
                    }
                } else if (message === "checkAccountHealthStatus") {
                    // Use the exported function
                    checkAccountHealthStatus(function(status) {
                        res(status);
                    });
                    return true; // Giữ kênh mở cho phản hồi bất đồng bộ
                }
            });
            console.log("[ACCOUNT HEALTH] DOM handlers registered");
        } else {
            setTimeout(checkJQuery, 100);
        }
    }
    
    // Start checking for jQuery
    setTimeout(checkJQuery, 0);
}

// Biến lưu trữ hẹn giờ cho account health
let scheduledAccountHealthTask = null;

// Hàm đặt lịch tự động cập nhật account health vào 10h20 sáng mỗi ngày
function scheduleAccountHealth() {
    const now = new Date();
    const updateTime = new Date();
    
    // Đặt thời gian cập nhật là 10h20 sáng
    updateTime.setHours(9, 15, 0, 0);
    
    // Nếu thời gian hiện tại đã qua 10h20 sáng, đặt lịch cho ngày mai
    if (now > updateTime) {
        updateTime.setDate(updateTime.getDate() + 1);
    }
    
    // Tính toán khoảng thời gian từ hiện tại đến thời điểm cập nhật (milliseconds)
    const timeUntilUpdate = updateTime.getTime() - now.getTime();
    
    console.log(`[ACCOUNT HEALTH] Lịch cập nhật account health tiếp theo: ${updateTime.toLocaleString()}`);
    console.log(`[ACCOUNT HEALTH] Còn: ${Math.floor(timeUntilUpdate / (1000 * 60))} phút`);
    
    // Xóa lịch trình cũ nếu có
    if (scheduledAccountHealthTask) {
        clearTimeout(scheduledAccountHealthTask);
    }
    
    // Đặt lịch mới
    scheduledAccountHealthTask = setTimeout(() => {
        console.log('[ACCOUNT HEALTH] Bắt đầu tự động cập nhật account health lúc 10h20 sáng');
        startAccountHealth();
        
        // Đặt lịch cho ngày hôm sau
        scheduleAccountHealth();
    }, timeUntilUpdate);
    
    // Lưu trạng thái và thời gian cập nhật tiếp theo
    chrome.storage.local.set({ 
        'nextAccountHealthTime': updateTime.toISOString(),
        'autoAccountHealthEnabled': true
    });
}

// Function to start account health check
function startAccountHealth() {
    console.log('[ACCOUNT HEALTH] Bắt đầu quá trình cập nhật account health tự động');
    
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
            
            // Gửi message đến background script để reload tab trước khi cập nhật account health
            chrome.runtime.sendMessage({
                message: "reloadTabBeforeAction",
                data: {
                    tabId: amazonTab.id,
                    action: "accountHealth"
                }
            });
        } else {
            // Nếu chưa có tab Amazon, mở trang Amazon mới
            chrome.tabs.create({ 
                url: "https://sellercentral.amazon.com/home",
                active: true 
            }, (tab) => {
                // Đợi tab load xong
                chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        // Tab đã load xong, đợi thêm 5 giây để trang hoàn toàn ổn định
                        setTimeout(() => {
                            // Gửi message đến background script để reload tab trước khi cập nhật account health
                            chrome.runtime.sendMessage({
                                message: "reloadTabBeforeAction",
                                data: {
                                    tabId: tab.id,
                                    action: "accountHealth"
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

// Khởi tạo lịch cập nhật account health khi extension được load
function initAccountHealthScheduler() {
    // Kiểm tra trạng thái tự động cập nhật từ storage
    chrome.storage.local.get(['autoAccountHealthEnabled'], function(result) {
        // Mặc định bật tính năng tự động cập nhật
        const enabled = result.autoAccountHealthEnabled !== false;
        
        if (enabled) {
            // Khởi tạo lịch trình
            scheduleAccountHealth();
            console.log('[ACCOUNT HEALTH] Đã khởi tạo lịch trình tự động cập nhật account health');
        } else {
            console.log('[ACCOUNT HEALTH] Tự động cập nhật account health đã bị tắt');
        }
    });
}

// Function to check account health status
function checkAccountHealthStatus(callback) {
    chrome.storage.local.get(['nextAccountHealthTime', 'autoAccountHealthEnabled'], function(result) {
        // Tính toán thời gian còn lại
        let remainingTime = "";
        let nextRun = "";
        
        if (result.nextAccountHealthTime) {
            const nextAccountHealthTime = new Date(result.nextAccountHealthTime);
            const now = new Date();
            
            // Tính toán thời gian còn lại (phút)
            const timeUntilUpdate = nextAccountHealthTime.getTime() - now.getTime();
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
                const isToday = nextAccountHealthTime.getDate() === now.getDate() && 
                                nextAccountHealthTime.getMonth() === now.getMonth() && 
                                nextAccountHealthTime.getFullYear() === now.getFullYear();
                
                const timeString = nextAccountHealthTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                nextRun = isToday ? `Hôm nay lúc ${timeString}` : `Ngày mai lúc ${timeString}`;
            }
        }
        
        callback({
            enabled: result.autoAccountHealthEnabled !== false,
            nextUpdateTime: result.nextAccountHealthTime,
            remainingTime: remainingTime,
            nextRun: nextRun
        });
    });
}

// Export for background script
const AccountHealthScheduler = {
    init: initAccountHealthScheduler,
    schedule: scheduleAccountHealth,
    start: startAccountHealth,
    checkStatus: checkAccountHealthStatus
};

// Export module for background.js to import
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccountHealthScheduler;
} else {
    // If not using module, add to global object
    self.AccountHealthScheduler = AccountHealthScheduler;
}

// Hàm chính thực hiện việc lấy dữ liệu Account Health
async function getAccountHealth() {
    console.log('Get account health clicked!');
    const accountAmazon = {};
    try {
        // 1. Tải trang Home để lấy KPI data và merchant id
        await loadPage("https://sellercentral.amazon.com/home");
        await sleep(2000);
        // const KPIDataElement = document.getElementById("KPITOOLBAR_CHANNEL_PROPS");
        const KPIDataElement = document.getElementById("KPITOOLBAR_CHANNEL_RESPONSE");
        if (KPIDataElement) {
            const KPIData = KPIDataElement.innerHTML;
            // Lấy merchant id từ KPI data
            const merchantId = getMerchant(KPIData);
            accountAmazon["merchain_id"] = merchantId;
            // Lấy thêm các chỉ số liên quan đến KPI (ví dụ: balance, buybox,…)
            getKpi(KPIData, accountAmazon);
        }

        // 2. Lấy số lượng đơn trả cần xác nhận (authorization required)
        let html = await loadPage("https://sellercentral.amazon.com/returns/list?pageSize=25&returnRequestState=authorizationRequired&useDefaultReturnRequestState=false&orderBy=CreatedDateDesc&pendingActionsFilterBy=pendingActions&isOnPendingActionsTab=false&pageNumber=1&scrollId=&previousPageScrollId=&isOrderBySelected=undefined&selectedDateRange=365&keyword=&dmCode=close-return-request-success&dmType=success");
        await sleep(3000);
        let doc = new DOMParser().parseFromString(html, "text/html");
        accountAmazon["return_authorize_num"] = doc.getElementsByClassName("returnRequest").length;

        // 3. Lấy số lượng đơn trả đang chờ xử lý (pending actions)
        html = await loadPage("https://sellercentral.amazon.com/returns/list?pageSize=25&returnRequestState=pendingActions&orderBy=CreatedDateAsc&pageNumber=1&selectedDateRange=50&cardType=pendingRefunds&pendingActionsFilterBy=pendingRefund&isOnPendingActionsTab=true");
        await sleep(3000);
        doc = new DOMParser().parseFromString(html, "text/html");
        accountAmazon["return_pending_action_num"] = doc.getElementsByClassName("returnRequest").length;

        // 4. Lấy thông tin Payment từ Payments Dashboard qua background
        try {
            const paymentData = await getPaymentData();
            Object.assign(accountAmazon, paymentData);
        } catch (err) {
            console.error("Error retrieving Payment data:", err);
        }


        // 5. Lấy thông tin Performance Dashboard (chỉ số khách hàng, feedback, AHR, policies, shipping, …)
        html = await loadPage("https://sellercentral.amazon.com/performance/dashboard");
        await sleep(3000);
        doc = new DOMParser().parseFromString(html, "text/html");
        // Ví dụ: trích xuất phần Customer Satisfaction
        let csSection = doc.getElementById("customer-satisfaction-content-rows-section");
        if (csSection) {
            let rows = csSection.getElementsByClassName("a-row");
            if (rows.length > 0) {
                let columns = rows[0].getElementsByClassName("a-column");
                if (columns.length > 1) {
                    let overallElem = columns[1].querySelector(".a-size-large");
                    if (overallElem) {
                        accountAmazon["odr_overall"] = overallElem.textContent.trim().replace("%", "");
                    }
                    let smallElem = columns[1].querySelector(".a-size-small");
                    if (smallElem) {
                        // Giả sử text dạng "x of y orders"
                        let parts = smallElem.textContent.split("of");
                        if(parts.length > 1) {
                            accountAmazon["total_orders_60days"] = parseInt(parts[1].replace(/[^\d]/g, ""));
                            accountAmazon["atoz_neg_fb"] = parseInt(parts[0].replace(/[^\d]/g, ""));
                        }
                    }
                }
            }
        }
        // Các chỉ số khác như feedback, AHR, payment review, policies, shipping… cũng được trích xuất tương tự
        const odrSection = doc.getElementById("odr-breakdown-section");
        if (odrSection) {
            let rows = odrSection.getElementsByClassName("a-row");
            if (rows.length >= 3) {
                // Lấy giá trị ở cột số 2 cho mỗi hàng
                let rawFbNegative = extractText(rows[0], ".sp-middle-col .a-size-base");
                let rawClaimsAtoz = extractText(rows[1], ".sp-middle-col .a-size-base");
                let rawClaimsCb   = extractText(rows[2], ".sp-middle-col .a-size-base");

                // Hàm xử lý: loại bỏ dấu "%" và convert sang số, làm tròn 2 chữ số
                const processValue = (rawValue) => {
                    if (rawValue !== "N/A") {
                        const num = parseFloat(rawValue.replace("%", "").trim());
                        return Number(num.toFixed(2));
                    }
                    return null;
                };

                accountAmazon["fb_negative"] = processValue(rawFbNegative);
                accountAmazon["claims_atoz"] = processValue(rawClaimsAtoz);
                accountAmazon["claims_cb"]   = processValue(rawClaimsCb);
            }
        }


        const ahrElem = doc.querySelector(".ahd-numeric-ahr-indicator .a-row .a-column:nth-child(2) h3");
        if (ahrElem) {
            accountAmazon["ahr"] = parseInt(ahrElem.textContent.trim());
        }
        accountAmazon["payment_review"] = doc.getElementById("financial-reserve-box") ? 1 : 0;

        // Policies Metrics
        // IP Suspected
        const ipSuspectedElem = doc.getElementById("policies-brand-protection-row");
        if (ipSuspectedElem) {
            const colElem = ipSuspectedElem.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["ip_suspected"] = parseInt(colElem.textContent.trim().replace("%", "").replace(/,/g, ""));
            }
        }

        // IP Received
        const ipReceivedElem = doc.getElementById("policies-intellectual-property-row");
        if (ipReceivedElem) {
            const colElem = ipReceivedElem.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["ip_received"] = parseInt(colElem.textContent.trim().replace("%", "").replace(/,/g, ""));
            }
        }

        // Listing Policy
        try {
            const listingPolicyElem = doc.getElementById("policies-listing-policy-row")
                .querySelector(".a-column:nth-child(2) .a-size-large");
            accountAmazon["listing_policy"] = parseInt(listingPolicyElem.textContent.trim().replace("%", "").replace(/,/g, ""));
        } catch (e) {
            accountAmazon["listing_policy"] = 0;
        }

        // Policy Restricted
        try {
            const policyRestrictedElem = doc.getElementById("restricted-products-row")
                .querySelector(".a-column:nth-child(2) .a-size-large");
            accountAmazon["policy_restricted"] = parseInt(policyRestrictedElem.textContent.trim().replace("%", "").replace(/,/g, ""));
        } catch (e) {
            accountAmazon["policy_restricted"] = 0;
        }

        // Policy Violation Warning
        try {
            const policyViolationElem = doc.getElementById("policies-product-warning-row")
                .querySelector(".a-column:nth-child(2) .a-size-large");
            accountAmazon["policy_violation_warning"] = parseInt(policyViolationElem.textContent.trim().replace("%", "").replace(/,/g, ""));
        } catch (e) {
            accountAmazon["policy_violation_warning"] = 0;
        }

        // Late Shipment Rate
        const lateShipmentRow = doc.getElementById("shipping-late-shipment-rate-row");
        if (lateShipmentRow) {
            let colElem = lateShipmentRow.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["late_shipment_rate"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
            } else {
                colElem = lateShipmentRow.querySelector(".a-column:nth-child(2) .a-size-base");
                if (colElem) {
                    accountAmazon["late_shipment_rate"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
                }
            }
        }

        // Pre-fulfillment Cancel Rate
        const cancelRateRow = doc.getElementById("shipping-cancellation-rate-row");
        if (cancelRateRow) {
            let colElem = cancelRateRow.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["cancel_rate"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
            } else {
                colElem = cancelRateRow.querySelector(".a-column:nth-child(2) .a-size-base");
                if (colElem) {
                    accountAmazon["cancel_rate"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
                }
            }
        }

        // Valid Tracking Rate
        const trackingRateRow = doc.getElementById("shipping-view-tracking-rate-row");
        if (trackingRateRow) {
            let colElem = trackingRateRow.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["valid_tracking_rate"] = colElem.textContent.trim();
            } else {
                colElem = trackingRateRow.querySelector(".a-column:nth-child(2) .a-size-base");
                if (colElem) {
                    accountAmazon["valid_tracking_rate"] = colElem.textContent.trim();
                }
            }
        }

        // OTDR (On-Time Delivery Rate)
        const otdrRow = doc.getElementById("unit-on-time-delivery-rate-row");
        if (otdrRow) {
            let colElem = otdrRow.querySelector(".a-column:nth-child(2) .a-size-large");
            if (colElem) {
                accountAmazon["otdr"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
            } else {
                colElem = otdrRow.querySelector(".a-column:nth-child(2) .a-size-base");
                if (colElem) {
                    accountAmazon["otdr"] = colElem.textContent.trim().replace("%", "").replace(/,/g, "");
                }
            }
        }


        // 6. Lấy thông tin Feedback Manager
        try {
            const feedbackData = await getFeedbackManagerData();
            // Gộp dữ liệu feedback vào accountAmazon
            Object.assign(accountAmazon, feedbackData);
        } catch (err) {
            console.error("Error retrieving Feedback Manager data:", err);
        }

        // 7. Lấy thông tin Listing Issues
        html = await loadPage("https://sellercentral.amazon.com/fixyourproducts");
        await sleep(5000);
        doc = new DOMParser().parseFromString(html, "text/html");
        let resultArray = [];
        const leftDivs = doc.getElementsByClassName("left-filter-content-div");
        Array.from(leftDivs).forEach(div => {
            let options = div.getElementsByClassName("left-filter-option-div");
            Array.from(options).forEach(option => {
                let nameElem = option.querySelector("a span");
                let countElem = option.querySelector("span");
                if (nameElem && countElem) {
                    let name = nameElem.textContent.trim().replace(/\(\d+\)/, "").trim();
                    let countMatch = countElem.textContent.match(/\((\d+)\)/);
                    if (countMatch) {
                        resultArray.push(name + "|" + countMatch[1]);
                    }
                }
            });
        });
        accountAmazon["note"] = resultArray.join(",");
        accountAmazon["listing_active"] = 0;
        accountAmazon["listing_closed"] = 0;

        // Chuyển đổi dữ liệu sang JSON và gửi về server
        const jsonData = JSON.stringify(accountAmazon);
        console.log('accountAmazon :>> ', accountAmazon);
        console.log("Account Health Data:", jsonData);
        await sendPostRequest("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=getAccountHealth", jsonData);
        
        return { success: true };
    } catch (err) {
        console.error("Error in getAccountHealth:", err);
        return { error: err.message };
    }
}

// Hàm hỗ trợ: tải một trang bằng fetch (chú ý dùng credentials để giữ session)
async function loadPage(url) {
    const response = await fetch(url, { credentials: "include" });
    return await response.text();
}

// Hàm sleep cho việc chờ đợi
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm trợ giúp để trích xuất text từ một phần tử con theo selector
function extractText(parent, selector) {
    const el = parent.querySelector(selector);
    return el ? el.textContent.trim().replace(/\$/g, "").replace(/,/g, "") : "";
}

// Hàm trợ giúp để lấy attribute của phần tử con theo selector
function extractAttribute(parent, selector, attribute) {
    const el = parent.querySelector(selector);
    return el ? el.getAttribute(attribute).trim().replace(/\$/g, "").replace(/,/g, "") : "";
}

// Loại bỏ ký tự định dạng tiền tệ
function cleanCurrency(str) {
    return str.replace(/\$/g, "").replace(/,/g, "").trim();
}

// Hàm lấy merchant id từ KPI data (được parse từ JSON)
function getMerchant(kpiData) {
    try {
        const jsonData = JSON.parse(kpiData);
        const cards = jsonData.cards;
        for (let card of cards) {
            if (card.cardType === "KPI_CARD_FEEDBACK") {
                return card.cardPayload.data.regionalFeedbackMap.NA.merchantMarketplaceFeedbackList[0].merchantID;
            }
        }
    } catch (e) {
        console.error("Error parsing KPI data for merchant:", e);
    }
    return "";
}

// Hàm parse KPI data và trích xuất các giá trị cần thiết (ví dụ: balance, buybox, feedback)
function getKpi(kpiData, accountAmazon) {
    try {
        const jsonData = JSON.parse(kpiData);
        const cards = jsonData.cards;
        for (let card of cards) {
            if (card.cardType === "KPI_CARD_PAYMENTS") {
                const cardPayload = card.cardPayload;
                const content = cardPayload.content[0];
                const regionalData = JSON.parse(content.regionalData);
                if (regionalData.NA) {
                    const marketplaces = regionalData.NA.marketplaces;
                    for (let marketplace of marketplaces) {
                        const marketplaceId = marketplace.id;
                        // Map các ID sang khu vực tương ứng
                        const regionName = (marketplaceId === "ATVPDKIKX0DER") ? "US" :
                                            (marketplaceId === "A2EUQ1WTGCTBG2") ? "CA" :
                                            (marketplaceId === "A1AM78C64UM0Y8") ? "MX" : "Unknown Region";
                        const value = marketplace.values[0];
                        if (regionName === "US") accountAmazon["balance_com"] = value;
                        else if (regionName === "CA") accountAmazon["balance_ca"] = value;
                        else if (regionName === "MX") accountAmazon["balance_mx"] = value;
                    }
                }
            }
            if (card.cardType === "KPI_CARD_BUYBOX") {
                const cardPayload = card.cardPayload;
                const content = cardPayload.content[0];
                const regionalData = JSON.parse(content.regionalData);
                if (regionalData.NA) {
                    const regionValues = regionalData.NA.values;
                    let bb_2days = regionValues[1].trim().replace("%", "").replace(/,/g, "");
                    let bb_30days = regionValues[2].trim().replace("%", "").replace(/,/g, "");
                    accountAmazon["bb_2days"] = (bb_2days === "--") ? "0" : bb_2days;
                    accountAmazon["bb_30days"] = (bb_30days === "--") ? "0" : bb_30days;
                }
            }
            if (card.cardType === "KPI_CARD_FEEDBACK") {
                const cardPayload = card.cardPayload;
                accountAmazon["fb_score"] = cardPayload.data.globalEffectiveRating;
                accountAmazon["fb_count"] = cardPayload.data.globalRatingCount;
            }
        }
    } catch (e) {
        console.error("Error parsing KPI data:", e);
    }
}

// Hàm gửi POST request với dữ liệu account health về server
async function sendPostRequest(url, jsonData) {
    const params = new URLSearchParams();
    params.append("account_info", jsonData);
    console.log('jsonData :>> ', jsonData);
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
    });
    if (response.ok) {
        console.log("Data sent successfully.");
    } else {
        console.error("Failed to send data:", response.message);
    }
}

// Hàm lấy dữ liệu Feedback Manager từ DOM đã render thông qua content script
// Hàm lấy dữ liệu Feedback Manager thông qua background
async function getFeedbackManagerData() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ 
            message: "getFeedbackData"
        }, (response) => {
            console.log('response :>> ', response);
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

// Hàm lấy dữ liệu Payment thông qua background
async function getPaymentData() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ message: "getPaymentData" }, (response) => {
            console.log('Payment response :>> ', response);
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

})();
