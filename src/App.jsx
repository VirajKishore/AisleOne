import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './App.css'
import { calculateProductHealth } from './utils/calculateProductHealth'
import { calculateGlobalHealthScore } from './utils/calculateGlobalHealthScore'
import { rankUsdaMatches } from './utils/rankUsdaMatches'
import {
  categorizeProduct,
  computeSwapDelta,
  generateAlternativeQueries,
  rerankAlternatives,
  searchSerperAlternatives,
} from './utils/smartSwaps'

const QUAGGA_CDN = 'https://unpkg.com/quagga/dist/quagga.min.js'
const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const NAME_SEARCH_PAGE_SIZE = 25
const NAME_SEARCH_MAX_PAGES = 4
const NUTRI_SCORE_COLORS = {
  a: '#008b4c',
  b: '#85bb2f',
  c: '#fecb02',
  d: '#ee8100',
  e: '#e63e11',
}

function getGlobalScoreColor(score) {
  if (score >= 80) {
    return '#1f8f55'
  }

  if (score >= 60) {
    return '#8dbf2e'
  }

  if (score >= 40) {
    return '#f0b429'
  }

  if (score >= 20) {
    return '#de7c1d'
  }

  return '#c0392b'
}

const DAILY_VALUES = {
  'Total Fat': { value: 78, unit: 'g' },
  'Saturated Fat': { value: 20, unit: 'g' },
  Cholesterol: { value: 300, unit: 'mg' },
  Sodium: { value: 2300, unit: 'mg' },
  'Total Carbohydrate': { value: 275, unit: 'g' },
  'Dietary Fiber': { value: 28, unit: 'g' },
  'Added Sugars': { value: 50, unit: 'g' },
}

const NUTRIENT_CONFIG = [
  {
    label: 'Calories',
    nutrientName: 'energy',
    unit: 'kcal',
    type: 'calories',
  },
  {
    label: 'Protein',
    nutrientName: 'protein',
    unit: 'g',
  },
  {
    label: 'Total Fat',
    nutrientName: 'total lipid (fat)',
    unit: 'g',
  },
  {
    label: 'Saturated Fat',
    nutrientName: 'fatty acids, total saturated',
    unit: 'g',
  },
  {
    label: 'Trans Fat',
    nutrientName: 'fatty acids, total trans',
    unit: 'g',
  },
  {
    label: 'Cholesterol',
    nutrientName: 'cholesterol',
    unit: 'mg',
  },
  {
    label: 'Sodium',
    nutrientName: 'sodium, na',
    unit: 'mg',
  },
  {
    label: 'Total Carbohydrate',
    nutrientName: 'carbohydrate, by difference',
    unit: 'g',
  },
  {
    label: 'Dietary Fiber',
    nutrientName: 'fiber, total dietary',
    unit: 'g',
  },
  {
    label: 'Total Sugars',
    nutrientName: 'total sugars',
    unit: 'g',
  },
  {
    label: 'Added Sugars',
    nutrientName: 'sugars, added',
    unit: 'g',
  },
]

function App() {
  const [productName, setProductName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [nameMatches, setNameMatches] = useState([])
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [product, setProduct] = useState(null)
  const [rawFoodData, setRawFoodData] = useState(null)
  const [uploadedImageName, setUploadedImageName] = useState('')
  const [smartSwaps, setSmartSwaps] = useState([])
  const [smartSwapsStatus, setSmartSwapsStatus] = useState('')
  const [smartSwapsError, setSmartSwapsError] = useState('')
  const [isLoadingSmartSwaps, setIsLoadingSmartSwaps] = useState(false)
  const [decodeAttempted, setDecodeAttempted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [productNotFound, setProductNotFound] = useState(false)
  const quaggaPromiseRef = useRef(null)
  const smartSwapsRequestRef = useRef(0)

  useEffect(() => {
    if (window.Quagga) {
      quaggaPromiseRef.current = Promise.resolve(window.Quagga)
      return
    }

    if (!quaggaPromiseRef.current) {
      quaggaPromiseRef.current = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = QUAGGA_CDN
        script.async = true
        script.onload = () => resolve(window.Quagga)
        script.onerror = () => reject(new Error('Failed to load barcode decoder.'))
        document.body.appendChild(script)
      })
    }
  }, [])

  async function ensureQuagga() {
    if (window.Quagga) {
      return window.Quagga
    }

    if (!quaggaPromiseRef.current) {
      throw new Error('Barcode decoder is not available.')
    }

    return quaggaPromiseRef.current
  }

  function resetMessages() {
    setError('')
    setNotice('')
    setProductNotFound(false)
  }

  function clearResult() {
    setProduct(null)
    setRawFoodData(null)
    setSmartSwaps([])
    setSmartSwapsStatus('')
    setSmartSwapsError('')
  }

  function clearNameMatches() {
    setNameMatches([])
    setSelectedMatchId('')
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function formatNumber(value, type = 'default') {
    if (!Number.isFinite(value)) {
      return null
    }

    if (type === 'calories') {
      return String(Math.round(value))
    }

    if (value === 0) {
      return '0'
    }

    if (value < 1) {
      const rounded = Math.round(value * 10) / 10
      return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
    }

    const rounded = Math.round(value * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '')
  }

  function findNutrient(foodNutrients = [], nutrientName) {
    return foodNutrients.find(
      (nutrient) => (nutrient?.nutrientName?.toLowerCase() || '') === nutrientName,
    )
  }

  function computePerServingValue(nutrient, servingSize) {
    if (!nutrient?.value || !servingSize) {
      return 0
    }

    const numericValue = Number(nutrient.value)
    const numericServingSize = Number(servingSize)

    if (!Number.isFinite(numericValue) || !Number.isFinite(numericServingSize)) {
      return 0
    }

    return (numericValue / 100) * numericServingSize
  }

  function computeDailyValuePercent(label, amount) {
    const dv = DAILY_VALUES[label]
    if (!dv) {
      return ''
    }

    const percent = Math.round((amount / dv.value) * 100)
    return `${percent}%`
  }

  function buildNutritionSummary(food) {
    const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
    const servingSize = Number(food.servingSize) || null
    const servingUnit = food.servingSizeUnit || ''

    const nutritionItems = NUTRIENT_CONFIG.map((item) => {
      const nutrient = findNutrient(nutrients, item.nutrientName)
      const amount = computePerServingValue(nutrient, servingSize, item.type)
      const formattedAmount =
        item.type === 'calories'
          ? formatNumber(amount, 'calories')
          : `${formatNumber(amount) || '0'} ${item.unit}`

      return {
        label: item.label,
        amount,
        formattedAmount,
        percentDailyValue: computeDailyValuePercent(item.label, amount),
      }
    })

    const health = calculateProductHealth(food)
    const globalHealth = calculateGlobalHealthScore(
      health.grade,
      food.ingredients,
      health.normalizedScore,
      {
        productName: food.description,
        foodType: health.foodType,
        categoryText: food.foodCategory,
        protein: nutritionItems.find((item) => item.label === 'Protein')?.amount ?? 0,
        fiber: nutritionItems.find((item) => item.label === 'Dietary Fiber')?.amount ?? 0,
        addedSugars: nutritionItems.find((item) => item.label === 'Added Sugars')?.amount ?? 0,
      },
    )

    return {
      name: food.description || 'Unnamed product',
      brand: food.brandName || food.brandOwner || 'Brand not listed',
      gtinUpc: food.gtinUpc || '',
      servingSizeText:
        food.householdServingFullText ||
        [servingSize ? formatNumber(servingSize) : null, servingUnit].filter(Boolean).join(' ') ||
        'Not listed',
      servingSizeMetric:
        servingSize && servingUnit ? `${formatNumber(servingSize)} ${servingUnit}` : 'Not listed',
      packageWeight: food.packageWeight || 'Not listed',
      ingredients: food.ingredients || 'Not listed',
      items: nutritionItems,
      health,
      globalHealth,
    }
  }

  function applySelectedFood(food) {
    const mappedProduct = buildNutritionSummary(food)
    console.log('Mapped nutrition summary', mappedProduct)

    setRawFoodData(food)
    setProduct(mappedProduct)
  }

  async function fetchUsdaSearchPage(query, pageSize, pageNumber = 1) {
    const response = await fetch(
      `${USDA_SEARCH_URL}?api_key=${encodeURIComponent(USDA_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          dataType: ['Branded'],
          pageSize,
          pageNumber,
        }),
      },
    )

    if (response.status === 429) {
      throw new Error('Too many requests')
    }

    if (response.status === 403) {
      throw new Error('Invalid key')
    }

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`)
    }

    return response.json()
  }

  async function fetchAllNameCandidates(query) {
    const pages = []

    for (let pageNumber = 1; pageNumber <= NAME_SEARCH_MAX_PAGES; pageNumber += 1) {
      const data = await fetchUsdaSearchPage(query, NAME_SEARCH_PAGE_SIZE, pageNumber)
      const foods = Array.isArray(data?.foods) ? data.foods : []

      pages.push(...foods)

      if (foods.length < NAME_SEARCH_PAGE_SIZE) {
        break
      }
    }

    return [...new Map(pages.map((food) => [String(food.fdcId), food])).values()]
  }

  async function fetchTopUsdaMatch(query) {
    const data = await fetchUsdaSearchPage(query, 8)
    const foods = Array.isArray(data?.foods) ? data.foods : []
    return rankUsdaMatches(query, foods, 1)[0] || null
  }

  function isEquivalentProduct(leftProduct, rightProduct) {
    const leftName = normalizeText(leftProduct?.name || leftProduct?.title)
    const rightName = normalizeText(rightProduct?.name || rightProduct?.title)
    const leftBrand = normalizeText(leftProduct?.brand)
    const rightBrand = normalizeText(rightProduct?.brand)

    return leftName === rightName || (leftName === rightName && leftBrand === rightBrand)
  }

  const buildSmartSwaps = useEffectEvent(async (productSummary, requestId) => {
    if (smartSwapsRequestRef.current !== requestId) {
      return
    }

    setIsLoadingSmartSwaps(true)
    setSmartSwaps([])
    setSmartSwapsError('')

    try {
      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsStatus('Classifying...')
      const swapStrategy = await categorizeProduct(productSummary)

      if (!swapStrategy?.broadCategory) {
        throw new Error('Gemini did not return a usable swap category.')
      }

      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsStatus('Generating Queries...')
      const searchQueries = generateAlternativeQueries(productSummary, swapStrategy)

      if (!searchQueries.length) {
        throw new Error('Gemini did not return any useful alternative search queries.')
      }

      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsStatus('Searching Alternatives...')
      const alternatives = await searchSerperAlternatives(swapStrategy, searchQueries)

      if (!alternatives.length) {
        throw new Error('Serper did not return any alternative product titles.')
      }

      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsStatus('Calculating Health Scores...')
      const scoredAlternatives = await Promise.all(
        alternatives.map(async (alternative) => {
          const matchedFood = await fetchTopUsdaMatch(alternative.title)
          if (!matchedFood) {
            return null
          }

          const summary = buildNutritionSummary(matchedFood)
          const swapDelta = computeSwapDelta(summary, alternative, swapStrategy)
          return {
            ...summary,
            sourceLink: alternative.link,
            sourceSnippet: alternative.snippet,
            sourceName: alternative.source,
            sourceTitle: alternative.title,
            swapDelta,
            swapScore: summary.globalHealth.totalScore + swapDelta,
          }
        }),
      )

      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      const currentSwapScore =
        productSummary.globalHealth.totalScore + computeSwapDelta(productSummary, null, swapStrategy)

      const improvedAlternatives = scoredAlternatives
        .filter(Boolean)
        .filter((candidate) => !isEquivalentProduct(candidate, productSummary))
        .filter((candidate) => candidate.swapScore > currentSwapScore)
        .sort(
          (left, right) =>
            right.swapScore - left.swapScore ||
            right.globalHealth.totalScore - left.globalHealth.totalScore ||
            right.health.normalizedScore - left.health.normalizedScore,
        )

      if (!improvedAlternatives.length) {
        throw new Error('No better-scoring alternatives were found for this product.')
      }

      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsStatus('Ranking Alternatives...')
      const rerankedAlternatives = await rerankAlternatives(
        productSummary,
        swapStrategy,
        improvedAlternatives,
      )

      setSmartSwaps((rerankedAlternatives.length ? rerankedAlternatives : improvedAlternatives).slice(0, 3))
      setSmartSwapsStatus('')
    } catch (swapError) {
      if (smartSwapsRequestRef.current !== requestId) {
        return
      }

      setSmartSwapsError(swapError.message)
      setSmartSwapsStatus('')
    } finally {
      if (smartSwapsRequestRef.current === requestId) {
        setIsLoadingSmartSwaps(false)
      }
    }
  })

  useEffect(() => {
    if (!product) {
      return
    }

    const requestId = smartSwapsRequestRef.current + 1
    smartSwapsRequestRef.current = requestId
    buildSmartSwaps(product, requestId)

    return () => {
      smartSwapsRequestRef.current += 1
    }
  }, [product])

  async function searchProducts(rawQuery, lookupType) {
    const normalized = String(rawQuery || '').trim()
    const lookupLabel = lookupType === 'name' ? 'product name' : 'barcode'

    resetMessages()
    clearResult()

    if (lookupType !== 'name') {
      clearNameMatches()
    }

    if (!normalized) {
      if (lookupType === 'name') {
        setError('Please enter a product name.')
        clearNameMatches()
      } else {
        setError(
          decodeAttempted
            ? 'No barcode could be read from the uploaded image. Try a tighter, clearer barcode photo.'
            : 'Please enter or scan a barcode.',
        )
      }
      return
    }

    if (!USDA_API_KEY) {
      setError('Missing USDA API key. Add VITE_USDA_API_KEY to your .env file.')
      return
    }

    setIsLoading(true)
    setNotice(`Looking up ${lookupLabel}: ${normalized}...`)

    try {
      let foods = []

      if (lookupType === 'name') {
        foods = await fetchAllNameCandidates(normalized)
      } else {
        const data = await fetchUsdaSearchPage(normalized, 1)
        foods = Array.isArray(data?.foods) ? data.foods : []
      }

      console.log('USDA candidate food records', foods)

      if (!foods.length) {
        setProductNotFound(true)
        setNotice('')
        clearNameMatches()
        return
      }

      if (lookupType === 'name') {
        const rankedFoods = rankUsdaMatches(normalized, foods, 5)
        console.log('Ranked USDA name matches', rankedFoods)
        setNameMatches(rankedFoods)
        setSelectedMatchId('')
        setNotice(
          `Collected ${foods.length} matching USDA names. Showing the 5 best-ranked options.`,
        )
        return
      }

      applySelectedFood(foods[0])
      setNotice('')
    } catch (fetchError) {
      setError(`Error: ${fetchError.message}`)
    } finally {
      setIsLoading(false)
      setNotice((currentNotice) =>
        currentNotice.startsWith(`Looking up ${lookupLabel}:`) ? '' : currentNotice,
      )
    }
  }

  async function decodeBarcodeFromImage(file) {
    const Quagga = await ensureQuagga()

    const imageDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read image file.'))
      reader.readAsDataURL(file)
    })

    return new Promise((resolve, reject) => {
      Quagga.decodeSingle(
        {
          src: imageDataUrl,
          numOfWorkers: 0,
          inputStream: {
            size: 1200,
          },
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
            ],
          },
          locate: true,
        },
        (result) => {
          if (result?.codeResult?.code) {
            resolve(result.codeResult.code)
            return
          }

          reject(new Error('Could not decode barcode from image.'))
        },
      )
    })
  }

  async function handleNameLookupSubmit(event) {
    event.preventDefault()
    setDecodeAttempted(false)
    await searchProducts(productName, 'name')
  }

  async function handleLookupSubmit(event) {
    event.preventDefault()
    setDecodeAttempted(false)
    await searchProducts(barcode, 'barcode')
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setUploadedImageName(file.name)
    setDecodeAttempted(true)
    resetMessages()
    clearResult()
      setIsLoading(true)
      setNotice('Decoding barcode from image...')

    try {
      const decodedBarcode = await decodeBarcodeFromImage(file)
      setBarcode(decodedBarcode)
      await searchProducts(decodedBarcode, 'barcode')
    } catch (decodeError) {
      setError(
        `${decodeError.message} Try an image where the barcode fills most of the frame and is not a screenshot of the page.`,
      )
      setNotice('')
      setIsLoading(false)
    }
  }

  function handleMatchChange(event) {
    const nextMatchId = event.target.value
    setSelectedMatchId(nextMatchId)

    const matchedFood = nameMatches.find((food) => String(food.fdcId) === nextMatchId)
    if (!matchedFood) {
      clearResult()
      return
    }

    applySelectedFood(matchedFood)
    setNotice('')
    setProductNotFound(false)
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">USDA FoodData Central</p>
        <h1>Nutrition lookup</h1>
        <p className="intro">
          Search by product name or barcode. The app uses the USDA product&apos;s
          `foodNutrients` array and computes amount per serving from the USDA values plus
          the serving size.
        </p>

        <form className="lookup-form" onSubmit={handleNameLookupSubmit}>
          <label className="field">
            <span>Product name</span>
            <input
              type="text"
              placeholder="Enter a branded food name"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Search by name'}
          </button>
        </form>

        {nameMatches.length ? (
          <label className="field match-field">
            <span>Top matches</span>
            <select value={selectedMatchId} onChange={handleMatchChange}>
              <option value="">Select the matching product</option>
              {nameMatches.map((food) => (
                <option key={food.fdcId} value={String(food.fdcId)}>
                  {[food.description, food.brandName || food.brandOwner, food.packageWeight]
                    .filter(Boolean)
                    .join(' | ')}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <p className="lookup-divider">Or use a barcode</p>

        <form className="lookup-form" onSubmit={handleLookupSubmit}>
          <label className="field">
            <span>Barcode (GTIN)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter barcode manually"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Search'}
          </button>
        </form>

        <label className="field upload-field">
          <span>Upload barcode image</span>
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>

        {uploadedImageName ? (
          <p className="file-note">Selected image: {uploadedImageName}</p>
        ) : null}

        {notice ? <p className="status">{notice}</p> : null}
        {error ? <p className="status error">{error}</p> : null}
        {productNotFound ? <p className="status error">Not Found</p> : null}

        {product ? (
          <section className="results" aria-live="polite">
            <p className="product-meta">{product.brand}</p>
            <h2>{product.name}</h2>

            <dl className="product-details">
              <div>
                <dt>UPC</dt>
                <dd>{product.gtinUpc || 'Not listed'}</dd>
              </div>
              <div>
                <dt>Serving</dt>
                <dd>{product.servingSizeText}</dd>
              </div>
              <div>
                <dt>Metric Serving</dt>
                <dd>{product.servingSizeMetric}</dd>
              </div>
              <div>
                <dt>Package Weight</dt>
                <dd>{product.packageWeight}</dd>
              </div>
            </dl>

            <section className="nutrition-list-card">
              <h3>Amount Per Serving</h3>
              <ul className="nutrition-items">
                {product.items.map((item) => (
                  <li key={item.label}>
                    <span className="nutrition-name">{item.label}</span>
                    <span className="nutrition-amount">{item.formattedAmount}</span>
                    <span className="nutrition-dv">{item.percentDailyValue}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="nutrition-list-card">
              <h3>Nutri-Score</h3>
              <div className="nutri-score-block">
                <div className="nutri-score-badge" aria-label={`Nutri-Score ${product.health.grade}`}>
                  {['a', 'b', 'c', 'd', 'e'].map((grade) => (
                    <span
                      key={grade}
                      className={`nutri-score-segment ${
                        product.health.grade === grade ? 'active' : ''
                      }`}
                      style={{
                        backgroundColor:
                          product.health.grade === grade
                            ? NUTRI_SCORE_COLORS[grade]
                            : '#d9d9d9',
                      }}
                    >
                      {grade.toUpperCase()}
                    </span>
                  ))}
                </div>
                <p className="nutri-score-summary">
                  Health score {product.health.normalizedScore}/100. Official grade {product.health.grade.toUpperCase()} with raw score {product.health.score}
                </p>
                <pre className="nutri-score-input">
                  {JSON.stringify(product.health.input, null, 2)}
                </pre>
              </div>
            </section>

            <section className="nutrition-list-card">
              <h3>Global Health Score</h3>
              <div className="global-health-card">
                <div
                  className="global-health-gauge"
                  role="img"
                  aria-label={`Global health score ${product.globalHealth.totalScore} out of 100`}
                  style={{
                    '--gauge-color': getGlobalScoreColor(product.globalHealth.totalScore),
                    '--gauge-fill': `${product.globalHealth.totalScore}%`,
                  }}
                >
                  <div className="global-health-gauge-inner">
                    <strong>{product.globalHealth.totalScore}</strong>
                    <span>/ 100</span>
                  </div>
                </div>

                <div className="global-health-copy">
                  <p>
                    Nutri-Score grade {product.globalHealth.nutriScoreGrade}. NOVA Group{' '}
                    {product.globalHealth.novaGroup}.
                  </p>
                  <p>
                    Nutri-Score contributes {product.globalHealth.nutriComponent} points and NOVA
                    contributes {product.globalHealth.novaComponent} points.
                  </p>
                  {product.globalHealth.ingredientQualityAdjustment ? (
                    <p>
                      Ingredient quality adjustment{' '}
                      {product.globalHealth.ingredientQualityAdjustment > 0 ? '+' : ''}
                      {product.globalHealth.ingredientQualityAdjustment} points.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="processing-alerts">
                <h4>Processing Alerts</h4>
                {product.globalHealth.processedMarkersFound.length ? (
                  <ul className="processing-alert-list">
                    {product.globalHealth.processedMarkersFound.map((marker) => (
                      <li key={marker}>{marker}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="processing-alert-empty">
                    No red-flag ultra-processed markers were found in the ingredient text.
                  </p>
                )}
              </div>
            </section>

            <section className="ingredients-card">
              <h3>Ingredients</h3>
              <p>{product.ingredients}</p>
            </section>

            <section className="nutrition-list-card">
              <h3>Smart Swaps</h3>
              {smartSwapsStatus ? <p className="swap-status">{smartSwapsStatus}</p> : null}
              {smartSwapsError ? <p className="swap-status error">{smartSwapsError}</p> : null}

              {smartSwaps.length ? (
                <div className="smart-swaps-grid">
                  {smartSwaps.map((swap) => (
                    <article className="smart-swap-card" key={swap.sourceLink || swap.name}>
                      <p className="smart-swap-brand">{swap.brand}</p>
                      <h4>{swap.name}</h4>
                      <p className="smart-swap-score">
                        Swap score {swap.swapScore}/100
                      </p>
                      <p className="smart-swap-score">
                        Global score {swap.globalHealth.totalScore}/100
                      </p>
                      <p className="smart-swap-score">
                        Nutri-Score {swap.health.grade.toUpperCase()} | NOVA Group{' '}
                        {swap.globalHealth.novaGroup}
                      </p>
                      {swap.sourceSnippet ? (
                        <p className="smart-swap-why">{swap.sourceSnippet}</p>
                      ) : null}
                      {swap.sourceLink ? (
                        <a
                          className="smart-swap-link"
                          href={swap.sourceLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open product result
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}

              {isLoadingSmartSwaps && !smartSwapsStatus ? (
                <p className="swap-status">Preparing Smart Swaps...</p>
              ) : null}
            </section>

            {rawFoodData ? (
              <section className="raw-data">
                <div className="raw-data-header">
                  <h3>Raw USDA Product Data</h3>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(rawFoodData, null, 2))
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
                <p className="raw-data-note">
                  Copy this block if you want to refine the extraction further.
                </p>
                <pre>{JSON.stringify(rawFoodData, null, 2)}</pre>
              </section>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
