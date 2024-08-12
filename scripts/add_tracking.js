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
   return "china-ems";
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
      trackingInfo.isFakeTracking = true;
      trackingInfo.tracking = randomTracking();
      trackingInfo.carrier = "Other";
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
      default:
         break;
   }
});

const handAddTracking = async (trackingInfo) => {
   let err = "";
   try {
      if (!trackingInfo) throw Error("Invalid tracking info");
      const { isFakeTracking, tracking, carrier, shippingService } = trackingInfo;
      // select carrier
      const carrierXpath = '[data-test-id="tvs-carrier-dropdown"]>select';
      while (true) {
         if ($(carrierXpath).length) break;
         await sleep(500);
      }
      const carrierElem = document.querySelector(carrierXpath);
      carrierElem.value = carrier;
      
      // update
      // select carrier
      //    + check carrier in options
      //    + else, set value = "Other"
      const carrierOptions = Array.from(carrierElem?.options)
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
            // set `Other`
            carrierElem.value = "Other"
         }
      }

      const carrierEvent = document.createEvent("HTMLEvents");
      carrierEvent.initEvent("change", true, true);
      carrierElem.dispatchEvent(carrierEvent);
      if (isFakeTracking) {
         await sleep(1000);
         // set carrier name
         const carrierNameXpath = 'input[data-test-id="text-input-carrier"]';
         while (true) {
            if ($(carrierNameXpath).length) break;
            await sleep(500);
         }
         const carrierNameElem = $(carrierNameXpath);
         carrierNameElem.focus();
         carrierNameElem.val("");
         document.execCommand("insertText", false, "Progressing");
         carrierNameElem.blur();
      }
      await sleep(2000);
      // select shipping option
      const shippingXpath = ".shipping-service-dropdown select";
      while (true) {
         if ($(shippingXpath).length) break;
         await sleep(500);
      }
      const shippingElem = document.querySelector(shippingXpath);
      // shippingElem.value = "Other";

      // set shipping service
      let validShippingService = false;
      const shippingServiceOptions = Array.from(shippingElem?.options);
      if (shippingServiceOptions?.length > 0) {
         // check `shippingSerive` include
         if (shippingService && shippingServiceOptions.some((opt) => compareValues(opt?.value, shippingService))) {
            let matchVal = shippingService;
            for (let opt of shippingServiceOptions) {
               if (!opt || typeof opt !== "object") continue;
               let selected = compareValues(opt.value, shippingService);

               opt.selected = selected;
               if (selected) matchVal = opt.value;
            }
            shippingElem.value = matchVal;
            validShippingService = true;
         } else {
            shippingElem.value = "Other";
         }
      }

      const shippingEvent = document.createEvent("HTMLEvents");
      shippingEvent.initEvent("change", true, true);
      shippingElem.dispatchEvent(shippingEvent);
      await sleep(1000);

      // case: validShippingService = false => set shipping name
      if (!validShippingService) {
         // set shipping name
         const shippingNameXpath = 'input[data-test-id="shipping-service"]';
         while (true) {
            if ($(shippingNameXpath).length) break;
            await sleep(500);
         }

         const shippingNameElem = $(shippingNameXpath);
         shippingNameElem.focus();
         shippingNameElem.val("");
         document.execCommand(
            "insertText",
            false,
            isFakeTracking ? "Standard Shipping" : carrier
         );
         shippingNameElem.blur();
         await sleep(2000);
      }
      
      // set tracking code
      const trackingElem = $(`input[data-test-id="text-input-tracking-id"]`);
      trackingElem.focus();
      trackingElem.val("");
      document.execCommand("insertText", false, tracking);
      trackingElem.blur();
      await sleep(2000);

      // get all item add tracking
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
      // trigger click confirm shipment
      const confirmBtn =
         '[data-test-id="confirm-shipment-button-action"] [value="Confirm shipment"]';
      $(confirmBtn).trigger("click");
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

const compareValues = (val1, val2) => {
   return (val1 || "").toLowerCase() === (val2 || "").toLowerCase();
}
