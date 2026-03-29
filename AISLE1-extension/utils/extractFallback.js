/**
 * extractFallback.js
 * STEP 4 – Regex scan of the entire DOM for GTIN / UPC / barcode patterns
 *          when structured sources and retailer selectors fail.
 */

/* global window, document */

/**
 * Scan ALL visible text nodes in the document for GTIN-like numbers.
 * Also scans common element classes / IDs as a faster first pass.
 *
 * @returns {{ gtinUpc: string|null, name: string|null, source: 'fallback'|null }}
 */
function extractFallback() {
  // Fast first-pass: likely containers
  const candidateSelectors = [
    "[class*='upc']",
    "[class*='gtin']",
    "[class*='barcode']",
    "[class*='sku']",
    "[class*='product-id']",
    "[id*='upc']",
    "[id*='gtin']",
    "[id*='barcode']",
    "[id*='sku']",
    "table",
    "dl",
    "ul",
  ];

  let gtinUpc = null;

  for (const sel of candidateSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const found = scanNodeForGtin(el.textContent);
      if (found) {
        gtinUpc = found;
        break;
      }
    }
    if (gtinUpc) break;
  }

  // Full-page fallback if still nothing
  if (!gtinUpc) {
    gtinUpc = scanNodeForGtin(document.body?.textContent ?? "");
  }

  // Best-effort product name from page title
  const name = inferNameFromPage();

  if (!gtinUpc && !name) return null;

  return {
    name,
    brand: null,
    gtinUpc,
    ingredients: null,
    source: "fallback",
  };
}

/**
 * Extract a GTIN/UPC-like number from raw text.
 */
function scanNodeForGtin(raw) {
  if (!raw) return null;

  const patterns = [
    // Labeled patterns (highest confidence)
    /\bGTIN[:\s–\-]+(\d{8,14})\b/i,
    /\bUPC[:\s–\-]+(\d{8,14})\b/i,
    /\bBarcode[:\s–\-]+(\d{8,14})\b/i,
    /\bEAN[:\s–\-]+(\d{8,14})\b/i,
    /\bSKU[:\s–\-]+([A-Z0-9\-]{5,20})\b/i,

    // Bare 12-digit or 13-digit numbers (UPC/EAN) – only if standalone
    /\b(\d{12,13})\b/,
    /\b(\d{14})\b/,
  ];

  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m) return m[1].replace(/\s+/g, "").trim();
  }

  return null;
}

/**
 * Infer a product name from the document title as last resort.
 */
function inferNameFromPage() {
  const title = document.title ?? "";
  // Strip common suffixes like "- Amazon.com", "| Walmart", etc.
  const cleaned = title
    .replace(/[-|–]\s*(Amazon\.com|Walmart|Target|Costco|Kroger|Whole Foods).*/i, "")
    .trim();
  return cleaned.length > 3 ? cleaned : null;
}

// Expose globally
window.aisle1_extractFallback = extractFallback;
window.aisle1_scanNodeForGtin = scanNodeForGtin;
