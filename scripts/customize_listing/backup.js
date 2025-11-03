// scripts/customize_listing/customizer_runner.js

const CS_DBG = true;
const CS_TAG = "[CS][Customizer]";
const ENABLE_ADDING_OPTIONS = false; // ← Đặt false để CHỈ set Label, không tạo option

// B1: nút mở modal
const SELS_ADD_BTN = [
  'kat-button[data-test-id="container-picker-add-button"]',
  'kat-button[label*="Add customization" i].gestalt_add-new-pane-button__J0ie5'
];

// B3: nút Add trong modal (primary)
const SELS_MODAL_CONFIRM_BTN = [
  'kat-button[data-test-id="container-picker-modal-add-button"]',
  'kat-button[label="Add customization"][variant="primary"]'
];

// Ô Label trong pane mới
const SEL_LABEL_INPUTS = [
  'input[placeholder="Label"]',
  'input[aria-label="Label"]',
  'input[id^="katal-id-"]'
];

// Nút "Add option" trong group (compact)
const SEL_ADD_OPTION = 'span[data-test-id="compact-option-item-add-option-button"]';

function cslog(...args) { if (CS_DBG) console.log(CS_TAG, ...args); }
function cswarn(...args) { if (CS_DBG) console.warn(CS_TAG, ...args); }
function cserr(...args) { if (CS_DBG) console.error(CS_TAG, ...args); }

// --- Duyệt sâu ---
function deepQuerySelector(selectors, root = document) {
  if (!Array.isArray(selectors)) selectors = [selectors];
  const stack = [root];
  let visited = 0;
  while (stack.length) {
    const node = stack.pop();
    visited++;
    if (node && (node.querySelector instanceof Function)) {
      for (const sel of selectors) {
        try {
          const found = node.querySelector(sel);
          if (found) {
            cslog("deepQuerySelector: found by", sel);
            return found;
          }
        } catch {}
      }
    }
    if (node && node.children) for (const c of node.children) stack.push(c);
    if (node && node.shadowRoot) stack.push(node.shadowRoot);
  }
  cswarn("deepQuerySelector: not found. visited ≈", visited);
  return null;
}
function deepQueryAll(selector, root = document) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node && node.querySelectorAll instanceof Function) {
      try {
        const found = node.querySelectorAll(selector);
        if (found && found.length) out.push(...found);
      } catch {}
    }
    if (node && node.children) for (const c of node.children) stack.push(c);
    if (node && node.shadowRoot) stack.push(node.shadowRoot);
  }
  return out;
}

function deepFindByText(text, root = document) {
  const wanted = (text || "").toLowerCase();
  const stack = [root];
  let scanned = 0;
  while (stack.length) {
    const node = stack.pop();
    if (node?.nodeType === 1) {
      const el = node;
      scanned++;
      const txt = (el.textContent || "").toLowerCase().trim();
      if (txt.includes(wanted)) {
        cslog("deepFindByText: found. snippet:", (el.outerHTML || "").slice(0, 200));
        return el;
      }
      for (const c of el.children) stack.push(c);
      if (el.shadowRoot) stack.push(el.shadowRoot);
    }
  }
  cswarn("deepFindByText: not found. scanned ≈", scanned);
  return null;
}

// --- waitFor / delay ---
function waitFor(fnCheck, { timeout = 15000, interval = 120 } = {}) {
  cslog("waitFor: start", { timeout, interval });
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      try {
        const elOrTrue = fnCheck();
        if (elOrTrue) {
          clearInterval(timer);
          cslog("waitFor: done in", Date.now() - start, "ms");
          resolve(elOrTrue);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          cserr("waitFor: timeout after", timeout, "ms");
          reject(new Error("Timeout waiting"));
        }
      } catch (e) {
        clearInterval(timer);
        cserr("waitFor: fnCheck threw:", e?.message);
        reject(e);
      }
    }, interval);
  });
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- tiện ích click kat-button + inner shadow ---
function clickKatButtonHost(btnHost) {
  btnHost?.click?.();
  try {
    if (btnHost?.shadowRoot) {
      const innerBtn = btnHost.shadowRoot.querySelector('button, [role="button"]');
      innerBtn?.click?.();
    }
  } catch (e) {
    cswarn("clickKatButtonHost: inner click skipped:", e?.message);
  }
}

// ===================== B1/B2/B3 =====================
async function clickAddCustomizationOpenModal() {
  cslog("B1: waiting for add-button…");
  let btnHost = await waitFor(() => deepQuerySelector(SELS_ADD_BTN), { timeout: 20000, interval: 150 });
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
    () => deepQueryAll('kat-box[data-test-id="container-picker-modal-choice"]').length > 0,
    { timeout: 20000, interval: 150 }
  );
}
async function clickOptionDropdown() {
  cslog("B2: waiting for modal choices…");
  await waitForContainerPickerModal();
  const labels = deepQueryAll('.gestalt_choice-label__O7P2T, kat-box[data-test-id="container-picker-modal-choice"]');
  cslog("B2: label-like nodes =", labels.length);
  for (const node of labels) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (text.includes("option dropdown")) {
      const target = node.closest?.('kat-box[data-test-id="container-picker-modal-choice"]') || node;
      cslog("B2: clicking choice");
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
      cslog("B2: fallback clicking box");
      box.click();
      return true;
    }
  }
  throw new Error('B2: Could not find "Option Dropdown" choice');
}
async function clickModalAddCustomizationConfirm() {
  cslog("B3: waiting for modal confirm button…");
  const btnHost = await waitFor(() => deepQuerySelector(SELS_MODAL_CONFIRM_BTN), { timeout: 20000, interval: 150 });
  if (!btnHost) throw new Error("B3: Cannot find modal confirm 'Add customization' button");
  await waitFor(() => {
    const disabled = btnHost.hasAttribute?.('disabled') || btnHost.getAttribute?.('aria-disabled') === 'true';
    return !disabled ? btnHost : null;
  }, { timeout: 15000, interval: 120 });
  cslog("B3: clicking modal confirm button");
  clickKatButtonHost(btnHost);
  return true;
}

// ===================== NEW: Label & active container =====================

// Đợi ô Label xuất hiện (ưu tiên phần tử đang focus là input "Label")
async function waitForLabelInput() {
  return waitFor(() => {
    const ae = document.activeElement;
    if (
      ae &&
      ae.tagName === "INPUT" &&
      (ae.getAttribute("placeholder") === "Label" ||
        ae.getAttribute("aria-label") === "Label" ||
        (ae.id || "").startsWith("katal-id-"))
    ) {
      return ae;
    }
    // fallback: quét sâu
    return deepQuerySelector(SEL_LABEL_INPUTS);
  }, { timeout: 20000, interval: 150 });
}

// Gõ label và bắn event để UI nhận + verify giá trị đã được giữ lại
async function setGroupLabel(labelText) {
  const input = await waitForLabelInput();
  cslog("Label input found:", input);

  const finalText = labelText || "Choose Book";

  // focus + clear + type
  input.focus();
  try { input.setSelectionRange(0, (input.value || "").length); } catch {}
  input.value = "";
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  input.value = finalText;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur?.();

  // Verify lần 1: chính input giữ được giá trị
  if ((input.value || "").trim() !== finalText.trim()) {
    throw new Error(`Set label failed: input value="${input.value}" !== "${finalText}"`);
  }

  // Verify lần 2 (nhẹ): chờ UI “ổn định” 1 nhịp rồi kiểm lại
  await delay(150);
  if ((input.value || "").trim() !== finalText.trim()) {
    throw new Error(`Set label failed after settle: input value="${input.value}" !== "${finalText}"`);
  }

  cslog(`Set label to "${finalText}" OK`);
  return input;
}

// Lấy container tuỳ chỉnh đang mở (ancestor của ô Label) – nơi chứa nút Add option
function getActiveCustomizationContainerFromLabelInput(input) {
  let cur = input;
  for (let i = 0; i < 10 && cur; i++) {
    if (cur.querySelector?.(SEL_ADD_OPTION)) {
      cslog("Active customization container found:", cur);
      return cur;
    }
    cur = cur.parentElement || cur.getRootNode()?.host || null;
  }
  cswarn("Active container not found by walking up from label input; fallback to document");
  return document;
}

// Bấm Add option n lần trong container chỉ định
async function clickAddOptionNTimesInContainer(container, n) {
  if (!n || n <= 0) {
    cslog(`No need to add options, n=${n}`);
    return;
  }

  const addBtn = container.querySelector(SEL_ADD_OPTION);
  if (!addBtn) throw new Error("Add option button not found inside active customization container");

  cslog(`Adding ${n} option(s)…`);
  for (let i = 0; i < n; i++) {
    addBtn.click();
    await delay(300);
  }
  cslog(`Done adding ${n} option(s).`);
}

// ===================== Listener =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  cslog("onMessage:", msg?.type, "from", sender?.tab?.id || "bg", "URL:", location.href);
  if (msg?.type === "NCNAS_APPLY") {
    (async () => {
      try {
        cslog("NCNAS_APPLY received. payload keys:", Object.keys(msg.payload || {}));

        // B1 → B2 → B3
        await clickAddCustomizationOpenModal();
        await clickOptionDropdown();
        await clickModalAddCustomizationConfirm();

        // Resolve payload & JSON
        const payload = msg?.payload;
        cslog("[CS] Incoming payload =", payload);

        let summary = null;
        if (payload?.json) {
          summary = typeof payload.json === "string" ? JSON.parse(payload.json) : payload.json;
        } else if (payload && typeof payload === "object" && Array.isArray(payload.groups)) {
          summary = payload;
        } else if (typeof payload === "string") {
          try { const parsed = JSON.parse(payload); if (Array.isArray(parsed?.groups)) summary = parsed; } catch {}
        }

        cslog("=== JSON debug ===");
        cslog("summary =", summary);

        // Mặc định label & clicks
        let targetLabel = "Choose Book";
        let clicks = 0;

        if (summary?.groups?.length) {
          cslog("summary.groups.length =", summary.groups.length);
          const g =
            summary.groups.find(x => (x.key || "").toLowerCase() === "book") ||
            summary.groups.find(x => (x.label || "").toLowerCase() === "choose book") ||
            null;

          cslog("found group g =", g);

          if (g) {
            targetLabel = g.label || targetLabel;
            const num = Number(g.number_option || 0);
            cslog("raw number_option =", g.number_option, "→ parsed =", num);
            clicks = Math.max(num - 2, 0);
            cslog("computed clicks =", clicks, "(num - 2)");
          } else {
            cswarn("No matching group 'book' or 'Choose Book' found in summary.groups");
          }
        } else {
          cswarn("summary.groups empty or undefined");
        }

        // --- NEW FLOW: CHỈ set Label, nếu thất bại → throw và DỪNG LUÔN ---
        const labelInput = await setGroupLabel(targetLabel);

        // Cho UI vẽ lại tiêu đề/khung một nhịp
        await delay(300);

        // Nếu đang debug: KHÔNG tạo option, dừng ngay tại đây
        if (!ENABLE_ADDING_OPTIONS) {
          cslog("Skipping option creation because ENABLE_ADDING_OPTIONS = false");
          sendResponse({
            ok: true,
            step: "set_label_only",
            group_label: targetLabel,
            intended_clicks: 0
          });
          return; // ← KẾT THÚC FLOW tại đây
        }

        // Nếu bật tạo option: chỉ tiếp tục khi label set OK
        const activeContainer = getActiveCustomizationContainerFromLabelInput(labelInput);
        await clickAddOptionNTimesInContainer(activeContainer, clicks);

        sendResponse({
          ok: true,
          step: "set_label_and_added_options",
          group_label: targetLabel,
          intended_clicks: clicks
        });
      } catch (e) {
        cserr("apply flow failed:", e);
        try {
          sendResponse({ ok: false, error: e.message, step: "cs_exception" });
        } catch {}
      }
    })();
    return true; // async
  }
});

cslog("content script loaded at URL:", location.href);
