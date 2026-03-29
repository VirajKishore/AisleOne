/**
 * sidebar.js
 * Builds and manages the persistent right-side assistant panel for aisle1.
 *
 * PUBLIC API (window.aisle1_sidebar):
 *   .show()                    – slide panel in
 *   .hide()                    – slide panel out
 *   .toggle()                  – toggle open/close
 *   .setState(state)           – 'scanning' | 'none' | 'product-loading-analysis' | 'product-ready' | 'product-error'
 *   .setProduct(product, analysis) – render a NormalizedProduct into the panel
 *   .setScanStep(index)        – advance animated scan checklist (0–2)
 *
 * Does NOT modify extraction logic. Calls window.aisle1_* utilities
 * only for rendering what was already detected.
 */

/* global window, document, chrome */

// ─── Constants ───────────────────────────────────────────────────────────────

const RETAILER_LABELS = {
  amazon:     "Amazon",
  walmart:    "Walmart",
  target:     "Target",
  costco:     "Costco",
  wholefoods: "Whole Foods",
  kroger:     "Kroger",
  unknown:    "Unknown Retailer",
};

const SCAN_STEPS = [
  "Detecting product name",
  "Extracting barcode",
  "Checking structured metadata",
];

const {
  clampScore,
  getScoreTone,
  buildNutritionFactsMarkup,
  buildAlternativesMarkup,
  buildConcernsMarkup,
  highlightIngredients,
} = window.aisle1_analysisView;

// ─── Font injection ───────────────────────────────────────────────────────────

function injectInterFont() {
  if (document.querySelector("#aisle1-inter-font")) return;
  const link = document.createElement("link");
  link.id   = "aisle1-inter-font";
  link.rel  = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

// ─── Sidebar DOM builder ──────────────────────────────────────────────────────

function buildSidebarDOM() {
  // Host element — floats over the page
  const host = document.createElement("div");
  host.id = "aisle1-sidebar-host";

  host.innerHTML = `
    <div id="aisle1-sidebar">

      <!-- ── HEADER ── -->
      <header id="aisle1-sb-header">
        <div class="aisle1-sb-brand">
          <span class="aisle1-sb-logo-icon">🛒</span>
          <span class="aisle1-sb-brand-text">
            <span class="aisle1-sb-brand-name">aisle1</span>
            <span class="aisle1-sb-brand-tagline">Smart grocery assistant</span>
          </span>
        </div>
        <div class="aisle1-sb-header-actions">
          <span id="aisle1-sb-status-dot" class="aisle1-sb-status-dot dot--none" title="Status"></span>
          <button id="aisle1-sb-close" title="Close assistant">✕</button>
        </div>
      </header>

      <!-- ── SCROLLABLE CONTENT ── -->
      <div id="aisle1-sb-scroll">

        <!-- STATE 1: Scanning -->
        <div id="aisle1-state-scanning" class="aisle1-state">
          <div style="padding:32px 20px">
            <p class="aisle1-scan-title">Scanning page…</p>
            <div class="aisle1-scan-steps" id="aisle1-scan-steps-list">
              ${SCAN_STEPS.map((label, i) => `
                <div class="aisle1-scan-step" id="aisle1-step-${i}" data-step="${i}">
                  <span class="aisle1-step-indicator"></span>
                  <span class="aisle1-step-label">${label}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- STATE 2: No product -->
        <div id="aisle1-state-none" class="aisle1-state">
          <div style="padding:48px 24px; text-align:center">
            <span class="aisle1-none-icon">🔍</span>
            <p class="aisle1-none-title">No product detected</p>
            <p class="aisle1-none-body">
              Navigate to a grocery product page on Amazon, Walmart, Target, Costco, Whole Foods, or Kroger.
            </p>
            <div class="aisle1-retailer-chips">
              ${["Amazon","Walmart","Target","Costco","Whole Foods","Kroger"].map(
                r => `<span class="aisle1-retailer-chip">${r}</span>`
              ).join("")}
            </div>
          </div>
        </div>

        <!-- STATE 3 + 4: Product detected / Scoring complete -->
        <div id="aisle1-state-product" class="aisle1-state">

          <!-- SECTION 2: Product Identity Card -->
          <div id="aisle1-identity" class="aisle1-section">
            <div class="aisle1-identity-top">
              <div class="aisle1-product-image-placeholder" id="aisle1-img-placeholder">🛒</div>
              <img id="aisle1-product-img" class="aisle1-product-image" src="" alt="Product" style="display:none"/>
              <div class="aisle1-product-meta">
                <div class="aisle1-product-name" id="aisle1-product-name">—</div>
                <div class="aisle1-product-brand" id="aisle1-product-brand"></div>
              </div>
            </div>
            <div class="aisle1-identity-chips">
              <span class="aisle1-retailer-badge" id="aisle1-retailer-badge">—</span>
              <span class="aisle1-category-chip" id="aisle1-category-chip" style="display:none">—</span>
            </div>
          </div>

          <!-- SECTION 3: Health Score Block -->
          <div id="aisle1-score-section" class="aisle1-section">
            <p class="aisle1-score-label">Health Score</p>
            <div class="aisle1-score-ring" id="aisle1-score-ring">
              <span class="aisle1-score-dash">—</span>
              <span class="aisle1-score-sub">/100</span>
            </div>
            <p class="aisle1-score-placeholder">Loading nutrition analysis…</p>
          </div>

          <!-- SECTION 3.5: Ingredient & Nutrient Concerns -->
          <div id="aisle1-concerns-section" class="aisle1-section" style="display:none;">
            <p class="aisle1-section-label">Watch Out For</p>
            <div id="aisle1-concerns-block"></div>
          </div>

          <!-- SECTION 4: Nutrition Facts -->
          <div id="aisle1-signals-section" class="aisle1-section">
            <p class="aisle1-section-label">Nutrition Facts</p>
            <div id="aisle1-nutrition-block">
              <p class="aisle1-analysis-copy">Analyzing nutrition…</p>
            </div>

            <!-- Ingredient text preview (if extracted) -->
            <div id="aisle1-ingredients-preview" style="display:none; margin-top:10px;">
              <p class="aisle1-section-label" style="margin-bottom:6px;">Ingredients</p>
              <p id="aisle1-ingredients-text" class="aisle1-ingredients-text"></p>
            </div>
          </div>

          <!-- SECTION 5: Healthier Alternatives -->
          <div id="aisle1-alts-section" class="aisle1-section">
            <p class="aisle1-section-label">Healthier Options</p>
            <div class="aisle1-alts-rows" id="aisle1-alts-rows">
              ${[1,2,3].map(() => `
                <div class="aisle1-alt-row">
                  <div class="aisle1-alt-placeholder">
                    <div class="aisle1-skeleton aisle1-skeleton-line aisle1-skeleton-line--medium"></div>
                    <div class="aisle1-skeleton aisle1-skeleton-line aisle1-skeleton-line--short" style="margin-top:4px"></div>
                  </div>
                  <div class="aisle1-alt-score-badge"></div>
                </div>
              `).join("")}
            </div>
            <p id="aisle1-alts-status" class="aisle1-analysis-copy">
              Searching better alternatives…
            </p>
          </div>

          <!-- SECTION 6: Collapsible Details -->
          <div id="aisle1-details-section" class="aisle1-section" style="border-bottom:none;padding:0;">
            <button class="aisle1-details-toggle" id="aisle1-details-toggle">
              <span>Details</span>
              <span class="aisle1-toggle-chevron">▾</span>
            </button>
            <div class="aisle1-details-body" id="aisle1-details-body">
              <div class="aisle1-details-inner" id="aisle1-details-inner">
                <!-- Populated dynamically -->
              </div>
            </div>
          </div>

        </div><!-- /state-product -->

      </div><!-- /scroll -->
    </div><!-- /sidebar -->
  `;

  return host;
}

// ─── Sidebar Controller ───────────────────────────────────────────────────────

let _hostEl   = null;
let _panelEl  = null;
let _isOpen   = false;
let _currentState = null;

function init() {
  if (document.getElementById("aisle1-sidebar-host")) return; // already mounted

  injectInterFont();

  _hostEl  = buildSidebarDOM();
  _panelEl = _hostEl.querySelector("#aisle1-sidebar");
  document.body.appendChild(_hostEl);

  // Wire close button
  _hostEl.querySelector("#aisle1-sb-close")?.addEventListener("click", hide);

  // Wire collapsible details
  const detailsToggle = _hostEl.querySelector("#aisle1-details-toggle");
  const detailsBody   = _hostEl.querySelector("#aisle1-details-body");
  detailsToggle?.addEventListener("click", () => {
    const expanded = detailsBody.classList.toggle("expanded");
    detailsToggle.classList.toggle("expanded", expanded);
  });
}

function show() {
  if (!_panelEl) init();
  _isOpen = true;
  _panelEl.classList.add("aisle1-sb--open");
}

function hide() {
  if (!_panelEl) return;
  _isOpen = false;
  _panelEl.classList.remove("aisle1-sb--open");
}

function toggle() {
  _isOpen ? hide() : show();
}

// ─── State Machine ────────────────────────────────────────────────────────────

/**
 * Set the active UI state.
 * @param {'scanning'|'none'|'product-loading-analysis'|'product-ready'|'product-error'} state
 */
function setState(state) {
  if (!_hostEl) init();
  _currentState = state;

  // Map all state IDs and deactivate
  const states = {
    scanning: _hostEl.querySelector("#aisle1-state-scanning"),
    none:     _hostEl.querySelector("#aisle1-state-none"),
    "product-loading-analysis": _hostEl.querySelector("#aisle1-state-product"),
    "product-ready": _hostEl.querySelector("#aisle1-state-product"),
    "product-error": _hostEl.querySelector("#aisle1-state-product"),
  };

  Object.values(states).forEach(el => {
    if (el) el.classList.remove("aisle1-state--active");
  });

  const target = states[state];
  if (target) target.classList.add("aisle1-state--active");

  // Update status dot
  const dot = _hostEl.querySelector("#aisle1-sb-status-dot");
  if (dot) {
    dot.className = "aisle1-sb-status-dot";
    if (state === "scanning") dot.classList.add("dot--scanning");
    else if (state === "product-loading-analysis" || state === "product-ready" || state === "product-error") dot.classList.add("dot--found");
    else dot.classList.add("dot--none");
  }
}

// ─── Scan Step Animator ───────────────────────────────────────────────────────

/**
 * Animate the scanning checklist to the given step.
 * @param {number} activeIndex – 0-based index of the current step (0–2)
 */
function setScanStep(activeIndex) {
  if (!_hostEl) return;
  SCAN_STEPS.forEach((_, i) => {
    const stepEl = _hostEl.querySelector(`#aisle1-step-${i}`);
    if (!stepEl) return;
    stepEl.classList.remove("step--done", "step--active");
    if (i < activeIndex) stepEl.classList.add("step--done");
    else if (i === activeIndex) stepEl.classList.add("step--active");
    // Mark indicator text
    const ind = stepEl.querySelector(".aisle1-step-indicator");
    if (ind) ind.textContent = i < activeIndex ? "✓" : "";
  });
}

// ─── Product Renderer ─────────────────────────────────────────────────────────

/**
 * Populate all product sections with a NormalizedProduct object.
 * @param {object} product – from normalizeProduct()
 */
function setProduct(product, analysis = null) {
  if (!_hostEl) init();
  if (!product) return;

  // Mark final scan step as done
  setScanStep(SCAN_STEPS.length); // all done

  // ── Identity ─────────────────────────────────────────
  const nameEl   = _hostEl.querySelector("#aisle1-product-name");
  const brandEl  = _hostEl.querySelector("#aisle1-product-brand");
  const badgeEl  = _hostEl.querySelector("#aisle1-retailer-badge");
  const catEl    = _hostEl.querySelector("#aisle1-category-chip");

  if (nameEl)  nameEl.textContent  = product.name ?? "Unknown Product";
  if (brandEl) {
    if (product.brand) {
      brandEl.textContent = `By ${product.brand}`;
      brandEl.style.display = "";
    } else {
      brandEl.style.display = "none";
    }
  }

  // Retailer badge
  const retailer = product._debug?.retailer ?? "unknown";
  if (badgeEl) badgeEl.textContent = RETAILER_LABELS[retailer] ?? retailer;

  // Category chip placeholder
  if (catEl) {
    const cat = inferCategory(product.name);
    if (cat) {
      catEl.textContent = cat;
      catEl.style.display = "";
    }
  }

  // ── Ingredients preview (highlighted later in renderAnalysis) ───────────
  const ingrWrap = _hostEl.querySelector("#aisle1-ingredients-preview");
  const ingrText = _hostEl.querySelector("#aisle1-ingredients-text");
  if (product.ingredients && ingrWrap && ingrText) {
    // Render plain text now; renderAnalysis will upgrade to highlighted HTML once ready
    ingrText.textContent = product.ingredients;
    ingrWrap.style.display = "";
  } else if (ingrWrap) {
    ingrWrap.style.display = "none";
  }

  renderAnalysis(analysis);

  // ── Collapsible details ───────────────────────────────
  renderDetails(product, analysis);

  // Switch to product state and open sidebar
  if (analysis?.status === "ready") {
    setState("product-ready");
  } else if (analysis?.status === "error") {
    setState("product-error");
  } else {
    setState("product-loading-analysis");
  }
  show();
}

function renderAnalysis(analysis) {
  const apiData = analysis?.data ?? null;
  const score = clampScore(apiData?.healthScore);
  const scoreRing = _hostEl.querySelector("#aisle1-score-ring");
  const scoreValue = _hostEl.querySelector(".aisle1-score-dash");
  const scorePlaceholder = _hostEl.querySelector(".aisle1-score-placeholder");
  const nutritionBlock = _hostEl.querySelector("#aisle1-nutrition-block");
  const alternativesRows = _hostEl.querySelector("#aisle1-alts-rows");
  const alternativesStatus = _hostEl.querySelector("#aisle1-alts-status");

  if (scoreRing) {
    scoreRing.className = `aisle1-score-ring ${getScoreTone(score)}`;
  }
  if (scoreValue) {
    scoreValue.textContent = score == null ? "—" : String(score);
  }

  if (analysis?.status === "ready" && apiData) {
    scorePlaceholder.textContent = "API nutrition analysis";

    // ── Concerns ──────────────────────────────────────────────────────────
    const concernsSection = _hostEl.querySelector("#aisle1-concerns-section");
    const concernsBlock   = _hostEl.querySelector("#aisle1-concerns-block");
    if (concernsBlock && apiData.concerns) {
      concernsBlock.innerHTML = buildConcernsMarkup(apiData.concerns, {
        blockClass:   "aisle1-concerns",
        rowClass:     "aisle1-concern-row",
        dotClass:     "aisle1-concern-dot",
        contentClass: "aisle1-concern-content",
        nameClass:    "aisle1-concern-name",
        reasonClass:  "aisle1-concern-reason",
        badgeClass:   "aisle1-concern-dv",
        cleanClass:   "aisle1-concerns-clean",
      });
      if (concernsSection) concernsSection.style.display = "";
    }

    // ── Highlight ingredients ─────────────────────────────────────────────
    const ingrText = _hostEl.querySelector("#aisle1-ingredients-text");
    if (ingrText && apiData.ingredients) {
      ingrText.innerHTML = highlightIngredients(apiData.ingredients, apiData.concerns);
    }

    // ── Nutrition facts ───────────────────────────────────────────────────
    nutritionBlock.innerHTML = buildNutritionFactsMarkup(apiData.nutritionFacts, {
      blockClass: "aisle1-nutrition-facts",
      titleClass: "aisle1-nutrition-title",
      caloriesClass: "aisle1-nutrition-calories",
      rowClass: "aisle1-nutrition-row",
    });

    alternativesRows.innerHTML = Array.isArray(apiData.alternatives) && apiData.alternatives.length > 0
      ? buildAlternativesMarkup(
          apiData.alternatives,
          apiData.alternativesStatus?.message,
          {
            rowClass: "aisle1-alt-row",
            linkClass: "aisle1-alt-link",
            badgeClass: "aisle1-alt-score-pill",
            emptyClass: "aisle1-analysis-copy",
          },
        )
      : "";
    alternativesStatus.textContent = apiData.alternativesStatus?.message || "";
    return;
  }

  if (analysis?.status === "error") {
    scorePlaceholder.textContent = analysis.error || "Nutrition analysis unavailable right now.";
    nutritionBlock.innerHTML = `<p class="aisle1-analysis-copy">${analysis.error || "Nutrition analysis unavailable right now."}</p>`;
    alternativesRows.innerHTML = "";
    alternativesStatus.textContent = "Better alternatives unavailable right now.";
    return;
  }

  if (analysis?.status === "no-gtin") {
    scorePlaceholder.textContent = "No barcode detected, cannot fetch nutrition analysis.";
    nutritionBlock.innerHTML = `<p class="aisle1-analysis-copy">No barcode detected, cannot fetch nutrition analysis.</p>`;
    alternativesRows.innerHTML = "";
    alternativesStatus.textContent = "Alternatives require a detected barcode.";
    return;
  }

  scorePlaceholder.textContent = "Analyzing nutrition…";
  nutritionBlock.innerHTML = `<p class="aisle1-analysis-copy">Analyzing nutrition…</p>`;
  alternativesRows.innerHTML = "";
  alternativesStatus.textContent = "Searching better alternatives…";
}

// ─── Details panel renderer ───────────────────────────────────────────────────

function renderDetails(product, analysis) {
  const container = _hostEl.querySelector("#aisle1-details-inner");
  if (!container) return;

  const retailer   = product._debug?.retailer ?? "unknown";
  const layers     = (product._debug?.layers ?? []).join(", ") || "—";
  const gtinSource = getGtinSource(product._debug?.rawLayers, product.gtinUpc);
  const schemaFound = product._debug?.layers?.includes("jsonld") ? "Yes" : "No";

  const rows = [
    {
      key: "GTIN",
      val: product.gtinUpc
        ? `<span class="badge-found">✅ ${product.gtinUpc}</span>`
        : `<span class="badge-missing">❌ Not detected</span>`,
    },
    {
      key: "Confidence",
      val: `<span class="aisle1-conf-chip conf--${product.confidence}">${capitalize(product.confidence)}</span>`,
    },
    { key: "Analysis",   val: analysis?.status ?? "idle" },
    { key: "Fetched at", val: analysis?.fetchedAt ?? "—" },
    { key: "Source",     val: schemaFound === "Yes" ? "schema.org JSON-LD" : layers },
    { key: "Retailer",   val: RETAILER_LABELS[retailer] ?? retailer },
  ];

  container.innerHTML = rows
    .map(({ key, val }) => `
      <div class="aisle1-detail-row">
        <span class="aisle1-detail-key">${key}</span>
        <span class="aisle1-detail-val">${val}</span>
      </div>
    `)
    .join("");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getGtinSource(rawLayers, gtin) {
  if (!gtin || !rawLayers) return "—";
  for (const l of rawLayers) {
    if (l?.gtinUpc === gtin) return l.source ?? "—";
  }
  return "—";
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Heuristic category inference from product name */
function inferCategory(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/milk|dairy|yogurt|cheese|cream/.test(n))  return "Dairy";
  if (/juice|drink|beverage|water|soda/.test(n)) return "Beverage";
  if (/chip|cracker|snack|pretzel|popcorn/.test(n)) return "Snack";
  if (/spread|butter|jam|jelly|honey/.test(n))   return "Spread";
  if (/cereal|granola|oat|muesli/.test(n))       return "Cereal";
  if (/bread|loaf|roll|bun/.test(n))             return "Bread";
  if (/frozen|ice cream|sorbet/.test(n))         return "Frozen";
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

window.aisle1_sidebar = {
  init,
  show,
  hide,
  toggle,
  setState,
  setProduct,
  setScanStep,
  isOpen: () => _isOpen,
};
