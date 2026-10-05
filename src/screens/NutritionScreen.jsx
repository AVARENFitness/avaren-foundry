import {
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  ChefHat,
  Copy,
  PackageCheck,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Droplets,
  History,
  Search,
  Sparkles,
  X,
  Plus,
  Save,
  Scale,
  Settings2,
  Trash2,
  Utensils,
  Star,
  Watch,
  Camera,
  ImagePlus,
  ScanLine,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppModalLayer } from '../hooks/useAppModalLayer'
import {
  DEFAULT_NUTRITION_GOALS,
  emptyNutritionDay,
  hasConfiguredNutritionTargets,
  nutritionDateKey,
  nutritionTotals,
  remainingNutrition,
  workoutActivityCalories,
} from '../lib/nutrition'
import {
  appendFoodToNutrition,
  appendFatSecretFoodReference,
  addWaterToNutrition,
  logRecipeToNutrition,
  nutritionRound as round,
} from '../lib/nutritionActions'
import { COMMON_FOODS, FOOD_CATEGORIES } from '../data/commonFoods'
import { appUi } from '../lib/appUi'
import { createRuntimeId } from '../lib/createRuntimeId'
import {
  getFatSecretFood,
  getFatSecretFoodByBarcode,
  searchFatSecretFoods,
} from '../lib/fatSecretFoodSearch'
import {
  analyzeNutritionImage,
  prepareNutritionScanImage,
} from '../lib/nutritionImageAnalysis'
import {
  ACTIVITY_OPTIONS,
  NUTRITION_GOAL_OPTIONS,
  calculateNutritionTargets,
} from '../lib/nutritionTargets'
import {
  analyzeNutritionAdaptation,
  applyAdaptiveNutritionAdjustment,
} from '../lib/nutritionAdaptation'
import {
  FOOD_MEASURE_UNIT,
  foodMeasureDisplay,
  foodMeasureMultiplier,
  resolveFoodServingBasis,
} from '../lib/nutritionMeasurement'
import {
  detectNutritionBarcode,
  normalizeBarcodeDigits,
} from '../lib/nutritionBarcode'

const tabs = [
  { label: 'Today', value: 'Today' },
  { label: 'Log', value: 'Meals' },
  { label: 'Library', value: 'Library' },
  { label: 'Insights', value: 'Insights' },
]
const blankFood = { name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servings: 1 }

const blankNutritionSetup = {
  goal: '',
  age: '',
  sexForEnergyEstimation: '',
  heightFeet: '',
  heightInches: '',
  weightLb: '',
  activityLevel: '',
  strengthSessionsPerWeek: '',
  cardioSessionsPerWeek: '',
}

const ProgressBar = ({ value, goal }) => {
  const percent = Math.max(0, Math.min(100, goal ? (value / goal) * 100 : 0))
  return <span className="nutrition-progress"><i style={{ width: `${percent}%` }} /></span>
}

const resolveFatSecretRuntimeEntry = (food, detailCache) => {
  if (food?.source !== 'fatsecret' || !food?.fatSecret?.foodId) return food

  const foodId = String(food.fatSecret.foodId)
  const hasAttempted = Object.prototype.hasOwnProperty.call(detailCache, foodId)
  const detail = detailCache[foodId]
  const serving = detail?.servings?.find(
    (item) => String(item.servingId) === String(food.fatSecret.servingId),
  )

  if (!detail || !serving) {
    const hasSnapshot =
      Number(food?.calories || 0) > 0 ||
      Number(food?.protein || 0) > 0 ||
      Number(food?.carbs || 0) > 0 ||
      Number(food?.fat || 0) > 0 ||
      Boolean(food?.name)

    if (hasSnapshot) {
      return food
    }

    return {
      ...food,
      name: hasAttempted ? 'Food unavailable' : 'Loading food…',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    }
  }

  const quantity = Math.max(0.01, Number(food.quantity || 1))
  return {
    ...food,
    name: detail.name || 'FatSecret food',
    brand: detail.brand || '',
    serving: serving.description,
    calories: round(Number(serving.calories || 0) * quantity),
    protein: round(Number(serving.protein || 0) * quantity),
    carbs: round(Number(serving.carbs || 0) * quantity),
    fat: round(Number(serving.fat || 0) * quantity),
    fiber: round(Number(serving.fiber || 0) * quantity),
  }
}

export default function NutritionScreen({ nutrition, onChange, initialTab = 'Today', trainingHistory = [] }) {
  const [tab, setTab] = useState(initialTab)
  const [date, setDate] = useState(nutritionDateKey())
  const [foodDraft, setFoodDraft] = useState(blankFood)
  const [foodSearch, setFoodSearch] = useState('')
  const [showCustomFood, setShowCustomFood] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedMultiplier, setSelectedMultiplier] = useState(1)
  const [selectedMeasureUnit, setSelectedMeasureUnit] = useState(FOOD_MEASURE_UNIT.SERVING)
  const [selectedMeasureAmount, setSelectedMeasureAmount] = useState('1')
  const [foodCategory, setFoodCategory] = useState('All')
  const [fatSecretFoods, setFatSecretFoods] = useState([])
  const [fatSecretSearchState, setFatSecretSearchState] = useState('idle')
  const [fatSecretSearchError, setFatSecretSearchError] = useState('')
  const [fatSecretDetailCache, setFatSecretDetailCache] = useState({})
  const [fatSecretDetailState, setFatSecretDetailState] = useState('idle')
  const [fatSecretDetailError, setFatSecretDetailError] = useState('')
  const [selectedFatSecretServingId, setSelectedFatSecretServingId] = useState('')
  const [fatSecretQuantity, setFatSecretQuantity] = useState('1')
  const [fatSecretMeasureUnit, setFatSecretMeasureUnit] = useState(FOOD_MEASURE_UNIT.SERVING)
  const [fatSecretMeasureAmount, setFatSecretMeasureAmount] = useState('1')
  const [recipeDraft, setRecipeDraft] = useState({ name: '', servings: 4, ingredients: [] })
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeLogTarget, setRecipeLogTarget] = useState(null)
  const [recipeLogAmount, setRecipeLogAmount] = useState(1)
  const [notice, setNotice] = useState('')
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const barcodeInputRef = useRef(null)
  const [scanState, setScanState] = useState('idle')
  const [scanError, setScanError] = useState('')
  const [scanPreview, setScanPreview] = useState('')
  const [scanContext, setScanContext] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [scanDraft, setScanDraft] = useState(null)
  const [scanQuantity, setScanQuantity] = useState(1)
  const [scanMeasureUnit, setScanMeasureUnit] = useState(FOOD_MEASURE_UNIT.SERVING)
  const [scanMeasureAmount, setScanMeasureAmount] = useState('1')
  const [scanMatches, setScanMatches] = useState([])
  const [barcodeManualValue, setBarcodeManualValue] = useState('')
  const [showWorkoutActivityForm, setShowWorkoutActivityForm] = useState(false)
  const [workoutActivityDraft, setWorkoutActivityDraft] = useState({
    label: 'Strength Training',
    activeCalories: '',
  })
  const [nutritionSetup, setNutritionSetup] = useState(() => {
    const inputs = nutrition?.goals?.inputs ?? {}
    const heightIn = Number(inputs.heightIn || 0)
    return {
      ...blankNutritionSetup,
      goal: inputs.goal ?? '',
      age: inputs.age ?? '',
      sexForEnergyEstimation: inputs.sexForEnergyEstimation ?? '',
      heightFeet: heightIn ? Math.floor(heightIn / 12) : '',
      heightInches: heightIn ? heightIn % 12 : '',
      weightLb: inputs.weightLb ?? '',
      activityLevel: inputs.activityLevel ?? '',
      strengthSessionsPerWeek: inputs.strengthSessionsPerWeek ?? '',
      cardioSessionsPerWeek: inputs.cardioSessionsPerWeek ?? '',
    }
  })
  const [setupError, setSetupError] = useState('')
  const [editingTargets, setEditingTargets] = useState(false)

  useAppModalLayer(Boolean(selectedFood || recipeLogTarget || scanPreview || scanResult))

  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition?.goals ?? {}) }
  const nutritionConfigured =
    hasConfiguredNutritionTargets(goals) && !editingTargets
  const visibleTabs = nutritionConfigured
    ? tabs
    : tabs.filter((item) => item.value !== 'Insights')
  const day = nutrition?.days?.[date] ?? emptyNutritionDay(date)

  const resolvedDayFoods = useMemo(
    () => (day.foods ?? []).map((food) =>
      resolveFatSecretRuntimeEntry(food, fatSecretDetailCache),
    ),
    [day.foods, fatSecretDetailCache],
  )

  const resolvedDay = useMemo(
    () => ({ ...day, foods: resolvedDayFoods }),
    [day, resolvedDayFoods],
  )
  const totals = useMemo(() => nutritionTotals(resolvedDay), [resolvedDay])
  const remaining = useMemo(() => remainingNutrition(goals, totals, resolvedDay), [goals, totals, resolvedDay])
  const workoutActivityTotal = useMemo(
    () => workoutActivityCalories(day),
    [day],
  )
  const favoriteIds = nutrition?.favoriteFoodIds ?? []
  const recentIds = nutrition?.recentFoodIds ?? []
  const foodMatches = useMemo(() => {
    const query = foodSearch.trim().toLowerCase()
    const saved = (nutrition.savedFoods ?? []).map((food) => ({ ...food, sourceLabel: 'Saved', category: food.category ?? 'Saved' }))
    const common = COMMON_FOODS.map((food) => ({ ...food, sourceLabel: food.brand }))
    const combined = [...saved, ...common]
    return combined
      .filter((food) => foodCategory === 'All' || food.category === foodCategory || (foodCategory === 'Favorites' && favoriteIds.includes(food.id)))
      .filter((food) => !query || `${food.name} ${food.brand ?? ''} ${food.category ?? ''} ${food.keywords ?? ''}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const favoriteDelta = Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id))
        if (favoriteDelta) return favoriteDelta
        const recentA = recentIds.indexOf(a.id)
        const recentB = recentIds.indexOf(b.id)
        if (recentA !== -1 || recentB !== -1) {
          if (recentA === -1) return 1
          if (recentB === -1) return -1
          return recentA - recentB
        }
        return a.name.localeCompare(b.name)
      })
      .slice(0, 28)
  }, [foodSearch, foodCategory, favoriteIds, recentIds, nutrition.savedFoods])

  useEffect(() => {
    const today = new Date(`${nutritionDateKey()}T12:00:00`)
    const historyWindowDays = tab === 'Insights' ? 14 : 7
    const recentKeys = new Set(
      Array.from({ length: historyWindowDays }, (_, index) => {
        const current = new Date(today)
        current.setDate(today.getDate() - index)
        return nutritionDateKey(current)
      }),
    )

    const relevantDays = Object.values(nutrition?.days ?? {}).filter(
      (entry) => entry?.date === date || recentKeys.has(entry?.date),
    )

    const foodIds = [
      ...new Set(
        relevantDays
          .flatMap((entry) => entry?.foods ?? [])
          .filter((food) => food.source === 'fatsecret' && food.fatSecret?.foodId)
          .map((food) => String(food.fatSecret.foodId)),
      ),
    ].filter(
      (foodId) =>
        !Object.prototype.hasOwnProperty.call(fatSecretDetailCache, foodId),
    )

    if (!foodIds.length) return undefined

    let cancelled = false

    Promise.all(
      foodIds.map(async (foodId) => {
        try {
          return [foodId, await getFatSecretFood(foodId)]
        } catch {
          return [foodId, null]
        }
      }),
    ).then((rows) => {
      if (cancelled) return
      setFatSecretDetailCache((current) => ({
        ...current,
        ...Object.fromEntries(rows),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [nutrition?.days, date, fatSecretDetailCache, tab])

  useEffect(() => {
    const query = foodSearch.trim()

    if (tab !== 'Meals' || showCustomFood || query.length < 2) {
      setFatSecretFoods([])
      setFatSecretSearchState('idle')
      setFatSecretSearchError('')
      return undefined
    }

    let cancelled = false
    setFatSecretSearchState('loading')
    setFatSecretSearchError('')

    const timer = window.setTimeout(async () => {
      try {
        const result = await searchFatSecretFoods(query, { maxResults: 20 })
        if (cancelled) return

        const foods = (result.foods ?? []).map((food) => ({
          id: `fatsecret:${food.foodId}`,
          foodId: food.foodId,
          provider: 'fatsecret',
          sourceLabel: 'FatSecret',
          name: food.name,
          brand: food.brand || 'FatSecret',
          serving:
            food.description?.match(/^Per ([^-]+?)\s+-/i)?.[1]?.trim() ??
            'Serving details',
          category: food.foodType || 'Food',
          calories: Number(food.summaryNutrition?.calories ?? 0),
          protein: Number(food.summaryNutrition?.protein ?? 0),
          carbs: Number(food.summaryNutrition?.carbs ?? 0),
          fat: Number(food.summaryNutrition?.fat ?? 0),
          fiber: 0,
          description: food.description,
          servingOptions: [],
          fatSecretSummaryOnly: true,
        }))

        setFatSecretFoods(foods)
        setFatSecretSearchState('success')
      } catch (error) {
        if (cancelled) return
        setFatSecretFoods([])
        setFatSecretSearchState('error')
        setFatSecretSearchError(
          error?.message ?? 'Live food search is unavailable right now.',
        )
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [foodSearch, tab, showCustomFood])

  const activeFoodSearch = foodSearch.trim().length >= 2

  const visibleFoodMatches = useMemo(() => {
    const query = foodSearch.trim()
    if (query.length < 2 || foodCategory === 'Favorites') {
      return foodMatches
    }

    const remoteIds = new Set(fatSecretFoods.map((food) => food.id))
    return [
      ...foodMatches.filter((food) => !remoteIds.has(food.id)),
      ...fatSecretFoods,
    ]
  }, [foodMatches, fatSecretFoods, foodSearch, foodCategory])

  const weeklyInsights = useMemo(() => {
    const today = new Date(`${nutritionDateKey()}T12:00:00`)
    const days = Array.from({ length: 7 }, (_, index) => {
      const current = new Date(today)
      current.setDate(today.getDate() - (6 - index))
      const key = nutritionDateKey(current)
      const entry = nutrition?.days?.[key] ?? emptyNutritionDay(key)
      const resolvedEntry = {
        ...entry,
        foods: (entry.foods ?? []).map((food) =>
          resolveFatSecretRuntimeEntry(food, fatSecretDetailCache),
        ),
      }
      const totalsForDay = nutritionTotals(resolvedEntry)
      return {
        key,
        label: current.toLocaleDateString([], { weekday: 'short' }),
        calories: Number(totalsForDay.calories || 0),
        protein: Number(totalsForDay.protein || 0),
        water: Number(entry.waterOz || 0),
        weight: Number(entry.weight || 0),
      }
    })
    const loggedDays = days.filter((item) => item.calories > 0 || item.protein > 0 || item.water > 0)
    const average = (field) => loggedDays.length
      ? loggedDays.reduce((sum, item) => sum + Number(item[field] || 0), 0) / loggedDays.length
      : 0
    const proteinDays = days.filter((item) => item.protein >= Number(goals.protein || 0) * .9).length
    const hydrationDays = days.filter((item) => item.water >= Number(goals.waterOz || 0) * .9).length
    const weights = days.filter((item) => item.weight > 0).map((item) => item.weight)
    const weightChange = weights.length > 1 ? weights[weights.length - 1] - weights[0] : 0
    return {
      days,
      loggedDays: loggedDays.length,
      averageCalories: average('calories'),
      averageProtein: average('protein'),
      averageWater: average('water'),
      proteinDays,
      hydrationDays,
      weightChange,
    }
  }, [nutrition?.days, goals.protein, goals.waterOz, fatSecretDetailCache])

  const adaptiveHistory = useMemo(() => {
    const today = new Date(`${nutritionDateKey()}T12:00:00`)
    return Array.from({ length: 14 }, (_, index) => {
      const current = new Date(today)
      current.setDate(today.getDate() - (13 - index))
      const key = nutritionDateKey(current)
      const entry = nutrition?.days?.[key] ?? emptyNutritionDay(key)
      const fatSecretFoods = (entry.foods ?? []).filter(
        (food) => food.source === 'fatsecret' && food.fatSecret?.foodId,
      )
      const completeNutrition = fatSecretFoods.every((food) => {
        const detail = fatSecretDetailCache[String(food.fatSecret.foodId)]
        return Boolean(
          detail?.servings?.some(
            (serving) =>
              String(serving.servingId) === String(food.fatSecret.servingId),
          ),
        )
      })
      const resolvedEntry = {
        ...entry,
        foods: (entry.foods ?? []).map((food) =>
          resolveFatSecretRuntimeEntry(food, fatSecretDetailCache),
        ),
      }
      const totalsForDay = nutritionTotals(resolvedEntry)
      return {
        date: key,
        calories: Number(totalsForDay.calories || 0),
        budget:
          Number(goals.calories || 0) + workoutActivityCalories(entry),
        weight: Number(entry.weight || 0),
        completeNutrition,
      }
    })
  }, [nutrition?.days, goals.calories, fatSecretDetailCache])

  const adaptiveAnalysis = useMemo(
    () =>
      analyzeNutritionAdaptation({
        days: adaptiveHistory,
        goal: goals.inputs?.goal,
        currentBaseCalories: goals.calories,
        lastAppliedAt: goals.adaptation?.lastAppliedAt,
        trainingHistory,
      }),
    [
      adaptiveHistory,
      goals.inputs?.goal,
      goals.calories,
      goals.adaptation?.lastAppliedAt,
      trainingHistory,
    ],
  )

  const patch = (updater) => onChange((current) => {
    const base = current ?? { goals: DEFAULT_NUTRITION_GOALS, days: {}, savedFoods: [], recipes: [], recentFoodIds: [], favoriteFoodIds: [] }
    return typeof updater === 'function' ? updater(base) : updater
  })

  const patchDay = (updater) => patch((current) => {
    const currentDay = current.days?.[date] ?? emptyNutritionDay(date)
    const nextDay = typeof updater === 'function' ? updater(currentDay) : updater
    return { ...current, days: { ...(current.days ?? {}), [date]: nextDay } }
  })

  const resetFoodScan = () => {
    setScanState('idle')
    setScanError('')
    setScanPreview('')
    setScanContext('')
    setScanResult(null)
    setScanDraft(null)
    setScanQuantity(1)
    setScanMatches([])
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    if (barcodeInputRef.current) barcodeInputRef.current.value = ''
  }

  const runFoodScan = async (file, contextOverride = null, mode = 'food') => {
    try {
      setScanState('loading')
      setScanError('')
      const prepared = file
        ? await prepareNutritionScanImage(file)
        : scanPreview
      if (!prepared) throw new Error('Choose a photo first.')
      if (file) setScanPreview(prepared)

      const result = await analyzeNutritionImage({
        imageDataUrl: prepared,
        context: contextOverride ?? scanContext,
        mode,
      })

      if (mode === 'barcode') {
        const barcode = String(result.barcode || '').replace(/\D/g, '')
        if (![8, 12, 13].includes(barcode.length)) {
          throw new Error('AVA could not read that barcode clearly. Try moving closer and keeping it in focus.')
        }

        const matched = await getFatSecretFoodByBarcode(barcode)
        const food = {
          id: `fatsecret:${matched.foodId}`,
          foodId: matched.foodId,
          provider: 'fatsecret',
          sourceLabel: 'FatSecret',
          name: matched.name,
          brand: matched.brand || 'FatSecret',
          serving: matched.servings?.[0]?.description || 'Serving details',
          category: matched.foodType || 'Food',
          calories: Number(matched.servings?.[0]?.calories || 0),
          protein: Number(matched.servings?.[0]?.protein || 0),
          carbs: Number(matched.servings?.[0]?.carbs || 0),
          fat: Number(matched.servings?.[0]?.fat || 0),
          fiber: Number(matched.servings?.[0]?.fiber || 0),
        }

        setFatSecretDetailCache((current) => ({
          ...current,
          [matched.foodId]: matched,
        }))
        resetFoodScan()
        await openFood(food)
        return
      }

      const draft = {
        name: result.title || 'Scanned food',
        calories: Number(result.calories || 0),
        protein: Number(result.protein || 0),
        carbs: Number(result.carbs || 0),
        fat: Number(result.fat || 0),
        fiber: Number(result.fiber || 0),
        servings: 1,
      }

      setScanResult(result)
      setScanDraft(draft)
      setScanQuantity(1)
      setScanMatches([])

      if (result.kind === 'packaged_product' && result.searchQuery?.trim()) {
        try {
          const matchResult = await searchFatSecretFoods(result.searchQuery, {
            maxResults: 5,
          })
          setScanMatches(
            (matchResult.foods ?? []).map((food) => ({
              id: `fatsecret:${food.foodId}`,
              foodId: food.foodId,
              provider: 'fatsecret',
              sourceLabel: 'FatSecret',
              name: food.name,
              brand: food.brand || 'FatSecret',
              serving:
                food.description?.match(/^Per ([^-]+?)\s+-/i)?.[1]?.trim() ??
                'Serving details',
              category: food.foodType || 'Food',
              calories: Number(food.summaryNutrition?.calories ?? 0),
              protein: Number(food.summaryNutrition?.protein ?? 0),
              carbs: Number(food.summaryNutrition?.carbs ?? 0),
              fat: Number(food.summaryNutrition?.fat ?? 0),
              fiber: 0,
              description: food.description,
              servingOptions: [],
              fatSecretSummaryOnly: true,
            })),
          )
        } catch {
          // The visual estimate remains usable if the database search is unavailable.
        }
      }

      setScanState('success')
    } catch (error) {
      setScanState('error')
      setScanError(error?.message ?? 'AVAREN could not analyze that photo.')
    }
  }

  const scanQuantityValue = Math.max(0.25, Number(scanQuantity || 1))
  const scaledScanDraft = scanDraft
    ? {
        ...scanDraft,
        calories: round(Number(scanDraft.calories || 0) * scanQuantityValue),
        protein: round(Number(scanDraft.protein || 0) * scanQuantityValue),
        carbs: round(Number(scanDraft.carbs || 0) * scanQuantityValue),
        fat: round(Number(scanDraft.fat || 0) * scanQuantityValue),
        fiber: round(Number(scanDraft.fiber || 0) * scanQuantityValue),
      }
    : null

  const logScannedFood = () => {
    if (!scanDraft?.name?.trim()) return

    const foodToLog = {
      ...scanDraft,
      servings: scanQuantityValue,
    }

    patch((current) =>
      appendFoodToNutrition(
        current,
        date,
        foodToLog,
        scanResult?.sourceType === 'label_read'
          ? 'nutrition_label_scan'
          : 'ava_photo_estimate',
      ).nutrition,
    )

    const quantityLabel =
      scanQuantityValue === 1
        ? '1 portion'
        : `${scanQuantityValue} portions`

    setNotice(
      scanResult?.sourceType === 'label_read'
        ? `${scanDraft.name} · ${quantityLabel} added from the nutrition label.`
        : `${scanDraft.name} · ${quantityLabel} estimate added. You can edit or remove it anytime.`,
    )
    resetFoodScan()
    setTab('Today')
  }

  const chooseScanDatabaseMatch = async (food) => {
    resetFoodScan()
    await openFood(food)
  }

  const addWorkoutActivity = () => {
    const activeCalories = Math.round(Number(workoutActivityDraft.activeCalories || 0))
    if (activeCalories <= 0) {
      setNotice('Enter the Active Calories from your wearable or fitness tracker.')
      return
    }

    const label = workoutActivityDraft.label || 'Strength Training'
    patchDay((current) => ({
      ...current,
      workoutActivities: [
        ...(current.workoutActivities ?? []),
        {
          id: createRuntimeId(),
          label,
          source: 'wearable_manual',
          activeCalories,
          loggedAt: new Date().toISOString(),
        },
      ],
    }))

    setWorkoutActivityDraft({
      label: 'Strength Training',
      activeCalories: '',
    })
    setShowWorkoutActivityForm(false)
    setNotice(`${activeCalories} active calories added from ${label}.`)
  }

  const removeWorkoutActivity = (id) => {
    patchDay((current) => ({
      ...current,
      workoutActivities: (current.workoutActivities ?? []).filter(
        (entry) => entry.id !== id,
      ),
    }))
  }

  const applyAdaptiveAdjustment = () => {
    if (adaptiveAnalysis.status !== 'recommend') return

    patch((current) => ({
      ...current,
      goals: applyAdaptiveNutritionAdjustment(
        current.goals ?? goals,
        adaptiveAnalysis,
      ),
    }))

    const direction =
      adaptiveAnalysis.adjustmentCalories > 0 ? 'increased' : 'reduced'
    setNotice(
      `AVAREN ${direction} your base target by ${Math.abs(adaptiveAnalysis.adjustmentCalories)} calories. Hold this target for at least 7 days before reassessing.`,
    )
  }

  const updateSetupField = (field, value) => {
    setNutritionSetup((current) => ({ ...current, [field]: value }))
    setSetupError('')
  }

  const saveCalculatedTargets = () => {
    try {
      const heightIn =
        Number(nutritionSetup.heightFeet || 0) * 12 +
        Number(nutritionSetup.heightInches || 0)
      const calculated = calculateNutritionTargets({
        goal: nutritionSetup.goal,
        age: nutritionSetup.age,
        sexForEnergyEstimation: nutritionSetup.sexForEnergyEstimation,
        heightIn,
        weightLb: nutritionSetup.weightLb,
        activityLevel: nutritionSetup.activityLevel,
        strengthSessionsPerWeek: nutritionSetup.strengthSessionsPerWeek,
        cardioSessionsPerWeek: nutritionSetup.cardioSessionsPerWeek,
      })

      patch((current) => ({
        ...current,
        goals: {
          ...current.goals,
          ...calculated,
          timezone:
            current.goals?.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone ??
            'UTC',
          coachAccess: Boolean(current.goals?.coachAccess),
          bottleOz: Number(current.goals?.bottleOz || 33.8),
          weightGoal: current.goals?.weightGoal ?? '',
        },
      }))
      setSetupError('')
      setEditingTargets(false)
      setNotice(
        `Starting targets set at ${calculated.calories.toLocaleString()} calories. You can adjust them anytime.`,
      )
      setTab('Today')
    } catch (error) {
      setSetupError(error?.message ?? 'Complete the fields above to calculate your targets.')
    }
  }

  const addFood = (food, source = 'manual') => {
    if (!food.name.trim()) return setNotice('Add a food name first.')
    patch((current) =>
      appendFoodToNutrition(current, date, food, source).nutrition,
    )
    setFoodDraft(blankFood)
    setFoodSearch('')
    setSelectedFood(null)
    setSelectedMultiplier(1)
    setNotice(`${food.name.trim()} added to today.`)
    setTab('Today')
  }

  const saveFood = () => {
    if (!foodDraft.name.trim()) return setNotice('Add a food name first.')
    const saved = { ...foodDraft, id: createRuntimeId(), servings: 1 }
    patch((current) => ({ ...current, savedFoods: [saved, ...(current.savedFoods ?? [])] }))
    setNotice(`${saved.name} saved.`)
  }

  const toggleFavorite = (food) => patch((current) => {
    const ids = current.favoriteFoodIds ?? []
    return {
      ...current,
      favoriteFoodIds: ids.includes(food.id)
        ? ids.filter((id) => id !== food.id)
        : [food.id, ...ids],
    }
  })

  const openFood = async (food) => {
    setSelectedFood(food)
    setSelectedMultiplier(1)

    if (food.provider !== 'fatsecret') {
      setFatSecretDetailState('idle')
      setFatSecretDetailError('')
      setSelectedFatSecretServingId('')
      setFatSecretQuantity('1')
      return
    }

    setFatSecretDetailState('loading')
    setFatSecretDetailError('')
    setSelectedFatSecretServingId('')
    setFatSecretQuantity('1')

    try {
      const cached = fatSecretDetailCache[food.foodId]
      const detail = cached ?? await getFatSecretFood(food.foodId)

      setFatSecretDetailCache((current) => ({
        ...current,
        [food.foodId]: detail,
      }))

      const firstServing = detail.servings?.[0]
      setSelectedFatSecretServingId(firstServing?.servingId ?? '')
      setFatSecretDetailState('success')
    } catch (error) {
      setFatSecretDetailState('error')
      setFatSecretDetailError(
        error?.message ?? 'Unable to load serving details right now.',
      )
    }
  }

  const addFatSecretFood = () => {
    if (selectedFood?.provider !== 'fatsecret') return
    if (!selectedFatSecretServingId) return

    const quantity = Number(fatSecretQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice('Enter a serving quantity greater than 0.')
      return
    }

    const detail = fatSecretDetailCache[selectedFood.foodId]
    const serving = detail?.servings?.find(
      (item) =>
        String(item.servingId) === String(selectedFatSecretServingId),
    )

    patch((current) =>
      appendFatSecretFoodReference(current, date, {
        foodId: selectedFood.foodId,
        servingId: selectedFatSecretServingId,
        quantity,
        servingSnapshot: serving
          ? {
              name: detail?.name ?? selectedFood.name,
              brand: detail?.brand ?? selectedFood.brand ?? '',
              serving: serving.description,
              calories: serving.calories,
              protein: serving.protein,
              carbs: serving.carbs,
              fat: serving.fat,
              fiber: serving.fiber,
            }
          : null,
      }).nutrition,
    )


    setNotice(`${detail?.name ?? selectedFood.name} added to today.`)
    setSelectedFood(null)
    setFoodSearch('')
    setFatSecretFoods([])
    setFatSecretDetailState('idle')
    setSelectedFatSecretServingId('')
    setFatSecretQuantity('1')
    setTab('Today')
  }

  const recipeFoodMatches = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase()
    if (!query) return []
    const saved = (nutrition.savedFoods ?? []).map((food) => ({ ...food, sourceLabel: 'Saved' }))
    return [...saved, ...COMMON_FOODS]
      .filter((food) => `${food.name} ${food.brand ?? ''} ${food.keywords ?? ''}`.toLowerCase().includes(query))
      .slice(0, 12)
  }, [recipeSearch, nutrition.savedFoods])

  const recipeDraftTotals = useMemo(
    () => (recipeDraft.ingredients ?? []).reduce(
      (totals, ingredient) => ({
        calories: totals.calories + Number(ingredient.calories || 0) * Number(ingredient.multiplier || 1),
        protein: totals.protein + Number(ingredient.protein || 0) * Number(ingredient.multiplier || 1),
        carbs: totals.carbs + Number(ingredient.carbs || 0) * Number(ingredient.multiplier || 1),
        fat: totals.fat + Number(ingredient.fat || 0) * Number(ingredient.multiplier || 1),
        fiber: totals.fiber + Number(ingredient.fiber || 0) * Number(ingredient.multiplier || 1),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    ),
    [recipeDraft.ingredients],
  )
  const hasRecipeIngredients = (recipeDraft.ingredients ?? []).length > 0
  const canSaveRecipe = Boolean(recipeDraft.name.trim()) && hasRecipeIngredients && Number(recipeDraft.servings || 0) > 0

  const addRecipeIngredient = (food) => {
    setRecipeDraft((current) => ({
      ...current,
      ingredients: [
        ...(current.ingredients ?? []),
        {
          id: createRuntimeId(),
          foodId: food.id ?? null,
          name: food.name,
          serving: food.serving ?? '1 serving',
          multiplier: 1,
          calories: Number(food.calories || 0),
          protein: Number(food.protein || 0),
          carbs: Number(food.carbs || 0),
          fat: Number(food.fat || 0),
          fiber: Number(food.fiber || 0),
        },
      ],
    }))
    setRecipeSearch('')
    setNotice(`${food.name} added to recipe.`)
  }

  const updateRecipeIngredient = (id, multiplier) => setRecipeDraft((current) => ({
    ...current,
    ingredients: current.ingredients.map((ingredient) =>
      ingredient.id === id ? { ...ingredient, multiplier: Math.max(0, Number(multiplier || 0)) } : ingredient,
    ),
  }))

  const saveRecipe = () => {
    const name = recipeDraft.name.trim()
    const servings = Math.max(1, Number(recipeDraft.servings || 1))
    if (!name) return setNotice('Name the recipe first.')
    if (!(recipeDraft.ingredients ?? []).length) return setNotice('Add at least one ingredient.')
    const recipe = {
      id: createRuntimeId(),
      name,
      servings,
      remainingServings: servings,
      ingredients: recipeDraft.ingredients,
      totals: Object.fromEntries(Object.entries(recipeDraftTotals).map(([key, value]) => [key, round(value)])),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    patch((current) => ({ ...current, recipes: [recipe, ...(current.recipes ?? [])] }))
    setRecipeDraft({ name: '', servings: 4, ingredients: [] })
    setNotice(`${name} saved as a ${servings}-serving batch.`)
  }

  const duplicateRecipe = (recipe) => patch((current) => ({
    ...current,
    recipes: [
      {
        ...recipe,
        id: createRuntimeId(),
        name: `${recipe.name} Copy`,
        remainingServings: recipe.servings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...(current.recipes ?? []),
    ],
  }))

  const resetRecipeBatch = (recipe) => patch((current) => ({
    ...current,
    recipes: (current.recipes ?? []).map((item) =>
      item.id === recipe.id ? { ...item, remainingServings: Number(item.servings || 1), updatedAt: new Date().toISOString() } : item,
    ),
  }))

  const deleteRecipe = async (recipe) => {
    if (!(await appUi.confirm({
      message: `Delete ${recipe.name}?`,
      tone: 'danger',
      confirmLabel: 'Delete',
    }))) return
    patch((current) => ({ ...current, recipes: (current.recipes ?? []).filter((item) => item.id !== recipe.id) }))
  }

  const logRecipe = (recipe, amount) => {
    patch((current) =>
      logRecipeToNutrition(current, date, recipe, amount).nutrition,
    )
    setRecipeLogTarget(null)
    setRecipeLogAmount(1)
  }

  const addWater = (ounces) =>
    patch((current) => addWaterToNutrition(current, date, ounces).nutrition)

  const changeDate = (offset) => {
    const next = new Date(`${date}T12:00:00`)
    next.setDate(next.getDate() + offset)
    setDate(nutritionDateKey(next))
  }

  return (
    <div className="nutrition-screen">
      <header className="nutrition-screen-header">
        <div><span className="eyebrow">NUTRITION</span><h1>Today’s Nutrition</h1><p>Everything important today, with deeper tools one tap away.</p></div>
        <button onClick={() => setTab('Goals')}><Settings2 size={18}/>Targets</button>
      </header>

      <nav className="nutrition-tabs">
        {visibleTabs.map((item) => <button key={item.value} className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label}</button>)}
      </nav>

      {notice && <div className="nutrition-notice">{notice}</div>}

      {tab === 'Today' && <>
        {!nutritionConfigured ? (
          <section className="nutrition-setup-card">
            <div className="nutrition-setup-intro">
              <span className="eyebrow">YOUR STARTING POINT</span>
              <h2>Set up your nutrition.</h2>
              <p>
                Tell AVAREN what you are working toward. We will calculate a
                starting calorie and macro target from your body and activity,
                then you can adjust it whenever you need.
              </p>
            </div>

            <div className="nutrition-setup-form">
              <label className="wide">
                <span>Goal</span>
                <select
                  value={nutritionSetup.goal}
                  onChange={(event) => updateSetupField('goal', event.target.value)}
                >
                  <option value="">Choose your goal</option>
                  {NUTRITION_GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Age</span>
                <input
                  type="number"
                  min="14"
                  max="100"
                  value={nutritionSetup.age}
                  onChange={(event) => updateSetupField('age', event.target.value)}
                  placeholder="Age"
                />
              </label>

              <label>
                <span>Sex for energy estimate</span>
                <select
                  value={nutritionSetup.sexForEnergyEstimation}
                  onChange={(event) =>
                    updateSetupField('sexForEnergyEstimation', event.target.value)
                  }
                >
                  <option value="">Choose</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>

              <label>
                <span>Height</span>
                <div className="nutrition-height-row">
                  <input
                    type="number"
                    min="4"
                    max="7"
                    value={nutritionSetup.heightFeet}
                    onChange={(event) => updateSetupField('heightFeet', event.target.value)}
                    placeholder="ft"
                  />
                  <input
                    type="number"
                    min="0"
                    max="11"
                    value={nutritionSetup.heightInches}
                    onChange={(event) => updateSetupField('heightInches', event.target.value)}
                    placeholder="in"
                  />
                </div>
              </label>

              <label>
                <span>Current weight</span>
                <input
                  type="number"
                  min="70"
                  max="700"
                  step="0.1"
                  value={nutritionSetup.weightLb}
                  onChange={(event) => updateSetupField('weightLb', event.target.value)}
                  placeholder="lb"
                />
              </label>

              <label className="wide">
                <span>Overall activity</span>
                <select
                  value={nutritionSetup.activityLevel}
                  onChange={(event) =>
                    updateSetupField('activityLevel', event.target.value)
                  }
                >
                  <option value="">Choose activity level</option>
                  {ACTIVITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>Choose your normal movement outside intentional workouts. Log Active Calories from your wearable or fitness tracker separately after training.</small>

              <label>
                <span>Strength sessions / week</span>
                <input
                  type="number"
                  min="0"
                  max="14"
                  value={nutritionSetup.strengthSessionsPerWeek}
                  onChange={(event) =>
                    updateSetupField('strengthSessionsPerWeek', event.target.value)
                  }
                  placeholder="0"
                />
                <small>Used to shape protein/fat/carbohydrate priorities, not base calories.</small>
              </label>

              <label>
                <span>Cardio / conditioning sessions / week</span>
                <input
                  type="number"
                  min="0"
                  max="14"
                  value={nutritionSetup.cardioSessionsPerWeek}
                  onChange={(event) =>
                    updateSetupField('cardioSessionsPerWeek', event.target.value)
                  }
                  placeholder="0"
                />
                <small>Higher training demand shifts more of the base target toward carbohydrate fuel.</small>
              </label>
              </label>

            </div>

            {setupError ? <p className="nutrition-setup-error">{setupError}</p> : null}

            <div className="nutrition-setup-actions">
              <button className="gold-button machined" onClick={saveCalculatedTargets}>
                <Sparkles size={18} /> Build My Targets
              </button>
              <button className="nutrition-secondary-button" onClick={() => setTab('Meals')}>
                Log food without targets
              </button>
            </div>

            <p className="nutrition-estimate-note">
              AVAREN builds the base target from body size, age, sex, goal, and normal daily movement.
              Protein is anchored to bodyweight and goal, fat stays above a physiological floor, and
              carbohydrate rises with training demand. Active Calories from your wearable or fitness tracker are still added
              separately after training so exercise is not counted twice.
            </p>
          </section>
        ) : (
          <>
        <div className="nutrition-date-switcher"><button onClick={() => changeDate(-1)}><ChevronLeft/></button><strong>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</strong><button disabled={date === nutritionDateKey()} onClick={() => changeDate(1)}><ChevronRight/></button></div>

        <section className="nutrition-calorie-hero">
          <div><span className="eyebrow">CALORIES REMAINING</span><strong>{Math.round(remaining.calories)}</strong><small>{Math.round(totals.calories)} eaten · {Math.round(Number(goals.calories) + workoutActivityTotal)} budget{workoutActivityTotal > 0 ? ` · +${Math.round(workoutActivityTotal)} activity` : ''}</small></div>
          <ProgressBar value={totals.calories} goal={Number(goals.calories) + workoutActivityTotal} />
        </section>

        <section className="nutrition-target-summary">
          <div>
            <span className="eyebrow">YOUR TARGETS</span>
            <strong>{Math.round(Number(goals.calories || 0)).toLocaleString()} base calories</strong>
            <small>
              {Math.round(Number(goals.protein || 0))}g protein · {Math.round(Number(goals.carbs || 0))}g carbs · {Math.round(Number(goals.fat || 0))}g fat
            </small>
            {goals.macroStrategy ? <small className="nutrition-target-rationale">
              {goals.macroStrategy.goalLabel} strategy · {Number(goals.macroStrategy.proteinGPerKg || 0).toFixed(1)} g/kg protein · training demand shapes carb/fat split
            </small> : null}
          </div>
          <button
            type="button"
            className="nutrition-secondary-button"
            onClick={() => {
              setEditingTargets(true)
              setSetupError('')
              setTab('Today')
            }}
          >
            <Sparkles size={16} />
            Recalculate Targets
          </button>
        </section>

        <section className="nutrition-macro-grid">
          {[['Protein', totals.protein, goals.protein, 'g'], ['Carbs', totals.carbs, goals.carbs, 'g'], ['Fat', totals.fat, goals.fat, 'g'], ['Fiber', totals.fiber, goals.fiber, 'g']].map(([label,value,goal,unit]) => <article key={label}><span>{label}</span><strong>{round(value)}<small> / {goal}{unit}</small></strong><ProgressBar value={value} goal={goal}/></article>)}
        </section>

        <section className="nutrition-quick-log-launcher">
          <div>
            <span className="eyebrow">QUICK LOG</span>
            <strong>Add food in seconds</strong>
          </div>
          <div className="nutrition-quick-log-actions">
            <button onClick={() => setTab('Meals')}><Search size={17}/><span>Search</span></button>
            <button onClick={() => cameraInputRef.current?.click()}><Camera size={17}/><span>Camera</span></button>
            <button onClick={() => uploadInputRef.current?.click()}><Upload size={17}/><span>Upload</span></button>
            <button onClick={() => barcodeInputRef.current?.click()}><ScanLine size={17}/><span>Barcode</span></button>
          </div>
        </section>

        <section
          className="nutrition-quick-grid nutrition-quick-grid--support"
          aria-label="Daily nutrition shortcuts"
        >
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8))}><Droplets/><strong>1 Bottle</strong><span>{goals.bottleOz} oz</span></button>
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8) / 2)}><Droplets/><strong>½ Bottle</strong><span>{round(Number(goals.bottleOz || 33.8) / 2)} oz</span></button>
          <button onClick={() => setTab('Goals')}><Scale/><strong>Log Weight</strong><span>{day.weight || 'Add today’s weight'}</span></button>
        </section>

        <section className="nutrition-hydration-card"><div><Droplets/><span><strong>Hydration</strong><small>{round(day.waterOz)} of {goals.waterOz} oz</small></span></div><ProgressBar value={day.waterOz} goal={goals.waterOz}/></section>

        <section className="nutrition-workout-activity-card">
          <header>
            <div>
              <Watch size={19}/>
              <span>
                <strong>Workout Activity</strong>
                <small>{workoutActivityTotal > 0 ? `+${Math.round(workoutActivityTotal)} active calories today` : 'Add Active Calories from a wearable or tracker'}</small>
              </span>
            </div>
            <button className="nutrition-secondary-button" onClick={() => setShowWorkoutActivityForm((value) => !value)}>
              <Plus size={16}/>{showWorkoutActivityForm ? 'Close' : 'Add Active Calories'}
            </button>
          </header>

          {showWorkoutActivityForm && <div className="nutrition-workout-activity-form">
            <label>
              <span>Workout</span>
              <select
                value={workoutActivityDraft.label}
                onChange={(event) => setWorkoutActivityDraft((current) => ({ ...current, label: event.target.value }))}
              >
                {['Strength Training', 'Cardio', 'Running', 'Walking', 'Cycling', 'HIIT', 'Sports', 'Other'].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Active Calories</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={workoutActivityDraft.activeCalories}
                onChange={(event) => setWorkoutActivityDraft((current) => ({ ...current, activeCalories: event.target.value }))}
                placeholder="347"
              />
            </label>
            <button className="gold-button machined" onClick={addWorkoutActivity}>
              <Plus size={17}/>Add Activity
            </button>
          </div>}

          <div className="nutrition-workout-activity-list">
            {(day.workoutActivities ?? []).length ? (day.workoutActivities ?? []).map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>{entry.label || 'Workout Activity'}</strong>
                  <span>+{Math.round(Number(entry.activeCalories || 0))} active calories</span>
                </div>
                <button aria-label={`Remove ${entry.label || 'workout activity'}`} onClick={() => removeWorkoutActivity(entry.id)}>
                  <Trash2 size={16}/>
                </button>
              </article>
            )) : <p>No workout activity added yet.</p>}
          </div>
        </section>

        <section className="nutrition-food-log">
          <header><div><span className="eyebrow">FOOD LOG</span><h2>{resolvedDayFoods.length ? `${resolvedDayFoods.length} items` : 'Nothing logged yet'}</h2></div><button onClick={() => setTab('Meals')}><Plus/>Add</button></header>
          {resolvedDayFoods.length ? resolvedDayFoods.map((food) => <article key={food.id}><div><strong>{food.name}</strong><span>{food.source === 'fatsecret' && (food.name === 'Loading food…' || food.name === 'Food unavailable') ? (food.name === 'Loading food…' ? 'Refreshing nutrition…' : 'Nutrition unavailable') : `${food.calories} cal · P ${food.protein} · C ${food.carbs} · F ${food.fat}`}</span></div><button onClick={() => patchDay((current) => ({ ...current, foods: current.foods.filter((item) => item.id !== food.id) }))}><Trash2 size={16}/></button></article>) : <div className="nutrition-empty"><Utensils/><p>Log your first meal to start today’s dashboard.</p></div>}
        </section>
          </>
        )}
      </>}

      {tab === 'Meals' && <section className="nutrition-panel nutrition-quick-log-panel">
        <header><div><span className="eyebrow">MEALS</span><h2>What did you have?</h2><p>Search a common food, choose something saved, or create a custom item only when needed.</p></div></header>

        <div className="nutrition-search-shell">
          <Search size={20}/>
          <input
            autoFocus
            value={foodSearch}
            onChange={(event) => setFoodSearch(event.target.value)}
            placeholder="Try “Clif Bar”, “chicken breast”, or “Greek yogurt”…"
          />
          {foodSearch && <button aria-label="Clear search" onClick={() => { setFoodSearch(''); setFatSecretFoods([]); setFatSecretSearchError('') }}><X size={17}/></button>}
        </div>

        <input
          ref={cameraInputRef}
          className="nutrition-scan-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) runFoodScan(file, null, 'food')
          }}
        />
        <input
          ref={uploadInputRef}
          className="nutrition-scan-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) runFoodScan(file, null, 'food')
          }}
        />
        <input
          ref={barcodeInputRef}
          className="nutrition-scan-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) runFoodScan(file, '', 'barcode')
          }}
        />

        {!activeFoodSearch && <div className="nutrition-scan-food">
          <div className="nutrition-scan-food-copy">
            <span className="eyebrow">SCAN FOOD</span>
            <strong>Use the fastest source you have</strong>
            <small>Take a photo, upload one you already have, or scan a barcode.</small>
          </div>
          <div className="nutrition-scan-choice-grid">
            <button onClick={() => cameraInputRef.current?.click()}>
              <Camera size={19}/>
              <span><strong>Camera</strong><small>Meal, package, or label</small></span>
            </button>
            <button onClick={() => uploadInputRef.current?.click()}>
              <ImagePlus size={19}/>
              <span><strong>Upload</strong><small>Choose an existing photo</small></span>
            </button>
            <button onClick={() => barcodeInputRef.current?.click()}>
              <ScanLine size={19}/>
              <span><strong>Barcode</strong><small>UPC or EAN product lookup</small></span>
            </button>
          </div>
          <label>
            <span>Optional meal details</span>
            <input
              value={scanContext}
              onChange={(event) => setScanContext(event.target.value)}
              placeholder="e.g. 8 oz 90/10 beef, 2 tortillas"
              maxLength={600}
            />
          </label>
        </div>}

        {!activeFoodSearch && <div className="nutrition-search-tools">
          <span><Sparkles size={15}/>Nutrition is filled in for you</span>
          <button onClick={() => setShowCustomFood((value) => !value)}>{showCustomFood ? 'Hide custom food' : '+ Create Custom Food'}</button>
        </div>}

        {!showCustomFood && <>
          {!activeFoodSearch && <div className="nutrition-category-strip">
            {['All', 'Favorites', ...FOOD_CATEGORIES].map((category) => (
              <button key={category} className={foodCategory === category ? 'active' : ''} onClick={() => setFoodCategory(category)}>{category}</button>
            ))}
          </div>}
          {foodSearch.trim().length >= 2 && (
            <div className="nutrition-live-search-status" data-state={fatSecretSearchState}>
              {fatSecretSearchState === 'loading' && <span>Searching verified foods…</span>}
              {fatSecretSearchState === 'success' && fatSecretFoods.length > 0 && <span>Live food database · {fatSecretFoods.length} matches shown</span>}
              {fatSecretSearchState === 'error' && <span>{fatSecretSearchError}</span>}
            </div>
          )}
          <div className="nutrition-food-results">
            {visibleFoodMatches.length ? visibleFoodMatches.map((food) => (
              <article key={`${food.sourceLabel}-${food.id ?? food.name}`}>
                <button className="nutrition-food-result-main" onClick={() => openFood(food)}>
                  <span className="nutrition-food-result-copy">
                    <strong>{food.name}</strong>
                    <small>{food.serving ?? '1 serving'} · {food.brand || food.category || food.sourceLabel}</small>
                  </span>
                  <span className="nutrition-food-result-macros">
                    <strong>{Math.round(Number(food.calories || 0))} cal</strong>
                    <small>P {round(food.protein)} · C {round(food.carbs)} · F {round(food.fat)}</small>
                  </span>
                  <ChevronRight size={18}/>
                </button>
                <button className={`nutrition-save-result ${favoriteIds.includes(food.id) ? 'active' : ''}`} title="Favorite food" onClick={() => toggleFavorite(food)}>{favoriteIds.includes(food.id) ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button>
              </article>
            )) : <div className="nutrition-no-results"><Utensils/><strong>No match yet</strong><span>Create a custom food for this item. Later, barcode and AI search will make this even faster.</span><button onClick={() => { setFoodDraft({...blankFood,name:foodSearch}); setShowCustomFood(true) }}>Create “{foodSearch}”</button></div>}
          </div>
        </>}

        {(scanPreview || scanResult) && typeof document !== 'undefined' && createPortal(
          <div className="nutrition-food-sheet-backdrop" data-app-ui-backdrop="open" onClick={resetFoodScan}>
            <section className="nutrition-food-sheet nutrition-scan-sheet" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <span className="eyebrow">SCAN FOOD</span>
                  <h2>{scanState === 'loading' ? 'AVA is reading your food…' : scanResult?.title || 'Food photo'}</h2>
                  <p>{scanState === 'loading' ? 'Checking the image, any details you gave, and the best nutrition source.' : scanResult?.servingDescription || 'Review before adding.'}</p>
                </div>
                <button onClick={resetFoodScan}><X size={18}/></button>
              </header>

              {scanPreview ? <img className="nutrition-scan-preview" src={scanPreview} alt="Food scan preview"/> : null}

              {scanState === 'loading' ? <div className="nutrition-scan-loading"><Sparkles size={20}/><span>Analyzing image…</span></div> : null}
              {scanState === 'error' ? <div className="nutrition-fatsecret-detail-state error"><strong>Couldn’t analyze this photo.</strong><span>{scanError}</span><button onClick={() => runFoodScan(null)}>Try Again</button></div> : null}

              {scanState === 'success' && scanResult && scanDraft ? <>
                <div className="nutrition-scan-confidence" data-confidence={scanResult.confidence}>
                  <span>{scanResult.sourceType === 'label_read' ? 'Nutrition label' : scanResult.kind === 'packaged_product' ? 'Recognized product' : 'AVA estimate'}</span>
                  <strong>{scanResult.confidence} confidence</strong>
                </div>

                {scanMatches.length > 0 ? <section className="nutrition-scan-matches">
                  <span className="eyebrow">VERIFIED MATCHES</span>
                  <p>AVA recognized a packaged food. Choose the exact database match when one looks right.</p>
                  {scanMatches.map((food) => <button key={food.foodId} onClick={() => chooseScanDatabaseMatch(food)}>
                    <span><strong>{food.name}</strong><small>{food.brand} · {food.serving}</small></span>
                    <ChevronRight size={17}/>
                  </button>)}
                </section> : null}

                <section className="nutrition-scan-portions">
                  <div>
                    <span className="eyebrow">PORTIONS</span>
                    <strong>How much did you have?</strong>
                    <small>
                      {scanResult.sourceType === 'label_read'
                        ? 'Label values are per serving. AVAREN will scale the totals before logging.'
                        : 'Choose the amount you actually ate. AVAREN will scale the estimate once.'}
                    </small>
                  </div>
                  <div className="nutrition-scan-portion-options" role="group" aria-label="Portion amount">
                    {[0.5, 1, 1.5, 2].map((quantity) => (
                      <button
                        type="button"
                        key={quantity}
                        className={scanQuantityValue === quantity ? 'active' : ''}
                        onClick={() => setScanQuantity(quantity)}
                      >
                        {quantity}×
                      </button>
                    ))}
                    <label>
                      <span>Custom</span>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={scanQuantity}
                        onChange={(event) => setScanQuantity(event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                </section>

                <div className="nutrition-sheet-macros">
                  <article><span>Calories</span><strong>{Math.round(Number(scaledScanDraft?.calories || 0))}</strong></article>
                  <article><span>Protein</span><strong>{round(scaledScanDraft?.protein)}g</strong></article>
                  <article><span>Carbs</span><strong>{round(scaledScanDraft?.carbs)}g</strong></article>
                  <article><span>Fat</span><strong>{round(scaledScanDraft?.fat)}g</strong></article>
                </div>

                <div className="nutrition-scan-edit-grid">
                  <p className="nutrition-scan-edit-hint">Nutrition below is per 1 portion. Edit the label values here if needed.</p>
                  <label><span>Name</span><input value={scanDraft.name} onChange={(event) => setScanDraft((current) => ({...current, name:event.target.value}))}/></label>
                  {['calories','protein','carbs','fat','fiber'].map((field) => <label key={field}><span>{field}</span><input type="number" min="0" step="0.1" value={scanDraft[field]} onChange={(event) => setScanDraft((current) => ({...current, [field]:event.target.value}))}/></label>)}
                </div>

                {scanResult.components?.length ? <details className="nutrition-scan-components">
                  <summary>How AVA built this estimate</summary>
                  <div>{scanResult.components.map((item, index) => <article key={`${item.name}-${index}`}>
                    <div><strong>{item.name}</strong><span>{item.amount} · {item.basis.replaceAll('_',' ')}</span></div>
                    <small>{Math.round(Number(item.calories || 0))} cal · P {round(item.protein)} · C {round(item.carbs)} · F {round(item.fat)}</small>
                  </article>)}</div>
                </details> : null}

                {scanResult.followUpQuestion ? <div className="nutrition-scan-followup">
                  <strong>{scanResult.followUpQuestion}</strong>
                  <div>
                    <input value={scanContext} onChange={(event) => setScanContext(event.target.value)} placeholder="Add one detail"/>
                    <button onClick={() => runFoodScan(null, scanContext, 'food')}>Refine</button>
                  </div>
                  <button className="nutrition-scan-skip" onClick={() => setScanResult((current) => ({...current, followUpQuestion:''}))}>Use estimate as-is</button>
                </div> : null}

                {scanResult.notes ? <p className="nutrition-scan-note">{scanResult.notes}</p> : null}

                <div className="nutrition-sheet-actions">
                  <button className="gold-button machined" onClick={logScannedFood}><Plus/>Add to Today</button>
                </div>
              </> : null}
            </section>
          </div>,
          document.body,
        )}

        {selectedFood && typeof document !== 'undefined' && createPortal(
          <div className="nutrition-food-sheet-backdrop" data-app-ui-backdrop="open" onClick={() => setSelectedFood(null)}>
          <section className="nutrition-food-sheet" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">FOOD DETAIL</span><h2>{selectedFood.name}</h2><p>{selectedFood.brand} · choose the serving you actually had</p></div>
              <button onClick={() => setSelectedFood(null)}><X size={18}/></button>
            </header>

            {selectedFood.provider === 'fatsecret' ? (() => {
              const detail = fatSecretDetailCache[selectedFood.foodId]
              const serving = detail?.servings?.find((item) => String(item.servingId) === String(selectedFatSecretServingId))
              const parsedQuantity = Number(fatSecretQuantity)
              const quantity =
                Number.isFinite(parsedQuantity) && parsedQuantity > 0
                  ? parsedQuantity
                  : 0

              if (fatSecretDetailState === 'loading') {
                return <div className="nutrition-fatsecret-detail-state"><span>Loading serving options…</span></div>
              }

              if (fatSecretDetailState === 'error') {
                return <div className="nutrition-fatsecret-detail-state error"><strong>Couldn’t load this food.</strong><span>{fatSecretDetailError}</span><button onClick={() => openFood(selectedFood)}>Try Again</button></div>
              }

              return <>
                {serving && <div className="nutrition-sheet-macros">
                  <article><span>Calories</span><strong>{Math.round(Number(serving.calories || 0) * quantity)}</strong></article>
                  <article><span>Protein</span><strong>{round(Number(serving.protein || 0) * quantity)}g</strong></article>
                  <article><span>Carbs</span><strong>{round(Number(serving.carbs || 0) * quantity)}g</strong></article>
                  <article><span>Fat</span><strong>{round(Number(serving.fat || 0) * quantity)}g</strong></article>
                </div>}

                <div className="nutrition-serving-picker">
                  <span>Serving</span>
                  <div>{(detail?.servings ?? []).map((option) => <button key={option.servingId} className={String(selectedFatSecretServingId) === String(option.servingId) ? 'active' : ''} onClick={() => setSelectedFatSecretServingId(option.servingId)}>{option.description}</button>)}</div>
                </div>

                <label className="nutrition-fatsecret-quantity">
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.25"
                    value={fatSecretQuantity}
                    onChange={(event) => setFatSecretQuantity(event.target.value)}
                    onBlur={() => {
                      const value = Number(fatSecretQuantity)
                      if (!Number.isFinite(value) || value <= 0) {
                        setFatSecretQuantity('1')
                      }
                    }}
                    inputMode="decimal"
                  />
                </label>

                <div className="nutrition-sheet-actions">
                  <button className="nutrition-secondary-button" onClick={() => toggleFavorite(selectedFood)}>{favoriteIds.includes(selectedFood.id) ? <BookmarkCheck/> : <BookmarkPlus/>}{favoriteIds.includes(selectedFood.id) ? 'Favorited' : 'Favorite'}</button>
                  <button
                    className="gold-button machined"
                    disabled={
                      !selectedFatSecretServingId ||
                      !Number.isFinite(Number(fatSecretQuantity)) ||
                      Number(fatSecretQuantity) <= 0
                    }
                    onClick={addFatSecretFood}
                  >
                    <Plus/>Add to Today
                  </button>
                </div>
                <p className="nutrition-fatsecret-detail-note">AVAREN keeps the verified nutrition with the FatSecret food/serving IDs so your totals update immediately and can refresh later.</p>
              </>
            })() : <>
              <div className="nutrition-sheet-macros">
                <article><span>Calories</span><strong>{Math.round(Number(selectedFood.calories || 0) * selectedMultiplier)}</strong></article>
                <article><span>Protein</span><strong>{round(Number(selectedFood.protein || 0) * selectedMultiplier)}g</strong></article>
                <article><span>Carbs</span><strong>{round(Number(selectedFood.carbs || 0) * selectedMultiplier)}g</strong></article>
                <article><span>Fat</span><strong>{round(Number(selectedFood.fat || 0) * selectedMultiplier)}g</strong></article>
              </div>
              <div className="nutrition-serving-picker">
                <span>Serving</span>
                <div>{(selectedFood.servingOptions ?? [{label:selectedFood.serving ?? '1 serving',multiplier:1}]).map((option) => <button key={`${option.label}-${option.multiplier}`} className={selectedMultiplier === option.multiplier ? 'active' : ''} onClick={() => setSelectedMultiplier(option.multiplier)}>{option.label}</button>)}</div>
              </div>
              <div className="nutrition-sheet-actions">
                <button className="nutrition-secondary-button" onClick={() => toggleFavorite(selectedFood)}>{favoriteIds.includes(selectedFood.id) ? <BookmarkCheck/> : <BookmarkPlus/>}{favoriteIds.includes(selectedFood.id) ? 'Favorited' : 'Favorite'}</button>
                <button className="gold-button machined" onClick={() => addFood({ ...selectedFood, servings: selectedMultiplier }, selectedFood.sourceLabel === 'Saved' ? 'saved' : 'catalog')}><Plus/>Add to Today</button>
              </div>
            </>}
          </section>
        </div>,
          document.body,
        )}

        {showCustomFood && <div className="nutrition-custom-food-card">
          <header><div><span className="eyebrow">CUSTOM FOOD</span><h3>Enter it once, then save it.</h3></div><button onClick={() => setShowCustomFood(false)}><X size={17}/></button></header>
          <div className="nutrition-food-form">
            <label className="wide"><span>Food name</span><input value={foodDraft.name} onChange={(e) => setFoodDraft({ ...foodDraft, name: e.target.value })} placeholder="Homemade meal or unique food"/></label>
            {['calories','protein','carbs','fat','fiber','servings'].map((field) => <label key={field}><span>{field[0].toUpperCase()+field.slice(1)}</span><input type="number" min="0" step="0.1" value={foodDraft[field]} onChange={(e) => setFoodDraft({ ...foodDraft, [field]: e.target.value })}/></label>)}
          </div>
          <div className="nutrition-form-actions nutrition-custom-actions">
            <button className="nutrition-secondary-button" onClick={saveFood}><BookmarkPlus/>Save for Later</button>
            <button className="gold-button machined" onClick={() => addFood(foodDraft)}><Plus/>Add to Today</button>
          </div>
        </div>}

        <p className="nutrition-estimate-note">Common-food values are practical estimates. Brand labels and exact packaging can differ, so use Custom Food when precision matters.</p>
      </section>}

      {tab === 'Library' && <section className="nutrition-panel nutrition-recipes-panel">
        <header><div><span className="eyebrow">LIBRARY</span><h2>Your reusable nutrition.</h2><p>Add ingredients from the food catalog, choose the batch yield, and AVAREN calculates every serving.</p></div></header>

        <section className="nutrition-recipe-builder">
          <header><div><ChefHat size={20}/><span><strong>Create recipe</strong><small>Macros calculate automatically from ingredients.</small></span></div></header>
          <div className="nutrition-recipe-basics">
            <label><span>Recipe name</span><input value={recipeDraft.name} onChange={(event) => setRecipeDraft({ ...recipeDraft, name: event.target.value })} placeholder="Chicken and rice bowls"/></label>
            <label><span>Batch servings</span><input type="number" min="1" step="1" value={recipeDraft.servings} onChange={(event) => setRecipeDraft({ ...recipeDraft, servings: event.target.value })}/></label>
          </div>

          <div className="nutrition-recipe-search">
            <Search size={18}/>
            <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search ingredients..."/>
          </div>
          {recipeFoodMatches.length > 0 && <div className="nutrition-recipe-search-results">
            {recipeFoodMatches.map((food) => <button key={`recipe-${food.id ?? food.name}`} onClick={() => addRecipeIngredient(food)}><span><strong>{food.name}</strong><small>{food.serving ?? '1 serving'} · {food.calories} cal</small></span><Plus size={16}/></button>)}
          </div>}

          <div className="nutrition-recipe-ingredients">
            {(recipeDraft.ingredients ?? []).length ? recipeDraft.ingredients.map((ingredient) => <article key={ingredient.id}>
              <div><strong>{ingredient.name}</strong><span>{ingredient.serving} · {Math.round(Number(ingredient.calories || 0) * Number(ingredient.multiplier || 1))} cal</span></div>
              <label><span>Qty</span><input type="number" min="0" step="0.25" value={ingredient.multiplier} onChange={(event) => updateRecipeIngredient(ingredient.id, event.target.value)}/></label>
              <button onClick={() => setRecipeDraft((current) => ({ ...current, ingredients: current.ingredients.filter((item) => item.id !== ingredient.id) }))}><Trash2 size={16}/></button>
            </article>) : <div className="nutrition-empty compact"><Utensils/><p>Search above to add the first ingredient.</p></div>}
          </div>

          {hasRecipeIngredients ? <section className="nutrition-recipe-summary">
            <div><span>Total batch</span><strong>{Math.round(recipeDraftTotals.calories)} calories</strong><small>{round(recipeDraftTotals.protein)}g Protein · {round(recipeDraftTotals.carbs)}g Carbs · {round(recipeDraftTotals.fat)}g Fat</small></div>
            <div><span>Per serving</span><strong>{Math.round(recipeDraftTotals.calories / Math.max(1, Number(recipeDraft.servings || 1)))} calories</strong><small>{round(recipeDraftTotals.protein / Math.max(1, Number(recipeDraft.servings || 1)))}g Protein · {round(recipeDraftTotals.carbs / Math.max(1, Number(recipeDraft.servings || 1)))}g Carbs · {round(recipeDraftTotals.fat / Math.max(1, Number(recipeDraft.servings || 1)))}g Fat</small></div>
          </section> : <section className="nutrition-recipe-guidance">
            <Utensils size={22}/>
            <div><strong>Build your recipe</strong><p>Search above and add at least one ingredient. AVAREN will calculate the total batch and each serving automatically.</p></div>
          </section>}
          <button className="gold-button machined nutrition-save-recipe" onClick={saveRecipe} disabled={!canSaveRecipe}><Save/>Save Recipe & Batch</button>
          {!canSaveRecipe && <p className="nutrition-recipe-requirements">Add a recipe name and at least one ingredient to save.</p>}
        </section>

        <section className="nutrition-saved-recipes">
          <header><div><span className="eyebrow">YOUR RECIPES</span><h2>{(nutrition.recipes ?? []).length ? `${nutrition.recipes.length} saved` : 'No recipes yet'}</h2></div></header>
          <div className="nutrition-recipe-list">
            {(nutrition.recipes ?? []).map((recipe) => {
              const servings = Math.max(1, Number(recipe.servings || 1))
              const totals = recipe.totals ?? { calories: recipe.calories, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat, fiber: recipe.fiber }
              const remainingServings = Number(recipe.remainingServings ?? recipe.servings ?? 0)
              return <article key={recipe.id} className="nutrition-recipe-card">
                <header><div><strong>{recipe.name}</strong><span>{servings} serving batch · {Math.round(Number(totals.calories || 0) / servings)} cal per serving</span></div><PackageCheck size={19}/></header>
                <div className="nutrition-recipe-inventory"><span>Remaining</span><strong>{round(remainingServings)} <small>of {servings}</small></strong><ProgressBar value={remainingServings} goal={servings}/></div>
                <div className="nutrition-recipe-card-actions">
                  <button onClick={() => { setRecipeLogTarget(recipe); setRecipeLogAmount(1) }}><Plus size={15}/>Log Portion</button>
                  <button onClick={() => duplicateRecipe(recipe)}><Copy size={15}/>Duplicate</button>
                  <button onClick={() => resetRecipeBatch(recipe)}><RotateCcw size={15}/>New Batch</button>
                  <button className="danger" onClick={() => deleteRecipe(recipe)}><Trash2 size={15}/>Delete</button>
                </div>
              </article>
            })}
          </div>
        </section>

        {recipeLogTarget && <div className="nutrition-food-sheet-backdrop" data-app-ui-backdrop="open" onClick={() => setRecipeLogTarget(null)}>
          <section className="nutrition-food-sheet nutrition-recipe-log-sheet" onClick={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">LOG RECIPE</span><h2>{recipeLogTarget.name}</h2><p>Choose a serving or fraction of the prepared batch.</p></div><button onClick={() => setRecipeLogTarget(null)}><X size={18}/></button></header>
            <div className="nutrition-serving-picker"><span>Amount</span><div>{[
              ['¼ serving', .25], ['⅓ serving', 1/3], ['½ serving', .5], ['1 serving', 1], ['1½ servings', 1.5], ['2 servings', 2],
            ].map(([label, value]) => <button key={label} className={Math.abs(recipeLogAmount - value) < .001 ? 'active' : ''} onClick={() => setRecipeLogAmount(value)}>{label}</button>)}</div></div>
            <label className="nutrition-custom-portion"><span>Custom servings</span><input type="number" min="0.01" step="0.05" value={round(recipeLogAmount)} onChange={(event) => setRecipeLogAmount(Number(event.target.value || 0))}/></label>
            <button className="gold-button machined" onClick={() => logRecipe(recipeLogTarget, recipeLogAmount)}><Plus/>Add to Today</button>
          </section>
        </div>}
      </section>}

      {tab === 'Insights' && <section className="nutrition-panel nutrition-insights-panel">
        <header><div><span className="eyebrow">LAST 7 DAYS</span><h2>Your nutrition rhythm</h2><p>One calm view of consistency, not a wall of data.</p></div></header>
        <section className="nutrition-insight-hero">
          <div><span>Protein goal</span><strong>{weeklyInsights.proteinDays} of 7 days</strong><small>{Math.round(weeklyInsights.averageProtein)}g daily average</small></div>
          <ProgressBar value={weeklyInsights.proteinDays} goal={7}/>
        </section>
        <div className="nutrition-insight-grid">
          <article><span>Calories</span><strong>{Math.round(weeklyInsights.averageCalories)}</strong><small>daily average</small></article>
          <article><span>Hydration</span><strong>{weeklyInsights.hydrationDays}/7</strong><small>days near goal</small></article>
          <article><span>Logging</span><strong>{weeklyInsights.loggedDays}/7</strong><small>days recorded</small></article>
          <article><span>Weight</span><strong>{weeklyInsights.weightChange ? `${weeklyInsights.weightChange > 0 ? '+' : ''}${round(weeklyInsights.weightChange)} lb` : '—'}</strong><small>7-day change</small></article>
        </div>
        <section className="nutrition-week-strip">
          {weeklyInsights.days.map((item) => <article key={item.key}><span>{item.label}</span><i style={{height:`${Math.max(8,Math.min(100, goals.calories ? (item.calories / goals.calories) * 100 : 0))}%`}}/><small>{item.calories ? Math.round(item.calories) : '—'}</small></article>)}
        </section>
        <section className="nutrition-adaptive-card" data-state={adaptiveAnalysis.status}>
          <header>
            <div>
              <span className="eyebrow">ADAPTIVE NUTRITION</span>
              <h3>{adaptiveAnalysis.status === 'recommend' ? 'AVAREN recommends a target adjustment.' : adaptiveAnalysis.status === 'on_track' ? 'Your current target is tracking well.' : 'AVAREN is still learning your response.'}</h3>
            </div>
            {Number.isFinite(adaptiveAnalysis.percentPerWeek) ? <strong className="nutrition-adaptive-trend">{adaptiveAnalysis.percentPerWeek > 0 ? '+' : ''}{round(adaptiveAnalysis.percentPerWeek)}% / week</strong> : null}
          </header>

          <p>{adaptiveAnalysis.reason ?? (
            adaptiveAnalysis.status === 'recommend'
              ? `Your weight trend and recent intake suggest a ${adaptiveAnalysis.adjustmentCalories > 0 ? 'small increase' : 'small reduction'} is appropriate.`
              : 'Weight trend and intake adherence currently support holding the plan steady.'
          )}</p>

          {adaptiveAnalysis.adherence != null ? <div className="nutrition-adaptive-meta">
            <span>{Math.round(adaptiveAnalysis.adherence * 100)}% calorie adherence</span>
            <span>{adaptiveAnalysis.weighIns ?? 0} weigh-ins</span>
            <span>{adaptiveAnalysis.loggedDays ?? 0}/14 nutrition days</span>
          </div> : null}

          {adaptiveAnalysis.status === 'recommend' ? <div className="nutrition-adaptive-action">
            <div>
              <span>Current base</span>
              <strong>{Math.round(Number(goals.calories || 0)).toLocaleString()} → {Math.round(Number(adaptiveAnalysis.proposedBaseCalories || goals.calories)).toLocaleString()} cal</strong>
            </div>
            <button className="gold-button machined" onClick={applyAdaptiveAdjustment}>
              <Sparkles size={16}/>Apply {adaptiveAnalysis.adjustmentCalories > 0 ? '+' : ''}{adaptiveAnalysis.adjustmentCalories} cal
            </button>
          </div> : null}
        </section>

        <section className="nutrition-coaching-insight"><Sparkles size={18}/><div><strong>{weeklyInsights.proteinDays >= 5 ? 'Protein consistency is strong.' : 'Protein is the clearest opportunity.'}</strong><span>{weeklyInsights.proteinDays >= 5 ? 'Keep the same routine and focus on consistency.' : `You reached at least 90% of your protein goal on ${weeklyInsights.proteinDays} days.`}</span></div></section>
        <details className="nutrition-history-disclosure"><summary><History size={17}/>View daily history</summary><div className="nutrition-history-list">{Object.values(nutrition.days ?? {}).sort((a,b)=>b.date.localeCompare(a.date)).map((entry)=>{const t=nutritionTotals(entry);return <article key={entry.date}><div><strong>{new Date(`${entry.date}T12:00:00`).toLocaleDateString()}</strong><span>{entry.foods.length} foods · {round(entry.waterOz)} oz water</span></div><div><strong>{Math.round(t.calories)} cal</strong><span>{round(t.protein)}g protein</span></div></article>})}</div></details>
      </section>}

      {tab === 'Goals' && (
        nutritionConfigured ? <section className="nutrition-panel">
          <header>
            <div>
              <span className="eyebrow">PERSONAL TARGETS</span>
              <h2>Your nutrition targets</h2>
              <p>
                {goals.source === 'ava_estimated'
                  ? 'AVAREN starting estimate · fully editable'
                  : 'Your saved nutrition targets'}
              </p>
            </div>
          </header>
          <div className="nutrition-food-form">
            {['calories','protein','carbs','fat','fiber','waterOz','bottleOz','weightGoal'].map((field)=><label key={field}><span>{field}</span><input type="number" value={goals[field] ?? ''} onChange={(e)=>patch((current)=>({...current,goals:{...goals,[field]:e.target.value,configured:true,source:goals.source === 'coach_set' ? 'coach_set' : 'user_set'}}))}/></label>)}
            <label className="wide nutrition-toggle"><span><strong>Share nutrition with connected coach</strong><small>Optional. AVAREN works fully without a coach.</small></span><input type="checkbox" checked={Boolean(goals.coachAccess)} onChange={(e)=>patch((current)=>({...current,goals:{...goals,coachAccess:e.target.checked}}))}/></label>
            <label><span>Today’s weight</span><input type="number" step="0.1" value={day.weight} onChange={(e)=>patchDay((current)=>({...current,weight:e.target.value}))}/></label>

          </div>
          <button
            className="nutrition-secondary-button nutrition-recalculate"
            onClick={() => {
              setEditingTargets(true)
              setTab('Today')
            }}
          >
            Recalculate from my goals & activity
          </button>
        </section> : <section className="nutrition-panel nutrition-goals-empty">
          <span className="eyebrow">PERSONAL TARGETS</span>
          <h2>No target has been set yet.</h2>
          <p>Set up your nutrition first. AVAREN will not guess a calorie target for you.</p>
          <button className="gold-button machined" onClick={() => setTab('Today')}>
            <Sparkles size={17}/> Set Up Nutrition
          </button>
        </section>
      )}
      {tab !== 'Meals' && <button className="nutrition-fab" onClick={() => setTab('Meals')}><Plus size={20}/><span>Log Food</span></button>}
    </div>
  )
}
