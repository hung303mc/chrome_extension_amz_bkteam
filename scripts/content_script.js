var mbApi = "MBApi";
const addonCollapsible = "AddonCollapsible";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getStorage = (key) =>
   new Promise((r) =>
      chrome.storage.local.get(key).then((result) => {
         r(result[key]);
      })
   );

const setStorage = (key, value) =>
   new Promise((r) =>
      chrome.storage.local.set({ [key]: value }).then(() => {
         r(value);
      })
   );

const notifySuccess = (message) => {
   $.toast({
      heading: message,
      position: "bottom-center",
      showHideTransition: "slide",
      loader: false,
      textAlign: "center",
   });
};

const notifyError = (message) => {
   $.toast({
      heading: message,
      position: "bottom-center",
      showHideTransition: "slide",
      loader: false,
      textAlign: "center",
      bgColor: " #d82c0d",
   });
};

const checkAddonCollapse = async () => {
   const isOpen = await getStorage(addonCollapsible);
   if (isOpen === false) {
      if ($("#om-collapsible").hasClass("om-active"))
         $("#om-collapsible").click();
   } else {
      if (!$("#om-collapsible").hasClass("om-active"))
         $("#om-collapsible").click();
   }
};

const taskProcessing = (label) => {
   if (label)
      $(".om-addon").append(`
         <div class="om-processing">
            <div class="om-processing-label">${label}</div>
            <div class="om-processing-stop">
               <button class="om-btn" id="stop-process">Stop</button>
            </div>
         </div>
      `);
};

const syncOrderOptionComponent = `
   <div class="box-order-ids">
      <label class="om-label" for="order_ids">Order Ids</label>
      <div class="wrap-order_ids">
         <textarea class="om-textarea" name="order_ids" id="order_ids" rows="4"></textarea>
      </div>
   </div>
   <div class="box-alway-mapping">
      <div class="wrap-alway_mapping">
         <input class="om-checkbox" type="checkbox" name="alway_mapping" id="alway_mapping" />
      </div>
      <label class="om-label" for="alway_mapping">Always mapping</label>
   </div>
   <div class="box-is-multi-product">
      <div class="wrap-is_multi_product">
         <input class="om-checkbox" type="checkbox" name="is_multi_product" id="is_multi_product" />
      </div>
      <label class="om-label" for="is_multi_product">Is multiple products</label>
   </div>
   <div class="box-split-order">
      <div class="wrap-split_order">
         <input class="om-checkbox" type="checkbox" name="split_order" id="split_order"/>
      </div>
      <label class="om-label" for="split_order">Split orders</label>
   </div>
   <div style="margin-left: 10px; margin-top: 10px;" class="box-split-detail-wrap">
      <div class="apply-split">
         <input
            class="om-checkbox"
            type="checkbox"
            name="apply_all_items"
            id="apply_all_items"
            checked
         />
         <label
            class="om-label"
            for="apply_all_items"
            style="display: inline-block; padding: 0px"
            >Apply all items</label
         >
      </div>
      <div class="box-split-detail" style="display: flex; margin-top: 10px">
         <div>
            <label class="om-label" for="number_item_of_each_order"
            >Expected orders:</label
            >
            <div class="wrap-apikey">
            <input
               class="om-input"
               type="number"
               min="1"
               value="1"
               name="number_item_of_each_order"
               id="number_item_of_each_order"
            />
            </div>
         </div>
         <div>
            <label class="om-label" for="qty_per_item">Qty per item:</label>
            <div class="wrap-apikey">
            <input
               class="om-input"
               type="number"
               min="1"
               value="1"
               name="qty_per_item"
               id="qty_per_item"
            />
            </div>
         </div>
      </div>
   </div>

   <!-- <div class="box-split-detail">
      <div>
         <label class="om-label" for="number_item_of_each_order">Expected orders:</label>
         <div class="wrap-apikey">
            <input class="om-input" type="number" min="1" value="1" name="number_item_of_each_order" id="number_item_of_each_order"/>
         </div>
      </div>
      <div>
         <label class="om-label" for="qty_per_item">Qty per item:</label>
         <div class="wrap-apikey">
            <input class="om-input" type="number" min="1" value="1" name="qty_per_item" id="qty_per_item"/>
         </div>
      </div>
   </div> -->
   <div class="wrap-btn om-fl-center" style="margin-top:15px">
      <button id="sync-order-option" class="om-btn">Sync Orders</button>
   </div>
`;

const addonComponent = `
   <div class="om-addon">
      <div class="om-container">
         <button type="button" id="om-collapsible" class="om-btn">
            <svg
               aria-hidden="true"
               focusable="false"
               data-prefix="fas"
               data-icon="angle-double-right"
               style="width: 18px"
               class="svg-inline--fa fa-angle-double-right fa-w-14"
               role="img"
               xmlns="http://www.w3.org/2000/svg"
               viewBox="0 0 448 512"
            >
               <path
                  fill="currentColor"
                  d="M224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34zm192-34l-136-136c-9.4-9.4-24.6-9.4-33.9 0l-22.6 22.6c-9.4 9.4-9.4 24.6 0 33.9l96.4 96.4-96.4 96.4c-9.4 9.4-9.4 24.6 0 33.9l22.6 22.6c9.4 9.4 24.6 9.4 33.9 0l136-136c9.4-9.2 9.4-24.4 0-33.8z"
               ></path>
            </svg>
         </button>
         <div class="om-content">
            <div class="om-tab">
               <button class="tablinks om-tablinks" data-name="sync_order">
                  Sync Orders
               </button>
               <button class="tablinks om-tablinks" data-name="sync_order_option">
                  Sync Orders Options
               </button>
            </div>

            <div id="sync_order" class="tabcontent om-tabcontent"></div>

            <div id="sync_order_option" class="tabcontent om-tabcontent">
               ${syncOrderOptionComponent}
            </div>
         </div>
      </div>
   </div>
`;

const syncOrderComponent = `
   <div class="sync-order-wrap">
      <h3 style="text-align:center;margin-top:20px;font-weight:420" >Orders Statistic</h3>
      <div class="om-tab">
         <button class="tablinks" data-name="not_synced">Not Synced</button>
         <button class="tablinks" data-name="ignored" style="display: none;">Ignored</button>
         <button class="tablinks" data-name="grand_total" style="display: none;">Update Grand Totals</button>
         <button class="tablinks" data-name="update_tracking">Update Tracking</button>
         <button class="tablinks" data-name="account_health">Account Health</button>
         <button class="tablinks" data-name="ads_report">Ads Report</button>         
      </div>
      <div id="not_synced" class="tabcontent">
         <div class="om-fl-center btn-sync-order-wrap">
            <button id="sync-order" class="om-btn">Sync Orders</button>
         </div>
      </div>
      <div id="ignored" class="tabcontent">
         <div class="om-fl-center btn-revert-order-wrap">
            <button id="revert-order" class="om-btn">Revert Orders</button>
         </div>
      </div>
      <div id="grand_total" class="tabcontent">
         <div class="om-fl-center btn-grandtotal-wrap">
            <button id="update-grandtotal" class="om-btn">Start Update</button>
         </div>
      </div>
      <div id="update_tracking" class="tabcontent">
         <div class="om-fl-center btn-updatetracking-wrap">
            <button id="update-tracking" class="om-btn">Start Update</button>
         </div>
      </div>
      <div id="account_health" class="tabcontent">
         <div class="om-fl-center btn-updatetracking-wrap">
            <button id="account-health" class="om-btn">Get account health</button>
         </div>
      </div>
      <div id="ads_report" class="tabcontent">
         <div class="om-fl-center btn-adsreport-wrap">
            <button id="ads-report" class="om-btn">Download Ads Reports</button>
         </div>
      </div>      
   </div>
`;

const initAddon = async () => {
   // check has api token
   const apiKey = await getStorage(mbApi);
   if (!apiKey) {
      notifyError("Please enter MB api key.");
      return;
   }
   // embedding addon into amazon
   if (
      !window.location.href.includes("/orders-v3") &&
      !window.location.href.includes("/payments") &&
      !window.location.href.includes("/gestalt/fulfillment") &&
      !window.location.href.includes("/home") &&
      !window.location.href.includes("advertising.amazon.com/reports")
   )
      return;
   if ($(".om-addon").length) return;
   $("body").append(addonComponent);
   await checkAddonCollapse();

   // active tab sync order
   $('[data-name="sync_order"]').click();
   $("#sync_order").append(syncOrderComponent);
   $(".btn-sync-order-wrap").css("display", "none");
   $(".btn-revert-order-wrap").css("display", "none");

   // loading tabs until receive orders
   $("#not_synced").prepend(
      `<div style="position:relative;height:100px" class="loader-resp"></div>`
   );
   $("#ignored").prepend(
      `<div style="position:relative;height:100px" class="loader-resp"></div>`
   );
   // active tab not synced
   $('[data-name="not_synced"]').click();
};

$(document).ready(function () {
   initAddon();
});

const b64Encode = (obj) => {
   const strObj = JSON.stringify(obj);
   return btoa(unescape(encodeURIComponent(strObj)));
};

const b64Decode = (b64String) => {
   const objStr = decodeURIComponent(escape(window.atob(b64String)));
   return JSON.parse(objStr);
};

// collapse addon
$(document).on("click", "#om-collapsible", function () {
   this.classList.toggle("om-active");
   var content = this.nextElementSibling;
   if (content.style.width) {
      content.style.width = null;
      setTimeout(() => {
         content.style.height = null;
         content.style.padding = null;
      }, 300);
   } else {
      content.style.width = "500px";
      content.style.height = "auto";
   }
   if ($(this).hasClass("om-active")) setStorage(addonCollapsible, true);
   else setStorage(addonCollapsible, false);
});

// open tabs
$(document).on("click", `.om-tablinks`, function (e) {
   $(".om-tabcontent").each(function () {
      $(this).css("display", "none");
   });
   $(".om-tablinks").each(function () {
      $(this).removeClass("om-active om-active-tab");
   });
   $(`#${$(this).attr("data-name")}`).css("display", "block");
   $(this).addClass("om-active om-active-tab");
});

// collapse split order
$(document).on("click", "#split_order", function (e) {
   if ($(this).is(":checked")) $(".box-split-detail-wrap").css("display", "flex");
   else $(".box-split-detail-wrap").css("display", "none");
});

// stop process
$(document).on("click", `#stop-process`, function (e) {
   chrome.runtime.sendMessage({
      message: "stopProcess",
      domain: window.location.origin,
   });
});

chrome.runtime.onMessage.addListener(async function (req, sender, res) {
   const { message, data } = req || {};
   switch (message) {
      case "popupSaveApiKey":
         res({ message: "received" });
         // initAddon();
         chrome.runtime.sendMessage({
            message: "listedSaveApiKey",
            domain: window.location.origin,
         });
         window.location.reload();
         break;
      case "listedSaveApiKey":
         res({ message: "received" });
         break;

      case "getApiKey":
         res({ message: "received" });
         chrome.runtime.sendMessage({
            message: "getApiKey",
            domain: window.location.origin,
            data: await getStorage(mbApi),
         });
         break;
      case "updateCancelledOrdersResponse":
         res({ message: "received" });
         
         const { success, message: responseMessage, error } = data;
         
         if (!success || error) {
            notifyError(error || "Có lỗi xảy ra khi cập nhật đơn hàng bị hủy.");
         } else {
            notifySuccess(responseMessage || "Đã cập nhật đơn hàng bị hủy thành công.");
         }
         break;
      default:
         break;
   }
});

// receive message from injected script
window.addEventListener("message", function (evt = {}) {
   if (
     evt.data?.sender === "OMG" &&
     ["fetch_request", "xhr_request"].includes(evt.data?.subject)
   ) {
     const { payload = {} } = evt.data;
 
     chrome.storage.local.get(["omgActive"], () => {
       chrome.runtime.sendMessage({
         message: "response",
         data: payload.data,
         endpoint: payload.endpoint,
         sender: "OMG",
       });
     });
   }
 });

// Add user interaction detection to keep service worker alive
function notifyServiceWorkerActivity() {
  try {
    chrome.runtime.sendMessage({ action: "userInteraction" }, (response) => {
      // Response not required, just keep service worker active
      if (chrome.runtime.lastError) {
        console.log("Service worker might be inactive, error:", chrome.runtime.lastError.message);
        // Only retry if it's not a permanent error like context invalidation
        if (!chrome.runtime.lastError.message.includes("Extension context invalidated")) {
          setTimeout(notifyServiceWorkerActivity, 1000);
        } else {
          console.log("Extension context invalidated, reloading page to reconnect...");
          // Reload page to re-establish connection
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      }
    });
  } catch (error) {
    console.error("Error in notifyServiceWorkerActivity:", error);
    // If we hit an exception, the extension is likely in a bad state
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }
}

// Listen for user interactions on the page
document.addEventListener('click', notifyServiceWorkerActivity);
document.addEventListener('keydown', notifyServiceWorkerActivity);
document.addEventListener('scroll', function() {
  // Debounce scroll events to avoid excessive messages
  if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
  this.scrollTimeout = setTimeout(notifyServiceWorkerActivity, 500);
});

// Initial notification when content script loads
notifyServiceWorkerActivity();

// Periodic check to ensure service worker is active
setInterval(notifyServiceWorkerActivity, 60000); // Every minute

// Lắng nghe các message từ background script
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
  if (req.message === "triggerGetAccountHealth") {
    console.log(`[AH Automation CS] Received trigger. Document readyState: ${document.readyState}. Attempting to switch to Account Health tab and click button.`);
    try {
        const accountHealthTabElement = document.querySelector('button[data-name="account_health"]');
        console.log("[AH Automation CS] Query for 'Account Health' tab (button[data-name='account_health']):", accountHealthTabElement);

        if (accountHealthTabElement) {
            console.log(`[AH Automation CS] 'Account Health' tab found. Visible (offsetHeight > 0): ${accountHealthTabElement.offsetHeight > 0}. Classes: ${accountHealthTabElement.className}`);
            if (accountHealthTabElement.classList.contains('om-active-tab') || accountHealthTabElement.classList.contains('om-active')) {
                console.log("[AH Automation CS] 'Account Health' tab appears to be already active. Skipping click on tab.");
            } else if (typeof accountHealthTabElement.click === 'function') {
                console.log("[AH Automation CS] Clicking 'Account Health' tab element.");
                accountHealthTabElement.click();
            } else {
                console.warn("[AH Automation CS] 'Account Health' tab element found, but no click method or not deemed necessary to click.");
            }
        } else {
            console.error(`[AH Automation CS] Could not find the 'Account Health' tab element using selector 'button[data-name="account_health"]'.`);
            if (typeof notifyError === 'function') notifyError("Failed to find 'Account Health' tab for automation.");
            res({status: "error", reason: "accountHealthTabNotFound"});
            return true;
        }

        let accountHealthContentDiv = document.getElementById("account_health");
        let retries = 10; // Try for up to 10 seconds
        while (retries > 0 && (!accountHealthContentDiv || accountHealthContentDiv.style.display !== 'block')) {
            console.warn(`[AH Automation CS] Account Health content div not visible or not found. Retrying... (${retries})`);
            await sleep(1000);
            if (accountHealthTabElement && typeof accountHealthTabElement.click === 'function' &&
                !accountHealthTabElement.classList.contains('om-active-tab') &&
                !accountHealthTabElement.classList.contains('om-active')) {
                 console.log("[AH Automation CS] Re-clicking 'Account Health' tab element as content not visible.");
                 accountHealthTabElement.click();
                 await sleep(500);
            }
            accountHealthContentDiv = document.getElementById("account_health");
            retries--;
        }

        if (!accountHealthContentDiv || accountHealthContentDiv.style.display !== 'block') {
            console.error("[AH Automation CS] Account Health content div did not become visible after retries.");
            if (typeof notifyError === 'function') notifyError("Account Health content did not become visible for automation.");
            res({status: "error", reason: "accountHealthContentNotVisible"});
            return true;
        }

        const getAccountHealthButton = document.getElementById("account-health");
        console.log("[AH Automation CS] Query for 'Get account health' button (#account-health):", getAccountHealthButton);

        if (getAccountHealthButton) {
            console.log(`[AH Automation CS] 'Get account health' button found. Visible (offsetHeight > 0): ${getAccountHealthButton.offsetHeight > 0}`);
            if (typeof getAccountHealthButton.click === 'function'){
                console.log("[AH Automation CS] Clicking 'Get account health' button.");
                getAccountHealthButton.click();
                if (typeof notifySuccess === 'function') notifySuccess("Automated account health check initiated.");
                res({status: "success", action: "getAccountHealthButtonProgrammaticallyClicked"});
            } else {
                console.error("[AH Automation CS] 'Get account health' button found, but no click method.");
                res({status: "error", reason: "getAccountHealthButtonNotClickable"});
            }
        } else {
            console.error("[AH Automation CS] Could not find the 'Get account health' button with ID '#account-health'.");
            if (typeof notifyError === 'function') notifyError("Failed to find 'Get account health' button for automation.");
            res({status: "error", reason: "getAccountHealthButtonNotFound"});
        }
    } catch (err) {
        console.error("[AH Automation CS] Error during automated Account Health tab switch/button click:", err);
        if (typeof notifyError === 'function') notifyError("Error automating account health check.");
        res({status: "error", details: err.toString()});
    }
    return true; // Indicates you wish to send a response asynchronously
  }
  // Make sure this is an else if if there are other message handlers
  else if (req.message === "triggerAutoRunUpdateTracking") {
    console.log("[CS] Received triggerAutoRunUpdateTracking from background. Data:", req.data);
    chrome.runtime.sendMessage({
      message: "runUpdateTracking",
      data: {
        autoMode: req.data.autoMode,
        domain: window.location.origin // Pass current domain, background will use sender.tab.url anyway
      }
    }, (bgResponse) => {
      if (chrome.runtime.lastError) {
        console.warn("[CS] Error sending runUpdateTracking to background:", chrome.runtime.lastError.message);
      } else {
        console.log("[CS] runUpdateTracking message sent to background. Response:", bgResponse);
      }
    });
    res({ status: "runUpdateTracking_initiated_from_cs" });
    return true; // Indicate async response
  }

  const { message, data } = req || {};
  
  // Xử lý message tự động update tracking
  if (message === "autoUpdateTracking") {
    res({ message: "received" });
    console.log("[CS] Đang thực hiện auto update tracking...");
    
    // Đợi để đảm bảo giao diện đã load
    setTimeout(() => {
      // Kích hoạt tab Update Tracking
      $('[data-name="update_tracking"]').click();
      console.log("[CS] Kích hoạt tab Update Tracking");
      
      // Đợi thêm một chút để dữ liệu tab tải xong và hiển thị
      setTimeout(() => {
        // Đảm bảo tab content đã hiển thị đúng
        $("#update_tracking").css("display", "block");
        
        console.log("Tìm kiếm nút Start Update...");
        console.log("Selector 1 - #update-tracking: ", $("#update-tracking").length);
        console.log("Selector 2 - button#update-tracking: ", $("button#update-tracking").length);
        console.log("Selector 3 - .btn-updatetracking-wrap button: ", $(".btn-updatetracking-wrap button").length);
        console.log("Selector 4 - .om-btn: ", $(".om-btn").length);
        
        // Thử tất cả các selector có thể
        const btn1 = $("#update-tracking");
        if (btn1.length > 0) {
          console.log("Click nút bằng selector #update-tracking");
          btn1.click();
        }
        
        const btn2 = $("button#update-tracking");
        if (btn2.length > 0) {
          console.log("Click nút bằng selector button#update-tracking");
          btn2.click();
        }
        
        const btn3 = $(".btn-updatetracking-wrap button");
        if (btn3.length > 0) {
          console.log("Click nút bằng selector .btn-updatetracking-wrap button");
          btn3.click();
        }
        
        // Thử bằng cách lộ trình khác - click trực tiếp vào nút dựa trên text
        $(".om-btn").each(function() {
          if ($(this).text().trim() === "Start Update") {
            console.log("Tìm thấy nút Start Update dựa vào text content");
            $(this).click();
          }
        });
        
        // Thử cách cuối cùng - dùng JavaScript thuần
        document.querySelectorAll('#update-tracking, .btn-updatetracking-wrap button, .om-btn').forEach(btn => {
          if (btn.innerText.trim() === 'Start Update') {
            console.log("Click bằng querySelector và dispatchEvent");
            btn.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          }
        });
        
        // Lưu thông tin để đánh dấu đang trong chế độ tự động
        setStorage("_mb_auto_tracking", true);
        console.log("Đã đặt _mb_auto_tracking = true");
      }, 4000); // Tăng thời gian chờ lên 4 giây để đảm bảo tab đã hoàn toàn load xong
    }, 2000);
    
    return true;
  }
});