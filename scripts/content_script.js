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
            <button id="select-all-sync" class="om-btn" style="margin-left:10px; background-color: #4CAF50; display: flex; align-items: center;" title="Tự động chọn tất cả sản phẩm trên tất cả các trang và đồng bộ chúng">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="margin-right: 5px; fill: white;">
                  <path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"/>
                  <path d="M10,17L6,13L7.41,11.58L10,14.17L16.59,7.58L18,9"/>
               </svg>
               Select All & Sync
            </button>
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

// Thêm biến để theo dõi trạng thái đồng bộ tự động
let autoSyncInProgress = false;
let currentPageForAutoSync = 1;
let totalPagesForAutoSync = 1;
let totalProductsSelected = 0;
let totalProductsSynced = 0;
let isScheduledSync = false; // Biến để theo dõi nếu đây là lần chạy theo lịch

// Hàm kiểm tra nếu có nút phân trang (pagination)
const hasPagination = () => {
   return $(".a-pagination").length > 0;
};

// Hàm lấy số trang hiện tại
const getCurrentPage = () => {
   const currentPageEl = $(".a-pagination .a-selected");
   if (currentPageEl.length > 0) {
      return parseInt(currentPageEl.text().trim());
   }
   return 1;
};

// Hàm lấy tổng số trang
const getTotalPages = () => {
   // Tìm tổng số trang từ phần tử phân trang cuối cùng (không phải là nút Next)
   const pageItems = $(".a-pagination li");
   if (pageItems.length > 1) {
      // Phần tử áp cuối là tổng số trang (phần tử cuối thường là nút Next)
      const lastPageNumber = pageItems.eq(pageItems.length - 2).text().trim();
      if (!isNaN(parseInt(lastPageNumber))) {
         return parseInt(lastPageNumber);
      }
   }
   return 1;
};

// Hàm chuyển đến trang tiếp theo
const goToNextPage = () => {
   const nextButton = $(".a-pagination .a-last a");
   if (nextButton.length > 0) {
      nextButton[0].click();
      return true;
   }
   return false;
};

// Hiển thị báo cáo tiến trình
const showAutoSyncProgress = () => {
   // Kiểm tra nếu đã có phần tử tiến trình, cập nhật thay vì tạo mới
   if ($("#auto-sync-progress").length > 0) {
      $("#auto-sync-progress .progress-text").text(
         `Đang xử lý: Trang ${currentPageForAutoSync}/${totalPagesForAutoSync} | Đã chọn: ${totalProductsSelected} sản phẩm`
      );
      return;
   }

   // Tạo phần tử hiển thị tiến trình
   const progressHtml = `
      <div id="auto-sync-progress" style="background: #ebf5ff; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #ccc;">
         <div class="progress-text">Đang xử lý: Trang ${currentPageForAutoSync}/${totalPagesForAutoSync} | Đã chọn: ${totalProductsSelected} sản phẩm</div>
         <div style="margin-top: 5px; display: flex; justify-content: space-between;">
            <button id="auto-sync-cancel" class="om-btn" style="background-color: #d82c0d;">Hủy quá trình</button>
            <div id="auto-sync-status" style="margin-left: 10px; font-style: italic;">Đang chạy...</div>
         </div>
      </div>
   `;
   
   $("#not_synced").prepend(progressHtml);
   
   // Thêm sự kiện click cho nút hủy
   $(document).on("click", "#auto-sync-cancel", function() {
      cancelAutoSync();
   });
};

// Hủy quá trình tự động đồng bộ
const cancelAutoSync = () => {
   autoSyncInProgress = false;
   notifySuccess("Đã hủy quá trình tự động đồng bộ.");
   $("#auto-sync-status").text("Đã hủy.");
   $("#auto-sync-cancel").prop("disabled", true);
   
   // Sau một khoảng thời gian, loại bỏ phần tử tiến trình
   setTimeout(() => {
      $("#auto-sync-progress").fadeOut(500, function() {
         $(this).remove();
      });
   }, 3000);
};

// Cập nhật phần tử trạng thái
const updateAutoSyncStatus = (status) => {
   $("#auto-sync-status").text(status);
};

// Hoàn thành quá trình tự động đồng bộ
const completeAutoSync = () => {
   console.log("Hoàn thành quá trình tự động đồng bộ");
   
   autoSyncInProgress = false;
   updateAutoSyncStatus("Đã hoàn thành!");
   $("#auto-sync-cancel").prop("disabled", true);
   
   // Hiển thị thông báo tổng kết
   notifySuccess(`Đã hoàn thành! Tổng cộng: ${totalProductsSelected} sản phẩm trên ${totalPagesForAutoSync} trang.`);
   
   // Sau một khoảng thời gian, loại bỏ phần tử tiến trình
   setTimeout(() => {
      $("#auto-sync-progress").fadeOut(500, function() {
         $(this).remove();
      });
   }, 5000);
   
   // Nếu đây là lần đồng bộ theo lịch, thông báo cho background.js
   if (isScheduledSync) {
      console.log("Gửi thông báo hoàn thành đến background.js");
      chrome.runtime.sendMessage({
         message: "autoSyncFinished",
         domain: window.location.origin,
         data: {
            totalProducts: totalProductsSelected,
            totalPages: totalPagesForAutoSync,
            status: "completed",
            timestamp: new Date().toISOString()
         }
      });
      
      // Reset biến theo dõi lịch
      isScheduledSync = false;
   }
   
   // Reset các biến theo dõi
   totalProductsSelected = 0;
   totalProductsSynced = 0;
};

// Thêm sự kiện click cho nút Select All & Sync
$(document).on("click", "#select-all-sync", async function() {
   try {
      // Bỏ nếu đã đang trong quá trình sync
      if ($(".om-processing").length > 0 || autoSyncInProgress) {
         notifyError("Đang có quá trình đồng bộ đang chạy, vui lòng đợi...");
         return;
      }
      
      // Thiết lập lại các biến theo dõi
      currentPageForAutoSync = 1;
      totalPagesForAutoSync = 1;
      totalProductsSelected = 0;
      totalProductsSynced = 0;
      
      // Thông báo đang bắt đầu chọn tất cả
      notifySuccess("Bắt đầu quá trình chọn tất cả sản phẩm...");
      
      // Đánh dấu đang trong quá trình tự động sync
      autoSyncInProgress = true;
      
      // Thiết lập timeout bảo vệ
      setupSyncTimeout();
      
      // Đảm bảo đang ở tab "not_synced"
      if(!$("#not_synced").is(":visible")) {
         $('[data-name="not_synced"]').click();
         await sleep(1000);
      }
      
      // Đợi dữ liệu được load
      let attempts = 0;
      while($(".loader-resp").length > 0 && attempts < 10) {
         await sleep(500);
         attempts++;
      }
      
      // Đảm bảo dữ liệu đã load xong
      if ($(".loader-resp").length > 0) {
         notifyError("Không thể tải dữ liệu. Vui lòng thử lại sau.");
         autoSyncInProgress = false;
         return;
      }
      
      // Kiểm tra xem có sản phẩm nào để đồng bộ hay không
      if ($("tr[data-order-id]").length === 0) {
         notifyError("Không tìm thấy sản phẩm nào để đồng bộ.");
         autoSyncInProgress = false;
         return;
      }
      
      // Kiểm tra phân trang
      if (hasPagination()) {
         currentPageForAutoSync = getCurrentPage();
         totalPagesForAutoSync = getTotalPages();
         notifySuccess(`Tìm thấy ${totalPagesForAutoSync} trang. Đang xử lý trang ${currentPageForAutoSync}/${totalPagesForAutoSync}`);
      }
      
      // Chọn tất cả checkbox cho sản phẩm trang hiện tại
      selectAndSyncCurrentPage();
   } catch (error) {
      console.error("Lỗi khi thực hiện tự động đồng bộ:", error);
      notifyError("Có lỗi xảy ra khi thực hiện tự động đồng bộ.");
      autoSyncInProgress = false;
   }
});

// Hàm chọn tất cả sản phẩm trên trang hiện tại và bắt đầu sync
const selectAndSyncCurrentPage = async () => {
   try {
      // Hiển thị/Cập nhật tiến trình
      showAutoSyncProgress();
      updateAutoSyncStatus("Đang chọn sản phẩm...");
      
      // Đợi một chút để đảm bảo trang đã load xong
      await sleep(1000);
      
      console.log("Bắt đầu chọn sản phẩm trên trang hiện tại");
      
      // Chọn tất cả checkbox cho sản phẩm
      const checkboxes = $("tr[data-order-id] .force-sync-item .om-checkbox");
      console.log(`Tìm thấy ${checkboxes.length} sản phẩm trên trang hiện tại`);
      
      if (checkboxes.length > 0) {
         // Đánh dấu tất cả các checkbox
         checkboxes.each(function() {
            $(this).prop("checked", true);
         });
         
         // Cập nhật số lượng sản phẩm đã chọn
         totalProductsSelected += checkboxes.length;
         showAutoSyncProgress();
         
         notifySuccess(`Đã chọn ${checkboxes.length} sản phẩm trên trang ${currentPageForAutoSync}/${totalPagesForAutoSync}, đang bắt đầu sync...`);
         updateAutoSyncStatus("Đang đồng bộ...");
         
         // Chờ một chút để giao diện cập nhật
         await sleep(1000);
         
         console.log("Nhấn nút Sync Orders để bắt đầu quá trình đồng bộ");
         
         // Nhấn nút Sync Orders để bắt đầu quá trình đồng bộ
         if ($("#sync-order").length > 0) {
            $("#sync-order").trigger("click");
            
            // Thiết lập lắng nghe cho sự kiện hoàn thành sync để chuyển qua trang tiếp theo (nếu có)
            waitForSyncToComplete();
         } else {
            console.error("Không tìm thấy nút Sync Orders");
            notifyError("Không tìm thấy nút Sync Orders. Vui lòng kiểm tra lại.");
            updateAutoSyncStatus("Lỗi: không tìm thấy nút Sync");
            
            // Sau một khoảng thời gian, thử lại hoặc chuyển đến trang tiếp theo
            setTimeout(async () => {
               await processNextPageIfAvailable();
            }, 3000);
         }
      } else {
         console.log("Kiểm tra trường hợp không có sản phẩm hoặc tất cả đã sync");
         
         // Kiểm tra nếu trang hiển thị "All orders were synced to MB"
         if ($(".om-text-synced-all").length > 0 || $("tr[data-order-id]").length === 0) {
            console.log("Tất cả đơn hàng đã được đồng bộ hoặc không có đơn hàng nào");
            notifySuccess("Tất cả đơn hàng đã được đồng bộ với MB.");
            updateAutoSyncStatus("Đã đồng bộ tất cả đơn hàng.");
            
            // Nếu đây là lần đồng bộ theo lịch trình và không có sản phẩm nào cần sync
            if (isScheduledSync && totalProductsSelected === 0) {
               chrome.runtime.sendMessage({
                  message: "autoSyncFinished",
                  domain: window.location.origin,
                  data: {
                     totalProducts: 0,
                     totalPages: 1,
                     status: "all_synced",
                     timestamp: new Date().toISOString()
                  }
               });
            }
            
            // Hoàn thành quá trình
            completeAutoSync();
            return;
         }
         
         console.log(`Không tìm thấy sản phẩm nào trên trang ${currentPageForAutoSync} để chọn.`);
         notifyError(`Không tìm thấy sản phẩm nào trên trang ${currentPageForAutoSync} để chọn.`);
         updateAutoSyncStatus("Không tìm thấy sản phẩm...");
         
         // Kiểm tra và chuyển đến trang tiếp theo nếu có
         await processNextPageIfAvailable();
      }
   } catch (error) {
      console.error("Lỗi trong quá trình chọn sản phẩm:", error);
      notifyError(`Lỗi khi chọn sản phẩm: ${error.message}`);
      updateAutoSyncStatus("Đã xảy ra lỗi!");
      
      // Sau một thời gian, thử chuyển đến trang tiếp theo
      setTimeout(async () => {
         await processNextPageIfAvailable();
      }, 3000);
   }
};

// Hàm đợi quá trình sync hoàn thành
const waitForSyncToComplete = () => {
   console.log("Bắt đầu đợi quá trình sync hoàn thành");
   let attemptCount = 0;
   
   const checkInterval = setInterval(async () => {
      // Kiểm tra nếu quá trình đã bị hủy
      if (!autoSyncInProgress) {
         console.log("Quá trình tự động sync đã bị hủy, dừng chờ đợi");
         clearInterval(checkInterval);
         return;
      }
      
      attemptCount++;
      
      // Thêm timeout nếu quá trình đợi quá lâu (sau 60 lần kiểm tra - tương đương 1 phút)
      if (attemptCount > 60) {
         console.log("Đã chờ quá lâu, coi như quá trình sync đã hoàn thành");
         clearInterval(checkInterval);
         updateAutoSyncStatus("Đã quá thời gian chờ đợi...");
         
         // Đợi một chút để đảm bảo mọi thứ đã hoàn tất
         await sleep(2000);
         
         // Kiểm tra và chuyển đến trang tiếp theo nếu có
         await processNextPageIfAvailable();
         return;
      }
      
      // Kiểm tra trạng thái sync bằng nhiều cách
      // 1. Nếu không còn thấy processing indicator, tức là đã hoàn thành
      const syncProcessing = $(".om-processing").length > 0;
      
      // 2. Hoặc nếu nút Sync Orders đã hiện lại, cũng coi như đã hoàn thành
      const syncButtonVisible = $(".btn-sync-order-wrap").is(":visible") && !syncProcessing;
      
      if (!syncProcessing || syncButtonVisible) {
         console.log("Phát hiện quá trình sync đã hoàn thành");
         clearInterval(checkInterval);
         
         updateAutoSyncStatus("Đã hoàn thành trang hiện tại...");
         
         // Đợi một chút để đảm bảo mọi thứ đã hoàn tất
         await sleep(2000);
         
         // Kiểm tra và chuyển đến trang tiếp theo nếu có
         await processNextPageIfAvailable();
      } else {
         // Log mỗi 5 giây
         if (attemptCount % 5 === 0) {
            console.log(`Vẫn đang đợi sync hoàn thành... (${attemptCount}s)`);
         }
      }
   }, 1000); // Kiểm tra mỗi giây
};

// Hàm xử lý chuyển đến trang tiếp theo nếu có
const processNextPageIfAvailable = async () => {
   // Kiểm tra nếu quá trình đã bị hủy
   if (!autoSyncInProgress) {
      console.log("Quá trình tự động bị hủy, không chuyển trang");
      return;
   }
   
   console.log(`Đang xử lý trang hiện tại: ${currentPageForAutoSync}/${totalPagesForAutoSync}`);
   
   if (currentPageForAutoSync < totalPagesForAutoSync) {
      currentPageForAutoSync++;
      console.log(`Đang chuyển đến trang ${currentPageForAutoSync}/${totalPagesForAutoSync}...`);
      notifySuccess(`Đang chuyển đến trang ${currentPageForAutoSync}/${totalPagesForAutoSync}...`);
      updateAutoSyncStatus("Đang chuyển trang...");
      
      // Kiểm tra lại nút phân trang (có thể đã thay đổi sau khi sync)
      const nextButton = $(".a-pagination .a-last a");
      
      if (nextButton.length > 0) {
         console.log("Tìm thấy nút Next, đang chuyển trang...");
         
         // Thử sử dụng cả hai phương pháp để đảm bảo nút Next được nhấn
         try {
            // Phương pháp 1: Sử dụng trigger click
            nextButton.trigger("click");
            
            // Phương pháp 2: Nếu phương pháp 1 không hoạt động, sử dụng window.location
            setTimeout(() => {
               if (nextButton.attr("href")) {
                  const nextUrl = nextButton.attr("href");
                  if (nextUrl && !nextUrl.includes("javascript:void")) {
                     console.log(`Sử dụng phương pháp thay thế để điều hướng đến: ${nextUrl}`);
                     window.location.href = nextUrl;
                  }
               }
            }, 1000);
            
            // Đợi trang mới load (đợi lâu hơn để đảm bảo trang mới load hoàn tất)
            await sleep(3000);
            
            // Kiểm tra xem trang đã chuyển thành công chưa
            const newCurrentPage = getCurrentPage();
            if (newCurrentPage === currentPageForAutoSync) {
               console.log(`Đã chuyển thành công đến trang ${currentPageForAutoSync}`);
               // Tiếp tục với trang mới
               selectAndSyncCurrentPage();
            } else {
               console.log(`Chưa chuyển thành công đến trang ${currentPageForAutoSync}, trang hiện tại là ${newCurrentPage}`);
               // Thử lại sau một khoảng thời gian
               setTimeout(() => {
                  // Kiểm tra lại
                  const retryPage = getCurrentPage();
                  if (retryPage === currentPageForAutoSync) {
                     console.log(`Lần kiểm tra lại: Đã chuyển thành công đến trang ${currentPageForAutoSync}`);
                     selectAndSyncCurrentPage();
                  } else {
                     console.error(`Không thể chuyển đến trang ${currentPageForAutoSync}, hiện tại ở trang ${retryPage}`);
                     notifyError(`Không thể chuyển đến trang ${currentPageForAutoSync}. Đang dừng quá trình.`);
                     autoSyncInProgress = false;
                  }
               }, 3000);
            }
         } catch (error) {
            console.error("Lỗi khi chuyển trang:", error);
            notifyError(`Lỗi khi chuyển trang: ${error.message}`);
            updateAutoSyncStatus("Lỗi khi chuyển trang!");
            autoSyncInProgress = false;
         }
      } else {
         console.error("Không tìm thấy nút Next để chuyển trang");
         notifyError("Không thể chuyển đến trang tiếp theo.");
         updateAutoSyncStatus("Lỗi khi chuyển trang!");
         autoSyncInProgress = false;
      }
   } else {
      console.log("Đã hoàn thành tất cả các trang");
      // Đã hoàn thành tất cả các trang
      completeAutoSync();
   }
};

// Hàm xử lý timeout nếu một quá trình kéo dài quá lâu
const setupSyncTimeout = () => {
   console.log("Thiết lập timeout bảo vệ cho quá trình đồng bộ tự động");
   
   // Thiết lập timeout cho quá trình đồng bộ (nếu kéo dài quá 5 phút)
   const timeoutId = setTimeout(() => {
      if (autoSyncInProgress) {
         console.error("Quá trình đồng bộ đã vượt quá thời gian cho phép (5 phút)");
         notifyError("Quá trình đồng bộ đã vượt quá thời gian. Đang hủy...");
         
         // Thông báo với background.js về việc hủy
         if (isScheduledSync) {
            chrome.runtime.sendMessage({
               message: "autoSyncFinished",
               domain: window.location.origin,
               data: {
                  totalProducts: totalProductsSelected,
                  totalPages: totalPagesForAutoSync,
                  status: "timeout",
                  timestamp: new Date().toISOString()
               }
            });
         }
         
         cancelAutoSync();
      }
   }, 5 * 60 * 1000); // 5 phút
   
   // Xóa timeout nếu quá trình đã hoàn thành hoặc bị hủy
   const checkIntervalId = setInterval(() => {
      if (!autoSyncInProgress) {
         console.log("Quá trình đồng bộ đã kết thúc, dừng timeout bảo vệ");
         clearTimeout(timeoutId);
         clearInterval(checkIntervalId);
      }
   }, 5000);
};

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
      case "autoSyncOrders":
         res({ message: "received" });
         console.log("Đang thực hiện auto sync orders...");
         
         // Đợi để đảm bảo giao diện đã load
         setTimeout(async () => {
            // Kích hoạt tab Not Synced
            $('[data-name="not_synced"]').click();
            
            // Đợi thêm một chút để dữ liệu tab tải xong
            await sleep(2000);
            
            // Nếu có yêu cầu tự động đánh dấu là đã sync
            if (data && data.autoMark === true) {
               // Lưu thông tin để script sync_order.js biết cần đánh dấu auto
               setStorage("_mb_auto", true);
               
               // Đánh dấu đây là lần chạy theo lịch trình
               isScheduledSync = true;
            }
            
            // Kiểm tra flag useSelectAllSync để quyết định sử dụng nút nào
            if (data && data.useSelectAllSync === true) {
               console.log("Sử dụng chức năng Select All & Sync tự động");
               
               // Đảm bảo không có quá trình đồng bộ nào đang chạy
               if (!autoSyncInProgress && $(".om-processing").length === 0) {
                  // Thêm thông báo rằng đây là quá trình tự động theo lịch
                  notifySuccess("Đang chạy tự động đồng bộ theo lịch đã cài đặt...");
                  
                  // Đợi để đảm bảo rằng select-all-sync đã sẵn sàng
                  if ($("#select-all-sync").length > 0) {
                     // Nhấn vào nút "Select All & Sync" để kích hoạt quá trình tự động
                     $("#select-all-sync").trigger("click");
                  } else {
                     console.error("Không tìm thấy nút Select All & Sync");
                     // Gửi thông báo lỗi
                     chrome.runtime.sendMessage({
                        message: "autoSyncSkipped",
                        domain: window.location.origin,
                        reason: "button_not_found"
                     });
                  }
               } else {
                  console.log("Đã có quá trình đồng bộ đang chạy, bỏ qua hành động tự động");
                  
                  // Nếu đã có quá trình đang chạy, báo cáo cho background.js biết để nó có thể xử lý tiếp theo
                  if (isScheduledSync) {
                     chrome.runtime.sendMessage({
                        message: "autoSyncSkipped",
                        domain: window.location.origin,
                        reason: "process_running"
                     });
                  }
               }
            } else {
               // Sử dụng cách cũ - chỉ đồng bộ các sản phẩm trên trang hiện tại
               console.log("Sử dụng chức năng Sync Orders thông thường");
               
               // Click vào nút Sync Orders
               $("#sync-order").click();
            }
         }, 2000);
         break;
      case "autoUpdateTracking":
         res({ message: "received" });
         console.log("Đang thực hiện auto update tracking...");
         
         // Đợi để đảm bảo giao diện đã load
         setTimeout(() => {
            // Kích hoạt tab Update Tracking
            $('[data-name="update_tracking"]').click();
            
            // Đợi thêm một chút để dữ liệu tab tải xong
            setTimeout(() => {
               // Click vào nút Start Update
               $("#update-tracking").click();
               
               // Lưu thông tin để đánh dấu đang trong chế độ tự động
               setStorage("_mb_auto_tracking", true);
            }, 2000);
         }, 2000);
         break;
      case "showToast":
         res({ message: "received" });
         if (data.type === "success") {
            notifySuccess(data.message);
         } else {
            notifyError(data.message);
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