/**
 * extractStructuredData.js
 * STEP 1 & 2 – Extract product metadata from schema.org JSON-LD and meta tags.
 * Priority: JSON-LD → itemprop meta tags
 */

/* global window, document */

/**
 * Parse all JSON-LD blocks on the page and find a Product schema.
 * @returns {object|null} The first Product schema object found, or null.
 */
function extractJsonLd() {
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  );

  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent);
      const candidates = Array.isArray(raw) ? raw : [raw];

      for (const item of candidates) {
        // Handle @graph arrays (e.g., Google-rich-result style)
        if (item["@graph"]) {
          for (const node of item["@graph"]) {
            if (isProductSchema(node)) return normalizeJsonLdProduct(node);
          }
        }
        if (isProductSchema(item)) return normalizeJsonLdProduct(item);
      }
    } catch (_) {
      // Malformed JSON – skip
    }
  }
  return null;
}

/**
 * Check if a schema.org object is a Product type.
 */
function isProductSchema(obj) {
  if (!obj || typeof obj !== "object") return false;
  const type = obj["@type"];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) =>
    ["Product", "GroceryProduct", "FoodProduct"].includes(t)
  );
}

/**
 * Convert a raw GTIN value (number or string) to a digit-only string,
 * re-padding to the standard length if a number conversion dropped a leading zero.
 * Standard lengths: 8, 12, 13, 14. We pick the nearest standard length ≥ the
 * digit count so that e.g. 11-digit "49000028911" is treated as a 12-digit UPC-A
 * with its leading zero restored.
 */
function normalizeGtinString(raw) {
  const str = String(raw).replace(/\D/g, "");
  if (!str) return null;
  // Nearest standard GTIN length at or above the current digit count
  const STANDARD_LENGTHS = [8, 12, 13, 14];
  const target = STANDARD_LENGTHS.find((l) => l >= str.length) ?? 14;
  return str.padStart(target, "0");
}

/**
 * Normalize a JSON-LD Product object to our internal shape.
 */
function normalizeJsonLdProduct(schema) {
  const gtin =
    schema.gtin13 ||
    schema.gtin12 ||
    schema.gtin14 ||
    schema.gtin8 ||
    schema.gtin ||
    null;

  const brand =
    typeof schema.brand === "string"
      ? schema.brand
      : schema.brand?.name ?? null;

  const description =
    typeof schema.description === "string" ? schema.description : null;

  // Ingredients sometimes stored in description or a custom "ingredients" field
  const ingredients =
    schema.ingredients || extractIngredientsFromDescription(description) || null;

  return {
    name: schema.name ?? null,
    brand,
    gtinUpc: gtin ? normalizeGtinString(gtin) : null,
    sku: schema.sku ?? null,
    ingredients,
    description,
    source: "jsonld",
  };
}

/**
 * Extract product info from itemprop meta/link tags (Microdata STEP 2).
 * @returns {object|null}
 */
function extractMetaTags() {
  const get = (prop) =>
    document.querySelector(`meta[itemprop="${prop}"]`)?.content?.trim() ?? null;

  const gtin =
    get("gtin13") || get("gtin12") || get("gtin14") || get("gtin") || null;

  const name = get("name");
  if (!name && !gtin) return null;

  return {
    name,
    brand: get("brand"),
    gtinUpc: gtin,
    sku: get("sku") || get("productID") || null,
    ingredients: null,
    description: get("description"),
    source: "metatags",
  };
}

/**
 * Heuristic: try to pull "Ingredients:" from a product description string.
 */
function extractIngredientsFromDescription(desc) {
  if (!desc) return null;
  const match = desc.match(
    /Ingredients?\s*[:\-–]\s*([\s\S]{10,600}?)(?=\b(?:Allergen|Contains|May\s+contain|Nutrition\s+Facts|Directions|Warning|Disclaimer|Storage|Best\s+before)\b|$)/i
  );
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

// Expose globally (content scripts share the page scope in Chrome MV3)
window.aisle1_extractJsonLd = extractJsonLd;
window.aisle1_extractMetaTags = extractMetaTags;
