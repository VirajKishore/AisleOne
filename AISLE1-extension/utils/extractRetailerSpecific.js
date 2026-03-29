/**
 * extractRetailerSpecific.js
 * STEP 3 – Retailer-specific DOM selectors for Amazon, Walmart, Target,
 *           Costco, Whole Foods, and Kroger.
 */

/* global window, document */

// ─── Helper ────────────────────────────────────────────────────────────────

function text(selector, root = document) {
  return root.querySelector(selector)?.textContent?.trim() ?? null;
}

function attr(selector, attribute, root = document) {
  return root.querySelector(selector)?.getAttribute(attribute)?.trim() ?? null;
}

/**
 * Scan a container's text for UPC / GTIN patterns.
 */
function scanContainerForGtin(container) {
  if (!container) return null;
  const raw = container.textContent;
  return extractGtinFromText(raw);
}

function extractGtinFromText(raw) {
  if (!raw) return null;
  // Matches "UPC: 123456789012" or "GTIN: 01234567890123"
  const patterns = [
    /GTIN[:\s–-]+(\d{8,14})/i,
    /UPC[:\s–-]+(\d{8,14})/i,
    /Barcode[:\s–-]+(\d{8,14})/i,
    /EAN[:\s–-]+(\d{8,14})/i,
  ];
  for (const pat of patterns) {
    const m = raw.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── Amazon ────────────────────────────────────────────────────────────────

function extractAmazon() {
  // Not on an Amazon product page?
  const titleEl = document.querySelector("#productTitle");
  if (!titleEl) return null;

  const name = titleEl.textContent.trim();

  // Brand – appears in #bylineInfo or a dedicated byline table row
  const brand =
    text("#bylineInfo")?.replace(/^(Brand|Visit the|store)/i, "").replace(/Store$/i, "").trim() ||
    text("[id^='brand']") ||
    null;

  // Detail bullets (feature list + product details table)
  const bulletContainer =
    document.querySelector("#detailBullets_feature_div") ||
    document.querySelector("#prodDetails");

  let gtinUpc = scanContainerForGtin(bulletContainer);

  // Ingredients – some grocery pages expose this in a scrollable section
  let ingredients =
    text("#ingredients-content") ||
    text('[data-feature-name="ingredients"]') ||
    null;

  // Serving size / package size
  const servingSize = text("#servingSize") || null;
  const packageSize =
    text("#package-quantity") ||
    text("#productOverview_feature_div") ||
    null;

  return {
    name,
    brand: brand || null,
    gtinUpc,
    ingredients,
    servingSize,
    packageSize,
    source: "amazon",
  };
}

// ─── Walmart ───────────────────────────────────────────────────────────────

function extractWalmart() {
  const nameEl =
    document.querySelector('[itemprop="name"]') ||
    document.querySelector('h1[class*="ProductTitle"]') ||
    document.querySelector('[data-testid="product-title"]');

  if (!nameEl) return null;

  const name = nameEl.textContent.trim();

  const brand =
    text('[itemprop="brand"]') ||
    text('[data-testid="product-brand"]') ||
    null;

  // Walmart product description div often contains ingredients
  const descEl =
    document.querySelector('div[data-testid="product-description"]') ||
    document.querySelector('[class*="about-product"]');

  const ingredients = descEl
    ? extractIngredientsFromText(descEl.textContent)
    : null;

  const gtinUpc =
    attr('[itemprop="gtin13"]', "content") ||
    attr('[itemprop="gtin12"]', "content") ||
    scanContainerForGtin(descEl) ||
    null;

  return { name, brand, gtinUpc, ingredients, source: "walmart" };
}

// ─── Target ────────────────────────────────────────────────────────────────

function extractTarget() {
  const nameEl =
    document.querySelector('h1[data-test="product-title"]') ||
    document.querySelector('[data-test="@web/ProductDetail/ProductTitleV2"]');

  if (!nameEl) return null;

  const name = nameEl.textContent.trim();

  const brand =
    text('[data-test="product-brand"]') ||
    text('[class*="ProductDetailsSection"] a') ||
    null;

  // Target sometimes exposes ingredients in a facts panel
  const ingredientsEl =
    document.querySelector('[data-test="item-details-ingredients"]') ||
    document.querySelector('[class*="Ingredients"]');

  const ingredients = ingredientsEl
    ? extractIngredientsFromText(ingredientsEl.textContent)
    : null;

  // Target specifications table
  const specsTable = document.querySelector('[data-test="item-details-table"]');
  const gtinUpc = scanContainerForGtin(specsTable) || null;

  return { name, brand, gtinUpc, ingredients, source: "target" };
}

// ─── Costco ────────────────────────────────────────────────────────────────

function extractCostco() {
  const nameEl =
    document.querySelector("h1.product-h1-title") ||
    document.querySelector('[class*="product-title"]');

  if (!nameEl) return null;

  const name = nameEl.textContent.trim();
  const brand = text('[class*="brand-name"]') || null;

  const detailsEl =
    document.querySelector("#longDescription") ||
    document.querySelector('[class*="product-info"]');

  const ingredients = detailsEl
    ? extractIngredientsFromText(detailsEl.textContent)
    : null;

  const gtinUpc = scanContainerForGtin(detailsEl) || null;

  return { name, brand, gtinUpc, ingredients, source: "costco" };
}

// ─── Whole Foods ────────────────────────────────────────────────────────────

function extractWholeFoods() {
  // Whole Foods is Amazon-backed; sometimes shares Amazon DOM
  const nameEl =
    document.querySelector('[class*="product-title"]') ||
    document.querySelector("h1.productTitle") ||
    document.querySelector("#productTitle");

  if (!nameEl) return null;

  const name = nameEl.textContent.trim();
  const brand = text('[class*="brand"]') || text("#bylineInfo") || null;

  const ingredientsEl = document.querySelector(
    '[class*="ingredients"], #ingredients-content, [data-testid="ingredients"]'
  );
  const ingredients = ingredientsEl
    ? extractIngredientsFromText(ingredientsEl.textContent)
    : null;

  const gtinUpc =
    scanContainerForGtin(
      document.querySelector('[class*="product-details"], #detailBullets_feature_div')
    ) || null;

  return { name, brand, gtinUpc, ingredients, source: "wholefoods" };
}

// ─── Kroger ────────────────────────────────────────────────────────────────

function extractKroger() {
  const nameEl =
    document.querySelector('h1[class*="ProductDetails-header"]') ||
    document.querySelector('[data-testid="cart-page-item-description"]') ||
    document.querySelector("h1");

  if (!nameEl) return null;

  const name = nameEl.textContent.trim();
  const brand =
    text('[class*="ProductDetails-brand"]') ||
    text('[data-testid="product-brand"]') ||
    null;

  const ingredientsEl =
    document.querySelector('[class*="ingredients"]') ||
    document.querySelector('[data-testid="ingredients"]');

  const ingredients = ingredientsEl
    ? extractIngredientsFromText(ingredientsEl.textContent)
    : null;

  const gtinUpc = scanContainerForGtin(document.querySelector('[class*="product-details"]')) || null;

  return { name, brand, gtinUpc, ingredients, source: "kroger" };
}

// ─── Common helper ──────────────────────────────────────────────────────────

function extractIngredientsFromText(raw) {
  if (!raw) return null;
  // Stop only at section-boundary keywords, not at every period (periods are
  // common inside ingredient lists, e.g. "Vitamin C. Niacin.").
  const match = raw.match(
    /Ingredients?\s*[:\-–]\s*([\s\S]{10,600}?)(?=\b(?:Allergen|Contains|May\s+contain|Nutrition\s+Facts|Directions|Warning|Disclaimer|Storage|Best\s+before)\b|$)/i
  );
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

function extractRetailerSpecific(retailer) {
  switch (retailer) {
    case "amazon":
      return extractAmazon();
    case "walmart":
      return extractWalmart();
    case "target":
      return extractTarget();
    case "costco":
      return extractCostco();
    case "wholefoods":
      return extractWholeFoods();
    case "kroger":
      return extractKroger();
    default:
      return null;
  }
}

// Expose globally
window.aisle1_extractRetailerSpecific = extractRetailerSpecific;
window.aisle1_extractIngredientsFromText = extractIngredientsFromText;
window.aisle1_extractGtinFromText = extractGtinFromText;
