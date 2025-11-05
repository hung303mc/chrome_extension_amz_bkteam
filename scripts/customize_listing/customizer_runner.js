// scripts/customize_listing/customizer_runner.js

// 🟩 Cờ debug + tag log (đồng bộ với helpers)
const CS_DBG = true;
const CS_TAG = "[CS][Customizer]";
window.CS && (CS.CS_DBG = CS_DBG); // đồng bộ flag từ helpers nếu đã load
const ENABLE_ADDING_OPTIONS = true; // cho phép tự bấm Add option
const PUBLIC_BASE_URL = "https://files.bkteam.top/";

// 🟩 Proxy cross-origin cho ảnh (dùng khi trang https/ http gây CORS)
const PROXY_BASE = "http://14.241.234.118:5003/proxy?u=";
function viaProxy(url) {
  if (!url) return url;
  if (url.startsWith(PROXY_BASE)) return url;
  return PROXY_BASE + encodeURIComponent(url);
}
function proxyUsableInThisPage() {
  return !(location.protocol === "https:" && PROXY_BASE.startsWith("http:"));
}

// ===== Selectors (đặc thù UI hiện tại) =====
const SELS_ADD_BTN = [
  'kat-button[data-test-id="container-picker-add-button"]',
  'kat-button[label*="Add customization" i].gestalt_add-new-pane-button__J0ie5'
];
const SELS_MODAL_CONFIRM_BTN = [
  'kat-button[data-test-id="container-picker-modal-add-button"]',
  'kat-button[label="Add customization"][variant="primary"]'
];
const SEL_PREVIEW_ZONE = [
  'div.image-input.preview-container-base-image-upload',
  'div.image-upload',
];
const SEL_PREVIEW_FILE_INPUT = [
  'div.image-upload input[type="file"][accept*="image"]',
  'input[type="file"][accept*="image/jpeg"]',
  'input[type="file"][accept*="image/png"]',
  'kat-image-uploader input[type="file"]'
];
const SEL_CELL_THUMB = '[data-test-id="compact-option-item-thumbnail-image"]';
const SEL_CELL_OVER  = '[data-test-id="compact-option-item-overlay-image"]';
const SEL_ADD_OPTION = 'span[data-test-id="compact-option-item-add-option-button"]';
const SEL_KAT_INPUT_OD_BROAD = 'kat-input[value^="Option Dropdown"]';
const SEL_KAT_INPUT_OD_LABEL = 'kat-input[placeholder="Label"][value^="Option Dropdown"]';

// ===== Aliases từ helpers =====
const {
  cslog, cswarn, cserr,
  deepQuerySelector, deepQueryAll, deepFindByText, deepQueryAny,
  waitFor, delay,
  clickKatButtonHost,
  getInnerTextInputFromKatInput,
  fireAll,
  getFileInputInCell,
  uploadUrlToFileInput,
  waitUntilCellUploaded,
  absPathToPublic, joinPublicUrlFromDirAndRel,
  filenameStem,
  // scrollToRow, scrollToTop,  // 🟥 bỏ scroll helper
  fillOneRowImages
} = window.CS;

// 🟩 Chờ input Preview
async function waitForPreviewFileInput() {
  const zone = await waitFor(() => deepQueryAny(SEL_PREVIEW_ZONE), { timeout: 15000, interval: 120 });
  const input = await waitFor(() => deepQueryAny(SEL_PREVIEW_FILE_INPUT, zone), { timeout: 10000, interval: 120 });
  return { zone, input };
}

async function dropFileOnCell(cell, file) { return window.CS.dropFileOnCell(cell, file); }

async function uploadPreviewImage(absPathOrUrl) {
  if (!absPathOrUrl) return false;
  const pub = absPathToPublic(absPathOrUrl, PUBLIC_BASE_URL);
  const url = proxyUsableInThisPage() ? viaProxy(pub) : pub;

  const { zone, input } = await waitForPreviewFileInput();
  await uploadUrlToFileInput(url, input, { debugOpenTab: false, fetchTimeoutMs: 45000 });

  try {
    await waitUntilCellUploaded(zone, input, { timeout: 20000 });
  } catch (e) {
    const name = decodeURIComponent((url.split("/").pop() || "preview").split("?")[0]) || "preview.jpg";
    const resp = await fetch(url);
    const blob = await resp.blob();
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    await dropFileOnCell(zone, file);
  }
  cslog("[CS][preview] ✅ Uploaded Preview Image");
  return true;
}

// 🟥 Bỏ toàn bộ scroll helpers
// async function scrollToRowInContainer(...) {}
// async function scrollToTopInContainer(...) {}

// ===== B1/B2/B3 =====
async function clickAddCustomizationOpenModal() {
  cslog("B1: waiting for add-button…");
  let btnHost = await waitFor(() => deepQuerySelector(SELS_ADD_BTN));
  if (!btnHost) {
    cswarn("B1: not found by selector, try text…");
    btnHost = deepFindByText("Add customization");
  }
  if (!btnHost) throw new Error("B1: Cannot find opener 'Add customization' button");
  cslog("B1: clicking opener button");
  clickKatButtonHost(btnHost);
  return true;
}

async function waitForContainerPickerModal() {
  return waitFor(
    () => deepQueryAll('kat-box[data-test-id="container-picker-modal-choice"]').length > 0
  );
}

async function clickOptionDropdown() {
  cslog("B2: waiting for modal choices…");
  await waitForContainerPickerModal();
  const labels = deepQueryAll('.gestalt_choice-label__O7P2T, kat-box[data-test-id="container-picker-modal-choice"]');
  for (const node of labels) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (text.includes("option dropdown")) {
      const target = node.closest?.('kat-box[data-test-id="container-picker-modal-choice"]') || node;
      target.click();
      try {
        const inner = target.querySelector('.gestalt_choice-content__cr_0c, .gestalt_inner-box__RxHou');
        inner?.click?.();
      } catch {}
      return true;
    }
  }
  const boxes = deepQueryAll('kat-box[data-test-id="container-picker-modal-choice"]');
  for (const box of boxes) {
    const t = (box.textContent || "").toLowerCase();
    if (t.includes("option dropdown")) {
      box.click();
      return true;
    }
  }
  throw new Error('B2: Could not find "Option Dropdown" choice');
}

async function clickModalAddCustomizationConfirm() {
  cslog("B3: waiting for modal confirm button…");
  const btnHost = await waitFor(() => deepQuerySelector(SELS_MODAL_CONFIRM_BTN));
  if (!btnHost) throw new Error("B3: Cannot find modal confirm 'Add customization' button");
  await waitFor(() => {
    const disabled = btnHost.hasAttribute?.('disabled') || btnHost.getAttribute?.('aria-disabled') === 'true';
    return !disabled ? btnHost : null;
  }, { timeout: 15000, interval: 120 });
  clickKatButtonHost(btnHost);
  return true;
}

// ===== Kat-input =====
async function waitForTargetKatInput(selector, root = document) {
  return waitFor(() => {
    const list = deepQueryAll(selector, root);
    if (list.length) return list[list.length - 1];
    return null;
  });
}

function getActiveCustomizationContainerFromLabelInput(inputOrHost) {
  let cur = inputOrHost;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur.querySelector?.(SEL_ADD_OPTION)) return cur;
    cur = cur.parentElement || cur.getRootNode()?.host || null;
  }
  return document;
}

async function setKatInputLabel(host, labelText) {
  const input = getInnerTextInputFromKatInput(host);
  if (!input) throw new Error("Cannot find inner input of kat-input");
  const finalText = labelText || "Choose Book";
  // 🟥 bỏ scrollIntoView tự động
  try { host.click?.(); } catch {}
  await delay(60);
  input.focus();
  input.value = "";
  input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  for (const ch of finalText.split("")) {
    input.value += ch;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await delay(15);
  }
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  input.blur?.();
  try { host.setAttribute("value", finalText); } catch {}
  cslog(`Set kat-input label to "${finalText}" OK`);
  return input;
}

async function clickAddOptionNTimesInContainer(container, n) {
  if (!n || n <= 0) return;
  const addBtn = container.querySelector(SEL_ADD_OPTION);
  if (!addBtn) throw new Error("Add option button not found inside active customization container");
  const BATCH = 10;
  let left = n;
  while (left > 0) {
    const take = Math.min(BATCH, left);
    for (let i = 0; i < take; i++) { addBtn.click(); await delay(120); }
    left -= take;
    await delay(350);
  }
}

// ===== Per-group flow =====
async function createOneDropdownGroup(group) {
  const targetLabel = (group?.label || "").trim() || "Choose";
  const thumbnails = Array.isArray(group?.thumbnail) ? group.thumbnail : [];
  const overlays   = Array.isArray(group?.overlay) ? group.overlay : [];
  const thumbDir   = group?.thumbnail_dir || "";
  const overDir    = group?.preview_dir || "";

  const baseNum = Number(group?.number_option || 0);
  const need = Math.max(baseNum, thumbnails.length, overlays.length);
  const clicks = Math.max(need - 2, 0);

  cslog(`\n=== Create group: "${targetLabel}" (need=${need} → clicks=${clicks}) ===`);

  await clickAddCustomizationOpenModal();
  await clickOptionDropdown();
  await clickModalAddCustomizationConfirm();

  let labelHost;
  let container;
  try {
    const labelHostBroad = await waitForTargetKatInput(SEL_KAT_INPUT_OD_BROAD, document);
    await setKatInputLabel(labelHostBroad, targetLabel);
    container = getActiveCustomizationContainerFromLabelInput(labelHostBroad) || document;
    try {
      const labelHostNarrow = await waitForTargetKatInput(SEL_KAT_INPUT_OD_LABEL, container);
      if (labelHostNarrow) {
        await setKatInputLabel(labelHostNarrow, targetLabel);
        labelHost = labelHostNarrow;
      } else labelHost = labelHostBroad;
    } catch { labelHost = labelHostBroad; }
  } catch (e) {
    cserr("Set label failed for group:", targetLabel, e?.message);
    throw e;
  }

  await delay(300);
  container = getActiveCustomizationContainerFromLabelInput(labelHost);
  if (ENABLE_ADDING_OPTIONS) await clickAddOptionNTimesInContainer(container, clicks);
  await delay(300);

  // 🟥 bỏ scrollToTop và scrollToRow
  for (let i = 0; i < need; i++) {
    const relT = thumbnails[i] || null;
    const relO = overlays[i] || null;
    const urlT = relT ? joinPublicUrlFromDirAndRel(thumbDir, relT, PUBLIC_BASE_URL) : null;
    const urlO = relO ? joinPublicUrlFromDirAndRel(overDir,  relO,  PUBLIC_BASE_URL) : null;
    try {
      const optionNameStem = (relO ? filenameStem(relO) : "") || (relT ? filenameStem(relT) : "");
      await fillOneRowImages(i, container, {
        thumbUrl: urlT,
        overUrl : urlO,
        nameStem: optionNameStem,
        thumbSel: SEL_CELL_THUMB,
        overSel : SEL_CELL_OVER
      });
    } catch (e) {
      cserr(`Row ${i}: upload failed`, e?.message);
    }
    await delay(200);
  }

  cslog(`=== Done group: "${targetLabel}" ===\n`);
  return { label: targetLabel, need, rows_done: need };
}

// ===== Listener =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  cslog("onMessage:", msg?.type, "from", sender?.tab?.id || "bg", "URL:", location.href);
  if (msg?.type === "NCNAS_APPLY") {
    (async () => {
      try {
        const payload = msg?.payload;
        let summary = null;
        if (payload?.json) {
          summary = typeof payload.json === "string" ? JSON.parse(payload.json) : payload.json;
        } else if (payload && typeof payload === "object" && Array.isArray(payload.groups)) {
          summary = payload;
        } else if (typeof payload === "string") {
          try { const parsed = JSON.parse(payload); if (Array.isArray(parsed?.groups)) summary = parsed; } catch {}
        }

        const groups = Array.isArray(summary?.groups) ? summary.groups : [];
        if (!groups.length) throw new Error("No groups provided in payload");

        try {
          const previewAbs = summary?.previewImage || summary?.preview_image || "";
          if (previewAbs) await uploadPreviewImage(previewAbs);
        } catch (e) {
          cserr("[CS][preview] upload failed:", e?.message || e);
        }

        const results = [];
        for (const g of groups) {
          const r = await createOneDropdownGroup(g);
          results.push(r);
          await delay(450);
        }
        sendResponse({ ok: true, step: "all_groups_done", results });
      } catch (e) {
        cserr("apply flow failed:", e);
        try { sendResponse({ ok: false, error: e.message, step: "cs_exception" }); } catch {}
      }
    })();
    return true;
  }
});

cslog("content script loaded at URL:", location.href);
