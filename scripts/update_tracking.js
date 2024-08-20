$(document).on("click", "#update-tracking", function () {
   $(this).addClass("loader");
   chrome.runtime.sendMessage({
      message: "runUpdateTracking",
      domain: window.location.origin,
   });
});

// caption event form background
chrome.runtime.onMessage.addListener(async (req, sender, res) => {
   const { message, data } = req || {};
   if (message === "updateTracking") {
      res({ message: "received" });
      $(".loader").removeClass("loader");
      const { error } = data;
      if (error) {
         notifyError(error);
         return;
      }
      notifySuccess("Update tracking completed.");
   }
});