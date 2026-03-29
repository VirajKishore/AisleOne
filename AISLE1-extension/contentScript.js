/**
 * contentScript.js
 * Popup-only product extraction. Detects product info/GTIN on supported pages
 * and sends the normalized product to the background service worker.
 */

/* global window, document, chrome,
   aisle1_extractJsonLd, aisle1_extractMetaTags,
   aisle1_extractRetailerSpecific, aisle1_extractFallback,
   aisle1_normalizeProduct, aisle1_setDetectedProduct */

const RETAILER_MAP = {
  "amazon.com": "amazon",
  "walmart.com": "walmart",
  "target.com": "target",
  "costco.com": "costco",
  "wholefoodsmarket.com": "wholefoods",
  "kroger.com": "kroger",
};

let lastUrl = window.location.href;
let debounceTimer = null;

function detectRetailer() {
  const host = window.location.hostname.replace(/^www\./, "");
  for (const [domain, retailer] of Object.entries(RETAILER_MAP)) {
    if (host.includes(domain)) return retailer;
  }
  return "unknown";
}

function isProductPage() {
  const signals = [
    !!document.querySelector('script[type="application/ld+json"]'),
    !!document.querySelector(
      '#productTitle, [itemprop="name"], h1[data-test="product-title"], ' +
      'h1[class*="ProductTitle"], h1[class*="product-title"], ' +
      '[data-testid="product-title"]'
    ),
    /\/(dp|ip|p|product|detail|item|product-detail)\//.test(window.location.pathname),
  ];

  return signals.filter(Boolean).length >= 2;
}

function log(message, extra) {
  if (extra !== undefined) {
    console.debug('[aisle1 content]', message, extra);
  } else {
    console.debug('[aisle1 content]', message);
  }
}

async function runExtraction() {
  const retailer = detectRetailer();
  const onProductPage = isProductPage();

  if (!onProductPage && retailer === 'unknown') {
    log('Skipping extraction: unsupported page');
    return;
  }

  const jsonld = aisle1_extractJsonLd();
  const meta = aisle1_extractMetaTags();
  const specific = aisle1_extractRetailerSpecific(retailer);
  const fallback = aisle1_extractFallback();

  const product = aisle1_normalizeProduct([jsonld, meta, specific, fallback]);
  product._debug.retailer = retailer;
  product._debug.onProductPage = onProductPage;

  aisle1_setDetectedProduct(product);

  chrome.runtime.sendMessage({ type: 'PRODUCT_DETECTED', product }, () => {
    if (chrome.runtime.lastError) {
      log('sendMessage error', chrome.runtime.lastError.message);
      return;
    }

    log('Product detected', {
      name: product.name,
      gtinUpc: product.gtinUpc,
      retailer,
      confidence: product.confidence,
    });
  });
}

function scheduleExtraction(delay = 900) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runExtraction, delay);
}

function onUrlChange() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    scheduleExtraction(900);
  }
}

const navObserver = new MutationObserver(() => onUrlChange());
navObserver.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});
window.addEventListener('popstate', onUrlChange);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scheduleExtraction(500));
} else {
  scheduleExtraction(500);
}
