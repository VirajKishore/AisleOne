# aisle1 — Grocery Product Intelligence

> Built for **Revolution UC 2026**

aisle1 is a Chrome browser extension paired with a local Fastify API that gives you real-time nutrition intelligence while you shop online. Scan any grocery product on Amazon, Walmart, Target, Costco, Whole Foods, or Kroger and instantly see a health score, flagged ingredients, nutrient concerns, and healthier alternatives — no manual searching required.

**Contributors:** Viraj Kishore Charakanam · Dheeraj Sajja

---

## How It Works

```
Retailer page  →  Chrome Extension  →  Local API  →  USDA FoodData Central
                  (detects GTIN)        (scores it)     (nutrition data)
                        ↓
                  Sidebar panel
                  Health score · Concerns · Alternatives
```

1. The extension detects the product barcode (GTIN/UPC) from the page using schema.org JSON-LD, meta tags, retailer-specific DOM selectors, and text patterns — in priority order.
2. It sends the GTIN to the local API, which looks up the full nutrition panel from USDA FoodData Central.
3. The API scores the product using a **Yuka-inspired model**: 60% Nutri-Score + 30% NOVA classification + 10% Additive hazard.
4. It flags concerning ingredients (BHA/BHT, carrageenan, artificial dyes, HFCS, etc.) and over-limit nutrients (sodium, added sugars, saturated fat, trans fat) by tier — high, medium, low.
5. The extension renders a live sidebar panel and popup with the score, concerns, highlighted ingredients, and healthier alternatives sourced from the web.

---

## Repository Structure

```
AisleOneReact/
├── AISLE1-extension/          # Chrome MV3 extension (load unpacked)
│   ├── manifest.json
│   ├── background.js          # Service worker — API calls, tab state
│   ├── contentScript.js       # Product detection on retailer pages
│   ├── sidebar.js / .css      # Persistent right-side assistant panel
│   ├── popup.js / .html / .css  # Toolbar popup UI
│   ├── apiConfig.js           # API base URL (edit to point at your server)
│   └── utils/
│       ├── extractStructuredData.js   # JSON-LD + meta tag extraction
│       ├── extractRetailerSpecific.js # Amazon/Walmart/Target/Costco/etc.
│       ├── extractFallback.js         # Generic DOM heuristics
│       ├── normalizeProduct.js        # Merge layers → NormalizedProduct
│       └── analysisView.js            # Shared rendering helpers
│
├── server/                    # Fastify API
│   ├── routes/products.js     # GET /api/v1/products/:gtin
│   └── services/
│       ├── usda.js            # USDA FoodData Central client
│       ├── productMapper.js   # Map USDA food → API response shape
│       ├── productScoring.js  # Nutri-Score + NOVA + Additive scoring
│       └── smartSwaps.js      # Healthier alternative search
│
└── src/utils/                 # Shared scoring logic
    ├── calculateProductHealth.js      # Nutri-Score computation
    ├── calculateGlobalHealthScore.js  # Yuka-like 60/30/10 model
    ├── ingredientConcerns.js          # Ingredient + nutrient concern flags
    └── normalizeFoodNutrients.js      # Normalize USDA nutrient shapes
```

---

## Prerequisites

- **Node.js** 18 or later
- **Google Chrome** (or any Chromium browser)
- A free **USDA FoodData Central API key** — [get one here](https://fdc.nal.usda.gov/api-guide.html)
- Optional: **Serper API key** for alternative product search

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd AisleOneReact
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_USDA_API_KEY=your_usda_api_key_here
VITE_SERPER_API_KEY=your_serper_api_key_here   # optional
VITE_GEMINI_API_KEY=your_gemini_api_key_here   # optional
```

### 3. Start the API server

```bash
npm run api:dev
```

The API starts at `http://127.0.0.1:3000`. You can verify it's running by visiting:

```
http://127.0.0.1:3000/api/v1/products/049000028911
```

That should return Coca-Cola's nutrition data and health score.

To see a full score breakdown for any product, append `?debug=1`:

```
http://127.0.0.1:3000/api/v1/products/049000028911?debug=1
```

### 4. Load the extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `AISLE1-extension/` folder inside this repo
5. The aisle1 icon appears in your toolbar

> The extension talks to `http://127.0.0.1:3000` by default. If you change the API port, update `AISLE1-extension/apiConfig.js`.

---

## Using the Extension

1. Navigate to a grocery product page on **Amazon, Walmart, Target, Costco, Whole Foods, or Kroger**
2. The extension auto-detects the product — the toolbar badge turns green (high confidence), yellow (medium), or red (low)
3. A **sidebar panel** slides in from the right showing:
   - **Health Score** (0–100, color-coded)
   - **Watch Out For** — flagged ingredients and over-limit nutrients with tier badges (🔴 high · 🟠 medium · 🟡 low)
   - **Ingredients** — with concerning ingredients highlighted inline
   - **Nutrition Facts** — per-serving breakdown
   - **Healthier Options** — alternative products with their scores
4. Click the **aisle1 toolbar icon** to open the compact popup view at any time

---

## Health Scoring Model

Scores follow a Yuka-inspired weighted model:

| Component | Weight | Source |
|---|---|---|
| Nutri-Score | 60% | Nutrient profile (sugars, sodium, fat, fiber, protein, energy) |
| NOVA Group | 30% | Ingredient processing markers |
| Additive Hazard | 10% | Specific additive match against curated concern list |

**NOVA classification:**
- Group 1 (unprocessed) → 100 pts · Group 2 → 75 pts · Group 3 → 40 pts · Group 4 (ultra-processed) → 0 pts

**Ingredient concern tiers:**
- 🔴 **High** — BHA, BHT, sodium nitrite, artificial dyes (Red 40, Yellow 5/6), brominated vegetable oil, TBHQ
- 🟠 **Medium** — Carrageenan, HFCS, partially hydrogenated oils, potassium bromate, propyl gallate
- 🟡 **Low** — Artificial flavors, artificial sweeteners (sucralose, aspartame), MSG, natural flavors

**Nutrient thresholds** (based on FDA daily values):
- Sodium · Added Sugars · Saturated Fat · Trans Fat — flagged as high/medium/low based on % DV per serving

---

## API Reference

### `GET /api/v1/products/:gtin`

Returns the full nutrition analysis for a product by its barcode.

**Parameters:**
- `:gtin` — 8 to 14 digit barcode (UPC-A, EAN-13, or GTIN-14)
- `?debug=1` — optional; logs full score breakdown to the server console

**Example response:**
```json
{
  "gtin": "049000028911",
  "name": "Coca-Cola Classic",
  "brand": "Coca-Cola",
  "healthScore": 28,
  "serving": { "amount": 355, "unit": "ml", "description": "1 can" },
  "nutritionFacts": {
    "calories":      { "amount": 140,  "unit": "kcal" },
    "totalSugars":   { "amount": 39,   "unit": "g" },
    "sodium":        { "amount": 45,   "unit": "mg" }
  },
  "concerns": {
    "ingredients": [
      {
        "tier": "medium",
        "name": "High Fructose Corn Syrup",
        "reason": "Linked to metabolic issues and obesity at high intake",
        "matchedText": "high fructose corn syrup"
      }
    ],
    "nutrients": [
      {
        "nutrient": "Added Sugars",
        "amount": 39,
        "unit": "g",
        "tier": "high",
        "dailyValuePct": "78% DV",
        "reason": "Very high added sugar — exceeds 50% of daily limit per serving"
      }
    ]
  },
  "alternatives": [
    { "title": "Zevia Zero Calorie Cola", "score": 74, "link": "https://..." }
  ]
}
```

---

## Supported Retailers

| Retailer | GTIN Source | Ingredients |
|---|---|---|
| Amazon | Detail bullets / product table | Dedicated section |
| Walmart | `itemprop` meta tags | Description block |
| Target | Specifications table | Facts panel |
| Costco | Product info section | Long description |
| Whole Foods | Product details | Ingredients section |
| Kroger | Product details | Ingredients panel |

All retailers also benefit from schema.org JSON-LD and meta tag extraction as a first-pass layer.

---

## GTIN Lookup Behavior

The API handles barcode format variations automatically:

1. **Tries the raw barcode first** (works for 12-digit UPC-A products stored as-is)
2. **Falls back to GTIN-14** (prepends zeros to reach 14 digits) if no result found
3. The extension sanitizes and validates GTINs before sending — stray characters, hyphens, and label text are stripped

> Products from some store brands (e.g. Walmart Great Value) may not be present in the USDA FoodData Central database as it relies on voluntary manufacturer submissions.

---

## License

MIT
