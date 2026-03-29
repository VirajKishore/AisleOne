/**
 * popup.js
 * Compact popup-only UI for extracted product + API nutrition analysis.
 */

/* global chrome, document, window */

const RETAILER_LABELS = {
  amazon: "Amazon",
  walmart: "Walmart",
  target: "Target",
  costco: "Costco",
  wholefoods: "Whole Foods",
  kroger: "Kroger",
  unknown: "Unknown",
};

const {
  clampScore,
  getScoreTone,
  buildNutritionFactsMarkup,
  buildAlternativesMarkup,
  buildConcernsMarkup,
  highlightIngredients,
} = window.aisle1_analysisView;

const $ = (id) => document.getElementById(id);
const stateProduct = $("state-product");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    loadView(tab.id, 0);
  } catch (error) {
    console.error("[aisle1 popup]", error);
  }
}

function loadView(tabId, attempt) {
  chrome.runtime.sendMessage({ type: "GET_PRODUCT_AND_ANALYSIS", tabId }, (response) => {
    if (chrome.runtime.lastError) return;

    if (!response?.product) {
      if (attempt < 10) {
        setTimeout(() => loadView(tabId, attempt + 1), 900);
      }
      return;
    }

    renderView(response.product, response.analysis);
    if ((response.analysis?.status === 'loading' || response.analysis?.status === 'idle') && attempt < 15) {
      setTimeout(() => loadView(tabId, attempt + 1), 900);
    }
  });
}

function renderView(product, analysis) {
  renderProductIdentity(product);
  renderAnalysis(analysis);
  renderIngredients(product);
  renderDebugPanel(product, analysis);
  stateProduct.hidden = false;
}

function renderProductIdentity(product) {
  $("source-badge").textContent = RETAILER_LABELS[product._debug?.retailer ?? "unknown"] ?? "Unknown";

  const confMap = {
    high: { label: "High confidence extraction", cls: "confidence-high" },
    medium: { label: "Medium confidence extraction", cls: "confidence-medium" },
    low: { label: "Low confidence extraction", cls: "confidence-low" },
  };
  const confidence = confMap[product.confidence] ?? confMap.low;
  const confBadge = $("confidence-badge");
  confBadge.textContent = confidence.label;
  confBadge.className = `confidence-badge ${confidence.cls}`;

  $("product-name").textContent = product.name;
  const brandEl = $("product-brand");
  if (product.brand) {
    brandEl.textContent = `By ${product.brand}`;
    brandEl.hidden = false;
  } else {
    brandEl.hidden = true;
  }

  const gtinStatus = $("gtin-status");
  const gtinIcon = $("gtin-icon");
  const gtinLabel = $("gtin-label");
  const gtinValue = $("gtin-value");

  if (product.gtinUpc) {
    gtinStatus.className = "gtin-status gtin-found";
    gtinIcon.textContent = "✅";
    gtinLabel.textContent = "GTIN detected";
    gtinValue.textContent = product.gtinUpc;
  } else {
    gtinStatus.className = "gtin-status gtin-missing";
    gtinIcon.textContent = "❌";
    gtinLabel.textContent = "GTIN not found";
    gtinValue.textContent = "";
  }
}

function renderAnalysis(analysis) {
  const status = analysis?.status || 'idle';
  const apiData = analysis?.data || null;
  const healthScore = clampScore(apiData?.healthScore);
  const scoreRing = $("popup-score-ring");

  $("popup-score-value").textContent = healthScore == null ? "—" : String(healthScore);
  scoreRing.className = `popup-score-ring ${getScoreTone(healthScore)} popup-score-ring--${status}`;

  const statusChip = $("analysis-status-chip");
  const statusMessage = $("analysis-status-message");
  const nutritionSummary = $("nutrition-summary");
  const alternativesList = $("alternatives-list");

  if (status === 'ready' && apiData) {
    statusChip.textContent = 'Ready';
    statusChip.className = 'analysis-status-chip status-ready';
    statusMessage.textContent = 'API nutrition analysis';

    // ── Concerns ──────────────────────────────────────────────────────────
    const concernsPanel = $("concerns-panel");
    const concernsList  = $("concerns-list");
    if (concernsList && apiData.concerns) {
      concernsList.innerHTML = buildConcernsMarkup(apiData.concerns, {
        blockClass:   "popup-concerns",
        rowClass:     "popup-concern-row",
        dotClass:     "popup-concern-dot",
        contentClass: "popup-concern-content",
        nameClass:    "popup-concern-name",
        reasonClass:  "popup-concern-reason",
        badgeClass:   "popup-concern-dv",
        cleanClass:   "popup-concerns-clean",
      });
      if (concernsPanel) concernsPanel.hidden = false;
    }

    // ── Highlight ingredients ─────────────────────────────────────────────
    const ingrText = $("ingredients-text");
    if (ingrText && apiData.ingredients) {
      ingrText.innerHTML = highlightIngredients(apiData.ingredients, apiData.concerns);
      $("ingredients-panel").hidden = false;
    }

    // ── Nutrition + Alternatives ─────────────────────────────────────────
    nutritionSummary.innerHTML = buildNutritionFactsMarkup(apiData.nutritionFacts, {
      blockClass: 'nutrition-facts nutrition-facts--compact',
      titleClass: 'nutrition-facts__title nutrition-facts__title--hidden',
      caloriesClass: 'nutrition-facts__calories nutrition-facts__calories--compact',
      rowClass: 'nutrition-facts__row nutrition-facts__row--compact',
    });
    alternativesList.innerHTML = buildAlternativesMarkup(apiData.alternatives, apiData.alternativesStatus?.message, {
      rowClass: 'popup-alt-row',
      linkClass: 'popup-alt-link',
      badgeClass: 'popup-alt-score',
      emptyClass: 'popup-empty-copy',
    });
    return;
  }

  if (status === 'loading' || status === 'idle') {
    statusChip.textContent = 'Loading';
    statusChip.className = 'analysis-status-chip status-loading';
    statusMessage.textContent = 'Analyzing nutrition…';
    nutritionSummary.innerHTML = '<p class="popup-empty-copy">Analyzing nutrition…</p>';
    alternativesList.innerHTML = '<p class="popup-empty-copy">Searching better alternatives…</p>';
    return;
  }

  if (status === 'no-gtin') {
    statusChip.textContent = 'No GTIN';
    statusChip.className = 'analysis-status-chip status-error';
    statusMessage.textContent = 'No barcode detected, cannot fetch nutrition analysis.';
    nutritionSummary.innerHTML = '<p class="popup-empty-copy">No barcode detected, cannot fetch nutrition analysis.</p>';
    alternativesList.innerHTML = '<p class="popup-empty-copy">Alternatives need a detected barcode first.</p>';
    return;
  }

  statusChip.textContent = 'Unavailable';
  statusChip.className = 'analysis-status-chip status-error';
  statusMessage.textContent = analysis?.error || 'Nutrition analysis unavailable right now.';
  nutritionSummary.innerHTML = `<p class="popup-empty-copy">${analysis?.error || 'Nutrition analysis unavailable right now.'}</p>`;
  alternativesList.innerHTML = '<p class="popup-empty-copy">Better alternatives unavailable right now.</p>';
}

function renderIngredients(product) {
  const ingredientsPanel = $("ingredients-panel");
  const ingredientsText = $("ingredients-text");
  // Ingredients text starts plain; renderAnalysis upgrades to highlighted HTML once API is ready
  if (product.ingredients) {
    if (!ingredientsText.innerHTML.includes("ingr-hl")) {
      ingredientsText.textContent = product.ingredients;
    }
    ingredientsPanel.hidden = false;
  } else {
    ingredientsPanel.hidden = true;
  }
}

function renderDebugPanel(product, analysis) {
  const debugPanel = $("debug-panel");
  const debugToggle = $("debug-toggle");
  const debugContent = $("debug-content");
  const debugTable = $("debug-table");
  const debugLogs = $("debug-logs");

  debugPanel.hidden = false;

  const retailer = product._debug?.retailer ?? 'unknown';
  const rows = [
    ['Retailer', RETAILER_LABELS[retailer] ?? retailer],
    ['Confidence', product.confidence],
    ['GTIN', product.gtinUpc ?? '—'],
    ['Analysis status', analysis?.status ?? 'idle'],
    ['API healthScore', analysis?.data?.healthScore ?? '—'],
    ['Fetched at', analysis?.fetchedAt ?? '—'],
    ['Extraction layers', (product._debug?.layers ?? []).join(', ') || '—'],
  ];

  debugTable.innerHTML = rows.map(([key, value]) => `<tr><td>${key}</td><td>${value ?? '—'}</td></tr>`).join('');
  debugLogs.textContent = Array.isArray(analysis?.logs) && analysis.logs.length > 0
    ? `${analysis.logs.join('\n')}\n\nAPI payload:\n${analysis?.data ? JSON.stringify(analysis.data, null, 2) : 'No API payload yet.'}`
    : 'No logs yet.';

  debugToggle.onclick = () => {
    const isOpen = !debugContent.hidden;
    debugContent.hidden = isOpen;
    debugToggle.textContent = isOpen ? 'Show Logs ▾' : 'Hide Logs ▴';
  };
}
