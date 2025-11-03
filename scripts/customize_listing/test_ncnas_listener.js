// scripts/customize_listing/test_ncnas_listener.js

// Helper nhỏ để không crash khi gọi alert trong service worker
function safeAlert(msg) {
  // background service worker thường không có alert()
  if (typeof alert === "function") {
    try { alert(msg); } catch (e) {}
  } else {
    // optional: log ra console
    console.warn("[BG][NCNAS] alert skipped:", msg);
  }
}

// ===== (1) HÀM GỬI MESSAGE SANG TAB ĐANG ACTIVE =====
async function forwardToActiveTabApply(data) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  // gửi message cho content script
  const resp = await chrome.tabs.sendMessage(tab.id, { type: "NCNAS_APPLY", payload: data });
  return resp;
}

// ===== (2) HÀM XỬ LÝ KHI NHẬN REQ testNCNAS =====
async function handleTestNCNAS(req, res) {
  const productName = req.productName || "";
  if (!productName) {
    const msg = "[BG][NCNAS] ❌ Lỗi: productName is empty";
    console.warn(msg);
    safeAlert(msg);
    res({ error: "productName is empty" });
    return;
  }

  const apiUrl = `http://14.241.234.118:5003/products/${encodeURIComponent(productName)}`;
  console.log("[BG][NCNAS] 🌐 Gọi tới:", apiUrl);
  safeAlert(`[BG] Gọi API: ${apiUrl}`);

  try {
    const fetchRes = await fetch(apiUrl);
    if (!fetchRes.ok) {
      const errMsg = `[BG][NCNAS] ❌ HTTP ${fetchRes.status} ${fetchRes.statusText}`;
      console.warn(errMsg);
      safeAlert(errMsg);
      res({ error: `HTTP ${fetchRes.status} ${fetchRes.statusText}` });
      return;
    }

    // (3) Parse JSON thành công
    const data = await fetchRes.json();
    console.log("[BG][NCNAS] ✅ JSON nhận được từ Flask:", data);
    safeAlert(`[BG][NCNAS] Nhận JSON thành công từ Flask (${productName})!`);

    // (4) >>> GỬI sang content script để click nút
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

// (5) Tự đăng ký listener riêng. Không đụng vào background.js hiện có.
chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req && req.message === "testNCNAS") {
    (async () => { await handleTestNCNAS(req, res); })();
    return true; // báo sẽ res async
  }
  // các message khác để background.js cũ xử lý
});
