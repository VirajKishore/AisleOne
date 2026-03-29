/**
 * normalizeProduct.js
 * Merges extraction layers into a single normalized product object
 * compatible with the USDA scoring pipeline.
 *
 * PUBLIC API:
 *   normalizeProduct(layers)   → NormalizedProduct
 *   getDetectedProduct()       → NormalizedProduct | null  (uses last stored result)
 *   setDetectedProduct(p)      → void
 */

/* global window */

/** @type {NormalizedProduct|null} */
let _latestProduct = null;

/**
 * Strip non-digit characters and validate the result is a plausible GTIN
 * (8–14 digits). Returns null for anything that doesn't look like a barcode.
 * @param {string|null} raw
 * @returns {string|null}
 */
function sanitizeGtin(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

/**
 * Merge multiple extraction layers (highest priority first) into one
 * normalized object and compute a confidence score.
 *
 * @param {object[]} layers  Array of raw extraction results (may contain nulls)
 * @returns {NormalizedProduct}
 *
 * @typedef {object} NormalizedProduct
 * @property {string}        name
 * @property {string|null}   brand
 * @property {string|null}   gtinUpc
 * @property {string|null}   ingredients
 * @property {string}        source
 * @property {string}        url
 * @property {'high'|'medium'|'low'} confidence
 * @property {object}        _debug
 */
function normalizeProduct(layers) {
  // Filter out nulls / undefined
  const valid = layers.filter(Boolean);

  if (valid.length === 0) {
    return {
      name: "Unknown Product",
      brand: null,
      gtinUpc: null,
      ingredients: null,
      source: window.location.hostname,
      url: window.location.href,
      confidence: "low",
      _debug: { layers: [] },
    };
  }

  // Pick first non-null value for each field (priority order = array order)
  const pick = (field) => {
    for (const l of valid) {
      if (l[field] != null && String(l[field]).trim() !== "") {
        return l[field];
      }
    }
    return null;
  };

  const name = pick("name") ?? "Unknown Product";
  const brand = pick("brand");
  const gtinUpc = sanitizeGtin(pick("gtinUpc"));
  const ingredients = pick("ingredients");

  // Confidence logic:
  // HIGH   → schema.org GTIN present
  // MEDIUM → name + brand detected
  // LOW    → only fallback / partial data
  const sourceTags = valid.map((l) => l.source);
  let confidence = "low";

  const hasSchemaGtin =
    valid.some((l) => l.source === "jsonld" && l.gtinUpc) ||
    valid.some((l) => l.source === "metatags" && l.gtinUpc);

  if (hasSchemaGtin) {
    confidence = "high";
  } else if (name !== "Unknown Product" && brand) {
    confidence = "medium";
  }

  const normalized = {
    name,
    brand,
    gtinUpc,
    ingredients,
    source: window.location.hostname,
    url: window.location.href,
    confidence,
    _debug: {
      layers: sourceTags,
      rawLayers: valid,
      extractedAt: new Date().toISOString(),
    },
  };

  return normalized;
}

/**
 * Store the latest detected product (called by contentScript after extraction).
 * @param {NormalizedProduct} product
 */
function setDetectedProduct(product) {
  _latestProduct = product;
}

/**
 * Retrieve the latest detected product.
 * Intended for use by external scoring modules:
 *
 *   import { getDetectedProduct } from "./utils/normalizeProduct.js"
 *   const product = getDetectedProduct();
 *
 * @returns {NormalizedProduct|null}
 */
function getDetectedProduct() {
  return _latestProduct;
}

// Expose globally (content script scope)
window.aisle1_normalizeProduct = normalizeProduct;
window.aisle1_setDetectedProduct = setDetectedProduct;
window.aisle1_getDetectedProduct = getDetectedProduct;
