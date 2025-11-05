// scripts/customize_listing/customizer_runner.js

const CS_DBG = true;
const CS_TAG = "[CS][Customizer]";
const ENABLE_ADDING_OPTIONS = true; // tạo option theo JSON
const PUBLIC_BASE_URL = "https://files.bkteam.top/"; // domain publish từ \\NCNAS\web\...


// === NEW: base proxy tới Flask ===
const PROXY_BASE = "http://14.241.234.118:5003/proxy?u=";
function viaProxy(url) {
  if (!url) return url;
  if (url.startsWith(PROXY_BASE)) return url; // tránh bọc 2 lần
  return PROXY_BASE + encodeURIComponent(url);
}

// Nếu trang là HTTPS và proxy là HTTP → không dùng proxy (tránh mixed content)
function proxyUsableInThisPage() {
  return !(location.protocol === "https:" && PROXY_BASE.startsWith("http:"));
}


// ===== Selectors =====
const SELS_ADD_BTN = [
  'kat-button[data-test-id="container-picker-add-button"]',
  'kat-button[label*="Add customization" i].gestalt_add-new-pane-button__J0ie5'
];

const SELS_MODAL_CONFIRM_BTN = [
  'kat-button[data-test-id="container-picker-modal-add-button"]',
  'kat-button[label="Add customization"][variant="primary"]'
];


// === Preview Image (ô upload lớn ở đầu Surface) ===
const SEL_PREVIEW_ZONE = [
  'div.image-input.preview-container-base-image-upload',
  'div.image-upload', // wrapper chính quanh drop-zone
];
const SEL_PREVIEW_FILE_INPUT = [
  'div.image-upload input[type="file"][accept*="image"]',
  'input[type="file"][accept*="image/jpeg"]',
  'input[type="file"][accept*="image/png"]',
  // fallback cho host component tương lai:
  'kat-image-uploader input[type="file"]'
];
// Nút "Add option" trong group (compact)
const SEL_ADD_OPTION = 'span[data-test-id="compact-option-item-add-option-button"]';

// Input Label của pane Option Dropdown mới tạo
// (1) Bắt rộng theo value để chạm được vào header ngay sau khi tạo
const SEL_KAT_INPUT_OD_BROAD = 'kat-input[value^="Option Dropdown"]';
// (2) Bắt hẹp theo placeholder để chạm đúng ô Label bên trong container
const SEL_KAT_INPUT_OD_LABEL = 'kat-input[placeholder="Label"][value^="Option Dropdown"]';


// Cells hình ảnh theo hàng (mỗi hàng có 2 ô: thumbnail & overlay)
const SEL_CELL_THUMB = '[data-test-id="compact-option-item-thumbnail-image"]';
const SEL_CELL_OVER  = '[data-test-id="compact-option-item-overlay-image"]';

// Input file bên trong cell
const SEL_INPUT_FILE = 'input[type="file"]';

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
async function waitFor(predicate, { timeout = 60000, interval = 150 } = {}) {
  const t0 = performance.now();
  while ((performance.now() - t0) < timeout) {
    try {
      const v = await predicate();
      if (v) return v;
    } catch {}
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error("Timeout waiting");
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

// ==== FILE INPUT HELPERS ====
function getFileInputInCell(cell) {
  if (!cell) return null;
  // trong cell trước
  let inp = cell.querySelector(SEL_INPUT_FILE);
  if (inp) return inp;

  // nếu tương lai chuyển vào host có shadow
  const host = cell.querySelector('kat-file-input, kat-image-uploader');
  if (host?.shadowRoot) {
    inp = host.shadowRoot.querySelector('input[type="file"]');
    if (!inp) console.warn("[CS][upload] ❌ No file input found in cell", cell);
      else console.log("[CS][upload] ✅ Found file input", inp);
    if (inp) return inp;
  }

  // fallback: deep
  return deepQuerySelector('input[type="file"]', cell);
}

// ==== Name helpers ====
function filenameStem(relOrUrl) {
  if (!relOrUrl) return "";
  // nếu là URL -> lấy phần cuối
  const last = String(relOrUrl).split("?")[0].split("#")[0].split("/").pop() || relOrUrl;
  return last.replace(/\.[^.]+$/,""); // bỏ đuôi .png/.jpg/...
}

// Tìm "row root" từ 1 cell bất kỳ
function findRowRootFromCell(cell) {
  if (!cell) return null;
  return (
    cell.closest('[data-test-id="compact-option-item"]') ||
    cell.closest('.gestalt_compact-row') ||
    cell.closest('.gestalt_compact-option-row') ||
    cell.closest('.gestalt_compact-row__tdNbj') ||
    cell.closest('[data-test-id*="compact-option"]') ||
    cell.closest('[data-test-id*="option-item"]') ||
    cell.closest('[role="row"]') ||
    cell.parentElement
  );
}

// Tìm input để nhập tên option trong 1 hàng
function findNameInputInRow(rowEl) {
  if (!rowEl) return null;

  // Ưu tiên kat-input có placeholder gợi ý
  const katCandidates = rowEl.querySelectorAll('kat-input, kat-text-field, kat-text-input');
  for (const host of katCandidates) {
    const ph = (host.getAttribute("placeholder") || host.getAttribute("aria-label") || "").toLowerCase();
    if (ph.includes("name") || ph.includes("option") || ph.includes("label")) {
      const inp = getInnerTextInputFromKatInput(host);
      if (inp) return inp;
    }
  }

  // Fallback: bất kỳ input text có thể gõ
  const txts = rowEl.querySelectorAll('input[type="text"], input:not([type]), textarea');
  for (const t of txts) {
    const ro = !!t.readOnly || t.getAttribute("readonly") != null;
    const dis = !!t.disabled || t.getAttribute("aria-disabled") === "true";
    const ph = (t.getAttribute("placeholder") || "").toLowerCase();
    // tránh các input tìm kiếm/ẩn
    if (!ro && !dis && !ph.includes("search")) {
      return t;
    }
  }

  // Fallback: thử inner của bất kỳ kat-input còn lại
  for (const host of katCandidates) {
    const inp = getInnerTextInputFromKatInput(host);
    if (inp) return inp;
  }

  return null;
}

async function setOptionNameInRow(rowEl, nameText) {
  if (!rowEl || !nameText) return false;
  const inp = findNameInputInRow(rowEl);
  if (!inp) {
    cswarn("[CS][name] ❌ No option-name input found in row");
    return false;
  }

  // gõ vào input
  rowEl.scrollIntoView?.({ block: "center", inline: "nearest" });
  try { inp.focus(); } catch {}
  inp.value = "";
  inp.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  for (const ch of String(nameText)) {
    inp.value += ch;
    inp.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    await delay(10);
  }
  inp.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  inp.blur?.();

  fireAll(inp);
  const ok = (inp.value || "").trim() === String(nameText).trim();
  cslog(`[CS][name] set "${nameText}" → ${ok ? "OK" : "verify"}`);
  return ok;
}

// ==== FILE PREVIEW IMAGE HELPERS ====
function deepQueryAny(selectors, root = document) {
  if (!Array.isArray(selectors)) selectors = [selectors];
  for (const sel of selectors) {
    const el = deepQuerySelector(sel, root);
    if (el) return el;
  }
  return null;
}

async function waitForPreviewFileInput() {
  // Tìm vùng Preview trước, rồi lấy input trong vùng đó
  const zone = await waitFor(() => deepQueryAny(SEL_PREVIEW_ZONE), { timeout: 15000, interval: 120 });
  const input = await waitFor(() => deepQueryAny(SEL_PREVIEW_FILE_INPUT, zone), { timeout: 10000, interval: 120 });
  return { zone, input };
}

async function uploadPreviewImage(absPathOrUrl) {
  if (!absPathOrUrl) return false;

  // Nếu server trả đường dẫn UNC -> convert sang public URL
  const pub = absPathToPublic(absPathOrUrl);
  const url = proxyUsableInThisPage() ? viaProxy(pub) : pub;

  const { zone, input } = await waitForPreviewFileInput();

  // Dùng pipeline upload chung
  await uploadUrlToFileInput(url, input, { debugOpenTab: false, fetchTimeoutMs: 45000 });

  // Chờ UI render thumbnail/ảnh
  try {
    await waitUntilCellUploaded(zone, input, { timeout: 20000 });
  } catch (e) {
    // fallback drag&drop nếu change không kick pipeline
    const name = decodeURIComponent((url.split("/").pop() || "preview").split("?")[0]) || "preview.jpg";
    const resp = await fetch(url);
    const blob = await resp.blob();
    const file = new File([blob], name, { type: blob.type || "image/jpeg" });
    await dropFileOnCell(zone, file);
  }

  cslog("[CS][preview] ✅ Uploaded Preview Image");
  return true;
}

// ==== Virtualized list helpers ====
const SEL_VLIST = '.compact-virtualized-option-list';

function getOptionListScroller(container) {
  // ưu tiên container hiện tại
  let s = container.querySelector(SEL_VLIST);
  if (s) return s;
  // fallback toàn document (trường hợp DOM wrap hơi khác)
  s = document.querySelector(SEL_VLIST);
  if (s) return s;
  // fallback: bất kỳ div có overflow và height lớn
  const cand = Array.from(container.querySelectorAll('div'))
    .filter(d => {
      const cs = getComputedStyle(d);
      return (cs.overflowY === 'auto' || cs.overflow === 'auto') && d.clientHeight > 300;
    });
  return cand[0] || container;
}

function measureRowHeight(scroller) {
  // tìm 1 item đang render để ước lượng chiều cao
  const item = scroller.querySelector('[data-rbd-draggable-id], .gestalt_draggable__rHcRM, [data-test-id*="compact-option-item"]');
  if (item) {
    const h = item.getBoundingClientRect().height || 80;
    return Math.max(40, Math.min(200, h));
  }
  // mặc định
  return 80;
}

async function scrollToRow(container, i /* 0-based */) {
  const scroller = getOptionListScroller(container);
  const rowH = measureRowHeight(scroller);
  // cuộn sao cho hàng i nằm gần đầu viewport
  scroller.scrollTop = Math.max(0, i * rowH - rowH);
  await delay(120);
}

async function scrollToTop(container) {
  const scroller = getOptionListScroller(container);
  scroller.scrollTop = 0;
  // đảm bảo thật sự về đầu
  await delay(150);
}


// ===================== B1/B2/B3 =====================
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
  const btnHost = await waitFor(() => deepQuerySelector(SELS_MODAL_CONFIRM_BTN));
  if (!btnHost) throw new Error("B3: Cannot find modal confirm 'Add customization' button");
  await waitFor(() => {
    const disabled = btnHost.hasAttribute?.('disabled') || btnHost.getAttribute?.('aria-disabled') === 'true';
    return !disabled ? btnHost : null;
  }, { timeout: 15000, interval: 120 });
  cslog("B3: clicking modal confirm button");
  clickKatButtonHost(btnHost);
  return true;
}

// ===================== Target đúng kat-input "Option Dropdown" =====================
async function waitForTargetKatInput(selector = SEL_KAT_INPUT_OD_BROAD, root = document) {
  return waitFor(() => {
    const list = deepQueryAll(selector, root);
    if (list.length) {
      cslog("waitForTargetKatInput: found by", selector, "count=", list.length);
      // Ưu tiên cái cuối cùng (thường là pane vừa tạo)
      return list[list.length - 1];
    }
    return null;
  });
}

function getInnerTextInputFromKatInput(host) {
  if (!host) return null;
  try {
    let inp = host.shadowRoot?.querySelector('input[part="input"], input[type="text"], input');
    if (inp) return inp;
    const uid = host.getAttribute('unique-id') || host.getAttribute('id') || '';
    if (uid) {
      const fallback = document.querySelector(`input#${CSS.escape(uid)}, input[id^="${CSS.escape(uid)}"]`);
      if (fallback) return fallback;
    }
    const local = host.querySelector?.('input[part="input"], input[type="text"], input');
    if (local) return local;
  } catch (e) {
    cswarn("getInnerTextInputFromKatInput error:", e?.message);
  }
  return null;
}

async function setKatInputLabel(host, labelText) {
  const input = getInnerTextInputFromKatInput(host);
  if (!input) throw new Error("Cannot find inner input of kat-input");

  const finalText = labelText || "Choose Book";

  // Chắc chắn focus đúng ô
  host.scrollIntoView?.({ block: "center", inline: "nearest" });
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

  // đồng bộ attribute cho host
  try { host.setAttribute("value", finalText); } catch {}

  const gotInput = (input.value || "").trim();
  const gotHost = (host.getAttribute("value") || "").trim();
  if (gotInput !== finalText.trim() && gotHost !== finalText.trim()) {
    throw new Error(`Set kat-input label failed: input="${gotInput}" host="${gotHost}" ≠ "${finalText}"`);
  }
  cslog(`Set kat-input label to "${finalText}" OK`);
  return input;
}

// Lấy container tuỳ chỉnh đang mở (ancestor của ô Label) – nơi chứa nút Add option
function getActiveCustomizationContainerFromLabelInput(inputOrHost) {
  let cur = inputOrHost;
  for (let i = 0; i < 12 && cur; i++) {
    if (cur.querySelector?.(SEL_ADD_OPTION)) {
      cslog("Active customization container found:", cur);
      return cur;
    }
    cur = cur.parentElement || cur.getRootNode()?.host || null;
  }
  cswarn("Active container not found by walking up from label input; fallback to document");
  return document;
}

// Bấm Add option n lần trong container chỉ định (có batching cho số lớn)
async function clickAddOptionNTimesInContainer(container, n) {
  if (!n || n <= 0) {
    cslog(`No need to add options, n=${n}`);
    return;
  }
  const addBtn = container.querySelector(SEL_ADD_OPTION);
  if (!addBtn) throw new Error("Add option button not found inside active customization container");

  cslog(`Adding ${n} option(s)…`);
  const BATCH = 10; // nhấp theo lô để UI kịp render
  let left = n;
  while (left > 0) {
    const take = Math.min(BATCH, left);
    for (let i = 0; i < take; i++) {
      addBtn.click();
      await delay(120);
    }
    left -= take;
    // đợi một nhịp dài hơn sau mỗi batch
    await delay(350);
  }
  cslog(`Done adding ${n} option(s).`);
}

// ===================== URL helpers =====================
// Cắt prefix \\NCNAS\web\ hoặc /ncnas/web/ và encode từng segment
function absPathToPublic(relOrAbs) {
  if (!relOrAbs) return "";
  let p = String(relOrAbs).replace(/\\/g, "/");
  p = p
    .replace(/^\/\/?NCNAS\/web\//i, "")
    .replace(/^\/ncnas\/web\//i, "");
  const enc = p.split("/").map(encodeURIComponent).join("/");
  return PUBLIC_BASE_URL + enc;
}
function joinPublicUrlFromDirAndRel(absDir, rel) {
  let dir = String(absDir || "").replace(/\\/g, "/");
  dir = dir
    .replace(/^\/\/?NCNAS\/web\//i, "")
    .replace(/^\/ncnas\/web\//i, "");
  const full = [dir.replace(/\/+$/,""), String(rel||"").replace(/^\/+/,"")].join("/");
  const enc = full.split("/").map(encodeURIComponent).join("/");
  return PUBLIC_BASE_URL + enc;
}

function fireAll(el) {
  if (!el) {
    console.warn("[CS][fireAll] ⚠️ element null hoặc undefined");
    return;
  }

  const tag = el.tagName?.toLowerCase() || "(unknown)";
  const info = `${tag}${el.type ? `[type=${el.type}]` : ""}${el.id ? `#${el.id}` : ""}`;
  console.log(`[CS][fireAll] 🔸 Triggering events on ${info}`, el);

  for (const ev of ["input", "change", "blur"]) {
    try {
      el.dispatchEvent(new Event(ev, { bubbles: true, composed: true }));
      console.log(`[CS][fireAll] ✅ Fired '${ev}' on`, el);
    } catch (e) {
      console.warn(`[CS][fireAll] ❌ Event '${ev}' failed:`, e);
    }
  }
}

// ================== Upload helpers ==================
// Helper: chuyển ans từ BG thành Blob đúng
function answerToBlob(ans) {
  // Ưu tiên base64 từ BG
  if (ans?.bufferBase64) {
    const binary = atob(ans.bufferBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const type = ans?.contentType || "application/octet-stream";
    return new Blob([bytes], { type });
  }

  // Phòng khi tương lai bạn gửi kèm ArrayBuffer chuẩn
  if (ans?.buffer && typeof ans.buffer.byteLength === "number") {
    const type = ans?.contentType || "application/octet-stream";
    return new Blob([ans.buffer], { type });
  }

  throw new Error("answerToBlob: unsupported payload (no bufferBase64/ArrayBuffer)");
}


// Helper: giả lập drag&drop lên cell nếu change không kích hoạt pipeline
async function dropFileOnCell(cell, file) {
  const dropZone =
    cell.querySelector('.gestalt_drag-and-drop-area, [role="button"][class*="drag-and-drop"], .file-drag-and-drop-area') || cell;

  const dt = new DataTransfer();
  dt.items.add(file);

  const fire = (type) =>
    dropZone.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, dataTransfer: dt }));

  fire("dragenter");
  fire("dragover");
  fire("drop");
  await delay(60);
  console.log("[CS][drop] Simulated drop on zone:", dropZone);
  return true;
}

async function uploadUrlToFileInput(url, inputEl, options = {}) {
  const { debugOpenTab = false, fetchTimeoutMs = 45000 } = options; // mặc định tắt debugOpenTab
  if (!inputEl) throw new Error("uploadUrlToFileInput: input missing");

  inputEl.scrollIntoView?.({ block: "center", inline: "nearest" });

  if (inputEl.files && inputEl.files.length > 0) {
    console.log("[CS] skip upload because input already has file(s)");
    return true;
  }

  console.time(`[CS] fetch ${url}`);
  const blob = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "FETCH_IMAGE_CROSS_ORIGIN", url, debugOpenTab, timeoutMs: fetchTimeoutMs },
      async (ans) => {
        if (chrome.runtime.lastError) {
          console.timeEnd(`[CS] fetch ${url}`);
          return reject(new Error(chrome.runtime.lastError.message));
        }
        console.log("[CS][FETCH] ans keys =", Object.keys(ans || {}));
        console.log("[CS][FETCH] has bufferBase64 =", typeof ans?.bufferBase64 === "string");
        console.log("[CS][FETCH] bufferBase64 length =", ans?.bufferBase64?.length || 0);
        console.log("[CS][FETCH] contentType =", ans?.contentType);


        if (!ans?.ok) {
          console.timeEnd(`[CS] fetch ${url}`);
          return reject(new Error(ans?.error || "unknown"));
        }
        try {
          const b = answerToBlob(ans);
          console.timeEnd(`[CS] fetch ${url}`);
          console.log("[CS] blob", { type: b.type, size: b.size });

          if (b.size < 2000) {
            // Preview nội dung text nếu payload quá nhỏ
            const previewText = await new Response(b).text().catch(() => "(binary)");
            console.warn("[CS] ⚠️ Very small blob; preview:", previewText.slice(0, 200));
          }
          resolve(b);
        } catch (e) {
          reject(e);
        }
      }
    );
  });

  // Tạo File và gán vào input
  const nameFromUrl = decodeURIComponent((url.split("/").pop() || "image").split("?")[0]) || "image";
  const extFromType = blob.type === "image/jpeg" ? ".jpg"
                     : blob.type === "image/png"  ? ".png"
                     : "";
  const safeName = nameFromUrl.includes(".") ? nameFromUrl : (nameFromUrl + extFromType || ".bin");

  const file = new File([blob], safeName, { type: blob.type || "image/png", lastModified: Date.now() });
  const dt = new DataTransfer();
  dt.items.add(file);

  inputEl.files = dt.files;
  console.log("[CS][upload] After assign, input.files length =", inputEl.files?.length, "file:", file);

  // Phát event lên input và host/wrapper
  const hostCell = inputEl.closest('kat-file-input, kat-image-uploader, [data-test-id*="image"], .gestalt_compact-cell__tdNbj') || inputEl.parentElement;
  fireAll(inputEl);
  fireAll(hostCell);

  // Nếu UI không phản hồi, fallback drag&drop vào cell
  await delay(400);
  const uiTile = hostCell?.querySelector?.('[class*="image-tile"], [class*="image-area"], img');
  const hasImg = !!uiTile || !!hostCell?.querySelector?.('img');
  if (!hasImg) {
    console.warn("[CS][upload] UI not reacting → try drag&drop fallback");
    try { await dropFileOnCell(hostCell || inputEl.closest('body'), file); } catch (e) {
      console.warn("[CS][upload] drop fallback failed:", e?.message);
    }
  }

  console.log("[CS] file assigned", { name: file.name, size: file.size, type: file.type });
  return true;
}






// Chờ tới khi cell xem như "uploaded"
async function waitUntilCellUploaded(cell, inputEl, { timeout = 20000 } = {}) {
  // nếu chính input đã có files → pass nhanh
  if (inputEl?.files?.length) return true;

  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(t); obs.disconnect(); resolve(true); };
    const t = setTimeout(() => { obs.disconnect(); reject(new Error("Timeout waiting")); }, timeout);

    const check = () => {
      // 1) có <img> render
      if (cell.querySelector('img')) return done();

      // 2) background-image ở tile
      const tile = cell.querySelector('[class*="image-tile"], [class*="image-area"]');
      if (tile) {
        const bg = getComputedStyle(tile).backgroundImage;
        if (bg && bg !== 'none') return done();
      }

      // 3) có nút remove/replace
      if (cell.querySelector('[data-test-id*="remove"], [aria-label*="Remove" i], [aria-label*="Replace" i]')) return done();

      // 4) input mới sinh ra có files
      const in2 = getFileInputInCell(cell);
      if (in2?.files?.length) return done();
    };

    const obs = new MutationObserver(check);
    obs.observe(cell, { subtree: true, childList: true, attributes: true });
    check();
  });
}


// Lấy danh sách cells theo thứ tự hàng trong container
function getRowCells(container) {
  const thumbCells = Array.from(container.querySelectorAll(SEL_CELL_THUMB));
  const overCells  = Array.from(container.querySelectorAll(SEL_CELL_OVER));
  const rows = Math.max(thumbCells.length, overCells.length);
  return { thumbCells, overCells, rows };
}

// Upload vào 1 cell an toàn, trả về true/false (không throw)
async function uploadIntoCell(cell, url, label) {
  if (!cell || !url) return false;

  try {
    cell.scrollIntoView?.({ block: "center", inline: "nearest" });
    const inp = getFileInputInCell(cell);
    if (!inp) {
      cswarn(`[CS][upload ${label}] ❌ input not found`);
      return false;
    }

    await uploadUrlToFileInput(url, inp, { debugOpenTab: false, fetchTimeoutMs: 45000 });
    cslog(`[CS][upload ${label}] injected, waiting UI...`);
    await waitUntilCellUploaded(cell, inp);
    cslog(`[CS][upload ${label}] ✅ done`);
    return true;
  } catch (e) {
    cserr(`[CS][upload ${label}] ❌ failed:`, e?.message || e);
    return false;
  }
}


// Upload 1 hàng: PREVIEW (overlay) trước, rồi THUMBNAIL
// Upload 1 hàng: THUMBNAIL trước; nếu thumbnail KHÔNG được thì vẫn thử PREVIEW.
// Dù cái nào fail cũng KHÔNG throw để không làm nhảy sang row tiếp theo.
// Upload 1 hàng + điền tên option theo filename stem
async function fillOneRowImages(i, container, thumbUrl, overUrl, nameStem) {
  const { thumbCells, overCells } = getRowCells(container);
  const thumbCell = thumbCells[i];
  const overCell  = overCells[i];

  const rowNo = i + 1;
  cslog(`[CS][row ${rowNo}] start`, { thumbUrl, overUrl, nameStem });

  // 3) ĐIỀN TÊN OPTION (lấy stem từ overlay hoặc thumbnail)
  try {
    const baseCell = thumbCell || overCell;
    const rowEl = findRowRootFromCell(baseCell);
    const finalStem = nameStem ||
                      filenameStem(thumbUrl || "") ||
                      filenameStem(overUrl || "");
    if (rowEl && finalStem) {
      await setOptionNameInRow(rowEl, finalStem);
    } else {
      cswarn(`[CS][row ${rowNo}] skip set name (rowEl/finalStem missing)`);
    }
  } catch (e) {
    cserr(`[CS][row ${rowNo}] set name failed:`, e?.message || e);
  }

  // 1) THUMBNAIL trước
  let thumbOK = false;
  if (thumbCell && thumbUrl) {
    thumbOK = await uploadIntoCell(thumbCell, thumbUrl, `THUMB row ${rowNo}`);
  } else {
    cswarn(`[CS][row ${rowNo}] thumbnail cell/url missing`);
  }

  // 2) PREVIEW
  let overOK = false;
  if (overCell && overUrl) {
    overOK = await uploadIntoCell(overCell, overUrl, `PREVIEW row ${rowNo}`);
  } else {
    cswarn(`[CS][row ${rowNo}] preview cell/url missing`);
  }

  

  cslog(`[CS][row ${rowNo}] done → thumbOK=${thumbOK}, overOK=${overOK}`);
}





// ===================== MAIN PER-GROUP FLOW =====================
async function createOneDropdownGroup(group) {
  const targetLabel = (group?.label || "").trim() || "Choose";
  const thumbnails = Array.isArray(group?.thumbnail) ? group.thumbnail : [];
  const overlays   = Array.isArray(group?.overlay) ? group.overlay : [];
  const thumbDir   = group?.thumbnail_dir || "";
  const overDir    = group?.preview_dir || "";

  // Số option mong muốn: theo number_option, nhưng đảm bảo >= số ảnh
  const baseNum = Number(group?.number_option || 0);
  const need = Math.max(baseNum, thumbnails.length, overlays.length);
  const clicks = Math.max(need - 2, 0);

  cslog(`\n=== Create group: "${targetLabel}" (need=${need} → clicks=${clicks}) ===`);

  // B1 → B2 → B3 cho từng group
  await clickAddCustomizationOpenModal();
  await clickOptionDropdown();
  await clickModalAddCustomizationConfirm();

  // Đợi kat-input mới xuất hiện và đổi tên
  // Đợi kat-input mới xuất hiện và đổi tên (2 bước: header → label trong container)
  let labelHost;        // giữ lại tên biến cũ để các đoạn dưới không phải đổi
  let container;        // container scope cho các bước tiếp theo

  try {
    // Bước 1: Bắt rộng theo value^="Option Dropdown" để chạm header của pane vừa tạo
    const labelHostBroad = await waitForTargetKatInput(SEL_KAT_INPUT_OD_BROAD, document);
    await setKatInputLabel(labelHostBroad, targetLabel);

    // Xác định container từ host vừa gõ (container này sẽ được dùng XUYÊN SUỐT)
    container = getActiveCustomizationContainerFromLabelInput(labelHostBroad) || document;

    // Bước 2: Thử bắt đúng ô Label trong CHÍNH container đó (nếu tồn tại) và điền lại
    try {
      const labelHostNarrow = await waitForTargetKatInput(SEL_KAT_INPUT_OD_LABEL, container);
      if (labelHostNarrow) {
        await setKatInputLabel(labelHostNarrow, targetLabel);
        labelHost = labelHostNarrow;  // ưu tiên giữ host hẹp
      } else {
        labelHost = labelHostBroad;   // fallback dùng host rộng
      }
    } catch {
      labelHost = labelHostBroad;     // nếu không thấy host hẹp thì dùng host rộng
    }
  } catch (e) {
    cserr("Set label failed for group:", targetLabel, e?.message);
    throw e;
  }

  // Cho UI vẽ lại
  await delay(300);

  // Thêm đủ option
  container = getActiveCustomizationContainerFromLabelInput(labelHost);
  if (ENABLE_ADDING_OPTIONS) {
    await clickAddOptionNTimesInContainer(container, clicks);
  }

  // Re-scan rows sau khi thêm options
  await delay(300);


  // VIRTUALIZED: về đầu để i=0 tương ứng Option 1
  await scrollToTop(container);
  await delay(120);

  // Lặp từng hàng: upload thumbnail rồi overlay
  for (let i = 0; i < need; i++) {

    // VIRTUALIZED: cuộn để render hàng i
    await scrollToRow(container, i);

    const relT = thumbnails[i] || null;
    const relO = overlays[i] || null;

    const urlT = relT ? joinPublicUrlFromDirAndRel(thumbDir, relT) : null;
    const urlO = relO ? joinPublicUrlFromDirAndRel(overDir, relO) : null;

    cslog(`Row ${i + 1}/${need}:`, { urlT, urlO });

    try {
      // Lấy stem theo thứ tự ưu tiên: overlay[i] -> thumbnail[i]
      const stemFromOverlay = relO ? filenameStem(relO) : "";
      const stemFromThumb   = relT ? filenameStem(relT) : "";
      const optionNameStem  = stemFromOverlay || stemFromThumb;

      await fillOneRowImages(i, container, urlT, urlO, optionNameStem);
    } catch (e) {
      cserr(`Row ${i}: upload failed`, e?.message);
      // tiếp tục hàng tiếp theo, không throw để không dừng nhóm
    }

    // Nhịp nhỏ giữa các hàng
    await delay(200);
  }

  cslog(`=== Done group: "${targetLabel}" ===\n`);
  return { label: targetLabel, need, rows_done: need };
}

// ===================== Listener =====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  cslog("onMessage:", msg?.type, "from", sender?.tab?.id || "bg", "URL:", location.href);
  if (msg?.type === "NCNAS_APPLY") {
    (async () => {
      try {
        // Parse payload/JSON
        const payload = msg?.payload;
        let summary = null;
        if (payload?.json) {
          summary = typeof payload.json === "string" ? JSON.parse(payload.json) : payload.json;
        } else if (payload && typeof payload === "object" && Array.isArray(payload.groups)) {
          summary = payload;
        } else if (typeof payload === "string") {
          try { const parsed = JSON.parse(payload); if (Array.isArray(parsed?.groups)) summary = parsed; } catch {}
        }
        cslog("Parsed summary:", summary);

        // Validate groups
        const groups = Array.isArray(summary?.groups) ? summary.groups : [];
        if (!groups.length) throw new Error("No groups provided in payload");
        
        // (NEW) Nếu có previewImage ở cấp product → upload TRƯỚC khi tạo các group
        try {
          const previewAbs = summary?.previewImage || summary?.preview_image || "";
          if (previewAbs) {
            cslog("[CS][preview] Found previewImage in payload:", previewAbs);
            await uploadPreviewImage(previewAbs);
            // nghỉ nhẹ để UI ổn định
            await delay(300);
          } else {
            cslog("[CS][preview] No previewImage provided in payload");
          }
        } catch (e) {
          cserr("[CS][preview] upload failed:", e?.message || e);
        }

        const results = [];

        // CHẠY TUẦN TỰ THEO TỪNG GROUP
        for (const g of groups) {
          const r = await createOneDropdownGroup(g);
          results.push(r);
          // Nghỉ một nhịp giữa các group để UI ổn định
          await delay(450);
        }

        sendResponse({ ok: true, step: "all_groups_done", results });
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
