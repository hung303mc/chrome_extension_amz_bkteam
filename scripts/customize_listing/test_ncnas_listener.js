// scripts/customize_listing/test_ncnas_listener.js

// ===== CẤU HÌNH API =====
const API_BASE = "http://14.241.234.118:5003/products"; // dùng ?sku=...

// Helper nhỏ để không crash khi gọi alert trong service worker
function safeAlert(msg) {
  if (typeof alert === "function") {
    try { alert(msg); } catch (_) {}
  } else {
    console.warn("[BG][NCNAS] alert skipped:", msg);
  }
}

// ===== (1) GỬI MESSAGE SANG TAB ĐANG ACTIVE =====
async function forwardToActiveTabApply(data) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return await chrome.tabs.sendMessage(tab.id, { type: "NCNAS_APPLY", payload: data });
}

// ===== (2) HANDLE REQUEST testNCNAS (NHẬN SKU) =====
async function handleTestNCNAS(req, res) {
  // chấp nhận cả req.sku (mới) và req.productName (cũ) cho tương thích
  const sku = (req.sku || req.productName || "").trim();
  if (!sku) {
    const msg = "[BG][NCNAS] ❌ Lỗi: sku is empty";
    console.warn(msg);
    safeAlert(msg);
    res({ error: "sku is empty" });
    return;
  }

  const apiUrl = `${API_BASE}?sku=${encodeURIComponent(sku)}`;
  console.log("[BG][NCNAS] 🌐 Gọi tới:", apiUrl);
  safeAlert(`[BG] Gọi API: ${apiUrl}`);

  try {
    const fetchRes = await fetch(apiUrl, { method: "GET" });
    if (!fetchRes.ok) {
      const errMsg = `[BG][NCNAS] ❌ HTTP ${fetchRes.status} ${fetchRes.statusText}`;
      console.warn(errMsg);
      safeAlert(errMsg);
      res({ error: `HTTP ${fetchRes.status} ${fetchRes.statusText}` });
      return;
    }

    // (3) Parse JSON thành công
    const data = await fetchRes.json();
    console.log("[BG][NCNAS] ✅ JSON nhận từ Flask:", data);
    safeAlert(`[BG][NCNAS] Nhận JSON thành công từ Flask (${sku})!`);

    // (4) Gửi sang content script để apply
    try {
      const applyResp = await forwardToActiveTabApply({ json: data });
      console.log("[BG][NCNAS] Apply response:", applyResp);
      res({ data, applyResp });
    } catch (e) {
      console.warn("[BG][NCNAS] Không gửi được sang tab:", e.message);
      res({ data, warning: "Could not message content script: " + e.message });
    }
  } catch (err) {
    const errMsg = `[BG][NCNAS] ⚠️ Lỗi khi gọi Flask: ${err?.message || "fetch failed"}`;
    console.error(errMsg);
    safeAlert(errMsg);
    res({ error: err?.message || "fetch failed" });
  }
}

// background.js (MV3 service worker)

const DEBUG_OPEN_URL_TABS = true;        // bật/tắt mở tab xem ảnh
const FETCH_TIMEOUT_MS = 45000;          // tăng timeout fetch 45s
const MAX_RETRIES = 2;                   // thử lại khi lỗi tạm thời

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  const t0 = performance.now();
  let res, buf;
  try {
    res = await fetch(url, { credentials: "omit", signal: ctrl.signal });
    const t1 = performance.now();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const lenHeader = res.headers.get("content-length");
    buf = await res.arrayBuffer();
    const t2 = performance.now();

    console.log("[BG][FETCH]",
      { url, status: res.status, ok: res.ok, contentType, contentLengthHeader: lenHeader },
      `t_total=${(t2 - t0).toFixed(1)}ms | t_headers=${(t1 - t0).toFixed(1)}ms | t_body=${(t2 - t1).toFixed(1)}ms | bytes=${buf.byteLength}`
    );

    return { ok: res.ok, status: res.status, contentType, buffer: buf };
  } finally {
    clearTimeout(to);
  }
}

// ===== BG: FETCH_IMAGE_CROSS_ORIGIN (base64-encoded) =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FETCH_IMAGE_CROSS_ORIGIN" && msg?.url) {
    (async () => {
      const url = msg.url;
      const timeoutMs = msg.timeoutMs || 45000;
      const MAX_RETRIES = 2;

      let lastErr;

      async function fetchWithTimeout(u, tmo) {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort("timeout"), tmo);
        try {
          const res = await fetch(u, {
            method: "GET",
            cache: "no-cache",
            redirect: "follow",
            signal: ctrl.signal,
          });
          clearTimeout(id);

          const ct = res.headers?.get?.("content-type") || "application/octet-stream";
          const cl = Number(res.headers?.get?.("content-length") || 0);

          const ab = await res.arrayBuffer();
          const size = ab.byteLength;

          console.log("[BG][FETCH] URL:", u);
          console.log("[BG][FETCH] status:", res.status, res.type);
          console.log("[BG][FETCH] content-type:", ct || "(unknown)");
          console.log("[BG][FETCH] content-length(hdr):", cl || "(n/a)");
          console.log("[BG][FETCH] arrayBuffer.byteLength:", size);

          const head = new Uint8Array(ab.slice(0, 64));
          const hex = Array.from(head).map(b => b.toString(16).padStart(2, "0")).join(" ");
          console.log("[BG][FETCH] head[0..63] hex:", hex);

          return { ok: res.ok, status: res.status, contentType: ct, buffer: ab };
        } finally {
          clearTimeout(id);
        }
      }

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const r = await fetchWithTimeout(url, timeoutMs);
          if (!r.ok) throw new Error(`HTTP_${r.status}`);

          // 🔁 ENCODE → base64 (an toàn cho sendMessage)
          const bytes = new Uint8Array(r.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const bufferBase64 = btoa(binary);

          // Gửi về CS dưới dạng base64 + contentType
          sendResponse({ ok: true, contentType: r.contentType, bufferBase64 });
          return;
        } catch (e) {
          lastErr = e;
          console.warn(`[BG] fetch attempt ${attempt + 1} failed:`, e?.message || e);
          if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 800));
        }
      }

      sendResponse({ ok: false, error: lastErr?.message || String(lastErr) });
    })();
    return true; // async
  }
});



// (5) Listener riêng, trả lời async
chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req && req.message === "testNCNAS") {
    (async () => { await handleTestNCNAS(req, res); })();
    return true; // sẽ res async
  }
  // Các message khác để background.js cũ xử lý
});
