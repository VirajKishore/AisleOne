(() => {
/* global window */

const NUTRITION_ROWS = [
  { key: "calories", label: "Calories", prominent: true },
  { key: "totalFat", label: "Total Fat" },
  { key: "saturatedFat", label: "Saturated Fat" },
  { key: "transFat", label: "Trans Fat" },
  { key: "cholesterol", label: "Cholesterol" },
  { key: "sodium", label: "Sodium" },
  { key: "totalCarbohydrate", label: "Total Carbohydrate" },
  { key: "dietaryFiber", label: "Dietary Fiber" },
  { key: "totalSugars", label: "Total Sugars" },
  { key: "addedSugars", label: "Added Sugars" },
  { key: "protein", label: "Protein" },
];

const POPUP_NUTRITION_KEYS = [
  "calories",
  "totalFat",
  "sodium",
  "totalSugars",
  "protein",
];

function clampScore(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numericScore)));
}

function getScoreTone(score) {
  if (!Number.isFinite(score)) return "score--unknown";
  if (score >= 75) return "score--high";
  if (score >= 45) return "score--medium";
  return "score--low";
}

function formatNutrientAmount(entry) {
  if (!entry || !Number.isFinite(Number(entry.amount))) {
    return "—";
  }

  const amount = Number(entry.amount);
  const unit = String(entry.unit || "").trim();

  if (unit.toLowerCase() === "kcal") {
    return `${Math.round(amount)}`;
  }

  const normalized = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
  return `${normalized}${unit ? ` ${unit}` : ""}`;
}

function getNutritionRows(nutritionFacts, options = {}) {
  const keys = Array.isArray(options.keys) && options.keys.length > 0
    ? options.keys
    : NUTRITION_ROWS.map((row) => row.key);

  return keys
    .map((key) => NUTRITION_ROWS.find((row) => row.key === key))
    .filter(Boolean)
    .map((row) => ({
      ...row,
      value: nutritionFacts?.[row.key] ?? null,
    }))
    .filter((row) => row.value && Number.isFinite(Number(row.value.amount)));
}

function buildNutritionFactsMarkup(nutritionFacts, options = {}) {
  const rows = getNutritionRows(nutritionFacts, options);

  if (rows.length === 0) {
    return `<p class="${options.emptyClass || "aisle1-empty-copy"}">Nutrition facts unavailable.</p>`;
  }

  return `
    <div class="${options.blockClass || "nutrition-facts"}">
      <div class="${options.titleClass || "nutrition-facts__title"}">Nutrition Facts</div>
      ${rows.map((row) => (
        row.prominent
          ? `<div class="${options.caloriesClass || "nutrition-facts__calories"}">
              <span>${row.label}</span>
              <strong>${formatNutrientAmount(row.value)}</strong>
            </div>`
          : `<div class="${options.rowClass || "nutrition-facts__row"}">
              <span>${row.label}</span>
              <strong>${formatNutrientAmount(row.value)}</strong>
            </div>`
      )).join("")}
    </div>
  `;
}

const CONCERN_TIER_ORDER = { high: 0, medium: 1, low: 2 };
const CONCERN_TIER_DOT   = { high: "🔴", medium: "🟠", low: "🟡" };
const CONCERN_TIER_CLASS = { high: "concern--high", medium: "concern--medium", low: "concern--low" };

/**
 * Builds a combined ingredient + nutrient concerns block.
 * @param {{ ingredients: Array, nutrients: Array }} concerns
 * @param {object} options – CSS class overrides
 */
function buildConcernsMarkup(concerns, options = {}) {
  const ingConcerns = Array.isArray(concerns?.ingredients) ? concerns.ingredients : [];
  const nutConcerns = Array.isArray(concerns?.nutrients)   ? concerns.nutrients   : [];

  if (ingConcerns.length === 0 && nutConcerns.length === 0) {
    return `<p class="${options.cleanClass || "aisle1-concerns-clean"}">✅ No concerning ingredients detected</p>`;
  }

  const items = [
    ...ingConcerns.map((c) => ({
      tier:     c.tier,
      label:    c.name,
      sublabel: c.reason,
      badge:    null,
    })),
    ...nutConcerns.map((n) => ({
      tier:     n.tier,
      label:    `${n.nutrient}: ${n.amount}${n.unit}`,
      sublabel: n.reason,
      badge:    n.dailyValuePct,
    })),
  ].sort((a, b) => (CONCERN_TIER_ORDER[a.tier] ?? 3) - (CONCERN_TIER_ORDER[b.tier] ?? 3));

  return `
    <div class="${options.blockClass || "aisle1-concerns"}">
      ${items.map((item) => `
        <div class="${options.rowClass || "aisle1-concern-row"} ${CONCERN_TIER_CLASS[item.tier] || ""}">
          <span class="${options.dotClass || "aisle1-concern-dot"}">${CONCERN_TIER_DOT[item.tier] || "●"}</span>
          <div class="${options.contentClass || "aisle1-concern-content"}">
            <span class="${options.nameClass || "aisle1-concern-name"}">
              ${item.label}${item.badge ? ` <span class="${options.badgeClass || "aisle1-concern-dv"}">${item.badge} DV</span>` : ""}
            </span>
            <span class="${options.reasonClass || "aisle1-concern-reason"}">${item.sublabel}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns an HTML string with concern matches wrapped in <mark> elements.
 * Uses matchedText from the API to highlight exactly the right fragment.
 * @param {string} ingredientsText  – raw ingredient string
 * @param {{ ingredients: Array }}  concerns
 * @returns {string}
 */
function highlightIngredients(ingredientsText, concerns) {
  if (!ingredientsText) return "";
  const ingConcerns = Array.isArray(concerns?.ingredients) ? concerns.ingredients : [];
  if (ingConcerns.length === 0) return escapeHtml(ingredientsText);

  // Sort longest match first to avoid substring clobbering
  const sorted = [...ingConcerns]
    .filter((c) => c.matchedText)
    .sort((a, b) => b.matchedText.length - a.matchedText.length);

  let result = escapeHtml(ingredientsText);
  for (const concern of sorted) {
    const cls = `ingr-hl ingr-hl--${concern.tier}`;
    const tip = concern.reason.replace(/"/g, "&quot;");
    const regex = new RegExp(escapeRegex(escapeHtml(concern.matchedText)), "gi");
    result = result.replace(regex, (match) =>
      `<mark class="${cls}" title="${tip}">${match}</mark>`
    );
  }
  return result;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAlternativesMarkup(alternatives, emptyMessage, options = {}) {
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    return `<p class="${options.emptyClass || "aisle1-empty-copy"}">${emptyMessage || "No better alternatives found."}</p>`;
  }

  return alternatives.map((alternative) => `
    <div class="${options.rowClass || "alternative-row"}">
      <a
        class="${options.linkClass || "alternative-link"}"
        href="${alternative.link}"
        target="_blank"
        rel="noreferrer noopener"
      >${alternative.title}</a>
      <span class="${options.badgeClass || "alternative-score"}">${clampScore(alternative.score)}/100</span>
    </div>
  `).join("");
}

window.aisle1_analysisView = {
  POPUP_NUTRITION_KEYS,
  NUTRITION_ROWS,
  clampScore,
  getScoreTone,
  formatNutrientAmount,
  getNutritionRows,
  buildNutritionFactsMarkup,
  buildAlternativesMarkup,
  buildConcernsMarkup,
  highlightIngredients,
};
})();
