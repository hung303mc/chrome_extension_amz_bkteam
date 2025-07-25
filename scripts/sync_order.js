const orderNotFound = `
   <div class="om-not-found-wrap">
      <div style="padding:20px 10px;"><img style="width:30px;object-fit:cover;" src="${chrome.runtime.getURL(
        "assets/images/not-found.png",
      )}"/></div>
      <div class="om-text-not-found" >Orders not found</div>
   </div>
`;

const syncedAllOrders = `
   <div class="om-synced-all-wrap">
      <div style="padding:20px 10px;"><img style="width:30px;object-fit:cover;" src="${chrome.runtime.getURL(
        "assets/images/completed.png",
      )}"/></div>
      <div class="om-text-synced-all" >All orders were synced to MB</div>
   </div>
`;

const statusLabel = (status, colorCode) => `
   <span data-status="${status}" class="main-status" style="margin-top: 5px; display: flex">
      <span class="om-status-label" style="background-color:${colorCode};">${status}</span>
   </span>
`;
// const forceConfirmBtn = (orderId, trackingCode) => `
//    <button data-status="Add Tracking Code" data-order-id="${orderId}" data-tracking="${
//    trackingCode ? trackingCode : ""
// }" class="om-btn om-btn-force-confirm force-confirm" >Confirm Shipment</button>
// `;

const forceConfirmBtn = ({
  orderId,
  trackingCode,
  shippingCarrierCode,
  shippingCarrierMethod,
}) => {
  const confirmShipmentBtn = $(
    `
      <button data-status="Add Tracking Code" class="om-btn om-btn-force-confirm force-confirm">
         Confirm Shipment
      </button>
      `,
  );

  let code = trackingCode ? trackingCode : "";
  let carrier = shippingCarrierCode ? shippingCarrierCode : ""; // USPS
  let shippingService = shippingCarrierMethod ? shippingCarrierMethod : ""; // "USPS Parcel Post"

  $(confirmShipmentBtn).attr({
    "data-order-id": orderId,
    "data-tracking": code,
    "data-carrier": carrier,
    "data-shipping-service": shippingService,
  });

  return confirmShipmentBtn;
};

// Thêm hàm kiểm tra đơn hủy vào scripts/sync_order.js

// Hàm để kiểm tra xem đơn hàng có bị hủy bởi khách hàng không
const checkCancelledOrders = async (orders) => {
  const cancelledOrders = [];
  const ordersXpath = "#orders-table tbody tr";
  
  for (let i = 0; i < $(ordersXpath).length; i++) {
    const item = $(ordersXpath)?.eq(i);
    const orderId = item?.find("td:nth-child(3) .cell-body-title")?.text();
    
    // Kiểm tra nếu có phần tử có class "buyer-requested-cancel"
    const hasCancelRequest = item.find(".buyer-requested-cancel").length > 0;
    
    // Hoặc kiểm tra nếu văn bản chứa thông tin về hủy đơn
    const statusText = item.find(".order-status-column").text();
    const hasCancelText = statusText.includes("Buyer cancellation") || 
                          statusText.includes("Order Created by Mistake") ||
                          statusText.includes("Cancel");
    
    if ((hasCancelRequest || hasCancelText) && orderId) {
      // Tìm đơn tương ứng trong danh sách đơn hàng
      const order = orders.find(o => o.id === orderId);
      if (order) {
        // Lấy lý do hủy đơn nếu có
        let cancelReason = "";
        const reasonElement = item.find(".buyer-requested-cancel-order-status-message");
        if (reasonElement.length > 0) {
          cancelReason = reasonElement.text().replace("Cancellation reason: ", "").trim();
        }
        
        // Thêm thông tin hủy đơn vào đối tượng đơn hàng
        cancelledOrders.push({
          ...order,
          cancelReason: cancelReason
        });
      }
    }
  }
  
  return cancelledOrders;
};

// Thêm hàm để gửi đơn hàng đã hủy lên server
const updateCancelledOrders = async (cancelledOrders) => {
  if (cancelledOrders.length === 0) return;
  
  try {
    const mbApiKey = await getStorage(mbApi);
    if (!mbApiKey) {
      notifyError("Không tìm thấy MB API key.");
      return;
    }
    
    // Tạo danh sách ID đơn hàng bị hủy
    const orderIds = cancelledOrders.map(order => order.id);
    
    // Gửi yêu cầu cập nhật đơn hàng bị hủy
    chrome.runtime.sendMessage({
      message: "updateCancelledOrders",
      data: {
        apiKey: mbApiKey,
        orderIds: orderIds,
        cancelledOrders: cancelledOrders
      },
      domain: window.location.origin,
    });
    
  } catch (error) {
    console.error("Lỗi khi cập nhật đơn hàng bị hủy:", error);
    notifyError("Có lỗi xảy ra khi cập nhật đơn hàng bị hủy.");
  }
};

// Sửa đổi hàm getOrderLists để thêm quét đơn bị hủy
const getOrderLists = async () => {
  const orders = [];
  // wait load dom
  const ordersXpath = "#orders-table tbody tr";
  const noOrdersSelector = 'span:contains("No orders were found that match the given search criteria.")';

  const MAX_WAIT_SECONDS = 60; // Vẫn giữ thời gian chờ tối đa 1 phút
  let tableFound = false;

  console.log(`Bắt đầu chờ, tối đa ${MAX_WAIT_SECONDS} giây. Sẽ chỉ dừng lại khi thấy bảng order.`);

  // Vòng lặp này chỉ có một mục đích duy nhất: chờ bằng được cái bảng order xuất hiện.
  for (let i = 0; i < MAX_WAIT_SECONDS; i++) {
    if ($(ordersXpath).length > 0) {
      console.log(`OK, đã tìm thấy bảng order sau ${i + 1} giây.`);
      tableFound = true;
      break; // Thoát ngay khi thấy bảng
    }
    await sleep(1000);
  }

  // Sau khi vòng lặp kết thúc, ta mới bắt đầu phán xét
  if (tableFound) {
    // Nếu vòng lặp dừng lại do đã tìm thấy bảng, thì quá tốt.
    // Bỏ qua cái dòng "No orders" dù nó có tồn tại hay không.
    console.log("Bảng order đã xuất hiện. Bắt đầu lấy danh sách.");
  } else {
    // Nếu chạy hết 60 giây mà không thấy bảng order đâu (tableFound = false)
    // Lúc này ta mới kiểm tra lần cuối xem có dòng "No orders" không.
    if ($(noOrdersSelector).length > 0) {
      console.log("Đã chờ hết 60 giây, không thấy bảng order, chỉ thấy thông báo 'No orders'. Kết luận không có đơn hàng.");
      return [];
    } else {
      // Trường hợp tệ nhất: hết 60s mà không thấy gì cả.
      console.log(`Hết ${MAX_WAIT_SECONDS} giây chờ mà không thấy bảng order hay thông báo. Có thể trang đã bị lỗi.`);
      return [];
    }
  }

  // wait load all order
  const totalOrders = parseInt(
    $(".total-orders-heading>span:first-child").text().split(" ")[0],
  );
  const pageLimit = parseInt(
    $(".footer .a-dropdown-prompt")?.text()?.split(" ").pop(),
  );
  while (true) {
    let orderLoaded = 0;
    for (let i = 0; i < $(ordersXpath).length; i++) {
      const id = $(ordersXpath)
        ?.eq(i)
        ?.find("td:nth-child(3) .cell-body-title")
        ?.text();
      if (id) orderLoaded++;
    }
    if (totalOrders == orderLoaded || pageLimit == orderLoaded) break;
    let isNextPage = true;
    if (!$(".a-pagination .a-selected").next(".a-normal").length)
      isNextPage = false;
    if (!isNextPage && totalOrders > pageLimit) {
      const currentPageTotalOrders =
        totalOrders - Math.floor(totalOrders / pageLimit) * pageLimit;
      if (currentPageTotalOrders == orderLoaded) break;
    }
    await sleep(1000);
  }
  // get orders
  for (let i = 0; i < $(ordersXpath).length; i++) {
    const id = $(ordersXpath)
      ?.eq(i)
      ?.find("td:nth-child(3) .cell-body-title")
      ?.text();
    let img = $(ordersXpath)
      ?.eq(i)
      ?.find("td:nth-child(4) img")
      ?.attr("src")
      ?.replace("__SX55_.", ".");

    const pt = /\.\_.*\_\./gi;
    img = (img || "").replace(pt, ".");
    const productUrl = $(ordersXpath)
      ?.eq(i)
      ?.find("td:nth-child(5) a")
      ?.attr("href");

    if (!id) continue;
    orders.push({ id, img, productUrl });
  }
  
  // Kiểm tra đơn hàng bị hủy và gửi lên server
  const cancelledOrders = await checkCancelledOrders(orders);
  if (cancelledOrders.length > 0) {
    console.log(`Tìm thấy ${cancelledOrders.length} đơn hàng bị hủy.`);
    await updateCancelledOrders(cancelledOrders);
  }
  
  return orders;
};


const addStatusLabel = (orderInfos) => {
  if (!orderInfos) return;
  // status = {
  //    [orderId]: {
  //       status: String,
  //       isShipLate: Boolean
  //    }
  // }
  const ordersXpath = "#orders-table tbody tr";
  for (let i = 0; i < $(ordersXpath).length; i++) {
    const item = $(ordersXpath)?.eq(i);
    const orderId = item?.find("td:nth-child(3) .cell-body-title")?.text();
    if (!orderId || !orderInfos[orderId]) continue;
    const elem = item.find(".order-status-column>div");
    const {
      status,
      trackingCode,
      isShipLate,
      shippingCarrierCode,
      shippingCarrierMethod,
    } = orderInfos[orderId];

    /**
     * Have confirm shipment button => not tracking code yet
     */
    const confirmShipmentBtn = $(item).find(
      '.myo-table-action-column .a-row a[href*="confirm"]',
    );
    switch (status) {
      case "Synced":
        if (!item.find(`[data-status="Synced"]`).length)
          elem.append(statusLabel("Synced", "#008060"));
        if (trackingCode) {
          if (!item.find(`[data-status="Tracking Available"]`).length)
            elem.append(statusLabel("Tracking Available", "#008060"));
        } else {
          if (!item.find(`[data-status="Tracking Not Available"]`).length)
            elem.append(statusLabel("Tracking Not Available", "#f44336"));
        }
        // SL = Shiplate
        if (
          isShipLate &&
          (confirmShipmentBtn?.length === 1 ||
            (trackingCode && trackingCode.startsWith("SL")))
        ) {
          if (!item.find(`[data-status="Need SL Tracking"]`).length)
            elem.append(statusLabel("Need SL Tracking", "#f44336"));
        }
        // add btn add tracking
        // if (!isAddedTracking)
        if (!item.find(`[data-status="Add Tracking Code"]`).length) {
          elem.append(
            forceConfirmBtn({
              orderId,
              trackingCode,
              shippingCarrierCode,
              shippingCarrierMethod,
            }),
          );
        }
        break;
      case "Not Synced":
        if (!item.find(`[data-status="Not Synced"]`).length)
          elem.append(statusLabel("Not Synced", "#f44336"));
        break;
      case "Ignored":
        if (!item.find(`[data-status="Ignored"]`).length)
          elem.append(statusLabel("MB Ignored", "#f44336"));
        break;
      default:
        break;
    }
  }
};

const removeTableLoading = () => {
  // remove loading
  $("#not_synced .loader-resp").remove();
  $("#ignored .loader-resp").remove();
  // show not synced table
  if (!$("#not_synced table").length)
    $("#not_synced").prepend(`
       <div class="table_wrap">
          <table class="om-table">
             <tr>
                <th class="force-sync-all-item">
                   <input class="om-checkbox" type="checkbox" />
                </th>
                <th>Image</th>
                <th>Order ID</th>
                <th>Action</th>
             </tr>
          </table>
       </div>
    `);
  // show ignore table
  if (!$("#ignored table").length)
    $("#ignored").prepend(`
       <div class="table_wrap">
          <table class="om-table">
             <tr>
                <th class="force-revert-all-item">
                   <input class="om-checkbox" type="checkbox" />
                </th>
                <th>Image</th>
                <th>Order ID</th>
                <th>Action</th>
             </tr>
          </table>
       </div>
    `);
};

const appendOrdersIntoTable = (orders, orderInfos) => {
  // status = {
  //    status : String,
  //    isShipLate: Boolean
  // }
  removeTableLoading();
  addStatusLabel(orderInfos);
  //------------ insert data into table
  let hasNotSync = false;
  let hasIgnore = false;
  for (const order of orders) {
    if (!orderInfos[order.id]) continue;
    // add order into not sync table
    if (orderInfos[order.id].status === "Not Synced") {
      hasNotSync = true;
      if (!$(`#not_synced tr[data-order-id="${order.id}"]`).length) {
        $("#not_synced .om-table").append(`
               <tr data-order-id="${order.id}">
                  <td class="force-sync-item"><input data-order="${b64Encode(
                    order,
                  )}" class="om-checkbox" type="checkbox"></td>
                  <td> <img class="om-img-50" src="${order.img}" /></td>
                  <td>${order.id}</td>
                  <td><button class="sync-order-item om-btn" data-order-id="${
                    order.id
                  }" data-order="${b64Encode(order)}">Sync</button></td>
               </tr>
            `);
      }
    }
    // add order into ignored table
    if (orderInfos[order.id].status === "Ignored") {
      hasIgnore = true;
      if (!$(`#ignored tr[data-order-id="${order.id}"]`).length) {
        $("#ignored .om-table").append(`
               <tr data-order-id="${order.id}">
                  <td class="force-revert-item"><input data-order="${b64Encode(
                    order,
                  )}" class="om-checkbox" type="checkbox"></td>
                  <td> <img class="om-img-50" src="${order.img}" /></td>
                  <td>${order.id}</td>
                  <td><button class="revert-order-item om-btn" data-order-id="${
                    order.id
                  }" data-order="${b64Encode(order)}">Revert</button></td>
               </tr>
            `);
      }
    }
  }
  if (hasNotSync) $(".btn-sync-order-wrap").css("display", "flex");
  else {
    if (orders.length > 0) {
      if (!$("#not_synced .om-synced-all-wrap").length) {
         $("#not_synced .table_wrap").append(syncedAllOrders);
      }
    } else {
      $("#not_synced .table_wrap").append(orderNotFound);
    }

    $("#not_synced .btn-sync-order-wrap").css("display", "none");
  }

  if (hasIgnore) $(".btn-revert-order-wrap").css("display", "flex");
  else {
    if (!$("#ignored .om-not-found-wrap").length)
      $("#ignored .table_wrap").append(orderNotFound);
    $("#ignored .btn-revert-order-wrap").css("display", "none");
  }

  return hasNotSync;
};

const appendProcessSyncOrderItem = async (data) => {
  console.log('[Content] Xử lý lấy thông tin đơn hàng:', data);
  
  try {
    removeTableLoading();
    if (!data) return;
    const { order, label } = data;
    if (!order) return;
    taskProcessing(label);
    
    // Kiểm tra xem chúng ta có đang ở trang chi tiết đơn hàng không
    if (window.location.href.includes("/orders-v3/order/")) {
      console.log('[Content] Đang ở trang chi tiết đơn hàng, bắt đầu trích xuất thông tin...');
      
      // TRÍCH XUẤT THÔNG TIN ĐƠN HÀNG
      const orderInfo = {};
      try {
        // Lấy thông tin từ DOM - điều chỉnh các selectors này dựa trên cấu trúc trang thực tế
        orderInfo.id = order.id || window.location.href.match(/\/order\/([A-Z0-9-]+)/i)?.[1];
        orderInfo.customer = $('.a-row.a-spacing-micro .a-column.a-span12')?.text()?.trim() || '';
        orderInfo.orderDate = $('.a-section.a-spacing-none time')?.text()?.trim() || '';
        
        // Thêm các thông tin khác tùy theo yêu cầu
        console.log('[Content] Đã trích xuất thông tin đơn hàng:', orderInfo);
      } catch (err) {
        console.error('[Content] Lỗi khi trích xuất thông tin đơn hàng:', err);
      }
      
      // TRÍCH XUẤT THÔNG TIN VẬN CHUYỂN
      const shippingInfo = {};
      try {
        // Lấy thông tin từ DOM - điều chỉnh các selectors này dựa trên cấu trúc trang thực tế
        const addressSelector = $('.ship-to-container .a-section');
        if (addressSelector.length) {
          shippingInfo.address = addressSelector.text().trim();
        }
        
        // Thêm các thông tin khác tùy theo yêu cầu
        console.log('[Content] Đã trích xuất thông tin vận chuyển:', shippingInfo);
      } catch (err) {
        console.error('[Content] Lỗi khi trích xuất thông tin vận chuyển:', err);
      }
      
      // GỬI THÔNG TIN TRỞ VỀ BACKGROUND SCRIPT
      console.log('[Content] Gửi thông tin đơn hàng và vận chuyển về background script');
      chrome.runtime.sendMessage({
        message: "orderItemInfoExtracted",
        data: {
          order: orderInfo,
          shipping: shippingInfo,
          orderId: orderInfo.id
        }
      });
      
      return;
    }
    
    // Xử lý cho trang không phải trang chi tiết đơn hàng
    // add order into not sync table
    if (!$(`#not_synced tr[data-order-id="${order.id}"]`).length) {
      $("#not_synced .om-table").append(`
               <tr data-order-id="${order.id}">
                  <td class="force-sync-item"><input class="om-checkbox" type="checkbox"></td>
                  <td> <img class="om-img-50" src="${order.img}" /></td>
                  <td>${order.id}</td>
                  <td><button class="sync-order-item om-btn loader">Sync</button></td>
               </tr>
            `);
    }
    // disable btn Sync Orders
    $("#not_synced .btn-sync-order-wrap").css("display", "none");
    // info tab ignore order
    if (!$("#ignored .om-not-found-wrap").length)
      $("#ignored .table_wrap").append(orderNotFound);
    $("#ignored .btn-revert-order-wrap").css("display", "none");
    // get mockup
    let countWaitImg = 0;
    if (!order.img) {
      while (true) {
        if (countWaitImg == 30) break;
        const img = $(
          ".a-keyvalue:first-child tbody tr:first-child td:nth-child(2) img",
        )?.attr("src");
        if (img) {
          $(`[data-order-id="${order.id}"] img`).attr(
            "src",
            img.replace("._SCLZZZZZZZ__SX55_.", "."),
          );
          break;
        }
        await sleep(500);
        countWaitImg++;
      }
    }
  } catch (error) {
    console.error('[Content] Lỗi trong appendProcessSyncOrderItem:', error);
  }
};

const setTextBtnSync = () => {
  let hasChecked = false;
  $(".force-sync-item .om-checkbox").each(function () {
    if ($(this).is(":checked")) {
      hasChecked = true;
      return false;
    }
  });
  if (hasChecked) $("#sync-order").text("Sync Selected Orders");
  else $("#sync-order").text("Sync Orders");
};

const setTextBtnRevert = () => {
  let hasChecked = false;
  $(".force-revert-item .om-checkbox").each(function () {
    if ($(this).is(":checked")) {
      hasChecked = true;
      return false;
    }
  });
  if (hasChecked) $("#revert-order").text("Revert Selected Orders");
  else $("#revert-order").text("Revert Orders");
};

// Đăng ký message listener trong phạm vi toàn cục để đảm bảo nhận tin nhắn trên mọi trang
chrome.runtime.onMessage.addListener(async function (req, sender, res) {
  const { message, data } = req || {};

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
        // Chọn checkbox "Select All"
        $(".force-sync-all-item .om-checkbox").prop("checked", true).trigger("click");
        
        // Chờ để đảm bảo UI đã cập nhật
        await sleep(1000);
      }
      
      // Click nút "Sync Orders"
      console.log("[Content] Tự động nhấn nút Sync Orders");
      $(".om-addon #not_synced #sync-order").trigger("click");
      
      // Thông báo thành công
      notifySuccess("Tự động đồng bộ đơn hàng đang được thực hiện");
    } catch (error) {
      console.error("[Content] Lỗi khi tự động đồng bộ đơn hàng:", error);
      notifyError("Không thể tự động đồng bộ đơn hàng: " + error.message);
    }
    
    return true;
  }
  
  // Xử lý tin nhắn trên bất kỳ trang nào, kể cả trang chi tiết đơn hàng
  if (message === "getOrderItemInfo") {
    console.log("[Content] Xử lý yêu cầu getOrderItemInfo:", data);
    res({ message: "received" });
    if (!data) return;
    await appendProcessSyncOrderItem(data);
    return true; // Đảm bảo kết nối message port được giữ mở cho res() bất đồng bộ
  }
  
  // Xử lý các tin nhắn phổ biến khác trên mọi trang
  if (message === "syncedOrderToMB") {
    handleSyncOrderToMBResponse(data);
    res({ message: "received" });
    return true;
  }
  
  if (message === "deleteIgnoreAmazonOrder") {
    handleDeleteIgnoreOrderResponse(data);
    return true;
  }
  
  if (message === "getProductImage") {
    handleGetProductImage(data, res);
    return true;
  }
  
  if (message === "auto_synced") {
    handleAutoSyncedResponse(res);
    return true;
  }
  
  // Đối với các messages chỉ liên quan đến trang danh sách đơn hàng
  if (!window.location.href.includes("/orders-v3") ||
      window.location.href.includes("/orders-v3/order/")) {
    return true;
  }
  
  // Các message handlers cho trang danh sách đơn hàng
  if (message === "checkSyncedOrders") {
    res({ message: "received" });
    const { orders, data: orderInfos, error } = data;
    if (error) {
      notifyError("Check synced order: " + error);
      return true;
    }
    
    const hasNotSync = appendOrdersIntoTable(orders, orderInfos);

    // if (hasNotSync) {
    //   // Auto sync
    //   await sleep(3000);
    //   const isAuto = await getStorage("_mb_auto");
    //   const autoKey = await getStorage("_mb_auto_key");
    //   if (isAuto && autoKey) {
    //     $(".om-addon #not_synced #sync-order").trigger("click");
    //     return true;
    //   }
    // }
  }
  
  return true; // Giữ kết nối message port mở cho các callbacks bất đồng bộ
});

$(document).ready(async () => {
  if (!window.location.href.includes("/orders-v3")) return;
  if (window.location.href.includes("/orders-v3/order/")) return;

  if (!(await getStorage(mbApi))) {
    return;
  }
  // wait embedded addon into amazon
  const orders = await getOrderLists();

  if (!orders.length) {
    notifyError("Order not found.");
    appendOrdersIntoTable(orders, {});
    return;
  }

  // Chỉ lưu trữ id của các đơn hàng
  const orderIds = orders.map(order => order.id);

  // Lưu trữ orderIds vào chrome.storage.local
  await chrome.storage.local.set({ UnshippedOrders: orderIds });

  // check synced orders
  chrome.runtime.sendMessage({
    message: "checkSyncedOrders",
    data: orders,
    domain: window.location.origin,
  });
  
  console.log("[Content] Đã khởi tạo addon trên trang danh sách đơn hàng");
});

// Message handler functions
const handleSyncOrderToMBResponse = (data) => {
  $(".loader").removeClass("loader");
  const { error } = data;
  if (error) notifyError(error);
  else notifySuccess("Sync order success");
};

const handleDeleteIgnoreOrderResponse = (data) => {
  $(".loader").removeClass("loader");
  const { orders, data: result, error } = data;
  if (error) {
    notifyError("Delete ignore order: " + error);
    return;
  }
  notifySuccess("Delete ignore order success.");
};

// Các handlers cho các messages đã được đăng ký ở trình nghe sự kiện chính
// Lưu ý: Listener chính đã được đăng ký ở trên. Đoạn code này chỉ là các hàm xử lý được sử dụng trong listener chính.

// Xử lý tin nhắn getProductImage
const handleGetProductImage = (data, res) => {
  res({ message: "received" });
  const doc = new DOMParser().parseFromString(data, "text/html");
  // get mockups
  let image = "";
  const mockupXpath = "#imgTagWrapperId img";
  if (doc.querySelector(mockupXpath)) {
    image = doc.querySelector(mockupXpath).getAttribute("src");
    if (image) image = image.split(".__")[0] + "." + image.split(".").pop();
    image = image.split("._")[0] + "." + image.split(".").pop();
  }
  chrome.runtime.sendMessage({
    message: "getProductImage",
    data: image ? image : "", 
    domain: window.location.origin,
  });
};

// Xử lý tin nhắn auto_synced
const handleAutoSyncedResponse = (res) => {
  res({ message: "received" });
  notifySuccess("Auto synced orders");
  $("#sync-order").removeClass("loader");
  setTimeout(() => {
    const event = new CustomEvent("mb_sync_done");
    window.dispatchEvent(event);
  }, 5 * 1000);
};

// control tabs sync orders
$(document).on("click", `.sync-order-wrap .tablinks`, function (e) {
  $(".sync-order-wrap .tabcontent").each(function () {
    $(this).css("display", "none");
  });
  $(".sync-order-wrap .tablinks").each(function () {
    $(this).removeClass("om-active om-active-tab");
  });
  $(`#${$(this).attr("data-name")}`).css("display", "block");
  $(this).addClass("om-active om-active-tab");
});

// checked force sync orders
$(document).on("click", ".force-sync-all-item .om-checkbox", function () {
  if ($(this).is(":checked"))
    $(".force-sync-item .om-checkbox").each(function () {
      if (!$(this).is(":checked")) $(this).click();
    });
  else
    $(".force-sync-item .om-checkbox").each(function () {
      if ($(this).is(":checked")) $(this).click();
    });
  setTextBtnSync();
});
// checked force sync order item
$(document).on("click", ".force-sync-item .om-checkbox", function () {
  if ($(this).is(":checked"))
    $(this).closest("tr").addClass("om-checkbox-selected");
  else $(this).closest("tr").removeClass("om-checkbox-selected");
  setTextBtnSync();
});

// checked force revert orders
$(document).on("click", ".force-revert-all-item .om-checkbox", function () {
  if ($(this).is(":checked"))
    $(".force-revert-item .om-checkbox").each(function () {
      if (!$(this).is(":checked")) $(this).click();
    });
  else
    $(".force-revert-item .om-checkbox").each(function () {
      if ($(this).is(":checked")) $(this).click();
    });
  setTextBtnRevert();
});
// checked force revert order item
$(document).on("click", ".force-revert-item .om-checkbox", function () {
  if ($(this).is(":checked"))
    $(this).closest("tr").addClass("om-checkbox-selected");
  else $(this).closest("tr").removeClass("om-checkbox-selected");
  setTextBtnRevert();
});

// click sync orders
$(document).on("click", "#sync-order", async function () {
  const orders = [];
  // check sync order specify
  let isSyncOrderSpecify = false;
  $(".force-sync-item .om-checkbox").each(function () {
    if ($(this).is(":checked")) {
      isSyncOrderSpecify = true;
      return false;
    }
  });
  $(".force-sync-item .om-checkbox").each(function () {
    const orderString = $(this).attr("data-order");
    if (!orderString) return true;
    const order = b64Decode(orderString);
    if (isSyncOrderSpecify) {
      if ($(this).is(":checked")) orders.push(order);
      return true;
    }
    orders.push(order);
  });
  if (orders.length == 0) {
    notifyError("Order not found   #sync-order .");
    return;
  }
  $(this).addClass("loader");
  for (const order of orders) {
    $(`.sync-order-item[data-order-id="${order.orderId}"]`).addClass("loader");
  }

  // send order ids to background
  chrome.runtime.sendMessage({
    message: "syncOrderToMB",
    domain: window.location.origin,
    data: {
      apiKey: await getStorage(mbApi),
      orders,
      markSynced: false,
    },
  });
});

// click force sync order
$(document).on("click", ".sync-order-item", async function () {
  const orders = [];
  const orderString = $(this).attr("data-order");
  if (!orderString) {
    notifyError("Order not found. ==== .sync-order-item");
    return;
  }
  orders.push(b64Decode(orderString));
  $(this).addClass("loader");
  $("#sync-order").addClass("loader");
  // send order ids to background
  chrome.runtime.sendMessage({
    message: "syncOrderToMB",
    domain: window.location.origin,
    data: {
      apiKey: await getStorage(mbApi),
      orders,
    },
  });
});

// click revert orders
$(document).on("click", "#revert-order", async function () {
  const orders = [];
  // check sync order specify
  let isRevertOrderSpecify = false;
  $(".force-revert-item .om-checkbox").each(function () {
    if ($(this).is(":checked")) {
      isSyncOrderSpecify = true;
      return false;
    }
  });
  $(".force-revert-item .om-checkbox").each(function () {
    const orderString = $(this).attr("data-order");
    if (!orderString) return true;
    const order = b64Decode(orderString);
    if (isRevertOrderSpecify) {
      if ($(this).is(":checked")) orders.push(order);
      return true;
    }
    orders.push(order);
  });
  if (orders.length == 0) {
    notifyError("Order not found.  #revert-order ");
    return;
  }
  $(this).addClass("loader");
  for (const order of orders) {
    $(`.revert-order-item[data-order-id="${order.orderId}"]`).addClass(
      "loader",
    );
  }

  // send order ids to background
  chrome.runtime.sendMessage({
    message: "deleteIgnoreOrder",
    domain: window.location.origin,
    data: {
      apiKey: await getStorage(mbApi),
      orders,
    },
  });
});

// click force revert order
$(document).on("click", ".revert-order-item", async function () {
  const orders = [];
  const orderString = $(this).attr("data-order");
  if (!orderString) {
    notifyError("Order not found revert-order-item");
    return;
  }
  orders.push(b64Decode(orderString));
  $(this).addClass("loader");
  $("#revert-order").addClass("loader");
  // send order ids to background
  chrome.runtime.sendMessage({
    message: "deleteIgnoreOrder",
    domain: window.location.origin,
    data: {
      apiKey: await getStorage(mbApi),
      orders,
    },
  });
});

// click sync order option
$(document).on("click", "#sync-order-option", async function () {
  const orderIdsString = $("#order_ids").val();
  if (!orderIdsString) {
    notifyError("Please enter orders ids.");
    return;
  }
  const orders = orderIdsString
    .split("\n")
    .map((o) => (o ? { id: o.trim(), img: null } : null))
    .filter(Boolean);
  if (!orders.length) {
    notifyError("Please enter orders ids.");
    return;
  }

  const options = {
    isAlwayMapping: false,
    isMultiProduct: false,
    isSplitOrder: false,
    numberOrdersSplit: 0,
    qtyPreItem: 0,
    applyAllItems: true,
  };
  if ($("#alway_mapping").is(":checked")) options.isAlwayMapping = true;
  if ($("#is_multi_product").is(":checked")) options.isMultiProduct = true;
  if ($("#split_order").is(":checked")) {
    let numberItem = parseInt(
      $("#number_item_of_each_order").val()
        ? $("#number_item_of_each_order").val()
        : 1,
    );
    let qtyPreItem = parseInt(
      $("#qty_per_item").val() ? $("#qty_per_item").val() : 1,
    );
    if (numberItem > 1) {
      options.isSplitOrder = true;
      options.numberOrdersSplit = numberItem;
      options.qtyPreItem = qtyPreItem;
      options.applyAllItems = !!$("#apply_all_items").is(":checked");
    }
  }

  $(this).addClass("loader");
  // send order ids to background
  chrome.runtime.sendMessage({
    message: "syncOrderToMB",
    domain: window.location.origin,
    data: {
      apiKey: await getStorage(mbApi),
      orders,
      options,
    },
  });
});

// amzapi-76b801cd-e694-40fc-94f2-e357a8e2443e
window.addEventListener("mb_sync_now", async (event) => {
  if (event?.detail?.mb_api) {
    await setStorage("_mb_auto", true);
    await setStorage("_mb_auto_key", event?.detail?.mb_api?.amazon);
    await setStorage(mbApi, event?.detail?.mb_api?.amazon);
    chrome.runtime.sendMessage({
      message: "autoReady",
      domain: window.location.origin,
      apiKey: event?.detail?.mb_api?.amazon,
    });
  }
});
