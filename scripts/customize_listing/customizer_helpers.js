// scripts/customize_listing/customizer_helpers.js
(() => {
  const CS = {};

  // ===== Logging =====
  CS.CS_DBG = true;
  CS.CS_TAG = "[CS][Customizer]";
  CS.cslog  = (...args) => { if (CS.CS_DBG) console.log(CS.CS_TAG, ...args); };
  CS.cswarn = (...args) => { if (CS.CS_DBG) console.warn(CS.CS_TAG, ...args); };
  CS.cserr  = (...args) => { if (CS.CS_DBG) console.error(CS.CS_TAG, ...args); };

  // ===== Deep queries =====
  // 🟩 Tìm phần tử theo selector trong cả shadow DOM (đệ quy)
  CS.deepQuerySelector = function(selectors, root = document) {
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
              CS.cslog("deepQuerySelector: found by", sel);
              return found;
            }
          } catch {}
        }
      }
      if (node && node.children) for (const c of node.children) stack.push(c);
      if (node && node.shadowRoot) stack.push(node.shadowRoot);
    }
    CS.cswarn("deepQuerySelector: not found. visited ≈", visited);
    return null;
  };

  // 🟩 Tìm tất cả phần tử theo selector trong DOM + shadow DOM
  CS.deepQueryAll = function(selector, root = document) {
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
  };

  // 🟩 Tìm phần tử chứa text cụ thể (so sánh lowercase)
  CS.deepFindByText = function(text, root = document) {
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
          CS.cslog("deepFindByText: found. snippet:", (el.outerHTML || "").slice(0, 200));
          return el;
        }
        for (const c of el.children) stack.push(c);
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    CS.cswarn("deepFindByText: not found. scanned ≈", scanned);
    return null;
  };

  // 🟩 Tìm theo nhiều selector, trả về phần tử đầu tiên match
  CS.deepQueryAny = function(selectors, root = document) {
    if (!Array.isArray(selectors)) selectors = [selectors];
    for (const sel of selectors) {
      const el = CS.deepQuerySelector(sel, root);
      if (el) return el;
    }
    return null;
  };

  // ===== Wait / delay =====
  CS.waitFor = async function(predicate, { timeout = 60000, interval = 150 } = {}) {
    const t0 = performance.now();
    while ((performance.now() - t0) < timeout) {
      try {
        const v = await predicate();
        if (v) return v;
      } catch {}
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error("Timeout waiting");
  };

  CS.delay = (ms) => new Promise(r => setTimeout(r, ms));

  // ===== Buttons (kat-button host + shadow) =====
  CS.clickKatButtonHost = function(btnHost) {
    btnHost?.click?.();
    try {
      if (btnHost?.shadowRoot) {
        const innerBtn = btnHost.shadowRoot.querySelector('button, [role="button"]');
        innerBtn?.click?.();
      }
    } catch (e) {
      CS.cswarn("clickKatButtonHost: inner click skipped:", e?.message);
    }
  };

  // ===== Fire general events on an element =====
  CS.fireAll = function(el) {
    if (!el) {
      console.warn("[CS][fireAll] ⚠️ element null/undefined");
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
  };

  // ===== Name / inputs inside KAT components =====
  CS.getInnerTextInputFromKatInput = function(host) {
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
      CS.cswarn("getInnerTextInputFromKatInput error:", e?.message);
    }
    return null;
  };

  CS.findRowRootFromCell = function(cell) {
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
  };

  CS.findNameInputInRow = function(rowEl) {
    if (!rowEl) return null;
    const katCandidates = rowEl.querySelectorAll('kat-input, kat-text-field, kat-text-input');
    for (const host of katCandidates) {
      const ph = (host.getAttribute("placeholder") || host.getAttribute("aria-label") || "").toLowerCase();
      if (ph.includes("name") || ph.includes("option") || ph.includes("label")) {
        const inp = CS.getInnerTextInputFromKatInput(host);
        if (inp) return inp;
      }
    }
    const txts = rowEl.querySelectorAll('input[type="text"], input:not([type]), textarea');
    for (const t of txts) {
      const ro = !!t.readOnly || t.getAttribute("readonly") != null;
      const dis = !!t.disabled || t.getAttribute("aria-disabled") === "true";
      const ph = (t.getAttribute("placeholder") || "").toLowerCase();
      if (!ro && !dis && !ph.includes("search")) return t;
    }
    for (const host of katCandidates) {
      const inp = CS.getInnerTextInputFromKatInput(host);
      if (inp) return inp;
    }
    return null;
  };

  CS.setOptionNameInRow = async function(rowEl, nameText) {
    if (!rowEl || !nameText) return false;
    const inp = CS.findNameInputInRow(rowEl);
    if (!inp) {
      CS.cswarn("[CS][name] ❌ No option-name input found in row");
      return false;
    }
    // 🟥 bỏ scrollIntoView
    try { inp.focus(); } catch {}
    inp.value = "";
    inp.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    for (const ch of String(nameText)) {
      inp.value += ch;
      inp.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      await CS.delay(10);
    }
    inp.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    inp.blur?.();
    CS.fireAll(inp);
    const ok = (inp.value || "").trim() === String(nameText).trim();
    CS.cslog(`[CS][name] set "${nameText}" → ${ok ? "OK" : "verify"}`);
    return ok;
  };

  // ===== File inputs / image upload =====
  CS.getFileInputInCell = function(cell) {
    if (!cell) return null;
    let inp = cell.querySelector('input[type="file"]');
    if (inp) return inp;
    const host = cell.querySelector('kat-file-input, kat-image-uploader');
    if (host?.shadowRoot) {
      inp = host.shadowRoot.querySelector('input[type="file"]');
      if (!inp) console.warn("[CS][upload] ❌ No file input found in cell", cell);
        else console.log("[CS][upload] ✅ Found file input", inp);
      if (inp) return inp;
    }
    return CS.deepQuerySelector('input[type="file"]', cell);
  };

  CS.dropFileOnCell = async function(cell, file) {
    const dropZone =
      cell.querySelector('.gestalt_drag-and-drop-area, [role="button"][class*="drag-and-drop"], .file-drag-and-drop-area') || cell;
    const dt = new DataTransfer();
    dt.items.add(file);
    const fire = (type) =>
      dropZone.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, dataTransfer: dt }));
    fire("dragenter"); fire("dragover"); fire("drop");
    await CS.delay(60);
    console.log("[CS][drop] Simulated drop on zone:", dropZone);
    return true;
  };

  CS.answerToBlob = function(ans) {
    if (ans?.bufferBase64) {
      const binary = atob(ans.bufferBase64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      const type = ans?.contentType || "application/octet-stream";
      return new Blob([bytes], { type });
    }
    if (ans?.buffer && typeof ans.buffer.byteLength === "number") {
      const type = ans?.contentType || "application/octet-stream";
      return new Blob([ans.buffer], { type });
    }
    throw new Error("answerToBlob: unsupported payload");
  };

  CS.uploadUrlToFileInput = async function(url, inputEl, { debugOpenTab = false, fetchTimeoutMs = 45000 } = {}) {
    if (!inputEl) throw new Error("uploadUrlToFileInput: input missing");
    // 🟥 bỏ scrollIntoView
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
          if (!ans?.ok) {
            console.timeEnd(`[CS] fetch ${url}`);
            return reject(new Error(ans?.error || "unknown"));
          }
          try {
            const b = CS.answerToBlob(ans);
            console.timeEnd(`[CS] fetch ${url}`);
            if (b.size < 2000) {
              const previewText = await new Response(b).text().catch(() => "(binary)");
              console.warn("[CS] ⚠️ Very small blob; preview:", previewText.slice(0, 200));
            }
            resolve(b);
          } catch (e) { reject(e); }
        }
      );
    });

    const nameFromUrl = decodeURIComponent((url.split("/").pop() || "image").split("?")[0]) || "image";
    const extFromType = blob.type === "image/jpeg" ? ".jpg"
                       : blob.type === "image/png"  ? ".png" : "";
    const safeName = nameFromUrl.includes(".") ? nameFromUrl : (nameFromUrl + extFromType || ".bin");
    const file = new File([blob], safeName, { type: blob.type || "image/png", lastModified: Date.now() });

    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;

    const hostCell = inputEl.closest('kat-file-input, kat-image-uploader, [data-test-id*="image"], .gestalt_compact-cell__tdNbj') || inputEl.parentElement;
    CS.fireAll(inputEl);
    CS.fireAll(hostCell);

    await CS.delay(400);
    const hasImg = !!hostCell?.querySelector?.('[class*="image-tile"], [class*="image-area"], img') || !!hostCell?.querySelector?.('img');
    if (!hasImg) {
      console.warn("[CS][upload] UI not reacting → try drag&drop fallback");
      try { await CS.dropFileOnCell(hostCell || inputEl.closest('body'), file); } catch (e) {
        console.warn("[CS][upload] drop fallback failed:", e?.message);
      }
    }
    return true;
  };

  CS.waitUntilCellUploaded = function(cell, inputEl, { timeout = 20000 } = {}) {
    if (inputEl?.files?.length) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(t); obs.disconnect(); resolve(true); };
      const t = setTimeout(() => { obs.disconnect(); reject(new Error("Timeout waiting")); }, timeout);
      const check = () => {
        if (cell.querySelector('img')) return done();
        const tile = cell.querySelector('[class*="image-tile"], [class*="image-area"]');
        if (tile) {
          const bg = getComputedStyle(tile).backgroundImage;
          if (bg && bg !== 'none') return done();
        }
        if (cell.querySelector('[data-test-id*="remove"], [aria-label*="Remove" i], [aria-label*="Replace" i]')) return done();
        const in2 = CS.getFileInputInCell(cell);
        if (in2?.files?.length) return done();
      };
      const obs = new MutationObserver(check);
      obs.observe(cell, { subtree: true, childList: true, attributes: true });
      check();
    });
  };

  // ===== URL helpers =====
  CS.absPathToPublic = function(relOrAbs, PUBLIC_BASE_URL) {
    if (!relOrAbs) return "";
    let p = String(relOrAbs).replace(/\\/g, "/");
    p = p
      .replace(/^\/\/?NCNAS\/web\//i, "")
      .replace(/^\/ncnas\/web\//i, "");
    const enc = p.split("/").map(encodeURIComponent).join("/");
    return (PUBLIC_BASE_URL || "/") + enc;
  };

  CS.joinPublicUrlFromDirAndRel = function(absDir, rel, PUBLIC_BASE_URL) {
    let dir = String(absDir || "").replace(/\\/g, "/");
    dir = dir
      .replace(/^\/\/?NCNAS\/web\//i, "")
      .replace(/^\/ncnas\/web\//i, "");
    const full = [dir.replace(/\/+$/,""), String(rel||"").replace(/^\/+/,"")].join("/");
    const enc = full.split("/").map(encodeURIComponent).join("/");
    return (PUBLIC_BASE_URL || "/") + enc;
  };

  CS.filenameStem = function(relOrUrl) {
    if (!relOrUrl) return "";
    const last = String(relOrUrl).split("?")[0].split("#")[0].split("/").pop() || relOrUrl;
    return last.replace(/\.[^.]+$/,"");
  };

  // ===== Virtualized list =====
  // 🟥 ĐÃ GỠ: getOptionListScroller / measureRowHeight / scrollToRow / scrollToTop

  // ===== Per-row helpers =====
  CS.getRowCells = function(container, { thumbSel, overSel }) {
    const thumbCells = Array.from(container.querySelectorAll(thumbSel));
    const overCells  = Array.from(container.querySelectorAll(overSel));
    const rows = Math.max(thumbCells.length, overCells.length);
    return { thumbCells, overCells, rows };
  };

  CS.uploadIntoCell = async function(cell, url, label) {
    if (!cell || !url) return false;
    try {
      // 🟥 bỏ scrollIntoView
      const inp = CS.getFileInputInCell(cell);
      if (!inp) {
        CS.cswarn(`[CS][upload ${label}] ❌ input not found`);
        return false;
      }
      await CS.uploadUrlToFileInput(url, inp, { debugOpenTab: false, fetchTimeoutMs: 45000 });
      CS.cslog(`[CS][upload ${label}] injected, waiting UI...`);
      await CS.waitUntilCellUploaded(cell, inp);
      CS.cslog(`[CS][upload ${label}] ✅ done`);
      return true;
    } catch (e) {
      CS.cserr(`[CS][upload ${label}] ❌ failed:`, e?.message || e);
      return false;
    }
  };

  CS.fillOneRowImages = async function(i, container, {
    thumbUrl, overUrl, nameStem, thumbSel, overSel
  }) {
    const { filenameStem, findRowRootFromCell, setOptionNameInRow,
            uploadIntoCell } = CS;

    const { thumbCells, overCells } = CS.getRowCells(container, { thumbSel, overSel });
    const thumbCell = thumbCells[i];
    const overCell  = overCells[i];
    const rowNo = i + 1;

    CS.cslog(`[CS][row ${rowNo}] start`, { thumbUrl, overUrl, nameStem });

    try {
      const baseCell = thumbCell || overCell;
      const rowEl = findRowRootFromCell(baseCell);
      const finalStem = nameStem || filenameStem(thumbUrl || "") || filenameStem(overUrl || "");
      if (rowEl && finalStem) {
        await setOptionNameInRow(rowEl, finalStem);
      } else {
        CS.cswarn(`[CS][row ${rowNo}] skip set name (rowEl/finalStem missing)`);
      }
    } catch (e) {
      CS.cserr(`[CS][row ${rowNo}] set name failed:`, e?.message || e);
    }

    let thumbOK = false;
    if (thumbCell && thumbUrl)   thumbOK = await uploadIntoCell(thumbCell, thumbUrl, `THUMB row ${rowNo}`);
    else CS.cswarn(`[CS][row ${rowNo}] thumbnail cell/url missing`);

    let overOK = false;
    if (overCell && overUrl)     overOK  = await uploadIntoCell(overCell,  overUrl,  `PREVIEW row ${rowNo}`);
    else CS.cswarn(`[CS][row ${rowNo}] preview cell/url missing`);

    CS.cslog(`[CS][row ${rowNo}] done → thumbOK=${thumbOK}, overOK=${overOK}`);
  };

  // Expose
  window.CS = CS;
})();
