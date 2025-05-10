$(document).on("click", "#account-health", function () {
    $(this).addClass("loader");
    chrome.runtime.sendMessage({
        message: "runGetAccountHealth",
        domain: window.location.origin,
    });

    getAccountHealth().then((accountHealth) => {
        $(".loader").removeClass("loader");
        const { error } = accountHealth;
        if (error) {
            notifyError(error);
            return;
        }
        notifySuccess("Account health completed.");
    });
});

async function getAccountHealth() {
    // Khởi tạo đối tượng chứa dữ liệu account health
    let accountHealth = {};

    try {
        // ============================
        // Bước 1: Lấy KPI Data và Merchant ID từ trang Home
        // ============================
        // Trích xuất nội dung JSON từ element có id "KPITOOLBAR_CHANNEL_PROPS"
        // const kpiElement = document.getElementById("KPITOOLBAR_CHANNEL_PROPS"); // ID cũ
        const kpiElement = document.getElementById("KPITOOLBAR_CHANNEL_RESPONSE");
        if (kpiElement) {
            const kpiData = kpiElement.innerHTML;
            // Phân tích dữ liệu KPI và trích xuất các thông số cần thiết
            getKpi(kpiData, accountHealth);
            // Lấy merchant ID từ KPI data
            accountHealth.merchantId = getMerchant(kpiData);
        }

        // ============================
        // Bước 2: Lấy số lượng trả hàng yêu cầu ủy quyền
        // ============================
        const returnsAuthUrl = "https://sellercentral.amazon.com/returns/list?pageSize=25&returnRequestState=authorizationRequired&useDefaultReturnRequestState=false&orderBy=CreatedDateDesc&pendingActionsFilterBy=pendingActions&isOnPendingActionsTab=false&pageNumber=1&scrollId=&previousPageScrollId=&isOrderBySelected=undefined&selectedDateRange=365&keyword=&dmCode=close-return-request-success&dmType=success";
        let returnsAuthResponse = await fetch(returnsAuthUrl, { credentials: 'include' });
        let returnsAuthText = await returnsAuthResponse.text();
        let parser = new DOMParser();
        let returnsAuthDoc = parser.parseFromString(returnsAuthText, "text/html");
        console.log('returnsAuthDoc :>> ', returnsAuthDoc);
        // Đếm số phần tử có class "returnRequest" để biết số đơn cần ủy quyền
        accountHealth.return_authorize_num = returnsAuthDoc.getElementsByClassName("returnRequest").length;

        // ============================
        // Bước 3: Lấy số lượng trả hàng có pending actions
        // ============================
        const returnsPendingUrl = "https://sellercentral.amazon.com/returns/list?pageSize=25&returnRequestState=pendingActions&orderBy=CreatedDateAsc&pageNumber=1&selectedDateRange=50&cardType=pendingRefunds&pendingActionsFilterBy=pendingRefund&isOnPendingActionsTab=true";
        let returnsPendingResponse = await fetch(returnsPendingUrl, { credentials: 'include' });
        let returnsPendingText = await returnsPendingResponse.text();
        let returnsPendingDoc = parser.parseFromString(returnsPendingText, "text/html");
        accountHealth.return_pending_action_num = returnsPendingDoc.getElementsByClassName("returnRequest").length;

        // ============================
        // Bước 4: Lấy thông tin Payment từ Payments Dashboard
        // ============================
        const paymentsUrl = "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx";
        let paymentsResponse = await fetch(paymentsUrl);
        let paymentsText = await paymentsResponse.text();
        let paymentsDoc = parser.parseFromString(paymentsText, "text/html");

        console.log('paymentsDoc :>> ', paymentsDoc);

        // Trích xuất thông tin từ khối Payment (các trường hợp hiển thị khác nhau)
        let paymentBlocks = paymentsDoc.getElementsByClassName("linkable-multi-row-card-rows-container");

        console.log('paymentBlocks :>> ', paymentBlocks);
        if (paymentBlocks.length > 1) {
            let paymentBlock = paymentBlocks[1]; // Lấy container thứ 2
            let rows = paymentBlock.getElementsByClassName("linkable-multi-row-card-row");
            if (rows.length === 4) {
                accountHealth.standard_orders = rows[0].querySelector(".underline-link").innerText.trim().replace("$", "").replace(/,/g, "");
                accountHealth.invoiced_orders = rows[1].querySelector(".underline-link").innerText.trim().replace("$", "").replace(/,/g, "");
                accountHealth.deferred_transactions = rows[2].querySelector(".underline-link").getAttribute("label").trim().replace("$", "").replace(/,/g, "");
                accountHealth.balance_com = rows[3].querySelector(".currency-total-amount").innerText.trim().replace("$", "").replace(/,/g, "");
            } else if (rows.length === 3) {
                accountHealth.standard_orders = rows[0].querySelector(".underline-link").innerText.trim().replace("$", "").replace(/,/g, "");
                accountHealth.deferred_transactions = rows[1].querySelector(".underline-link").getAttribute("label").trim().replace("$", "").replace(/,/g, "");
                accountHealth.balance_com = rows[2].querySelector(".currency-total-amount").innerText.trim().replace("$", "").replace(/,/g, "");
            } else if (rows.length === 2) {
                accountHealth.standard_orders = rows[0].querySelector(".underline-link").innerText.trim().replace("$", "").replace(/,/g, "");
                accountHealth.balance_com = rows[1].querySelector(".currency-total-amount").innerText.trim().replace("$", "").replace(/,/g, "");
            }
        }

        // Lấy thông tin "payment_today" từ phần tử có class "currency-total-amount" (ví dụ: phần tử thứ 2)
        let currencyElements = paymentsDoc.getElementsByClassName("currency-total-amount");
        if (currencyElements.length > 1) {
            let paymentTodayElement = currencyElements[1].querySelector("span");
            if (paymentTodayElement) {
                accountHealth.payment_today = paymentTodayElement.innerText.trim().replace("$", "").replace(/,/g, "");
            }
        }

        // Lấy "payment_amount" từ phần tử có class "multi-line-child-content"
        let multiLineElements = paymentsDoc.getElementsByClassName("multi-line-child-content");
        if (multiLineElements.length > 2) {
            accountHealth.payment_amount = multiLineElements[2].innerText.trim().replace("$", "").replace(/,/g, "");
        }

        // Lấy "payment_date" từ thông báo trong phần "fund-transfer-primary-message"
        let message = "";
        let fundTransferElements = paymentsDoc.getElementsByClassName("fund-transfer-primary-message");
        if (fundTransferElements.length > 0) {
            let span = fundTransferElements[0].querySelector("span");
            if (span) {
                message = span.innerText.trim();
                // Tìm kiếm định dạng ngày mm/dd/yyyy trong thông báo
                let dateMatch = message.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                if (dateMatch) {
                let dateParts = dateMatch[1].split("/");
                // Chuyển sang định dạng yyyy-mm-dd
                accountHealth.payment_date = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
                }
            }
        }

        // Tính toán "balance_hold" = balance_com - payment_today
        if (accountHealth.balance_com && accountHealth.payment_today) {
            let balanceCom = parseFloat(accountHealth.balance_com);
            let paymentToday = parseFloat(accountHealth.payment_today);
            accountHealth.balance_hold = (balanceCom - paymentToday).toString();
        }

        // ============================
        // Bước 5: Lấy số liệu Performance Dashboard (ví dụ: customer satisfaction, feedback metrics, AHR, v.v.)
        // ============================
        const performanceUrl = "https://sellercentral.amazon.com/performance/dashboard";
        let performanceResponse = await fetch(performanceUrl, { credentials: 'include' });
        let performanceText = await performanceResponse.text();
        let performanceDoc = parser.parseFromString(performanceText, "text/html");

        // Trích xuất Customer Satisfaction Section
        let csElement = performanceDoc.getElementById("customer-satisfaction-content-rows-section");
        if (csElement) {
        let row = csElement.getElementsByClassName("a-row")[0];
        let col = row.getElementsByClassName("a-column")[1];
        if (col) {
            let odrOverallElem = col.querySelector(".a-size-large");
            if (odrOverallElem) {
            accountHealth.odr_overall = odrOverallElem.innerText.trim().replace("%", "").replace(/,/g, "");
            }
            let smallText = col.querySelector(".a-size-small");
            if (smallText) {
                let parts = smallText.innerText.split("of");
                console.log('parts :>> ', parts);
                if (parts.length > 1) {
                    accountHealth.total_orders_60days = parseInt(parts[1].trim().replace(/\D/g, ""));
                    accountHealth.atoz_neg_fb = parseInt(parts[0].trim().replace(/\D/g, ""));
                }
            }
        }
        }

        console.log('accountHealth :>> ', accountHealth);

    } catch (error) {
        console.error("Error getting account health:", err);
    }
}

/**
 * Hàm parse dữ liệu KPI từ JSON và cập nhật vào đối tượng accountHealth
 * @param {string} jsonString - Nội dung JSON từ KPI element
 * @param {object} accountHealth - Đối tượng chứa dữ liệu account health
 */
function getKpi(jsonString, accountHealth) {
    try {
        let jsonObj = JSON.parse(jsonString);
            if (jsonObj.cards && Array.isArray(jsonObj.cards)) {
                jsonObj.cards.forEach(card => {
                // Xử lý thẻ KPI_CARD_PAYMENTS để lấy thông tin balance theo region
                if (card.cardType === "KPI_CARD_PAYMENTS") {
                    let cardPayload = JSON.parse(card.cardPayload.content[0].regionalData);
                    if (cardPayload.NA) {
                        let marketplaces = cardPayload.NA.marketplaces;
                        marketplaces.forEach(marketplace => {
                            let id = marketplace.id;
                            let value = marketplace.values[0];
                            if (id === "ATVPDKIKX0DER") {
                            accountHealth.balance_com = value;
                            } else if (id === "A2EUQ1WTGCTBG2") {
                            accountHealth.balance_ca = value;
                            } else if (id === "A1AM78C64UM0Y8") {
                            accountHealth.balance_mx = value;
                            }
                        });
                    }
                }
                // Xử lý KPI_CARD_BUYBOX để lấy thông tin Buy Box 2days và 30days
                if (card.cardType === "KPI_CARD_BUYBOX") {
                    let cardPayload = JSON.parse(card.cardPayload.content[0].regionalData);
                    if (cardPayload.NA) {
                        let regionValues = cardPayload.NA.values;
                        accountHealth.bb_2days = regionValues[1].replace("%", "").replace(/,/g, "");
                        accountHealth.bb_30days = regionValues[2].replace("%", "").replace(/,/g, "");
                        if (accountHealth.bb_2days === "--") accountHealth.bb_2days = "0";
                        if (accountHealth.bb_30days === "--") accountHealth.bb_30days = "0";
                    }
                }
                // Xử lý KPI_CARD_FEEDBACK để lấy điểm và số lượng feedback
                if (card.cardType === "KPI_CARD_FEEDBACK") {
                    let cardPayload = card.cardPayload;
                    accountHealth.fb_score = cardPayload.data.globalEffectiveRating;
                    accountHealth.fb_count = cardPayload.data.globalRatingCount;
                }
                });
            }
    } catch (e) {
        console.error("Error parsing KPI data:", e);
    }
}

/**
   * Hàm trích xuất Merchant ID từ nội dung KPI JSON
   * @param {string} jsonString - Nội dung JSON từ KPI element
   * @returns {string} Merchant ID hoặc chuỗi rỗng nếu không tìm thấy
   */
function getMerchant(jsonString) {
    try {
        let jsonObj = JSON.parse(jsonString);
        if (jsonObj.cards && Array.isArray(jsonObj.cards)) {
            for (let card of jsonObj.cards) {
                if (card.cardType === "KPI_CARD_FEEDBACK") {
                return card.cardPayload.data.regionalFeedbackMap.NA.merchantMarketplaceFeedbackList[0].merchantID;
                }
            }
        }
    } catch (e) {
        console.error("Error extracting merchant id:", e);
    }
    return "";
}