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
         res({ message: "received" });
         if (!data) return;

         // wait for jQuery to load
         while (true) {
            if (jQuery.isReady) {
               break;
            }
            await sleep(500);
         }

         // TODO
         const { orderId, trackingCode } = data;

         // wait for the tracking span to be ready
         const trackingSpanXpath = 'span[data-test-id="tracking-id-value"]';
         while (true) {
            if ($(trackingSpanXpath).length) break;
            await sleep(500);
         }

         // Verify if the tracking code is already in the span
         const currentTrackingCode = $(trackingSpanXpath).text().trim();

         let status = "error";
         let message = `Tracking code for order ${orderId} does not match! Expected: ${trackingCode}, Found: ${currentTrackingCode}`;

         if (currentTrackingCode === trackingCode) {
            status = "success";
            message = `Tracking code for order ${orderId} is correctly set to ${trackingCode}`;
            // notifySuccess(message);
         } else {
            // notifyError(message);
         }

         // Send message back to background script
         chrome.runtime.sendMessage({
            message: "verifyAddTracking",
            data: {
               orderId,
               status,
               trackingCode,
               message
            },
            domain: window.location.origin,
         });

         break;


      default:
         break;
   }
});

const handleTracking = async (trackingInfo, confirmType) => {
   let err = "";

   try {
      if (!trackingInfo) throw Error("Invalid tracking info");
      const {orderId, isFakeTracking, tracking, carrier, shippingService } = trackingInfo;

      // Nếu trackingCode rỗng thì tick checkbox, nếu không thì bỏ tick checkbox
      const checkboxSelector = '#missing-tracking-id-checkbox';
      if (tracking === "") {
         // Nếu chưa được tick, thì tick vào
         if (!$(checkboxSelector).attr('checked')) {
            $(checkboxSelector).attr('checked', 'checked');
         }
      } else {
         // Nếu đã tick, thì bỏ tick
         if ($(checkboxSelector).attr('checked')) {
            $(checkboxSelector).removeAttr('checked');
         }
      }

      // select carrier
      const carrierXpath = '[data-test-id="tvs-carrier-dropdown"]>select';
      while (true) {
         if ($(carrierXpath).length) break;
         await sleep(500);
      }
      const carrierElem = document.querySelector(carrierXpath);
      // carrierElem.value = carrier;
      
      // update
      // select carrier
      //    + check carrier in options
      //    + else, set value = "Other"
      const carrierOptions = Array.from(carrierElem?.options)
      let isOtherCarrier = false;

      if (carrierOptions?.length > 0) {
         // carrier code include list options.
         if ( carrier && carrierOptions.some((opt) => compareValues(opt?.value, carrier) )) {
            let matchVal = carrier;
            for (let opt of carrierOptions) {
               if (!opt || typeof opt !== "object") continue;
               let selected = compareValues(opt.value, carrier);

               opt.selected = selected;
               if (selected) matchVal = opt.value;
            }
            carrierElem.value = matchVal;
         } else {
            // set `others`
            carrierElem.value = "Other";
            isOtherCarrier = true; // Đánh dấu nếu carrier là "Other"
            console.log("isOtherCarrier = true")
         }
      }

      const carrierEvent = document.createEvent("HTMLEvents");
      carrierEvent.initEvent("change", true, true);
      carrierElem.dispatchEvent(carrierEvent);
      await sleep(1000);

      // Chỉ điền tên carrier manually nếu carrier là "Other"
      if (isOtherCarrier) {
         // set custom carrier name if 'Other' is selected
         const customCarrierXpath = 'input[data-test-id="text-input-carrier"]';
         while (true) {
            if ($(customCarrierXpath).length) break;
            await sleep(500);
         }

         const customCarrierElem = $(customCarrierXpath);
         customCarrierElem.focus();
         customCarrierElem.val("");
         document.execCommand(
             "insertText",
             false,
             carrier // Điền tên carrier vào đây
         );
         customCarrierElem.blur();
         await sleep(2000);
      }

      // // select shipping option
      // const shippingXpath = ".shipping-service-dropdown select";
      // while (true) {
      //    if ($(shippingXpath).length) break;
      //    await sleep(500);
      // }
      // const shippingElem = document.querySelector(shippingXpath);
      // // shippingElem.value = "Other";
      //
      // // set shipping service
      // let validShippingService = false;
      // const shippingServiceOptions = Array.from(shippingElem?.options);
      // if (shippingServiceOptions?.length > 0) {
      //    // check `shippingSerive` include
      //    if (shippingService && shippingServiceOptions.some((opt) => compareValues(opt?.value, shippingService))) {
      //       let matchVal = shippingService;
      //       for (let opt of shippingServiceOptions) {
      //          if (!opt || typeof opt !== "object") continue;
      //          let selected = compareValues(opt.value, shippingService);
      //
      //          opt.selected = selected;
      //          if (selected) matchVal = opt.value;
      //       }
      //       shippingElem.value = matchVal;
      //       validShippingService = true;
      //    } else {
      //       shippingElem.value = "Other";
      //    }
      // }
      //
      //
      // const shippingEvent = document.createEvent("HTMLEvents");
      // shippingEvent.initEvent("change", true, true);
      // shippingElem.dispatchEvent(shippingEvent);
      // await sleep(1000);
      //
      // // case: validShippingService = false => set shipping name
      // if (!validShippingService) {
      //    // set shipping name
      //    const shippingNameXpath = 'input[data-test-id="shipping-service"]';
      //    let attempts = 0;
      //    let err = null;
      //
      //    while (attempts < 3) {
      //       if ($(shippingNameXpath).length) {
      //          const shippingNameElem = $(shippingNameXpath);
      //          shippingNameElem.focus();
      //          shippingNameElem.val("");
      //          document.execCommand(
      //              "insertText",
      //              false,
      //              isFakeTracking ? "Standard Shipping" : carrier
      //          );
      //          shippingNameElem.blur();
      //
      //          await sleep(2000);
      //          break;
      //       } else {
      //          // Nếu không tìm thấy, chờ 5 giây và kiểm tra lại
      //          await sleep(5000);
      //          shippingElem.dispatchEvent(shippingEvent);
      //          attempts++;
      //       }
      //    }
      //
      //    // Nếu sau 3 lần vẫn không tìm thấy, return error
      //    if (attempts === 3) {
      //       err = "Không thể tìm thấy phần tử shipping name sau 3 lần thử.";
      //       chrome.runtime.sendMessage({
      //          message: "addedTrackingCode",
      //          error: err,
      //          domain: window.location.origin,
      //       });
      //       return err;
      //    }
      // }


// Lấy phần tử input của tracking code
      const trackingElem = document.querySelector('input[data-test-id="text-input-tracking-id"]');
      trackingElem.focus();

// Nếu tracking là null, thay thế bằng chuỗi rỗng
      const trackingCode = tracking !== null ? tracking : "";

// Đặt giá trị trực tiếp cho tracking code bằng setAttribute và trigger sự kiện
      trackingElem.setAttribute('value', trackingCode); // Đặt trực tiếp giá trị vào thuộc tính `value`
      trackingElem.value = trackingCode; // Đặt lại giá trị thông qua thuộc tính `value` để đảm bảo sự thay đổi

// Kích hoạt các sự kiện để đảm bảo trang web nhận diện được thay đổi
      trackingElem.dispatchEvent(new Event('input', { bubbles: true }));
      trackingElem.dispatchEvent(new Event('change', { bubbles: true }));

      trackingElem.blur();
      await sleep(2000);


      // get all item add tracking
      /*
      const dataAddedTracking = [];
      const itemXpath =
         "table.a-keyvalue tbody tr td:nth-child(4)>div:last-child";
      const numberItems = $(itemXpath).length;
      for (let i = 0; i < numberItems; i++) {
         let itemId = $(itemXpath).eq(i).text().split(":").pop().trim();
         if (itemId) {
            dataAddedTracking.push({
               isFakeTracking,
               lineId: itemId,
               trackingCode: tracking,
            });
         }
      }
      */

      // get order_id and tracking only
      const dataAddedTracking = {
         isFakeTracking,
         orderId: orderId,
         trackingCode: tracking,
      };

      // Xử lý click nút xác nhận dựa trên loại (confirmType)
      let confirmBtnXpath = '';
      if (confirmType === 'add') {
         confirmBtnXpath = '[data-test-id="confirm-shipment-button-action"] input[value="Confirm shipment"]';
         $(confirmBtnXpath).trigger("click");
         await sleep(2000);

         // Nếu tracking code là empty, đợi 1 giây và click thêm lần nữa
         if (trackingCode === "") {
            await sleep(1000);
            $(confirmBtnXpath).trigger("click");
         }else{
            // Đợi tối đa 5 lần (5 giây) để tìm và click nút "YES, please continue with this shipping service name"
            const continueBtnXpath = 'input[value="YES, please continue with this shipping service name"]';
            let maxRetries = 5;
            while (maxRetries > 0) {
               if ($(continueBtnXpath).length) {
                  $(continueBtnXpath).trigger("click");
                  await sleep(2000); // Đợi 2 giây sau khi click trước khi tiếp tục
                  break; // Thoát khỏi vòng lặp sau khi click
               }
               await sleep(1000); // Đợi 1 giây trước khi thử lại
               maxRetries--;
            }
         }
      } else if (confirmType === 'edit') {
         confirmBtnXpath = 'input.a-button-input[value="Re-confirm Shipment"]';
         $(confirmBtnXpath).trigger("click");

         // Đợi cho đến khi xuất hiện thông báo "Shipment Updated" trong toàn bộ trang
         let maxRetries = 10; // Giới hạn số lần kiểm tra (10 lần * 500ms = 5 giây)
         while (maxRetries > 0) {
            if ($('body').text().includes("Shipment Updated")) break;
            await sleep(500);
            maxRetries--;

            // Kiểm tra và click nút "YES, continue with this shipping service name" nếu có
            const continueBtnXpath = 'input[value="YES, please continue with this shipping service name"]';
            if ($(continueBtnXpath).length) {
               $(continueBtnXpath).trigger("click");
               maxRetries = 10; // Reset số lần kiểm tra sau khi click nút này
            }
         }

         // // Nếu sau 5 giây không có thông báo "Shipment Updated", chọn lại shipping option
         // if (maxRetries === 0) {
         //    console.log("Không thấy thông báo 'Shipment Updated', đang chọn lại shipping option...");
         //
         //    // // Chọn lại shipping option
         //    // const shippingXpath = ".shipping-service-dropdown select";
         //    // while (true) {
         //    //    if ($(shippingXpath).length) break;
         //    //    await sleep(500);
         //    // }
         //    // const shippingElem = document.querySelector(shippingXpath);
         //    //
         //    // let validShippingService = false;
         //    // const shippingServiceOptions = Array.from(shippingElem?.options);
         //    // if (shippingServiceOptions?.length > 0) {
         //    //    // check `shippingSerive` include
         //    //    if (shippingService && shippingServiceOptions.some((opt) => compareValues(opt?.value, shippingService))) {
         //    //       let matchVal = shippingService;
         //    //       for (let opt of shippingServiceOptions) {
         //    //          if (!opt || typeof opt !== "object") continue;
         //    //          let selected = compareValues(opt.value, shippingService);
         //    //
         //    //          opt.selected = selected;
         //    //          if (selected) matchVal = opt.value;
         //    //       }
         //    //       shippingElem.value = matchVal;
         //    //       validShippingService = true;
         //    //    } else {
         //    //       shippingElem.value = "Other";
         //    //    }
         //    // }
         //    //
         //    // const shippingEvent = document.createEvent("HTMLEvents");
         //    // shippingEvent.initEvent("change", true, true);
         //    // shippingElem.dispatchEvent(shippingEvent);
         //    // await sleep(1000);
         // }
      }


      chrome.runtime.sendMessage({
         message: "addedTrackingCode",
         data: dataAddedTracking,
         domain: window.location.origin,
      });
      while (true) {
         if ($(".a-alert-heading").length) break;
         await sleep(500);
      }
   } catch (error) {
      err = error.message;
   }
   return err;
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
