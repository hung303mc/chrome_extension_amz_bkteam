const isProduction = true;
const MBUrl = "http://bkteam.top/dungvuong-admin/api/Order_Sync_Amazon_to_System_Api_v2.php";
//  "http://127.0.0.1:8080/query";
const AMZDomain = "https://sellercentral.amazon.com";
const AMZDomains = [
  "https://sellercentral.amazon.com",
  "https://sellercentral-europe.amazon.com",
  "https://sellercentral.amazon.de",
  "https://sellercentral.amazon.co.uk/",
];

let doingAuto = false;
let globalDomain = AMZDomain;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isImage = (filename) => {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(filename);
};

const isCustomImgLabel = (label) => {
  return /(photo|image|picture)/.test(label.toLowerCase());
};

const stopInteval = (params) => {
  clearInterval(params);
};

var activeTabId;
chrome.tabs.onActivated.addListener(function (activeInfo) {
  activeTabId = activeInfo?.tabId;
});

const sendMessage = (tabId, message, data) => {
  let timeOut = 0;
  let start = setInterval(() => {
    timeOut++;
    // chrome.tabs.sendMessage(
    //    tabId,
    //    {
    //       message,
    //       data,
    //    },
    //    (resp) => {
    //       if (!chrome.runtime.lastError && resp?.message === "received")
    //          stopInteval(start);
    //    },
    // );

    chrome.tabs.get(tabId, function (tabInner) {
      if (tabInner) {
        chrome.tabs.sendMessage(
          tabId,
          {
            message,
            data,
          },
          (resp) => {
            if (!chrome.runtime.lastError && resp?.message === "received")
              stopInteval(start);
          },
        );
      } else {
        chrome.tabs.get(activeTabId, function (tab) {
          if (tab?.id) {
            chrome.tabs.sendMessage(
              tab?.id,
              {
                message,
                data,
              },
              (resp) => {
                if (!chrome.runtime.lastError && resp?.message === "received")
                  stopInteval(start);
              },
            );
          }
        });
      }
    });

    if (timeOut == 120) stopInteval(start);
  }, 1000);
};

const sendToContentScript = (msg, data) =>
  new Promise(async (resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length || !tabs[0].id) {
        if (activeTabId) {
          chrome.tabs.get(activeTabId, function (tab) {
            if (tab) {
              sendMessage(tab.id, msg, data);
              return resolve(true);
            }
            return resolve(false);
          });
        }
        return resolve(false);
      }
      sendMessage(tabs[0].id, msg, data);
      resolve(true);
    });
  });

const getMBApiKey = () =>
  new Promise(async (resolve) => {
    await chrome.storage.local.get("MBApi").then((result) => {
      if (result["MBApi"]) {
        resolve(result["MBApi"]);
      }
    });
    const isSended = await sendToContentScript("getApiKey", null);
    if (!isSended) resolve(null);
    chrome.runtime.onMessage.addListener(async (req, sender, res) => {
      const { message, data } = req || {};
      if (message === "getApiKey" && data) resolve(data);
    });
  });

const sendRequestToMB = async (endPoint, apiKey, data) => {
  const res = {
    error: null,
  };
  if (!apiKey) apiKey = await getMBApiKey();

  let url = MBUrl;
  if (endPoint) {
    url += `?case=${endPoint}`;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "merchantId": apiKey, // Sử dụng merchantId như một apiKey
      },
      body: data,
    });
    return await resp.json();
  } catch (error) {
    res.error = error.message;
  }
  return res;
};

const redirectToNewURL = async (fn) => {
  let querying = chrome.tabs.query({ currentWindow: true });
  querying.then(fn);
  return;
};

const openOrderPage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/orders-v3?page=1`;
  chrome.tabs.query({}, (tabs) => {
    let found = false;

    for (let tab of tabs) {
      if (found) break;
      if (tab?.url?.includes("orders-v3")) {
        found = tab.id;
        break;
      }
    }

    if (found) {
      chrome.tabs.update(found, {
        active: true,
        url,
      });
    } else {
      chrome.tabs.create({
        active: true,
        url,
      });
    }
  });
};

const openHomePage = () => {
  if (!globalDomain.includes("sellercentral")) {
    return;
  }
  const url = `${globalDomain}/home`;
  chrome.tabs.query({}, (tabs) => {
    let found = false;

    for (let tab of tabs) {
      if (found) break;
      if (tab?.url?.includes("/home")) {
        found = tab.id;
        break;
      }
    }

    if (found) {
      chrome.tabs.update(found, {
        active: true,
        url,
      });
    } else {
      chrome.tabs.create({
        active: true,
        url,
      });
    }
  });
};

const downloadFiles = async (fieldValues, apiKey) => {
  try {
    const result = await Promise.allSettled(
        fieldValues.map(async (item) => {
          const fileKey =
              Array.from({ length: 2 })
                  .map(() => Math.random().toString(36).slice(2))
                  .join("_") + "_.jpg";

          const req = new Request(item.fileUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000 * 300); // 5m
          const res = await fetch(req, { signal: controller.signal });

          if (res.ok) {
            const fileBlob = await res.blob();
            if (fileBlob.type && fileBlob.size) {
              // Sử dụng FileReader để chuyển đổi Blob thành chuỗi base64
              const reader = new FileReader();

              return new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                  const base64Data = reader.result.split(',')[1]; // Lấy phần base64 sau 'data:image/jpeg;base64,'

                  // Chuẩn bị payload JSON để gửi qua sendRequestToMB
                  const payload = {
                    fileName: fileKey,
                    fileData: base64Data, // Sử dụng chuỗi base64 đã chuyển đổi
                    mimeType: fileBlob.type,
                    folder: "desgin_images_data", // Chỉ cần subfolder tới đây
                  };

                  // Gửi yêu cầu qua sendRequestToMB
                  const uploadResponse = await sendRequestToMB("createUploadUrl", apiKey, JSON.stringify(payload));

                  if (uploadResponse && uploadResponse.fileUrl) {
                    resolve({ [item.name]: uploadResponse.fileUrl });
                  } else {
                    console.error("Upload failed:", uploadResponse.error || "Unknown error");
                    reject(null);
                  }
                };

                reader.onerror = (error) => {
                  console.error("Error reading file:", error);
                  reject(null);
                };

                reader.readAsDataURL(fileBlob); // Đọc file dưới dạng Data URL (base64)
              });
            }
          }

          return null;
        })
    );

    return result
        .filter((i) => i.status === "fulfilled")
        .map(({ value }) => value);
  } catch (err) {
    console.log("download file error: ", err);
  }

  return [];
};



let stopProcess = false;
// capture event from content script
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
  const { message, data, domain: oldDomain } = req || {};
  let domain = AMZDomain;
  if (AMZDomains.includes(oldDomain)) {
    domain = oldDomain;
  }
  globalDomain = domain;

  if (message === "listedSaveApiKey") {
    sendToContentScript("listedSaveApiKey", null);
  }
  if (message === "stopProcess") {
    stopProcess = true;
  }
  if (message === "checkSyncedOrders") {
    const query = JSON.stringify({
      originIds: JSON.stringify(data.map((o) => o["id"]))
    });
    const result = await sendRequestToMB("checkSyncedOrders", null, query);
    const resp = {
      orders: data,
      data: result.data,
      error: result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null,
    };
    // get img for order
    for (const order of data) {
      if (!Object.keys(resp.data).length) break;
      const orderInfo = resp.data[order["id"]];
      // only get product image if order not synced and order has't image
      if (!orderInfo || orderInfo.status != "Not Synced") continue;
      const { img, productUrl } = order;
      if (img) continue;
      let mockup = await getProductImg(productUrl);
      order.img = mockup;
    }
    sendMessage(sender.tab.id, "checkSyncedOrders", resp);
  }
  if (message === "syncOrderToMB") {
    const { apiKey, orders, options, markSynced } = data;
    if (!orders || !orders.length) return;
    await handleSyncOrders(orders, options, apiKey, domain);
    if (markSynced) {
      sendToContentScript("auto_synced");
    }
  }
  if (message === "deleteIgnoreOrder") {
    const { apiKey, orders } = data;
    if (!apiKey || !orders || !orders.length || !domain) return;
    let query = JSON.stringify({
      operationName: "deleteIgnoreAmazonOrder",
      variables: {
        originOrderIds: orders.map((o) => o.id),
      },
      query:
        "mutation deleteIgnoreAmazonOrder($originOrderIds: [ID!]!) {deleteIgnoreAmazonOrder(originOrderIds: $originOrderIds)}",
    });
    const result = await sendRequestToMB(null, apiKey, query);
    const resp = {
      orders,
      data: result.data ? result.data.deleteIgnoreAmazonOrder : null,
      error: result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null,
    };
    sendMessage(sender.tab.id, "deleteIgnoreAmazonOrder", resp);
    await sleep(3000);
    chrome.tabs.update({
      // url: `${AMZDomain}/orders-v3?page=1`,
      url: `${domain}/orders-v3?page=1`,
    });
  }
  if (message === "forceAddTracking") {
    // const url = `${AMZDomain}/orders-v3/order/${data.orderId}/confirm-shipment`;
    const url = `${domain}/orders-v3/order/${data.orderId}/confirm-shipment`;
    chrome.tabs.update({ url }, (tab) =>
      sendMessage(tab.id, "forceAddTracking", data),
    );
  }
  if (message === "addedTrackingCode") {
    const { trackingCode, orderId } = data;

    // Nếu tracking code không phải là empty, tiến hành verify
    if (trackingCode && trackingCode.trim() !== "") {
      const url = `${domain}/orders-v3/order/${orderId}`;
      chrome.tabs.update({ url }, (tab) =>
          sendMessage(tab.id, "verifyAddTracking", data),
      );
    } else {
      console.log(`Tracking code is empty for order ${orderId}. No need to verify.`);
    }
  }

  if (message === "verifyAddTracking") {
    const { status, orderId, trackingCode, message: verificationMessage } = data;

    // Kiểm tra xem việc thêm tracking có thành công không
    if (status === "success") {
      const query = JSON.stringify({
        orderId,
        trackingCode,
      });
      const resAddTrack = await sendRequestToMB("addedTrackingCode", null, query);
    } else {
      // Ghi log hoặc thực hiện các hành động khác nếu cần thiết khi tracking không thành công
      console.warn(`Failed to add tracking for order ${orderId}: ${verificationMessage}`);
    }
  }

  if (message === "runUpdateGrandTotal") {
    let query = JSON.stringify({
      query: `
            query {
               getAmazonOrdersNeedUpdateGrandTotalV2{
                  nodes{
                     amazonOrderId
                  }
               }
            }`,
    });
    const result = await sendRequestToMB(null, null, query);
    let error = null;
    if (result.error || result.errors?.[0].message) {
      error = result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null;
      sendMessage(sender.tab.id, "updateGrandTotal", { error });
      return;
    }
    const orderIds =
      result.data.getAmazonOrdersNeedUpdateGrandTotalV2.nodes.map(
        (i) => i.amazonOrderId,
      );

    if (orderIds.length) {
      await handleUpdateGrandTotal_NEW(orderIds, domain);
    }
    sendMessage(sender.tab.id, "updateGrandTotal", { error });
  }

  if (message === "runUpdateTracking") {
    const apiKey = await getMBApiKey();
    let query = JSON.stringify({
      input: apiKey
    });

    const result = await sendRequestToMB("OrderNeedUpdateTracking", apiKey, query);
    let error = null;
    if (result.error || result.errors?.[0].message) {
      error = result.error
          ? result.error
          : result.errors
              ? result.errors[0].message
              : null;
      sendMessage(sender.tab.id, "updateTracking", { error });
      return;
    }
    const orders = result.data;

    // Lấy UnshippedOrders từ chrome.storage.local
    const UnshippedOrders = await new Promise((resolve) => {
      chrome.storage.local.get("UnshippedOrders", (result) => {
        resolve(result.UnshippedOrders || []);
      });
    });

    // Hàm xử lý từng order theo thứ tự
    const processOrder = async (index) => {
      if (index >= orders.length) {
        // Khi tất cả các order đã được xử lý, gửi message "updateTracking"
        sendMessage(sender.tab.id, "updateTracking", { error });
        return;
      }

      const order = orders[index];

      let carrier = order.carrier;
      if (carrier) {
        carrier = detectCarrier(carrier.toLowerCase());
      }

      if (!carrier) {
        carrier = detectCarrier(detectCarrierCode(order.tracking));
      }

      order.carrier = carrier;

      let url;
      if (UnshippedOrders.includes(order.orderId)) {
        // Nếu orderId có trong UnshippedOrders, thực hiện logic cập nhật tracking
        url = `${domain}/orders-v3/order/${order.orderId}/confirm-shipment`;
        chrome.tabs.update({ url }, (tab) =>
            sendMessage(tab.id, "forceAddTracking", order)
        );
      } else {
        // Nếu orderId không có trong UnshippedOrders, thực hiện logic chỉnh sửa tracking
        url = `${domain}/orders-v3/order/${order.orderId}/edit-shipment`;
        chrome.tabs.update({ url }, (tab) =>
            sendMessage(tab.id, "forceEditTracking", order)
        );
      }

      // Nghe tín hiệu từ `verifyAddTracking` sau khi tracking đã được thêm
      chrome.runtime.onMessage.addListener(async (req, sender, res) => {
        const { message, data } = req || {};
        if (message === "verifyAddTracking" && data.orderId === order.orderId) {
          // Sau khi verify thành công, tiến tới order tiếp theo
          await sleep(5000);  // Thời gian chờ xử lý xong
          processOrder(index + 1);  // Xử lý order tiếp theo
        }
      });
    };

    // Bắt đầu xử lý từ order đầu tiên
    processOrder(0);
  }


  if (message === "getProductImage") {
    productImg = data;
  }

  // Auto sync order
  if (message === "autoReady") {
    if (doingAuto) return;

    doingAuto = true;
    openOrderPage();
    return;
  }

  // Sync Files
  if (message === "syncFiletoMB") {
    if (!data) return;
    const { apiKey, ...rest } = data;

    if (rest.fieldValues && rest.fieldValues.length > 0) {
      const fileDownloaded = await downloadFiles(rest.fieldValues, apiKey);
      if (fileDownloaded.length > 0) {
        const ob = fileDownloaded.reduce((acc, cur) => {
          acc = { ...acc, ...cur };
          return acc;
        }, {});

        for (let i = 0; i < rest.fieldValues.length; i++) {
          let item = rest.fieldValues[i];
          const val = ob[item.name];
          if (val) {
            item = {
              ...item,
              fileUrl: val,
            };
          }

          rest.fieldValues[i] = item;
        }
      }
    }

    let query = JSON.stringify({
      operationName: "syncAmazonPersonalizedFile",
      variables: {
        input: rest,
      },
      query:
        "mutation syncAmazonPersonalizedFile($input: AmazonPersonalizedFileInput!) {syncAmazonPersonalizedFile(input: $input)}",
    });

    const result = await sendRequestToMB(null, null, query);

    let error = "";
    if (result && result.syncAmazonPersonalizedFile === false) {
      error = "Could not sync file to MB";
    }

    if (error || result.error || result.errors?.[0].message) {
      error = result.error
        ? result.error
        : result.errors
        ? result.errors[0].message
        : null;
      sendMessage(sender.tab.id, "syncFileCompleted", { error });
      return;
    }
    sendMessage(sender.tab.id || activeTabId, "syncFileCompleted", {});
  }
});

// capture event from popup
chrome.runtime.onMessage.addListener((req, sender, res) => {
  const { message, data } = req || {};
  switch (message) {
    case "saveApiKey":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.length > 0 && tabs[0].id) {
          // send order info to content script
          sendMessage(tabs[0].id, "popupSaveApiKey", data);
        }
      });
      break;
    default:
      break;
  }
});

// capture event from devtool
var OrderInfo = {
  locked: false,
  orderId: null,
  order: null,
  shipping: null,
};
const resetOrderInfo = () =>
  (OrderInfo = {
    locked: false,
    orderId: null,
    order: null,
    shipping: null,
  });

var OrderGrandTotal = {
  locked: false,
  isListed: false,
  orderId: null,
  grandTotal: 0,
  marketplaceFee: 0,
};
const resetOrderGrandTotal = () =>
  (OrderGrandTotal = {
    locked: false,
    isListed: false,
    orderId: null,
    grandTotal: 0,
    marketplaceFee: 0,
  });
var CustomOrder = {
  locked: false,
  isListed: false,
  orderId: null,
  itemId: null,
  personalizedInfo: null,
};
const resetCustomOrder = () =>
  (CustomOrder = {
    locked: false,
    isListed: false,
    orderId: null,
    itemId: null,
    personalizedInfo: null,
  });
chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== "captureRequest") return;
  port.onMessage.addListener((msg) => {
    return;
    const { message, endPoint, data } = msg || {};
    if (message !== "response" || !data) return;
    // capture order info
    if (endPoint.includes("/orders-api/order/")) {
      const { order } = data;
      if (!order || order["amazonOrderId"] != OrderInfo.orderId) return;
      OrderInfo.order = order;
      saveLog("orderLog - dev tool", { type: "Order Information", data: order });
    }
    // capture shipping order info
    if (endPoint.includes("/orders-st/resolve")) {
      if (!data || !data[OrderInfo.orderId]) return;
      OrderInfo.shipping = data[OrderInfo.orderId].address;
    }
    // capture order grand totals
    if (
      endPoint.includes("payments/api/events-view") &&
      endPoint.includes(OrderGrandTotal.orderId)
    ) {
      OrderGrandTotal.isListed = true;
      if (!data) return;
      if (!data.tableRows || !data.tableRows.length) {
        OrderGrandTotal.grandTotal = -1;
        OrderGrandTotal.marketplaceFee = -1;
        return;
      }
      for (const row of data.tableRows) {
        if (row.tableCells?.length) {
          for (const item of row.tableCells) {
            if (item.columnIdentifier === "TOTAL") {
              let grandTotals = item.value.linkBody.currency.amount;
              if (grandTotals) OrderGrandTotal.grandTotal = grandTotals;
            }
            if (item.columnIdentifier === "FEES_TOTAL") {
              let marketFee = item.value.currency.amount;
              if (marketFee < 0) marketFee = marketFee * -1;
              if (marketFee >= 0) OrderGrandTotal.marketplaceFee = marketFee;
            }
          }
        }
      }
    }
    // capture personalized info
    if (
      endPoint.includes("/gestalt/ajax/fulfillment/init") &&
      endPoint.includes(CustomOrder.orderId) &&
      endPoint.includes(CustomOrder.itemId)
    ) {
      if (!data) return;
      CustomOrder.personalizedInfo = data;
    }
  });
});

// Hàm lưu log vào Chrome Storage
const saveLog = (key, message) => {
  chrome.storage.local.get([key], (result) => {
    const logs = result[key] || [];
    logs.push(message);
    const data = {};
    data[key] = logs;
    chrome.storage.local.set(data);
  });
};

const PT_ADDRESS = /\s(unit|stage|apt|ln|ste|ave)\s/i;
const getOrderInfo = async (order, shipping) => {

  // Lưu log vào localStorage
  // saveLog("orderLog", { type: "Order Information", data: order });
  // saveLog("shippingLog", { type: "Shipping Information", data: shipping });


  if (
    !order ||
    !shipping ||
    typeof order !== "object" ||
    typeof shipping !== "object"
  )
    return null;

  // Lấy MB API Key để sử dụng làm merchantId
  const merchantId = await getMBApiKey();

  let line1 = shipping.line1 || "";
  let line2 = shipping.line2 || "";
  const matcher = line1.match(PT_ADDRESS);
  if (matcher && matcher.index != null) {
    const remain = line1.substring(matcher.index);
    line1 = line1.substring(0, matcher.index);
    line2 = [remain.trim(), line2.trim()].filter(Boolean).join(" ");
  }

  const info = {
    orderId: order.amazonOrderId,
    merchantId,  // Thêm merchantId vào info
    items: [],
    shipping: {
      name: shipping.name,
      address: line1,
      address2: line2,
      city: shipping.city,
      state: shipping.stateOrRegion,
      zipCode: shipping.postalCode,
      phone: shipping.phoneNumber,
      country: shipping.countryCode,
    },
    discountTotal: 0,
    itemsTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal: 0,
    shippingService: order.shippingService,
    orderCreated: null,
    orderShipByDate: null,
    orderDeliveryByDate: null,
  };
  if (!info.shipping.address && info.shipping.address2) {
    info.shipping.address = info.shipping.address2;
    info.shipping.address2 = null;
  }
  if (order.orderCost) {
    const cost = order.orderCost;
    if (cost.PromotionTotal?.Amount)
      info.discountTotal = cost.PromotionTotal.Amount;
    if (cost.Total?.Amount) info.itemsTotal = cost.Total.Amount;
    if (cost.ShippingTotal?.Amount)
      info.shippingTotal = cost.ShippingTotal.Amount;
    if (cost.TaxTotal?.Amount) info.taxTotal = cost.TaxTotal.Amount;
    if (cost.GrandTotal?.Amount) info.grandTotal = cost.GrandTotal.Amount;
  }
  const getDate = (dateNumber, isPurchase) => {
    let dateStr = String(dateNumber).replace(",", "").replace(".", "").trim();
    if (dateStr.length < 13) {
      const limitAdd = 13 - dateStr.length;
      for (let i = 0; i < limitAdd; i++) {
        dateStr += "0";
      }
    }
    if (isPurchase) {
      // time locale
      return getRealTime(dateStr);
    }

    const formatDate = new Date(
      new Date(parseInt(dateStr)).toLocaleString("en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
      }),
    ).setHours(-17, 00, 00);
    return new Date(formatDate).toISOString();
  };
  info.orderCreated = getDate(order.purchaseDate, true);
  info.orderShipByDate = getDate(order.latestShipDate);
  info.orderDeliveryByDate = getDate(order.latestDeliveryDate);
  const productWithContent = await getProductInfoString(order.orderItems);
  for (const item of order.orderItems) {
    if (item.QuantityOrdered < 1) continue; // case: qty = 0 => order can cancelled
    const newItem = {
      lineId: item.OrderItemId,
      name: item.Title,
      sku: item.SellerSKU,
      asin: item.ASIN,
      alwayMapping: false,
      isPersonalized: false,
      personalized: [],
      personalizedPreview: null,
      qty: item.QuantityOrdered,
      price: 0,
      itemSubtotal: 0,
      itemShippingTotal: 0,
      itemTaxTotal: 0,
      tax: 0,
      itemTotal: 0,
      itemDiscountTotal: 0,
      itemShippingTaxTotal: 0,
      itemMarketplaceFee: 0,
      mockup: item.ImageUrl
        ? [item.ImageUrl.replace("._SCLZZZZZZZ__SX55_.", ".")]
        : null,
      allVariations: {},
      variation: [],
    };
    // get personalized
    if (item.ItemCustomizations?.ModificationGroups?.length) {
      newItem.alwayMapping = true;
      newItem.isPersonalized = true;
      for (const gr of item.ItemCustomizations.ModificationGroups) {
        if (gr.Modifications?.length > 0) {
          for (const ct of gr.Modifications) {
            newItem.personalized.push({
              name: ct.Name,
              value: ct.Value,
            });
          }
        }
      }
    }
    // get item cost
    if (item.ItemCost) {
      const cost = item.ItemCost;
      if (cost.UnitPrice?.Amount) newItem.price = cost.UnitPrice.Amount;
      if (cost.Subtotal?.Amount) newItem.itemSubtotal = cost.Subtotal.Amount;
      if (cost.Shipping?.Amount)
        newItem.itemShippingTotal = cost.Shipping.Amount;
      if (cost.Tax?.Amount) {
        newItem.itemTaxTotal = cost.Tax.Amount;
        newItem.tax = cost.Tax.Amount;
      }
      if (cost.Total?.Amount) newItem.itemTotal = cost.Total.Amount;
      if (cost.Promotion?.Amount)
        newItem.itemDiscountTotal = cost.Promotion.Amount;
      if (cost.ShippingTax?.Amount)
        newItem.itemShippingTaxTotal = cost.ShippingTax.Amount;
      if (cost.PaymentMethodFee?.Amount)
        newItem.itemMarketplaceFee = cost.PaymentMethodFee.Amount;
    }
    // get product info
    const productInfo = await getProductInfo(
      item.ProductLink,
      newItem.asin,
      productWithContent,
    );
    if (productInfo) {
      newItem.allVariations = productInfo.variantItems;
      newItem.variation = productInfo.variantItem;
      let isMultiProduct = false;
      for (const v of productInfo.variantItem) {
        if (v.value?.toLowerCase()?.includes("multi")) {
          isMultiProduct = true;
          break;
        }
      }
      if (isMultiProduct && newItem.allVariations.asinVariationValues)
        newItem.allVariations.asinVariationValues = [];
    }
    info.items.push(newItem);
  }
  return info;
};

var productImg = null;
const getProductImg = async (url) => {
  let img = "";
  try {
    const htmlString = await fetch(url).then((res) => res.text());
    if (!htmlString) return img;
    sendToContentScript("getProductImage", htmlString);
    let timeOut = 0;
    while (true) {
      if (productImg != null || timeOut == 60) break;
      await sleep(500);
    }
    img = productImg;
    productImg = null;
  } catch (error) {}
  return img;
};

const getProductInfoString = async (items) => {
  const res = {};
  if (!items || !Array.isArray(items) || items.length === 0) return {};

  const urls = Array.from(
    new Set(items.map((i) => i?.ProductLink)).values(),
  ).filter(Boolean);

  try {
    const data = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(url);
        return { [url]: await res.text() };
      }),
    );

    return data.reduce((acc, cur) => ({ ...acc, ...cur }), {});
  } catch {}

  return res;
};

const getProductInfo = async (url, asinCurrent, productWithContent) => {
  // amzapi-1590c83f-eef4-4fcb-8b64-b10474e0dee2
  // 111-7907232-8321008
  const res = {
    mockups: [],
    variantItems: {
      variationValues: [],
      attributes: [],
      asinVariationValues: [],
    },
    variantItem: [],
  };
  try {
    let htmlString = productWithContent[url];
    if (!htmlString) {
      htmlString = await fetch(url).then((res) => res.text());
    }
    if (!htmlString) return res;
    // get variants info
    if (
      !htmlString.includes("var dataToReturn =") ||
      !htmlString.includes("return dataToReturn;")
    )
      return res;
    const indexStartCut = htmlString.indexOf("var dataToReturn =");
    const indexEndCut = htmlString.indexOf("return dataToReturn;");
    let dataString = htmlString
      .slice(indexStartCut, indexEndCut)
      .split(";")[0]
      .replace("var dataToReturn =", "")
      .trim();
    if (!dataString) return res;
    const getObjValue = (key, lastIndex) => {
      if (!dataString.includes(key)) return null;
      let valueStr = dataString.split(key)[1];
      let endCut = valueStr.indexOf(lastIndex) + lastIndex.length;
      valueStr = valueStr.slice(0, endCut).trim();
      if (valueStr.slice(-1) === ",") valueStr = valueStr.slice(0, -1);
      return JSON.parse(valueStr);
    };
    // get variant value
    const variantValues = getObjValue('"variationValues" :', "]},\n");
    for (const [key, values] of Object.entries(variantValues)) {
      res.variantItems.variationValues.push({
        slug: key,
        options: values,
      });
    }
    // get attribute
    const attrValues = getObjValue('"variationDisplayLabels" :', "},\n");
    for (const [key, values] of Object.entries(attrValues)) {
      res.variantItems.attributes.push({
        slug: key,
        label: values,
      });
    }
    // get asin Variation Values
    const dimensions = getObjValue('"dimensions" :', "],\n");
    const dimensionValues = getObjValue(
      '"dimensionValuesDisplayData" :',
      "]},\n",
    );
    const colorImages = getObjValue('"colorImages" :', "]},\n");
    if (!dimensionValues) return res;
    for (const asin in dimensionValues) {
      if (asin == asinCurrent) {
        for (const keyName of dimensions) {
          res.variantItem.push({
            option: keyName,
            value: dimensionValues[asin][0],
          });
        }
        continue;
      }
      let item = {
        asin,
        attributes: [],
        mockup: null,
      };
      let checkName = "";
      for (const keyName of dimensions) {
        if (keyName != "size_name") checkName += ` ${dimensionValues[asin][0]}`;
        item.attributes.push({
          slug: keyName,
          option: dimensionValues[asin][0],
        });
      }
      if (colorImages) {
        for (const keyColor in colorImages) {
          if (
            checkName.trim().replace(/\s/g, "").replace(/\\/g, "") ===
            keyColor.replace(/\s/g, "").replace(/\\/g, "")
          )
            if (colorImages[keyColor][0].hiRes)
              item.mockup = colorImages[keyColor][0].hiRes;
        }
      }
      if (!item.mockup && res.mockups.length) item.mockup = res.mockups[0];
      res.variantItems.asinVariationValues.push(item);
    }

    for (const attr of res.variantItems.attributes) {
      for (const v of res.variantItem) {
        if (attr.slug === v.option) v.option = attr.label;
      }
    }
  } catch (error) {}
  return res;
};

const getCustomImage = (data) => {
  const customImages = [];
  if (!data) return customImages;
  const { buyerImageUrlMap, customizationData: customDataString } = data;
  if (!buyerImageUrlMap || !customDataString) return customImages;
  const { children: customWraps } = JSON.parse(customDataString);
  if (!customWraps || !customWraps.length) return customImages;
  // get list custom image info
  const getImage = (customList) => {
    if (customList.type == "FlatContainerCustomization") {
      for (const flatItem of customList.children) {
        if (flatItem.type === "PlacementContainerCustomization")
          for (const item of flatItem.children) {
            if (item?.type === "ImageCustomization") {
              if (buyerImageUrlMap[item.identifier]) {
                customImages.push({
                  label: item.label,
                  img: buyerImageUrlMap[item.identifier],
                });
              }
            }
          }
      }
    }
  };
  for (const customWrap of customWraps) {
    if (customWrap.type == "FlatContainerCustomization") {
      getImage(customWrap);
    }
    if (customWrap.type === "PreviewContainerCustomization") {
      for (const previewItem of customWrap.children) {
        if (previewItem.type == "FlatContainerCustomization") {
          getImage(previewItem);
        }
      }
    }
  }
  return customImages;
};

const handleSyncOrders = async (orders, options, apiKey, domain) => {
  const results = [];
  resetOrderInfo();
  if (!apiKey) apiKey = await getMBApiKey();
  stopProcess = false;
  const addMockups = {};
  for (let i = 0; i < orders.length; i++) {
    if (OrderInfo.locked) break;
    if (stopProcess) break;
    const order = orders[i];
    OrderInfo.orderId = order["id"];
    OrderInfo.locked = true;
    // const url = `${AMZDomain}/orders-v3/order/${order["id"]}`;
    const url = `${domain ? domain : AMZDomain}/orders-v3/order/${order["id"]}`;
    // chrome.tabs.update({ url }, (tab) => {
    //    if (tab?.id) {
    //       sendMessage(tab.id, "getOrderItemInfo", {
    //          order,
    //          label: `Syncing orders: ${i + 1}/${orders.length}`,
    //       });
    //    } else if (activeTabId) {
    //       chrome.tabs.get(activeTabId, function (tabInner) {
    //          if (tabInner) {
    //             chrome.tabs.update(
    //                activeTabId || tabInner?.id,
    //                { url },
    //                (tab) => {
    //                   sendMessage(tab.id, "getOrderItemInfo", {
    //                      order,
    //                      label: `Syncing orders: ${i + 1}/${orders.length}`,
    //                   });
    //                },
    //             );
    //          }
    //       });
    //    }
    // });

    function redirectToOrderDetail(tabs) {
      let tab = (tabs || []).find((item) => item?.active);
      if (tab?.id) {
        chrome.tabs.update(tab.id, { url }, (tabInner) => {
          if (tabInner?.id) {
            sendMessage(tabInner.id, "getOrderItemInfo", {
              order,
              label: `Syncing orders: ${i + 1}/${orders.length}`,
            });
          }
        });
      } else if (activeTabId) {
        chrome.tabs.get(activeTabId, function (tabInner) {
          if (tabInner) {
            chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
              sendMessage(tab.id, "getOrderItemInfo", {
                order,
                label: `Syncing orders: ${i + 1}/${orders.length}`,
              });
            });
          }
        });
      }
    }

    await redirectToNewURL(redirectToOrderDetail);
    // wait info order
    let countSleep = 0;
    while (true) {
      if ((OrderInfo.order && OrderInfo.shipping) || countSleep == 30) break;
      countSleep++;
      await sleep(1000);
    }
    if (!OrderInfo.order || !OrderInfo.shipping) {
      sendToContentScript("syncOrderToMB", {
        data: false,
        error: "Could not get order info or shipping info.",
      });
      await sleep(1000);
      resetOrderInfo();
      continue;
    }
    const orderInfo = await getOrderInfo(OrderInfo.order, OrderInfo.shipping);
    if (!orderInfo) {
      sendToContentScript("syncOrderToMB", {
        data: false,
        error: "Could not get order info.",
      });
      await sleep(1000);
      resetOrderInfo();
      continue;
    }
    // check all item are same product
    let isSameProduct = orderInfo.items.every(
      (item, i, items) => item.asin === items[0].asin,
    );
    let customItems = [];
    for (const item of orderInfo.items) {
      // check has image per order item
      if (!item.mockup) {
        if (orderInfo.items.length == 1 || isSameProduct) {
          item.mockup = [order["img"]];
        } else {
          // check the same product that has image
          if (addMockups[item.asin]) {
            item.mockup = addMockups[item.asin];
          } else {
            item.mockup = [
              await getProductImg(
                `https://www.amazon.com/gp/product/${item.asin}`,
              ),
            ];
          }
        }
      }
      addMockups[item.asin] = item.mockup;
      // check order has custom info
      if (!item.isPersonalized || item.personalized.length === 0) continue;
      let isCustomImage = false;
      for (const personal of item.personalized) {
        if (!personal || !personal.name) continue;
        if (isCustomImgLabel(personal.name) || isImage(personal.value)) {
          isCustomImage = true;
          break;
        }
      }
      customItems.push({
        orderId: order.id,
        itemId: item.lineId,
        // url: `${AMZDomain}/gestalt/fulfillment/index.html?orderId=${orderInfo.orderId}&orderItemId=${item.lineId}`,
        url: `${
          domain ? domain : AMZDomain
        }/gestalt/fulfillment/index.html?orderId=${
          orderInfo.orderId
        }&orderItemId=${item.lineId}`,
        hasCustomImg: isCustomImage,
      });
    }
    if (customItems.length > 0) {
      resetCustomOrder();
      for (const custom of customItems) {
        if (CustomOrder.locked) break;
        CustomOrder.locked = true;
        CustomOrder.orderId = orderInfo.orderId;
        CustomOrder.itemId = custom.itemId;

        chrome.tabs.update({ url: custom.url }, (tab) => {
          if (tab?.id) {
            sendMessage(tab.id, "getOrderItemInfo", {
              order,
              label: `Syncing orders: ${i + 1}/${orders.length}`,
            });
          } else {
            chrome.tabs.get(activeTabId, function (tabInner) {
              if (tabInner) {
                chrome.tabs.update(
                  activeTabId || tabInner?.id,
                  { url: custom.url },
                  (tab) => {
                    sendMessage(tab?.id, "getOrderItemInfo", {
                      order,
                      label: `Syncing orders: ${i + 1}/${orders.length}`,
                    });
                  },
                );
              }
            });
          }
        });
        // wait custom info
        let countSleep = 0;
        while (true) {
          if (CustomOrder.personalizedInfo || countSleep == 30) break;
          countSleep++;
          await sleep(1000);
        }
        const handelErr = async () => {
          sendToContentScript("syncOrderToMB", {
            data: false,
            error: "Could not get personalized info.",
          });
          await sleep(3000);
          resetCustomOrder();
        };
        if (!CustomOrder.personalizedInfo) {
          handelErr();
          continue;
        }
        if (
          !CustomOrder.personalizedInfo ||
          !CustomOrder.personalizedInfo.fulfillmentData
        ) {
          handelErr();
          continue;
        }
        const { customizationData, previewSnapshotUrlMap } =
          CustomOrder.personalizedInfo.fulfillmentData;
        // get alls custom field
        const customFiled = [];
        const { children: customWraps } = JSON.parse(customizationData);
        let imgPreviewId = null;
        if (customWraps)
          for (let c = 0; c < customWraps.length; c++) {
            const customWrap = customWraps[c];
            if (
              customWrap.children &&
              customWrap.type == "FlatContainerCustomization"
            ) {
              for (const field of customWrap.children) {
                if (field && field.label) customFiled.push(field.label);
              }
            }
            if (customWrap.type === "PreviewContainerCustomization") {
              if (c == 0) {
                imgPreviewId = customWrap.identifier;
              }
              for (const previewItem of customWrap.children) {
                if (previewItem.type == "FlatContainerCustomization")
                  for (const field of customWrap.children) {
                    if (field && field.label) customFiled.push(field.label);
                  }
              }
            }
          }
        // check order miss custom field
        if (customFiled.length)
          for (const item of orderInfo.items) {
            if (item.lineId != custom.itemId) continue;
            const orderField = [];
            for (const personal of item.personalized) {
              orderField.push(personal.name);
            }
            for (const field of customFiled)
              if (!orderField.includes(field))
                item.personalized.push({
                  name: field,
                  value: "",
                });
          }
        // get personalized preview image
        if (previewSnapshotUrlMap) {
          for (const item of orderInfo.items) {
            if (item.lineId != custom.itemId) continue;
            if (imgPreviewId && previewSnapshotUrlMap[imgPreviewId]) {
              item.personalizedPreview = previewSnapshotUrlMap[imgPreviewId];
            } else {
              const previewImgs = Object.values(previewSnapshotUrlMap);
              if (previewImgs.length) {
                item.personalizedPreview = previewImgs[0];
              }
            }
          }
        }
        // get custom image
        if (custom.hasCustomImg) {
          const customImages = getCustomImage(
            CustomOrder.personalizedInfo.fulfillmentData,
          );
          if (customImages.length)
            // map custom image info into order item
            for (const item of orderInfo.items) {
              if (item.lineId != custom.itemId) continue;
              for (const personal of item.personalized) {
                for (const customImgItem of customImages) {
                  if (personal.name === customImgItem.label) {
                    personal.value = customImgItem.img;
                    break;
                  }
                }
              }
            }
        }
        resetCustomOrder();
      }
      resetCustomOrder();
    }
    if (options) {
      const {
        isAlwayMapping,
        isMultiProduct,
        isSplitOrder,
        numberOrdersSplit,
        qtyPreItem,
        applyAllItems,
      } = options;
      if (isAlwayMapping)
        orderInfo.items.forEach((i) => (i.alwayMapping = true));
      if (isMultiProduct)
        orderInfo.items.forEach(
          (i) => (i.allVariations.asinVariationValues = []),
        );
      if (isSplitOrder) {
        const newItems = [];

        // prev split first item => improve split all items via `applyAllItems` value
        if (applyAllItems) {
          for (let originItem of orderInfo.items) {
            originItem.qty = qtyPreItem;
            newItems.push(originItem);
            for (let i = 1; i < numberOrdersSplit; i++) {
              const newItem = { ...originItem };
              newItem.lineId = newItem.lineId + `-${i + 1}`;
              newItem.itemDiscountTotal = 0;
              newItem.itemShippingTaxTotal = 0;
              newItem.itemShippingTotal = 0;
              newItem.itemMarketplaceFee = 0;
              newItem.tax = 0;
              newItem.itemTaxTotal = 0;
              newItem.itemTotal = 0;
              newItem.itemSubtotal = 0;
              newItems.push(newItem);
            }
            orderInfo.items = newItems;
          }
        } else {
          const originItem = orderInfo.items[0];
          originItem.qty = qtyPreItem;
          newItems.push(originItem);
          for (let i = 1; i < numberOrdersSplit; i++) {
            const newItem = { ...originItem };
            newItem.lineId = newItem.lineId + `-${i + 1}`;
            newItem.itemDiscountTotal = 0;
            newItem.itemShippingTaxTotal = 0;
            newItem.itemShippingTotal = 0;
            newItem.itemMarketplaceFee = 0;
            newItem.tax = 0;
            newItem.itemTaxTotal = 0;
            newItem.itemTotal = 0;
            newItem.itemSubtotal = 0;
            newItems.push(newItem);
          }
          orderInfo.items = newItems;
        }
      }
    }

    orderInfo.items = (orderInfo.items || []).map((item) => {
      const { mockup } = item || {};
      const newMockup = (mockup || []).map((s) => {
        const pt = /\.\_.*\_\./gi;
        return (s || "").replace(pt, ".");
      });

      return {
        ...item,
        mockup: newMockup,
      };
    });

    const fieldValues = [];
    const filePT = /https?:\/\/gestalt/gi;
    for (let i = 0; i < orderInfo.items.length; i++) {
      const item = orderInfo.items[i];
      if (!item || typeof item !== "object") continue;

      const key = "__key" + i;
      if (
        item.personalizedPreview &&
        !!item.personalizedPreview.match(filePT)
      ) {
        fieldValues.push({
          name: `${key}_personalizedPreview`,
          fileUrl: item.personalizedPreview,
        });
      }

      if (item.personalized?.length > 0) {
        for (let p of item.personalized) {
          if (!p || !p.value || !p.value.match(filePT)) continue;
          fieldValues.push({ name: `${key}_${p.name}`, fileUrl: p.value });
        }
      }
    }

    console.log("fieldValues", fieldValues);
    if (fieldValues.length > 0) {
      const fileDownloaded = await downloadFiles(fieldValues, apiKey);

      if (fileDownloaded.length > 0) {
        const ob = fileDownloaded.reduce((acc, cur) => {
          acc = { ...acc, ...cur };
          return acc;
        }, {});

        for (let i = 0; i < orderInfo.items.length; i++) {
          let item = orderInfo.items[i];
          if (!item || typeof item !== "object") continue;

          const key = "__key" + i;
          const personalizedPreview = ob[`${key}_personalizedPreview`];

          const newPersonalized = [];
          for (let p of item.personalized) {
            const newVal = ob[`${key}_${p.name}`];
            const newP = p;
            if (newVal) {
              newP.value = newVal;
            }

            newPersonalized.push(newP);
          }

          item = {
            ...item,
            personalizedPreview,
            personalized: newPersonalized,
          };

          orderInfo.items[i] = item;
        }
      }
    }

    // sync order to MB
    let query = JSON.stringify({
        input: orderInfo
    });
    const result = await sendRequestToMB("createAmazonOrder", apiKey, query);
    const messResp = { data: true, error: null };
    if (result.error) messResp.error = result.error;
    else if (result.errors?.length) messResp.error = result.errors[0].message;
    sendToContentScript("syncOrderToMB", messResp);
    resetOrderInfo();
    await sleep(200);
  }
  stopProcess = false;
  // back to home page
  const url = `${domain ? domain : AMZDomain}/orders-v3?page=1`;
  //  chrome.tabs.update(
  //     {
  //        // url: `${AMZDomain}/orders-v3?page=1`,
  //        url,
  //     },
  //     (tab) => {
  //        if (!tab && activeTabId) {
  //           chrome.tabs.get(activeTabId, function (tabInner) {
  //              if (tabInner) {
  //                 chrome.tabs.update(activeTabId || tabInner?.id, {
  //                    url,
  //                 });
  //              }
  //           });
  //        }
  //     },
  //  );

  function redirectToOrder(tabs) {
    let tab = (tabs || []).find((item) => item?.active);
    if (tab?.id) {
      chrome.tabs.update(
        tab.id,
        {
          url,
        },
        (tab) => {
          if (!tab && activeTabId) {
            chrome.tabs.get(activeTabId, function (tabInner) {
              if (tabInner) {
                chrome.tabs.update(activeTabId || tabInner?.id, {
                  url,
                });
              }
            });
          }
        },
      );
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, { url });
        }
      });
    }
  }

  await redirectToNewURL(redirectToOrder);
  return results;
};

const handleUpdateGrandTotal = async (orderIds, domain) => {
  if (!orderIds || !orderIds.length) return;
  let apiKey = await getMBApiKey();
  if (!apiKey) apiKey = await getMBApiKey();

  if (!apiKey) return;
  resetOrderGrandTotal();
  stopProcess = false;
  let countTemporaryStop = 0;
  for (let i = 0; i < orderIds.length; i++) {
    if (OrderGrandTotal.locked) break;
    if (stopProcess) break;
    countTemporaryStop++;
    const orderId = orderIds[i];
    OrderGrandTotal.locked = true;
    OrderGrandTotal.orderId = orderId;
    // const url = `${AMZDomain}/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;
    const url = `${
      domain ? domain : AMZDomain
    }/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;
    chrome.tabs.update({ url }, (tab) => {
      if (tab?.id) {
        sendMessage(tab.id, "getGrandTotal", {
          orderId,
          label: `Updating grand totals: ${i + 1}/${orderIds.length}`,
        });
      } else if (activeTabId) {
        chrome.tabs.get(activeTabId, function (tabInner) {
          if (tabInner) {
            chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
              sendMessage(tab.id, "getGrandTotal", {
                orderId,
                label: `Updating grand totals: ${i + 1}/${orderIds.length}`,
              });
            });
          }
        });
      }
    });
    // wait info order
    let countSleep = 0;
    while (true) {
      if (OrderGrandTotal.isListed || countSleep == 20) break;
      countSleep++;
      await sleep(1000);
    }
    if (!OrderGrandTotal.isListed || OrderGrandTotal.grandTotal <= 0) {
      await sleep(3000);
      resetOrderGrandTotal();
      continue;
    }
    // sync order grand total to MB
    let query = JSON.stringify({
      query: `mutation{
            updateGrandTotal(orderId: "${OrderGrandTotal.orderId}", grandTotal: ${OrderGrandTotal.grandTotal}, marketplaceFee: ${OrderGrandTotal.marketplaceFee})}`,
    });
    const result = await sendRequestToMB(null, apiKey, query);
    resetOrderGrandTotal();
    if (countTemporaryStop == 10) {
      await sleep(1000 * 15);
      countTemporaryStop = 0;
    } else await sleep(1000 * 3);
  }
  stopProcess = false;
  // back to home page
  chrome.tabs.update({
    // url: `${AMZDomain}/orders-v3?page=1`,
    url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
  });
  return;
};

const handleUpdateGrandTotalImpl = async ({
  orderId,
  index,
  len,
  domain,
  countTemporaryStop,
  apiKey,
}) => {
  if (OrderGrandTotal.locked) return;
  if (stopProcess) return;

  countTemporaryStop++;
  OrderGrandTotal.locked = true;
  OrderGrandTotal.orderId = orderId;

  const url = `${
    domain ? domain : AMZDomain
  }/gp/payments-account/view-transactions.html?orderId=${orderId}&view=search&range=all`;

  const dataSendMessage = {
    orderId,
    label: `Updating grand totals: ${index + 1}/${len}`,
  };

  function redirectToOrderDetail(tabs) {
    let tab = (tabs || []).find((item) => item?.active);
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url }, (tabInner) => {
        sendMessage(tabInner?.id, "getGrandTotal", dataSendMessage);
      });
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, { url }, (tab) => {
            sendMessage(tab.id, "getGrandTotal", dataSendMessage);
          });
        }
      });
    }
  }

  await redirectToNewURL(redirectToOrderDetail);
  // wait info order
  let countSleep = 0;
  while (true) {
    if (OrderGrandTotal.isListed || countSleep == 10) break;
    countSleep++;
    await sleep(1000);
  }
  if (!OrderGrandTotal.isListed || OrderGrandTotal.grandTotal <= 0) {
    await sleep(2000);
    resetOrderGrandTotal();
    return;
  }

  let query = JSON.stringify({
    query: `mutation{
         updateGrandTotal(orderId: "${OrderGrandTotal.orderId}", grandTotal: ${OrderGrandTotal.grandTotal}, marketplaceFee: ${OrderGrandTotal.marketplaceFee})}`,
  });

  await sendRequestToMB(null, apiKey, query);
  resetOrderGrandTotal();

  if (countTemporaryStop == 10) {
    await sleep(1000 * 10);
    countTemporaryStop = 0;
  } else await sleep(1000 * 3);

  return;
};

async function* handleUpdateGrandTotalGen(orderIds, domain, apiKey) {
  let countTemporaryStop = 0;
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i];
    yield await handleUpdateGrandTotalImpl({
      orderId,
      index: i,
      len: orderIds.length,
      domain,
      countTemporaryStop,
      apiKey,
    });
  }
}

const handleUpdateGrandTotal_NEW = async (orderIds, domain) => {
  if (!orderIds || !orderIds.length) return;
  let apiKey = await getMBApiKey();
  if (!apiKey) apiKey = await getMBApiKey();

  if (!apiKey) return;
  resetOrderGrandTotal();
  stopProcess = false;

  for await (const _order of handleUpdateGrandTotalGen(
    orderIds,
    domain,
    apiKey,
  )) {
    console.log("_order:", _order);
  }

  stopProcess = false;
  // back to home page
  // chrome.tabs.update({
  //    url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
  // });

  function updateFirstTab(tabs) {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.update(tabs[0].id, {
        active: true,
        url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
      });
    } else if (activeTabId) {
      chrome.tabs.get(activeTabId, function (tabInner) {
        if (tabInner) {
          chrome.tabs.update(activeTabId || tabInner?.id, {
            url: `${domain ? domain : AMZDomain}/orders-v3?page=1`,
          });
        }
      });
    }
  }

  let querying = chrome.tabs.query({ currentWindow: true });
  querying.then(updateFirstTab);

  return;
};

// message from `content_script`
chrome.runtime.onMessage.addListener(async (req) => {
  const { message, data, endpoint, sender } = req || {};
  if (sender !== "OMG") return;
  switch (message) {
    case "response":
      // Capture merchant ID from "get-merchant-marketplaces-for-partner-account"
      const mbApiKey = await getMBApiKey();
      if (!mbApiKey) return;
      if (!data) break;
      if (endpoint.includes("/orders-api/order/")) {
        const { order } = data;
        if (!order || order["amazonOrderId"] != OrderInfo.orderId) return;
        OrderInfo.order = order;
        saveLog("orderLog - inject js", { type: "Order Information", data: order });
      }

      if (endpoint.includes("/orders-st/resolve")) {
        if (!data || !data[OrderInfo.orderId]) return;
        OrderInfo.shipping = data[OrderInfo.orderId].address;
      }
      // capture order grand totals
      if (
        endpoint.includes("payments/api/events-view") &&
        endpoint.includes(OrderGrandTotal.orderId)
      ) {
        OrderGrandTotal.isListed = true;
        if (!data) return;
        if (!data.tableRows || !data.tableRows.length) {
          OrderGrandTotal.grandTotal = -1;
          OrderGrandTotal.marketplaceFee = -1;
          return;
        }
        for (const row of data.tableRows) {
          if (row.tableCells?.length) {
            for (const item of row.tableCells) {
              if (item.columnIdentifier === "TOTAL") {
                let grandTotals = item.value.linkBody.currency.amount;
                if (grandTotals) OrderGrandTotal.grandTotal = grandTotals;
              }
              if (item.columnIdentifier === "FEES_TOTAL") {
                let marketFee = item.value.currency.amount;
                if (marketFee < 0) marketFee = marketFee * -1;
                if (marketFee >= 0) OrderGrandTotal.marketplaceFee = marketFee;
              }
            }
          }
        }
      }
      // capture personalized info
      if (endpoint.includes("/gestalt/ajax/fulfillment/init")) {
        if (activeTabId) {
          sendMessage(activeTabId, "syncFile", "");
        }
        if (
          endpoint.includes(CustomOrder.orderId) &&
          endpoint.includes(CustomOrder.itemId)
        ) {
          if (!data) return;
          CustomOrder.personalizedInfo = data;
        }
      }

      break;
    default:
      break;
  }
});

chrome.runtime.onInstalled.addListener(openHomePage);

function getRealTime(dateStr) {
  const myDate = new Date(parseInt(dateStr));
  var pstDate = myDate.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
  });

  // const formatVal = (val) => {
  //   val = String(val);
  //   if (val.length === 1) {
  //     val = "0" + val;
  //   }
  //   return val;
  // };

  // const [T1, T2] = pstDate.split(/,/).map((i) => i.trim());
  // let [mo, d, y] = T1.split(/\//g).map((i) => formatVal(i));
  // let [h, m, s] = T2.split(/\:/g).map((i) => formatVal(i));
  // [s] = s.split(" ");
  // const pt = /PM/gi;
  // if (!!pstDate.match(pt)) {
  //   h = parseInt(h) + 12;
  //   if (h >= 24) {
  //     h = h - 24;
  //     d = parseInt(d) + 1;
  //     if (d == 32) {
  //       mo = parseInt(mo) + 1;
  //       d = 1;
  //     }
  //   }
  // }

  // h = formatVal(h);
  // m = formatVal(m);
  // s = formatVal(s);
  // mo = formatVal(mo);
  // d = formatVal(d);

  // const result = `${[y, mo, d].join("-")}T${[h, m, s].join(":")}.000Z`;
  const result = new Date(pstDate + " PDT").toISOString();
  return result;
}

// V2
((data) => {
  try {
    const { chrome } = data;

    chrome.runtime.onInstalled.addListener(async () => {
      //  chrome.storage.local.clear(function (...args) {
      //    var error = chrome.runtime.lastError;
      //    if (error) {
      //      console.error(error);
      //    }
      //    // do something more
      //  });

      chrome.storage.local.get(["_mb_auto", "_mb_auto_key"], function () {
        chrome.storage.local.remove(
          ["_mb_auto", "_mb_auto_key"],
          function () {},
        );
        var error = chrome.runtime.lastError;
        if (error) {
          console.error(error);
        }
      });

      const script = {
        id: "inject",
        js: ["inject/inject.js"],
        matches: ["<all_urls>"],
        runAt: "document_start",
        world: "MAIN",
      };

      await chrome.scripting
        .unregisterContentScripts({ ids: [script.id] })
        .catch(() => {});

      await chrome.scripting.registerContentScripts([script]).catch(() => {});
      await chrome.storage.local.set({ omgActive: true });
    });
  } catch (e) {}
})({ chrome });

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
    default:
      break;
  }
  return null;
};