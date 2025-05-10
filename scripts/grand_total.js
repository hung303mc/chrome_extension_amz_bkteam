$(document).on("click", "#update-grandtotal", function () {
   $(this).addClass("loader");
   chrome.runtime.sendMessage({
      message: "runUpdateGrandTotal",
      domain: window.location.origin,
   });
});

// caption event form background
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   const { message, data } = req || {};
   if (message === "updateGrandTotal") {
      res({ message: "received" });
      $(".loader").removeClass("loader");
      const { error } = data;
      if (error) {
         notifyError(error);
         return;
      }
      notifySuccess("Update grand total completed.");
   }
   if (message === "getGrandTotal") {
      res({ message: "received" });
      let countCheck$ = 0;
      while (true) {
         if (jQuery.isReady && $("#update-grandtotal").length || countCheck$ === 30) {
            break;
         }
         await sleep(1000)
         countCheck$++;
      }

      if (!jQuery.isReady) return;
      const { label } = data;
      taskProcessing(label);
      $('[data-name="grand_total"]').click();
      $("#update-grandtotal").addClass("loader");
   }
});
