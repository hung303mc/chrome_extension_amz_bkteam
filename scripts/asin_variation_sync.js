(function () {
  const DOMAIN_GLB = "https://bkteam.top";
  const API_BASE = `${DOMAIN_GLB}/dungvuong-admin/api/Api_ASIN_Manager.php`;
  const MAX_DEFAULT_ITERATIONS = 2000;
  const VARWIZ_SEARCH_INPUT = "#varwiz-search-text";
  const VARWIZ_SEARCH_BUTTON = "span.a-declarative.searchButton span span";
  const VARIATION_TABLE_SELECTOR = "#variation-table";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(predicate, { timeout = 15000, interval = 200 } = {}) {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = predicate();
      if (result) {
        return result;
      }
      if (Date.now() - start > timeout) {
        throw new Error("Timed out waiting for condition");
      }
      await sleep(interval);
    }
  }

  async function fetchNewAsin() {
    try {
      const response = await fetch(`${API_BASE}?case=1`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "case=1",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ASIN: ${response.status}`);
      }
      const text = (await response.text()).trim();
      return text.replace(/"/g, "");
    } catch (error) {
      console.error("[VariationSync] fetchNewAsin error", error);
      return "";
    }
  }

  function buildVariationPayload(tableElement) {
    const rows = Array.from(tableElement.querySelectorAll("tr"));
    if (rows.length <= 1) {
      return null;
    }

    const variationData = {};
    const parentId = rows[1]?.getAttribute("id") || "";

    rows.slice(1).forEach((row, index) => {
      const asin = row.getAttribute("id") || "";
      if (!asin) {
        return;
      }
      const variation = {
        asin,
        parent: index === 0 ? "" : parentId,
        relationship: index === 0 ? "parent" : "child",
      };
      variationData[`variation_${index}`] = variation;
    });

    return variationData;
  }

  async function sendVariationData(json) {
    try {
      const params = new URLSearchParams();
      params.append("info", json);
      const response = await fetch(`${API_BASE}?case=2`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to send variation data: ${response.status}`);
      }
      console.log("[VariationSync] Data sent successfully for payload", json);
    } catch (error) {
      console.error("[VariationSync] sendVariationData error", error);
    }
  }

  const VARWIZ_MESSAGE_SELECTOR = ".msgList";
  const VARWIZ_ERROR_MESSAGES = [
    "The ASIN you searched for is not part of any variation family.",
    "This ASIN's variation family is not supported on this experience.",
  ];

  function extractMessageText(container) {
    if (!container) {
      return "";
    }
    const items = Array.from(container.querySelectorAll("li"));
    if (!items.length) {
      return container.textContent.trim();
    }
    return items.map((item) => item.textContent.trim()).join(" ");
  }

  function normalizeWhitespace(text) {
    if (!text) {
      return "";
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function isElementVisible(element) {
    if (!element) {
      return false;
    }
    const hasSize = element.offsetWidth > 0 || element.offsetHeight > 0;
    const hasClientRects = element.getClientRects && element.getClientRects().length > 0;
    return !!(hasSize || hasClientRects);
  }

  async function searchAsinOnPage(asin) {
    const searchInput = await waitFor(() => document.querySelector(VARWIZ_SEARCH_INPUT), {
      timeout: 10000,
      interval: 200,
    });
    const searchButton = document.querySelector(VARWIZ_SEARCH_BUTTON);
    if (!searchButton) {
      throw new Error("Search button not found on the page");
    }

    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);

    searchInput.value = asin;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(100);

    searchButton.click();

    const previousMessageSignature = normalizeWhitespace(
      extractMessageText(document.querySelector(VARWIZ_MESSAGE_SELECTOR))
    );
    const searchStart = Date.now();

    const searchResult = await waitFor(() => {
      const element = document.querySelector(VARIATION_TABLE_SELECTOR);
      if (element) {
        const rows = element.querySelectorAll("tr");
        if (rows.length > 1) {
          return { type: "table", element };
        }
      }

      const messageContainer = document.querySelector(VARWIZ_MESSAGE_SELECTOR);
      if (messageContainer && isElementVisible(messageContainer)) {
        const messageText = normalizeWhitespace(extractMessageText(messageContainer));
        const waitedEnough = Date.now() - searchStart > 1200;
        const messageChanged = messageText && messageText !== previousMessageSignature;
        const matchesError = VARWIZ_ERROR_MESSAGES.some((msg) => messageText.includes(msg));
        const includesCurrentAsin = messageText.includes(asin);
        if (
          waitedEnough &&
          matchesError &&
          (messageChanged || includesCurrentAsin)
        ) {
          return { type: "error", message: messageText };
        }
      }

      return false;
    }, {
      timeout: 15000,
      interval: 300,
    });

    await sleep(500);

    if (searchResult.type === "error") {
      console.warn(`[VariationSync] ASIN ${asin} returned error message: ${searchResult.message}`);
      return null;
    }

    return searchResult.element;
  }

  async function runVariationSync({ maxIterations = MAX_DEFAULT_ITERATIONS } = {}) {
    if (!location.href.includes("/listing/varwiz")) {
      console.warn("[VariationSync] This helper is intended for the listing variation wizard page.");
      return;
    }

    for (let i = 0; i < maxIterations; i += 1) {
      const asin = await fetchNewAsin();
      if (!asin) {
        console.log("[VariationSync] No ASIN returned from server, stop processing.");
        break;
      }

      console.log(`[VariationSync] Processing ASIN ${asin}`);
      try {
        const table = await searchAsinOnPage(asin);
        if (!table) {
          console.warn(`[VariationSync] Skipping ASIN ${asin} due to unsupported variation data.`);
          continue;
        }

        const variationData = buildVariationPayload(table);
        if (!variationData) {
          console.warn(`[VariationSync] No variation table data found for ${asin}`);
          continue;
        }

        const payload = {
          asin,
          ...variationData,
        };

        await sendVariationData(JSON.stringify(payload));
      } catch (error) {
        console.error(`[VariationSync] Error while processing ASIN ${asin}`, error);
      }

      await sleep(2000);
    }
  }

  window.BkteamVariationSync = {
    runVariationSync,
    fetchNewAsin,
    sendVariationData,
    buildVariationPayload,
  };

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request?.action === "runVariationSync" || request?.message === "runVariationSync") {
        runVariationSync(request?.options || {});
        if (typeof sendResponse === "function") {
          sendResponse({ status: "started" });
        }
        return false;
      }
      return undefined;
    });
  }
})();
