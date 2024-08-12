// chrome.devtools.panels.create(
//    "Amazon Helper",
//    "../../assets/images/48.png",
//    "devtool/htmls/panel.html",
//    function (panel) {}
// );

//Created a port with background page for continous message communication
const port = chrome.runtime.connect({ name: "captureRequest" });
const AMZDomain = "https://sellercentral.amazon.com";
const AMZDomain2 = "https://sellercentral-europe.amazon.com";
const AMZDomain3 = "https://sellercentral.amazon.de";
const AMZDomain4 = "https://sellercentral.amazon.co.uk/";

// capture response request get orders
chrome.devtools.network.onRequestFinished.addListener(async function (
   netevent
) {
   const request = await netevent.request;
   const response = await netevent.response;

   const DOMAIN_VALID = [AMZDomain, AMZDomain2, AMZDomain3, AMZDomain4]
   if (
      !request?.url ||
      DOMAIN_VALID.every((i) => !request?.url?.includes(i)) || 
      response.status !== 200 ||
      !response?.content?.mimeType?.includes("application/json")
   )
      return;
   // send response to background
   netevent.getContent(function (body) {
      const data = JSON.parse(body);
      if (port)
         port.postMessage({
            message: "response",
            endPoint: request?.url,
            data,
         });
   });
});
