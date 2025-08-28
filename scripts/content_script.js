/**
 * Gửi một chuỗi log lên server thông qua background script.
 * Đây là cách thay thế an toàn cho việc override console.log.
 * @param {...any} args - Các đối số bạn muốn ghi log, tương tự như console.log.
 */
function sendToServerLog(...args) {
   // Chuyển đổi tất cả các đối số thành một chuỗi duy nhất.
   let logString = '';
   try {
       logString = args.map(arg => {
           if (typeof arg === 'object' && arg !== null) {
               try {
                   return JSON.stringify(arg);
               } catch (e) {
                   return '[Circular Object]';
               }
           }
           return String(arg);
       }).join(' ');
   } catch (e) {
       logString = 'Error converting log arguments to string.';
   }

   // Gửi chuỗi log đến background script.
   try {
       chrome.runtime.sendMessage({
           message: "log_to_server", // Giữ nguyên message name này
           data: logString
       });
   } catch (error) {
       // Nếu có lỗi, chỉ ghi ra console của trình duyệt.
       console.error('Could not send log to background script:', error);
   }
}

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
const testFeatureComponent = `
   <div class="test-feature-wrap" style="padding: 20px; border: 1px solid #e1e3e5; border-radius: 8px; margin: 10px 0;">
      <h3 style="text-align:center;margin-bottom:15px;font-weight:420">🧪 Test Payment Features</h3>
      
      <!-- Test ngay lập tức -->
      <div class="om-fl-center" style="margin-bottom: 15px;">
         <button id="test-payment-request" class="om-btn" style="background-color: #ff9500;">Test Payment Now</button>
      </div>
      <p class="om-comment" style="text-align:center; margin-bottom: 20px;">Click để chạy test kiểm tra disbursement button (không click thật).</p>
      
      <!-- Đặt lịch test tùy chỉnh -->
      <div style="border-top: 1px solid #e1e3e5; padding-top: 15px;">
         <h4 style="text-align:center;margin-bottom:10px;">Schedule Custom Test</h4>
         
         <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
            <label>Thời gian:</label>
            <input type="time" id="custom-test-time" value="12:30" style="padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
            
            <label>Sau bao nhiêu phút:</label>
            <input type="number" id="custom-test-minutes" min="1" max="1440" value="5" style="width: 60px; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
            <span>phút</span>
         </div>
         
         <div class="om-fl-center" style="margin-bottom: 10px;">
            <button id="schedule-custom-test" class="om-btn" style="background-color: #17a2b8;">Schedule Test</button>
            <button id="cancel-test-alarm" class="om-btn" style="background-color: #dc3545; margin-left: 10px;">Cancel Test</button>
         </div>
         
         <div id="test-status" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;"></div>
      </div>
   </div>
`;
const paymentFeatureComponent = `
   <div class="payment-feature-wrap" style="padding: 20px; border: 1px solid #28a745; border-radius: 8px; margin: 10px 0; background-color: #f8fff9;">
      <h3 style="text-align:center;margin-bottom:15px;font-weight:420">💰 Real Payment Management</h3>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 10px; margin-bottom: 15px;">
         <p style="margin: 0; color: #856404; font-weight: bold; text-align: center;">
            ⚠️ CẢNH BÁO: Các nút bên dưới sẽ THỰC HIỆN RÚT TIỀN THẬT!
         </p>
      </div>
      
      <div class="om-fl-center" style="margin-bottom: 10px;">
         <button id="execute-real-payment" class="om-btn" style="background-color: #28a745; font-weight: bold;">🚀 THỰC HIỆN RÚT TIỀN</button>
      </div>
      <p class="om-comment" style="text-align:center; margin-bottom: 15px;">
         Kiểm tra điều kiện và thực hiện rút tiền thật nếu đủ điều kiện
      </p>

      <div id="real_status" style="text-align: center; font-weight: bold; margin-top: 10px; display: none;"></div>

      <div class="om-fl-center">
         <button id="schedule-payment-alarm" class="om-btn" style="background-color: #6c757d;">Toggle Auto Schedule</button>
      </div>
      <p class="om-comment" style="text-align:center; margin-top: 10px;">
         Bật/tắt lịch tự động kiểm tra rút tiền (T2, T4, T6 12:30 & CN 8:00)
      </p>
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
               <button class="tablinks om-tablinks" data-name="payment_feature">Payment
               </button> 
            </div>

            <div id="sync_order" class="tabcontent om-tabcontent"></div>

            <div id="sync_order_option" class="tabcontent om-tabcontent">
               ${syncOrderOptionComponent}
            </div>
            <div id="payment_feature" class="tabcontent om-tabcontent"></div> </div>
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
         <div class="om-fl-center btn-accounthealth-wrap">
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
      !window.location.href.includes("advertising.amazon.com/reports") &&
      !window.location.href.includes("/performance/dashboard")
   )
      return;
   if ($(".om-addon").length) return;
   $("body").append(addonComponent);
   await checkAddonCollapse();

   // active tab sync order
   $('[data-name="sync_order"]').click();
   $("#sync_order").append(syncOrderComponent);
   $("#payment_feature").append(paymentFeatureComponent);
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
function showStatus(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.style.display = 'block';
    element.textContent = message;
    // Thêm một class để có thể tùy chỉnh màu sắc nếu cần
    element.className = `status-${type}`; 
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

function setButtonLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    if (loading) {
        button.disabled = true;
        button.style.opacity = '0.6';
        const originalText = button.getAttribute('data-original-text') || button.innerHTML;
        button.setAttribute('data-original-text', originalText);
        button.innerHTML = '⏳ Đang xử lý...';
    } else {
        button.disabled = false;
        button.style.opacity = '1';
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
        }
    }
}



$(document).ready(function () {
   initAddon();
});
$(document).on('click', '#schedule-payment-alarm', function() {
    chrome.runtime.sendMessage({ message: "toggleAutoSchedule" }, (response) => {
        if (response && response.enabled !== undefined) {
            const statusText = response.enabled ? 'BẬT' : 'TẮT';
            showStatus('real_status', `Đã ${statusText} lịch tự động rút tiền`, 'success');
            const button = document.getElementById('enable_auto_schedule');
            button.textContent = response.enabled ? 'Tắt Lịch Tự Động' : 'Bật Lịch Tự Động';
        }
    });
});
$(document).on('click', '#execute-real-payment', function() {

    if (!confirm('⚠️ CẢNH BÁO: Bạn có chắc chắn muốn THỰC HIỆN RÚT TIỀN THẬT?\n\nHành động này KHÔNG THỂ HOÀN TÁC!')) {
        return;
    }
    if (!confirm('Xác nhận lần cuối: THỰC HIỆN RÚT TIỀN NGAY BÂY GIỜ?')) {
        return;
    }
    
    setButtonLoading('execute-real-payment', true);
    showStatus('real_status', 'Đang thực hiện rút tiền thật... Vui lòng đợi!', 'info');
    
    // SỬA LẠI Ở ĐÂY
    chrome.runtime.sendMessage({ 
        message: "executeRealPayment",
        data: { 
            confirmed: true, 
            realPayment: true, // <--- THÊM DÒNG NÀY
            testMode: false
        }
    });
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

$(document).on("click", "#manual-payment-check", function () {
   $(this).addClass("loader");
   notifySuccess("Bắt đầu kiểm tra thanh toán từ Dashboard...");
   chrome.runtime.sendMessage({ message: "manualRequestPayment" });
});

$(document).on("click", "#direct-disbursement", function () {
   $(this).addClass("loader");
   notifySuccess("Đang thực hiện Direct Disbursement...");
   chrome.runtime.sendMessage({ message: "directDisbursementRequest" });
});

$(document).on("click", "#test-navigation", function () {
   $(this).addClass("loader");
   notifySuccess("Đang test navigation...");
   
   // Mở tab dashboard để test navigation
   chrome.runtime.sendMessage({ 
      message: "testNavigation",
      data: {
         fromUrl: "https://sellercentral.amazon.com/payments/dashboard/index.html/ref=xx_payments_dnav_xx",
         toUrl: "https://sellercentral.amazon.com/payments/disburse/details?ref_=xx_paynow_butn_dash&accountType=PAYABLE"
      }
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
      case "manualPaymentRequestFinished":
         res({ message: "received" });
         $("#manual-payment-check").removeClass("loader");
         if (data.error) {
            notifyError(`Dashboard → Disbursement thất bại: ${data.error}`);
         } else {
            notifySuccess("Dashboard → Disbursement hoàn tất!");
         }
         break;

      case "directDisbursementFinished":
         res({ message: "received" });
         $("#direct-disbursement").removeClass("loader");
         if (data.error) {
            notifyError(`Direct Disbursement thất bại: ${data.error}`);
         } else {
            notifySuccess(`Direct Disbursement thành công! Amount: $${data.amount}`);
         }
         break;
         
      case "testNavigationFinished":
         res({ message: "received" });
         $("#test-navigation").removeClass("loader");
         if (data.error) {
            notifyError(`Test Navigation thất bại: ${data.error}`);
         } else {
            notifySuccess("Test Navigation thành công!");
         }
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


chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   if (req.message === "autoGetAccountHealth") {
      res({ message: "received" });
      console.log("[CS] Đang thực hiện auto get account health...");
      
      // Đợi để đảm bảo giao diện đã load
      setTimeout(() => {
        // Kích hoạt tab Account Health
        const accountHealthTabButton = $('button[data-name="account_health"]');
        if (accountHealthTabButton.length > 0) {
          accountHealthTabButton.click();
          console.log("[CS] Kích hoạt tab Account Health");
        } else {
          console.error("[CS] Không tìm thấy tab Account Health button[data-name='account_health']");
          if (typeof notifyError === 'function') notifyError("Auto mode: Failed to find Account Health tab.");
          return; 
        }
        
        // Đợi thêm một chút để dữ liệu tab tải xong và hiển thị
        setTimeout(() => {
          // Đảm bảo tab content đã hiển thị đúng
          const accountHealthContentDiv = $("#account_health");
          if (accountHealthContentDiv.length > 0) {
            accountHealthContentDiv.css("display", "block");
            console.log("[CS] Đảm bảo nội dung tab Account Health hiển thị.");
          } else {
            console.error("[CS] Không tìm thấy div nội dung Account Health #account_health");
            if (typeof notifyError === 'function') notifyError("Auto mode: Failed to find Account Health content div.");
            return;
          }
          
          console.log("[CS] Tìm kiếm nút Get account health...");
          const getAccountHealthButtonElement = document.querySelector('#account-health'); // Using pure JS selector
          
          if (getAccountHealthButtonElement) {
              console.log("[CS] Nút 'Get account health' (#account-health) tìm thấy. Click bằng dispatchEvent.");
              getAccountHealthButtonElement.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              }));
              if (typeof notifySuccess === 'function') notifySuccess("Automated account health check initiated (auto mode).");
          } else {
            console.error("[CS] Không tìm thấy nút Get account health bằng selector '#account-health'.");
            if (typeof notifyError === 'function') notifyError("Auto mode: Failed to find 'Get account health' button.");
          }
          
        }, 4000); // Tăng thời gian chờ lên 4 giây
      }, 2000); // Tăng thời gian chờ lên 2 giây
      
      return true;
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
    console.log(`[Content] Nhận tin nhắn từ background.js: ${message}`, { url: window.location.href });
  
    // Phản hồi ping từ background script để xác nhận content script đã được tiêm
    if (message === "ping") {
      console.log("[Content] Nhận ping từ background script, phản hồi để xác nhận đã tiêm");
      res({ injected: true });
      return true;
    }
    
    // Xử lý message autoSyncOrders để tự động chọn tất cả đơn hàng và nhấn nút sync
    if (message === "autoSyncOrders") {
      console.log("[Content] Xử lý yêu cầu autoSyncOrders:", data);
      res({ message: "received" });
      
      try {
        // Chờ một chút để đảm bảo UI đã được tải hoàn toàn
        await sleep(3000);
        
        // Nếu có useSelectAllSync, chọn tất cả các đơn hàng
        if (data?.useSelectAllSync) {
          console.log("[Content] Tự động chọn tất cả đơn hàng");
          $(".force-sync-all-item .om-checkbox").prop("checked", true).trigger("click");
          await sleep(1000);
        }
        
        // Click nút "Sync Orders"
        console.log("[Content] Tự động nhấn nút Sync Orders");
        $(".om-addon #not_synced #sync-order").trigger("click");
        
        notifySuccess("Tự động đồng bộ đơn hàng đang được thực hiện");
      } catch (error) {
        console.error("[Content] Lỗi khi tự động đồng bộ đơn hàng:", error);
        notifyError("Không thể tự động đồng bộ đơn hàng: " + error.message);
      }
      
      return true;
    }
  });