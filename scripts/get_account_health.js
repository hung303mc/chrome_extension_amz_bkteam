(function(){
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    $(document).on("click", "#account-health", function () {
        console.log('Clicked!');
        $(this).addClass("loader");
        getAccountHealth().then((result) => {
            $(".loader").removeClass("loader");
            if (!result) {
                console.error("[AH Script] getAccountHealth returned undefined.");
                notifyError("Failed to get account health: No result returned.");
                return;
            }
            const { data, error } = result;
            if (error) {
                notifyError(error); // Display the specific error message from getAccountHealth
            } else if (data) {
                // console.log("[AH Script] Account health data for UI (if any):", data);
                notifySuccess("Account health data retrieved successfully.");
            } else {
                // Fallback if result is defined but neither data nor error is present
                notifyError("Unexpected result from getAccountHealth.");
            }
        });
    });
    
    // Hàm chính thực hiện việc lấy dữ liệu Account Health
    async function getAccountHealth() {
        try {
            console.log('[AH Script] getAccountHealth function started.');
            const accountAmazon = {};
            let merchantId; // Khai báo biến merchantId ở đây

            // 1. Tải trang Home để lấy KPI data và merchant id
            await loadPage("https://sellercentral.amazon.com/home");
            await sleep(2000);
            
            const KPIDataElement = document.getElementById("KPITOOLBAR_CHANNEL_RESPONSE");
            if (KPIDataElement) {
                const KPIData = KPIDataElement.innerHTML;
                // Cố gắng lấy merchant id từ KPI data
                merchantId = getMerchant(KPIData); // Gán giá trị cho biến đã khai báo
                
                // Lấy thêm các chỉ số liên quan đến KPI (ví dụ: balance, buybox,…)
                getKpi(KPIData, accountAmazon);
            }
    
            // Logic dự phòng: Nếu không lấy được merchantId từ việc quét trang
            if (!merchantId) {
                console.log("Không tìm thấy merchantId từ việc quét trang, sẽ lấy từ MB API key...");
                // Hàm getStorage được định nghĩa trong scripts/content_script.js
                merchantId = await getStorage(mbApi);
            }
    
            // Kiểm tra lần cuối và gán vào đối tượng accountAmazon
            if (merchantId) {
                 accountAmazon["merchain_id"] = merchantId;
            } else {
                 // Xử lý trường hợp vẫn không tìm thấy merchantId
                 console.error("Không thể xác định được Merchant ID. Vui lòng kiểm tra lại MB API key.");
                 notifyError("Không thể xác định Merchant ID. Vui lòng kiểm tra lại MB API key.");
                 return { error: "Không thể xác định Merchant ID." };
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
                            let parts = smallElem.textContent.split("of");
                            if(parts.length > 1) {
                                accountAmazon["total_orders_60days"] = parseInt(parts[1].replace(/[^\\d]/g, ""));
                                accountAmazon["atoz_neg_fb"] = parseInt(parts[0].replace(/[^\\d]/g, ""));
                            }
                        }
                    }
                }
            }
            const odrSection = doc.getElementById("odr-breakdown-section");
            if (odrSection) {
                let rows = odrSection.getElementsByClassName("a-row");
                if (rows.length >= 3) {
                    let rawFbNegative = extractText(rows[0], ".sp-middle-col .a-size-base");
                    let rawClaimsAtoz = extractText(rows[1], ".sp-middle-col .a-size-base");
                    let rawClaimsCb   = extractText(rows[2], ".sp-middle-col .a-size-base");
    
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
            const ipSuspectedElem = doc.getElementById("policies-brand-protection-row");
            if (ipSuspectedElem) {
                const colElem = ipSuspectedElem.querySelector(".a-column:nth-child(2) .a-size-large");
                if (colElem) {
                    accountAmazon["ip_suspected"] = parseInt(colElem.textContent.trim().replace("%", "").replace(/,/g, ""));
                }
            }
            const ipReceivedElem = doc.getElementById("policies-intellectual-property-row");
            if (ipReceivedElem) {
                const colElem = ipReceivedElem.querySelector(".a-column:nth-child(2) .a-size-large");
                if (colElem) {
                    accountAmazon["ip_received"] = parseInt(colElem.textContent.trim().replace("%", "").replace(/,/g, ""));
                }
            }
            try {
                const listingPolicyElem = doc.getElementById("policies-listing-policy-row")
                    .querySelector(".a-column:nth-child(2) .a-size-large");
                accountAmazon["listing_policy"] = parseInt(listingPolicyElem.textContent.trim().replace("%", "").replace(/,/g, ""));
            } catch (e) {
                accountAmazon["listing_policy"] = 0;
            }
            try {
                const policyRestrictedElem = doc.getElementById("restricted-products-row")
                    .querySelector(".a-column:nth-child(2) .a-size-large");
                accountAmazon["policy_restricted"] = parseInt(policyRestrictedElem.textContent.trim().replace("%", "").replace(/,/g, ""));
            } catch (e) {
                accountAmazon["policy_restricted"] = 0;
            }
            try {
                const policyViolationElem = doc.getElementById("policies-product-warning-row")
                    .querySelector(".a-column:nth-child(2) .a-size-large");
                accountAmazon["policy_violation_warning"] = parseInt(policyViolationElem.textContent.trim().replace("%", "").replace(/,/g, ""));
            } catch (e) {
                accountAmazon["policy_violation_warning"] = 0;
            }
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
                        let name = nameElem.textContent.trim().replace(/\\(\\d+\\)/, "").trim();
                        let countMatch = countElem.textContent.match(/\\((\\d+)\\)/);
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
            console.log("Account Health Data to be sent:", jsonData);
            await sendPostRequest("https://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php?case=getAccountHealth", jsonData);
            
            console.log("[AH Script] Successfully collected and sent data.");
            // Gửi tin nhắn thông báo hoàn thành về cho background script
            chrome.runtime.sendMessage({ message: "accountHealthProcessFinished" });
            return { data: accountAmazon }; // Ensure this is the last successful return in try block
        } catch (err) {
            console.error("[AH Script] Error in getAccountHealth function:", err);
            return { error: err.message || "An unknown error occurred while fetching account health." };
        }
    }
    
    // Hàm hỗ trợ: tải một trang bằng fetch (chú ý dùng credentials để giữ session)
    async function loadPage(url) {
        const response = await fetch(url, { credentials: "include" });
        return await response.text();
    }
    
    // Hàm trợ giúp để trích xuất text từ một phần tử con theo selector
    function extractText(parent, selector) {
        const el = parent.querySelector(selector);
        return el ? el.textContent.trim().replace(/\\$/g, "").replace(/,/g, "") : "";
    }
    
    // Hàm trợ giúp để lấy attribute của phần tử con theo selector
    function extractAttribute(parent, selector, attribute) {
        const el = parent.querySelector(selector);
        return el ? el.getAttribute(attribute).trim().replace(/\\$/g, "").replace(/,/g, "") : "";
    }
    
    // Loại bỏ ký tự định dạng tiền tệ
    function cleanCurrency(str) {
        return str.replace(/\\$/g, "").replace(/,/g, "").trim();
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