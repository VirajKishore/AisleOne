/**
 * background.js
 * Popup-only data pipeline. Stores the latest extracted product and the latest
 * API analysis per tab.
 */

import { API_BASE_URL } from "./apiConfig.js";

/* global chrome */

const productStore = new Map();
const analysisStore = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;

  switch (message.type) {
    case "PRODUCT_DETECTED": {
      if (tabId != null && message.product) {
        const previousProduct = productStore.get(tabId);
        productStore.set(tabId, message.product);
        setTabBadge(tabId, message.product);

        // Compare digit-only forms so "049000028911" and "00049000028911" don't
        // trigger a redundant re-fetch for the same physical product.
        const canonGtin = (g) => (g ? String(g).replace(/\D/g, "") : null);
        const gtinChanged =
          canonGtin(previousProduct?.gtinUpc) !==
          canonGtin(message.product.gtinUpc);
        if (gtinChanged) {
          analysisStore.delete(tabId);
        }

        void ensureAnalysisForTab(tabId, message.product, {
          force: gtinChanged,
        });
      }

      sendResponse({ ok: true });
      break;
    }

    case "GET_PRODUCT_AND_ANALYSIS": {
      const product = tabId != null ? (productStore.get(tabId) ?? null) : null;
      const analysis = tabId != null ? getAnalysisState(tabId, product) : null;
      sendResponse({ product, analysis });
      break;
    }

    case "REFRESH_ANALYSIS": {
      if (tabId == null) {
        sendResponse({ ok: false, error: "Missing tab id." });
        break;
      }

      const product = productStore.get(tabId) ?? null;
      void ensureAnalysisForTab(tabId, product, { force: true }).then(
        (analysis) => {
          sendResponse({ ok: true, analysis });
        },
      );
      return true;
    }

    default:
      sendResponse({ error: "Unknown message type" });
  }

  return true;
});

function createAnalysisState(overrides = {}) {
  return {
    status: "idle",
    gtinUpc: null,
    data: null,
    error: null,
    fetchedAt: null,
    logs: [],
    ...overrides,
  };
}

function addLog(logs, message) {
  return [
    ...(Array.isArray(logs) ? logs : []),
    `[${new Date().toLocaleTimeString()}] ${message}`,
  ];
}

function getAnalysisState(tabId, product) {
  const analysis = analysisStore.get(tabId);
  if (analysis) {
    return analysis;
  }

  if (!product) {
    return createAnalysisState({
      logs: addLog([], "Waiting for product detection."),
    });
  }

  if (!product.gtinUpc) {
    return createAnalysisState({
      status: "no-gtin",
      error: "No barcode detected, cannot fetch nutrition analysis.",
      logs: addLog([], "Product detected without GTIN."),
    });
  }

  return createAnalysisState({
    status: "idle",
    gtinUpc: product.gtinUpc,
    logs: addLog([], `GTIN ${product.gtinUpc} detected. Waiting for analysis.`),
  });
}

async function ensureAnalysisForTab(tabId, product, options = {}) {
  if (!product) {
    const analysis = createAnalysisState({
      logs: addLog([], "No product available for analysis."),
    });
    analysisStore.set(tabId, analysis);
    return analysis;
  }

  if (!product.gtinUpc) {
    const analysis = createAnalysisState({
      status: "no-gtin",
      error: "No barcode detected, cannot fetch nutrition analysis.",
      logs: addLog([], "Cannot call API because GTIN is missing."),
    });
    analysisStore.set(tabId, analysis);
    return analysis;
  }

  const existing = analysisStore.get(tabId);
  if (
    !options.force &&
    existing &&
    existing.gtinUpc === product.gtinUpc &&
    (existing.status === "loading" || existing.status === "ready")
  ) {
    return existing;
  }

  let logs = addLog(
    [],
    `Starting analysis request for GTIN ${product.gtinUpc}.`,
  );
  const loadingState = createAnalysisState({
    status: "loading",
    gtinUpc: product.gtinUpc,
    logs,
  });
  analysisStore.set(tabId, loadingState);

  try {
    const url = `${API_BASE_URL}/products/${encodeURIComponent(product.gtinUpc)}`;
    logs = addLog(logs, `Fetching ${url}`);
    const response = await fetch(url);
    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        response.status === 404
          ? "Nutrition analysis unavailable for this barcode."
          : responseData?.error || "Nutrition analysis unavailable right now.";
      logs = addLog(logs, `API error ${response.status}: ${message}`);
      const errorState = createAnalysisState({
        status: "error",
        gtinUpc: product.gtinUpc,
        error: message,
        logs,
      });
      analysisStore.set(tabId, errorState);
      return errorState;
    }

    logs = addLog(logs, "API response received successfully.");
    console.debug("[aisle1 background] API response payload", responseData);
    const readyState = createAnalysisState({
      status: "ready",
      gtinUpc: product.gtinUpc,
      data: responseData,
      fetchedAt: new Date().toISOString(),
      logs,
    });
    analysisStore.set(tabId, readyState);
    return readyState;
  } catch (error) {
    const message =
      error?.message || "Nutrition analysis unavailable right now.";
    logs = addLog(logs, `Fetch failed: ${message}`);
    const errorState = createAnalysisState({
      status: "error",
      gtinUpc: product.gtinUpc,
      error: message,
      logs,
    });
    analysisStore.set(tabId, errorState);
    return errorState;
  }
}

function setTabBadge(tabId, product) {
  const color =
    product.confidence === "high"
      ? "#4ADE80"
      : product.confidence === "medium"
        ? "#FBBF24"
        : "#F87171";

  chrome.action.setBadgeText({ tabId, text: "✓" });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  productStore.delete(tabId);
  analysisStore.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    productStore.delete(tabId);
    analysisStore.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
