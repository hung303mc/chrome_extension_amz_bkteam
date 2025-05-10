const imageCustomizationContentCls = "image-customization-content";
const imageCustomizationViewCls = "image-customization-view";
const buttonControl = "bottom-controls-view bottom-controls-container";

function containsCls(selector, className) {
  return selector.classList.contains(className);
}

chrome.runtime.onMessage.addListener(async (req, _, res) => {
  const { message, data } = req || {};

  switch (message) {
    case "syncFile":
      console.log("sync_file action");
      const downloadLinksA = document.querySelectorAll(
        ".preview-container-customization-child .download-link a",
      );
      console.log("downloadLinksA", downloadLinksA);

      const fieldValues = [];
      for (let tagA of downloadLinksA) {
        ((tagA) => {
          let customizationContent = tagA;
          while (
            !containsCls(customizationContent, imageCustomizationContentCls)
          ) {
            customizationContent = customizationContent.parentNode;

            if (!customizationContent) break;
          }

          let imageCustomizationView = customizationContent;
          while (
            !containsCls(imageCustomizationView, imageCustomizationViewCls)
          ) {
            imageCustomizationView = imageCustomizationView.parentNode;

            if (!imageCustomizationView) break;
          }

          let fileUrl = "";
          if (containsCls(customizationContent, imageCustomizationContentCls)) {
            let imgTag = imageCustomizationView.querySelector(
              ".buyer-image-container img",
            );
            if (imgTag && imgTag.src) {
              fileUrl = imgTag.src;
            }
          }

          let title = "";
          if (containsCls(imageCustomizationView, imageCustomizationViewCls)) {
            title = imageCustomizationView.querySelector(
              ".left-section .block-label",
            );
            if (title && title.textContent) {
              title = title.textContent;
            }
          }

          // add checkbox
          if (title.length > 0){
            let inputCheck = customizationContent.querySelector('input.omg-checkbox-file');
            if (!inputCheck) {
              inputCheck = document.createElement("input");
              inputCheck.type= "checkbox";
              inputCheck.style = "display: inline-block;margin-left: auto;width: 16px;height: 16px;"
            }
            inputCheck.className = 'omg-checkbox-file'
            inputCheck.setAttribute('data-field-name', title)
            customizationContent.append(inputCheck)
          }

          fieldValues.push({ name: title, fileUrl });
        })(tagA);
      }

      const buttonControlDiv = document.querySelector(
        ".bottom-controls-view .bottom-controls-container",
      );
      if (buttonControlDiv) {
        let button = buttonControlDiv.querySelector("#om-sync-file");
        if (button) {
          button.remove();
        }
        button = document.createElement("button");

        button.textContent = "Sync File to MB";
        button.className = "om-btn";
        button.id = "om-sync-file";
        button.style =
          "height: 32px; margin-left: 10px; line-height: 1; padding-top: 8px;font-size: 14px;";
        button.setAttribute("data-field-values", JSON.stringify(fieldValues));

        buttonControlDiv.append(button);

        if (!buttonControlDiv.querySelector("style")) {
          const style = document.createElement("style");
          const css = `
            .omg-disabled {
              pointer-events: none;
              cursor: not-allowed;
              opacity: 0.6;
            }
          `;
          if (style.styleSheet) {
            // This is required for IE8 and below.
            style.styleSheet.cssText = css;
          } else {
            style.appendChild(document.createTextNode(css));
          }
          buttonControlDiv.append(style);
        }
      }
      res({ message: "received" });
      break;
    case "syncFileCompleted":
      const { error } = data || {};
      const btn = $("#om-sync-file");
      if (btn.length > 0) {
        $(btn).text("Sync File to MB");
        $(btn).removeClass("omg-disabled");
      }

      if (error) notifyError(error);
      else notifySuccess("Sync file(s) success");
      res({ message: "received" });
      break;
    default:
      break;
  }
});

$(document).on("click", "#om-sync-file", async function () {
  const btn = $(this);
  const data = $(btn).attr("data-field-values");

  // check files checked
  const filesChecked = document.querySelectorAll('input.omg-checkbox-file:checked')
  const namesChecked = [];
  for (let i of filesChecked) {
    const title = $(i).attr("data-field-name")
    if (title) namesChecked.push(title)
  }

  console.log('namesChecked', namesChecked)
  if (data && typeof data === "string") {
    let fieldValues = JSON.parse(data);
    
    console.log('fieldValues before', fieldValues)
    if (namesChecked.length > 0) {
      fieldValues = fieldValues.filter((item) => namesChecked.includes(item.name))
    }

    console.log('fieldValues after', fieldValues)

    let orderIdNode = document.querySelector(".order-id");
    let orderId;
    if (orderIdNode) {
      orderId = orderIdNode.getAttribute("label");
      orderId = orderId.trim();
    }

    $(btn).text("Syncing File to MB");
    $(btn).addClass("omg-disabled");

    console.log("orderId", orderId);
    // send fieldvalues to background
    chrome.runtime.sendMessage({
      message: "syncFiletoMB",
      domain: window.location.origin,
      data: {
        orderId,
        fieldValues,
        apiKey: await getStorage(mbApi),
      },
    });
  }
});
