import { useEffect, useRef, useState } from 'react'
import './App.css'
import { calculateProductHealth } from './utils/calculateProductHealth'
import { calculateGlobalHealthScore } from './utils/calculateGlobalHealthScore'

const QUAGGA_CDN = 'https://unpkg.com/quagga/dist/quagga.min.js'
const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY
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
  const [barcode, setBarcode] = useState('')
  const [product, setProduct] = useState(null)
  const [rawFoodData, setRawFoodData] = useState(null)
  const [uploadedImageName, setUploadedImageName] = useState('')
  const [decodeAttempted, setDecodeAttempted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [productNotFound, setProductNotFound] = useState(false)
  const quaggaPromiseRef = useRef(null)

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

  async function fetchProduct(rawBarcode) {
    const normalized = String(rawBarcode || '').trim()

    resetMessages()
    clearResult()

    if (!normalized) {
      setError(
        decodeAttempted
          ? 'No barcode could be read from the uploaded image. Try a tighter, clearer barcode photo.'
          : 'Please enter or scan a barcode.',
      )
      return
    }

    if (!USDA_API_KEY) {
      setError('Missing USDA API key. Add VITE_USDA_API_KEY to your .env file.')
      return
    }

    setIsLoading(true)
    setNotice(`Looking up barcode: ${normalized}...`)

    try {
      const response = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: normalized,
            dataType: ['Branded'],
            pageSize: 1,
          }),
        },
      )

      if (response.status === 429) {
        setError('Too many requests')
        return
      }

      if (response.status === 403) {
        setError('Invalid key')
        return
      }

      if (!response.ok) {
        setError(`Request failed (${response.status}).`)
        return
      }

      const data = await response.json()
      const food = data?.foods?.[0]

      console.log('USDA search response', data)
      console.log('USDA first food record', food)

      if (!food) {
        setProductNotFound(true)
        setNotice('')
        return
      }

      const mappedProduct = buildNutritionSummary(food)
      console.log('Mapped nutrition summary', mappedProduct)

      setRawFoodData(food)
      setProduct(mappedProduct)
      setNotice('')
    } catch (fetchError) {
      setError(`Error: ${fetchError.message}`)
    } finally {
      setIsLoading(false)
      setNotice((currentNotice) =>
        currentNotice.startsWith('Looking up barcode:') ? '' : currentNotice,
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

  async function handleLookupSubmit(event) {
    event.preventDefault()
    await fetchProduct(barcode)
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
      await fetchProduct(decodedBarcode)
    } catch (decodeError) {
      setError(
        `${decodeError.message} Try an image where the barcode fills most of the frame and is not a screenshot of the page.`,
      )
      setNotice('')
      setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">USDA FoodData Central</p>
        <h1>Nutrition by barcode</h1>
        <p className="intro">
          This version uses the product&apos;s `foodNutrients` array and computes amount
          per serving from the USDA values plus the serving size.
        </p>

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
