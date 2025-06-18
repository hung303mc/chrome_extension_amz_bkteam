const randomTracking = () => {
   let tracking = "SL";
   const possible = "0123456789QWERTYUIOPASDFGHJKLZXCVBNM";
   for (var i = 0; i < 10; i++)
      tracking += possible.charAt(Math.floor(Math.random() * possible.length));

   return tracking;
};

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
      case "deutsche-post":
         return "DHL";
      case "royal-mail":
         return "Royal Mail";
      default:
         break;
   }
   return null;
};

$(document).on("click", ".force-confirm", function () {
   const orderId = $(this).attr("data-order-id");
   if (!orderId) {
      notifyError("Could't get order id.");
      return;
   }

   //   amzapi-859ca242-b9fa-49e9-85fe-c00f06636141 (413)

   const agree = confirm("Are you sure to add tracking for this order?");
   if (!agree) return;
   let tracking = $(this).attr("data-tracking");
   const trackingInfo = {
      orderId,
      isFakeTracking: false,
      tracking: null,
      carrier: null,
      shippingService: null,
   };
   if (tracking) {
      trackingInfo.tracking = tracking;

      let carrier = $(this).attr("data-carrier");
      if (carrier) {
         carrier = detectCarrier(carrier.toLowerCase());
      }

      if (!carrier) {
         carrier = detectCarrier(detectCarrierCode(tracking));
      }

      if (!carrier) {
         notifyError("Could't detect carrier of tracing code.");
         return;
      }

      trackingInfo.carrier = carrier;

      let shippingService = $(this).attr("data-shipping-service");
      if (shippingService) {
         trackingInfo.shippingService = shippingService;
      }
      // trackingInfo.carrier = detectCarrier(detectCarrierCode(tracking));
      // if (!trackingInfo.carrier) {
      //    notifyError("Could't detect carrier of tracing code.");
      //    return;
      // }
   } else {
      // trackingInfo.isFakeTracking = true;
      // trackingInfo.tracking = randomTracking();
      // trackingInfo.carrier = "Other";
   }
   chrome.runtime.sendMessage({
      message: "forceAddTracking",
      data: trackingInfo,
      domain: window.location.origin,
   });
});

// caption event form background
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   const { message, data } = req || {};
   switch (message) {
      case "forceAddTracking":
         res({ message: "received" });
         if (!data) return;
         // white jquery loaded
         while (true) {
            if (jQuery.isReady) {
               break;
            }
            await sleep(500);
         }
         // white dom loaded
         while (true) {
            const confirmBtnXpath = `[data-test-id="confirm-shipment-button-action"] input[value="Confirm shipment"]`;
            if ($(confirmBtnXpath).length) break;
            await sleep(500);
         }
         const error = await handAddTracking(data);
         if (error) {
            notifyError(error);
            return;
         }
         notifySuccess("Add tracking code successfully.");
         break;

      case "forceEditTracking":
         res({ message: "received" });
         if (!data) return;

         // wait for jQuery to load
         while (true) {
            if (jQuery.isReady) {
               break;
            }
            await sleep(500);
         }

         // wait for the reconfirm button to load
         while (true) {
            const confirmBtnXpath = 'input.a-button-input[value="Re-confirm Shipment"]';
            if ($(confirmBtnXpath).length) break;
            await sleep(500);
         }

         const editError = await handEditTracking(data);
         if (editError) {
            notifyError(editError);
            return;
         }
         notifySuccess("Edit tracking code successfully.");
         break;

      case "verifyAddTracking":
         console.log("[CS] Received 'verifyAddTracking' (initial request) with data:", data);
         res({ message: "received" });
         if (!data || !data.orderId) {
            console.error("[CS] verifyAddTracking: No data or orderId received from background script.");
            // Nếu có lỗi ngay từ đầu, không cần gửi message kết quả mới nữa vì background đã nhận ACK rồi
            // Background sẽ timeout nếu nó chờ message kết quả mà không thấy.
            // Hoặc mày có thể gửi một message lỗi riêng nếu muốn.
            // Ví dụ:
            chrome.runtime.sendMessage({
               message: "verifyAddTracking", // Hoặc "verifyAddTrackingError"
               data: {
                  orderId: (data && data.orderId) ? data.orderId : "UNKNOWN_CS_ERROR",
                  status: "error",
                  trackingCode: (data && data.trackingCode) ? data.trackingCode : "",
                  message: "[CS] Critical: Missing data or orderId in request for verifyAddTracking."
               },
               domain: window.location.origin
            });
            return true; // Vì đã gọi res()
         }


         // wait for jQuery to load
         while (true) {
            if (typeof jQuery !== 'undefined' && jQuery.isReady) {
               break;
            }
            await sleep(500);
         }
         // TODO
         const { orderId, trackingCode } = data;

         // wait for the tracking span to be ready
         // const trackingSpanXpath = 'span[data-test-id="tracking-id-value"]';
         // while (true) {
         //    if ($(trackingSpanXpath).length) break;
         //    await sleep(500);
         // }
         
         let status = "error";
         let verificationMessage = `[CS] Verification failed for order ${orderId}.`;
         let actualTrackingOnPage = "";
         try { // Bước 2: Thực hiện logic xác minhAdd commentMore actions
            if (trackingCode && trackingCode.trim() !== "") {
               const trackingSpanSelector = 'span[data-test-id="tracking-id-value"]';
               let retries = 20;
               let trackingSpanFoundAndNotEmpty = false;
               console.log(`[CS] Verifying non-empty tracking for order ${orderId}, expected: ${trackingCode}`);

               // Cố gắng tìm và scroll tới element trước khi vào vòng lặp retry
               const $initialTrackingSpan = $(trackingSpanSelector);
               if ($initialTrackingSpan.length && typeof $initialTrackingSpan[0].scrollIntoView === 'function') {
                  console.log(`[CS] Scrolling tracking span into view for order ${orderId}`);
                  $initialTrackingSpan[0].scrollIntoView({ behavior: "smooth", block: "center" });
                  await sleep(500); // Chờ một chút cho scroll và nếu có lazy load
               } else if (!$initialTrackingSpan.length) {
                  console.log(`[CS] Tracking span not immediately found for order ${orderId}, will retry.`);
               }
               while (retries > 0) {
                  const $trackingSpan = $(trackingSpanSelector);
                  if ($trackingSpan.length && $trackingSpan.text().trim() !== "") {
                     actualTrackingOnPage = $trackingSpan.text().trim();
                     trackingSpanFoundAndNotEmpty = true;
                     break;
                  }
                  await sleep(500);
                  retries--;
               }
               if (trackingSpanFoundAndNotEmpty) {
                  if (actualTrackingOnPage === trackingCode) {
                     status = "success";
                     verificationMessage = `Order ${orderId}: Tracking code "${trackingCode}" matches page.`;
                  } else {
                     status = "error"; // Set rõ status
                     verificationMessage = `Order ${orderId}: Tracking mismatch. Expected: "${trackingCode}", Found: "${actualTrackingOnPage}".`;
                  }
               } else {
                  status = "error"; // Set rõ status
                  verificationMessage = `Order ${orderId}: Tracking span "${trackingSpanSelector}" not found or empty after retries. Cannot verify tracking "${trackingCode}".`;
               }
               console.log(`[CS] ${verificationMessage}`); // Log kết quả cuối cùng của nhánh này
            } else {
               // Sửa selector để tìm được cả 2 trạng thái
               const statusSelector = '.main-status';
               let retries = 20;
               let shippedStatusConfirmed = false;
               console.log(`[CS] Verifying empty tracking for order ${orderId}, checking for "Shipped" or "Unshipped" status.`);
               
               while (retries > 0) {
                  const $statusElement = $(statusSelector);
                  if ($statusElement.length) {
                     const statusText = $statusElement.text().trim().toLowerCase();
                     // SỬA LỖI: Check "unshipped" TRƯỚC
                     if (statusText.includes("unshipped")) {
                        // Thấy "unshipped" là thất bại, thoát luôn
                        break;
                     } else if (statusText.includes("shipped")) {
                        // Nếu không phải "unshipped" thì mới check "shipped"
                        shippedStatusConfirmed = true;
                        break;
                     }
                  }
                  await sleep(500);
                  retries--;
               }
               if (shippedStatusConfirmed) {
                  status = "success";
                  verificationMessage = `[CS] Order ${orderId}: Tracking is empty and status is "Shipped", as expected.`;
               } else {
                  status = "error"; // Explicitly set status
                  const $statusElementForLog = $(statusSelector);
                  if ($statusElementForLog.length) {
                     verificationMessage = `[CS] Order ${orderId}: Tracking is empty, status is not "Shipped". Found: "${$statusElementForLog.text().trim()}".`;
                  } else {
                     verificationMessage = `[CS] Order ${orderId}: Tracking is empty, status element "${statusSelector}" not found.`;
                  }
               }
               console.log(verificationMessage);
            }
         } catch (e) {
            console.error(`[CS] Error during verification for order ${orderId}:`, e.message, e.stack);
            status = "error"; // Ensure status is error
            verificationMessage = `[CS] Error during verification on content script for order ${orderId}: ${e.message}`;
         }
         const verificationPayload = {
            orderId,
            status,
            trackingCode: data.trackingCode, // Luôn trả về trackingCode gốc mà background đã gửi
            actualTrackingOnPage,
            message: verificationMessage
         };

         // Bước 3: Gửi kết quả xác minh (dưới dạng message MỚI)
         console.log("[CS] Sending ACTUAL verification result (as NEW message) to background:", verificationPayload);
         // Verify if the tracking code is already in the span
         // const currentTrackingCode = $(trackingSpanXpath).text().trim();

         // let message = `Tracking code for order ${orderId} does not match! Expected: ${trackingCode}, Found: ${currentTrackingCode}`;

         // if (currentTrackingCode === trackingCode) {
         //    status = "success";
         //    message = `Tracking code for order ${orderId} is correctly set to ${trackingCode}`;
         //    // notifySuccess(message);
         // } else {
         //    // notifyError(message);
         // }

         // Send message back to background script
         chrome.runtime.sendMessage({
            message: "verifyAddTracking", // Hoặc "verifyAddTrackingResult" nếu mày muốn đổi và sửa cả ở backgroundAdd commentMore actions
            data: verificationPayload,
            domain: window.location.origin
         });
         return true
      default:
   }
});

const handleTracking = async (trackingInfo, confirmType) => {
   let err = "";

   const _waitForElement = async (selector, timeout = 10000, interval = 500) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
         const $element = $(selector);
         if ($element.length) return $element;
         await sleep(interval);
      }
      throw new Error(`Element ${selector} not found within ${timeout}ms`);
   };

   const _scrollToAndClick = async ($element) => {
      if ($element && $element.length && $element[0]) {
         $element[0].scrollIntoView({ behavior: "smooth", block: "center" });
         await sleep(500); // Chờ scroll animation và UI ổn định
         $element[0].click();
      } else {
         throw new Error("Element not valid for scrolling and clicking.");
      }
      };

   const CHECKBOX_SELECTOR = '#missing-tracking-id-checkbox';
   const CARRIER_XPATH = '[data-test-id="tvs-carrier-dropdown"]>select';
   const CUSTOM_CARRIER_XPATH = 'input[data-test-id="text-input-carrier"]';
   const TRACKING_INPUT_SELECTOR = 'input[data-test-id="text-input-tracking-id"]';
   const CONFIRM_SHIPMENT_BTN_XPATH = '[data-test-id="confirm-shipment-button-action"] input[value="Confirm shipment"]';
   const RECONFIRM_SHIPMENT_BTN_XPATH = 'input.a-button-input[value="Re-confirm Shipment"]';
   const CONTINUE_BTN_XPATH = 'input[value="YES, please continue with this shipping service name"]';
   const ALERT_HEADING_SELECTOR = ".a-alert-heading";

   try {
      if (!trackingInfo) throw Error("Invalid tracking info");
      let { orderId, isFakeTracking, tracking, carrier /*, shippingService */ } = trackingInfo;
      const trackingCode = tracking !== null ? tracking : ""; // Ensure trackingCode is an empty string if tracking is null

      // 1. Handle "Missing Tracking ID" checkbox (<kat-checkbox>)
      const $katCheckbox = await _waitForElement(CHECKBOX_SELECTOR, 5000);
      if ($katCheckbox.length) {
         const katCheckboxElement = $katCheckbox[0]; // The actual <kat-checkbox> DOM element

         // Scroll the checkbox into view first
         console.log("[handleTracking] Scrolling checkbox into view...");
         katCheckboxElement.scrollIntoView({ behavior: "smooth", block: "center" });
         await sleep(500); // Wait for scroll

         // Determine the current checked state of the <kat-checkbox>
         let isCurrentlyChecked = false;
         if (typeof katCheckboxElement.checked === 'boolean') {
            isCurrentlyChecked = katCheckboxElement.checked;
            console.log(`[handleTracking] Checkbox state from .checked property: ${isCurrentlyChecked}`);
         } else if (katCheckboxElement.hasAttribute('checked')) {
            isCurrentlyChecked = true;
            console.log(`[handleTracking] Checkbox state from 'checked' attribute: ${isCurrentlyChecked}`);
         } else if (katCheckboxElement.getAttribute('aria-checked') === 'true') {
            isCurrentlyChecked = true;
            console.log(`[handleTracking] Checkbox state from 'aria-checked' attribute: ${isCurrentlyChecked}`);
         } else {
            console.log(`[handleTracking] Checkbox state could not be reliably determined. Assuming false.`);
         }
         console.log(`[handleTracking] Checkbox initial deduced state: ${isCurrentlyChecked}`);

         const shouldBeChecked = (trackingCode === ""); // Desired state

         if (shouldBeChecked !== isCurrentlyChecked) {
            console.log(`[handleTracking] Checkbox state needs to change. Should be: ${shouldBeChecked}, Is: ${isCurrentlyChecked}. Attempting to set property and dispatch events.`);
            // Directly set the 'checked' property
            if (typeof katCheckboxElement.checked === 'boolean') {
               katCheckboxElement.checked = shouldBeChecked;
               console.log(`[handleTracking] Set katCheckboxElement.checked to ${shouldBeChecked}`);
            } else {
               // If .checked property is not directly settable/reliable, try attributes
               if (shouldBeChecked) {
                  katCheckboxElement.setAttribute('checked', '');
                  katCheckboxElement.setAttribute('aria-checked', 'true');
                  console.log(`[handleTracking] Set 'checked' and 'aria-checked' attributes for true.`);
               } else {
                  katCheckboxElement.removeAttribute('checked');
                  katCheckboxElement.setAttribute('aria-checked', 'false');
                  console.log(`[handleTracking] Removed 'checked' and set 'aria-checked' attribute for false.`);
               }
            }
            // Dispatch 'change' and 'input' events to notify the page
            console.log("[handleTracking] Dispatching 'change' event on checkbox.");
            katCheckboxElement.dispatchEvent(new Event('change', { bubbles: true }));
            console.log("[handleTracking] Dispatching 'input' event on checkbox."); // Some custom components might listen to input
            katCheckboxElement.dispatchEvent(new Event('input', { bubbles: true }));
         }else{
            console.log(`[handleTracking] Checkbox state is already correct (Should be: ${shouldBeChecked}). No change needed.`);
         }
         await sleep(700); // Wait for UI to potentially update after property change and event dispatch

      let finalStateChecked = false;
      if (typeof katCheckboxElement.checked === 'boolean') {
         finalStateChecked = katCheckboxElement.checked;
         }else if (katCheckboxElement.hasAttribute('checked')) {
            finalStateChecked = true;
         }else if (katCheckboxElement.getAttribute('aria-checked') === 'true') {
            finalStateChecked = true;
         }
         console.log(`[handleTracking] Checkbox state after interaction (deduced): ${finalStateChecked}. (Prop: ${katCheckboxElement.checked}, Attr: ${katCheckboxElement.hasAttribute('checked')}, Aria: ${katCheckboxElement.getAttribute('aria-checked')})`);
         if (finalStateChecked !== shouldBeChecked) {
            console.warn(`[handleTracking] Checkbox state MISMATCH after attempt. Expected: ${shouldBeChecked}, Got: ${finalStateChecked}`);
         }

      }else {
         console.warn(`[handleTracking] Checkbox ${CHECKBOX_SELECTOR} not found. Proceeding without interacting with it.`);
      }



      // Conditional execution for steps 2 and 3
      if (trackingCode !== "") {
         console.log("[handleTracking] Processing Carrier and Tracking ID input as trackingCode is not empty.");
         // 2. Select Carrier
         if (carrier) {
            carrier = detectCarrier(carrier.toLowerCase());
         }
         if (!carrier) {
            carrier = detectCarrier(detectCarrierCode(tracking));
         }
         if (!carrier) {
            notifyError("Could't detect carrier of tracing code.");
            return;
         }
         const $carrierSelectElement = await _waitForElement(CARRIER_XPATH);
         if (!$carrierSelectElement.length) throw new Error("Carrier select element not found.");
         const carrierNativeSelect = $carrierSelectElement[0];
         const carrierOptions = Array.from(carrierNativeSelect.options);
         let isOtherCarrier = false;
         let selectedOptionText = ""; // To store the text of the selected option
         if (carrierOptions.length > 0) {
            const foundOption = carrierOptions.find(opt => compareValues(opt.value, carrier));

            if (carrier && foundOption) {
               carrierNativeSelect.value = foundOption.value;
               selectedOptionText = foundOption.text;
               console.log(`[handleTracking] Carrier: Set to '${foundOption.value}' (Text: '${selectedOptionText}')`);
            } else {
               carrierNativeSelect.value = "Other"; // Fallback to "Other"
               const otherOpt = carrierOptions.find(opt => opt.value === "Other");
               selectedOptionText = otherOpt ? otherOpt.text : "Other";
               isOtherCarrier = true;
               console.log(`[handleTracking] Carrier: Target carrier '${carrier}' not found or carrier undefined. Set to 'Other' (Text: '${selectedOptionText}').`);
            }
         } else {
            console.warn("[handleTracking] Carrier select element has no options. Attempting to set to 'Other'.");
            // Attempt to set to "Other" if a carrier was intended, assuming "Other" might appear or be a valid value
            if (carrier) {
               carrierNativeSelect.value = "Other";
               isOtherCarrier = true; // Assume it's an "Other" scenario
               selectedOptionText = "Other"; // Assume this text for logging
               console.log(`[handleTracking] Carrier: No options initially, but target carrier was '${carrier}'. Set to 'Other'.`);
            }
         }
         // Dispatch events to ensure Amazon's UI framework picks up the change
         console.log("[handleTracking] Dispatching 'change' and 'input' events on carrier select.");
         carrierNativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
         carrierNativeSelect.dispatchEvent(new Event('input', { bubbles: true })); // Some frameworks listen to input
         await sleep(1500); // Increased sleep, give more time for UI to react.
         // Verify if the visual prompt updated (for debugging)
         const $promptSpan = $carrierSelectElement.closest('[data-test-id="tvs-carrier-dropdown"]').find('.a-dropdown-prompt');
         if ($promptSpan.length) {
            const currentPromptText = $promptSpan.text().trim();
            console.log(`[handleTracking] Carrier: Visual prompt text after update: '${currentPromptText}'`);
            const expectedTextForCompare = selectedOptionText.trim();
            const isMatch = currentPromptText === expectedTextForCompare ||
                (expectedTextForCompare.startsWith(currentPromptText.replace(/\s*\.\.\.$/, '')) && currentPromptText.endsWith('...')) ||
                currentPromptText.startsWith(expectedTextForCompare.substring(0,15)); // General short compare

            if (!isMatch && selectedOptionText) { // Only warn if we expected a specific text
               console.warn(`[handleTracking] Carrier: Visual prompt text ('${currentPromptText}') may not fully match selected option text ('${expectedTextForCompare}'). Amazon UI might not have updated as expected.`);
            } else if (selectedOptionText) {
               console.log(`[handleTracking] Carrier: Visual prompt text appears consistent with selection.`);
            }
         } else {
            console.warn("[handleTracking] Carrier: Visual prompt span not found for verification.");
         }
         if (isOtherCarrier && carrier) { // This 'carrier' is the original target carrier name (e.g., "MyCustomCarrier")Add commentMore actions
            console.log(`[handleTracking] Carrier is 'Other', setting custom carrier input to: '${carrier}'`);
            const $customCarrierInput = await _waitForElement(CUSTOM_CARRIER_XPATH);
            if (!$customCarrierInput.length) throw new Error("Custom carrier input not found.");
            const customCarrierNativeInput = $customCarrierInput[0];

            // customCarrierNativeInput.focus();
            customCarrierNativeInput.value = carrier; // Set the actual carrier name in the text field
            customCarrierNativeInput.dispatchEvent(new Event('input', { bubbles: true }));
            customCarrierNativeInput.dispatchEvent(new Event('change', { bubbles: true }));
            // customCarrierNativeInput.blur();
            await sleep(1000); // Reduced sleep slightly, 2000 might be too long if next step is quick
            console.log(`[handleTracking] Carrier: Custom carrier input set to '${customCarrierNativeInput.value}'`);
         }
         // 3. Input Tracking Code
         const $trackingInputElem = await _waitForElement(TRACKING_INPUT_SELECTOR);
         $trackingInputElem.focus();
         $trackingInputElem.val(trackingCode);
         if ($trackingInputElem[0]) {
            $trackingInputElem[0].dispatchEvent(new Event('input', { bubbles: true }));
            $trackingInputElem[0].dispatchEvent(new Event('change', { bubbles: true }));
         }
         $trackingInputElem.blur();
         await sleep(2000);
      }
      // 4. Confirm Action

      if (confirmType === 'add') {
         // confirmBtnXpath = '[data-test-id="confirm-shipment-button-action"] input[value="Confirm shipment"]';
         // $(confirmBtnXpath).trigger("click");
         let $confirmBtn = await _waitForElement(CONFIRM_SHIPMENT_BTN_XPATH);
         await _scrollToAndClick($confirmBtn);
         await sleep(2000);

         // Nếu tracking code là empty, đợi 1 giây và click thêm lần nữa
         if (trackingCode === "") {
            await sleep(1000);
            try {
               // Thử tìm lại nút confirm chính, phòng trường hợp dialog che hoặc nút mới xuất hiện
               $confirmBtn = await _waitForElement(CONFIRM_SHIPMENT_BTN_XPATH, 5000); // Timeout ngắn hơn
               await _scrollToAndClick($confirmBtn);
               await sleep(2000);
            } catch (e) {
               console.log(`Main confirm button not found or clickable after first attempt for empty tracking. This might be okay if no dialog appeared.`);
            }
         } else {
            // Chỉ tìm nút "YES, please continue..." nếu tracking code KHÔNG rỗng
            try {
               const $continueBtn = await _waitForElement(CONTINUE_BTN_XPATH, 7000); // Tăng timeout một chút
               if ($continueBtn.length) { // Double check length
                  await _scrollToAndClick($continueBtn);
                  await sleep(2000);
               }
            } catch (e) {
               console.log(`Continue button (${CONTINUE_BTN_XPATH}) not found or timed out for 'add' action with tracking. This might be expected if no warning dialog appears.`);
            }
         }
      } else if (confirmType === 'edit') {
         const $reconfirmBtn = await _waitForElement(RECONFIRM_SHIPMENT_BTN_XPATH);
         await _scrollToAndClick($reconfirmBtn);
         await sleep(2000); // Chờ sau khi click re-confirm

         let editRetries = 10; // Số lần thử tìm nút "YES, please continue..." hoặc thông báo "Shipment Updated"
         let shipmentActuallyUpdated = false;

         // Vòng lặp để xử lý nút "YES, please continue..." hoặc kiểm tra "Shipment Updated"
         while (editRetries > 0) {
            if ($('body').text().includes("Shipment Updated")) {
               shipmentActuallyUpdated = true;
               console.log("Shipment Updated message found.");
               break; // Thoát vòng lặp nếu đã thấy thông báo cập nhật
            }
            // Thử tìm nút "YES, please continue..."Add commentMore actions
            // Dùng try-catch ở đây vì nút này có thể không xuất hiện
            try {
               // Không dùng await _waitForElement vì nó sẽ throw error nếu không tìm thấy ngay
               const $continueEditBtn = $(CONTINUE_BTN_XPATH);
               if ($continueEditBtn.length && $continueEditBtn.is(":visible")) {
                  console.log("Continue button found for edit, clicking...");
                  await _scrollToAndClick($continueEditBtn);
                  await sleep(2500); // Chờ sau khi click continue
                  // Sau khi click continue, reset retries để nó kiểm tra lại "Shipment Updated" hoặc nút continue khác (nếu có)
                  editRetries = 10; // Reset retries
                  continue; // Tiếp tục vòng lặp để kiểm tra lại
               }
            } catch (e) {
               // Bỏ qua lỗi nếu không tìm thấy nút continue, sẽ thử lại ở lần lặp sau
               console.log("Continue button not found in current check, will retry.");
            }
            await sleep(1000); // Chờ 1 giây trước khi thử lại
            editRetries--;
         }
         if (!shipmentActuallyUpdated) {
            console.warn("Shipment Updated message not found after edit confirmation retries. The update might have failed or the confirmation message is different.");
         }
      }
      await sleep(3000);
      // --- BƯỚC QUAN TRỌNG: KIỂM TRA THÔNG BÁO THÀNH CÔNG CỦA AMAZON ---
      let finalStatus = "error";
      let statusMessage = "Không tìm thấy thông báo xác nhận từ Amazon.";
      const successSelectors = [
         // Selector chính xác nhất dựa trên HTML bạn cung cấp
         '.a-alert-success h4.a-alert-heading:contains("Shipment confirmed")',
         '.a-alert-success .a-alert-content:contains("Your shipment has been updated")',
         
         // Các selector cũ giữ lại làm phương án dự phòng
         '.a-alert-heading:contains("Shipment has been confirmed")',
         'h4:contains("Shipment has been confirmed")'
     ];
      for (const selector of successSelectors) {
         if ($(selector).length > 0) {
            finalStatus = "success";
            statusMessage = `Phát hiện thông báo thành công: "${$(selector).text()}"`;
            break;
         }
      }
      console.log(`[CS] Order ${orderId} - Verification Result: ${finalStatus}. Message: ${statusMessage}`);
      // Gửi kết quả cuối cùng về cho background
      chrome.runtime.sendMessage({
         message: "addedTrackingCode",
         data: { 
            status: finalStatus,
            message: statusMessage,
            isFakeTracking, 
            orderId: orderId,
            trackingCode: trackingCode
         }, // Gửi trackingCode đã dùng
         domain: window.location.origin,
      });
      // 6. Wait for alert heading (final confirmation of page state)Add commentMore actions
      //    Điều chỉnh timeout này dựa trên thời gian thực tế trang phản hồi
      console.log("Waiting for alert heading as final page state confirmation...");
      await _waitForElement(ALERT_HEADING_SELECTOR, 20000); // Tăng timeout cho xác nhận cuối cùng
      console.log("Alert heading found.");
   } catch (error) {
      console.error("Error in handleTracking:", error.message, error.stack);
      err = error.message;
      chrome.runtime.sendMessage({
         message: "addedTrackingCode",
         data: {
             status: "error",
             message: `Lỗi content script: ${error.message}`,
             orderId: trackingInfo.orderId,
             trackingCode: trackingInfo.tracking || ""
         }
     });
   }
};

// Sử dụng hàm handleTracking cho từng trường hợp
const handAddTracking = async (trackingInfo) => {
   return await handleTracking(trackingInfo, 'add');
};

const handEditTracking = async (trackingInfo) => {
   return await handleTracking(trackingInfo, 'edit');
};

const compareValues = (val1, val2) => {
   return (val1 || "").toLowerCase() === (val2 || "").toLowerCase();
}
