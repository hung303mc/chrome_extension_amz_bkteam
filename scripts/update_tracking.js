$(document).on("click", "#update-tracking", async function () {
   $(this).addClass("loader");
   
   // Kiểm tra nếu đang trong chế độ tự động
   const isAutoTracking = await getStorage("_mb_auto_tracking");
   
   chrome.runtime.sendMessage({
      message: "runUpdateTracking",
      domain: window.location.origin,
      data: { 
         autoMode: isAutoTracking 
      }
   });
});

// caption event form background
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   const { message, data } = req || {};
   if (message === "updateTracking") {
      res({ message: "received" });
      $(".loader").removeClass("loader");
      const { error, autoMode } = data;
      if (error) {
         notifyError(error);
         return;
      }
      
      notifySuccess("Update tracking completed.");
      
      // Nếu đang trong chế độ tự động, xóa trạng thái đánh dấu
      if (autoMode) {
         await setStorage("_mb_auto_tracking", false);
         
         // Thông báo cho background script biết quá trình đã hoàn tất
         chrome.runtime.sendMessage({
            message: "autoUpdateTrackingFinished",
            domain: window.location.origin
         });
         
         // Trở về trang orders
         setTimeout(() => {
            window.location.href = "https://sellercentral.amazon.com/orders-v3/ref=xx_myo_favb_xx";
         }, 3000);
      }
   }
});