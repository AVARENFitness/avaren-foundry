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
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  resetDocumentModalLayer,
  useAppModalLayer,
} from '../hooks/useAppModalLayer'
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
  repeatLoggedFoodEntry,
  updateLoggedFoodAmount,
  duplicateLoggedFoodEntry,
} from '../lib/nutritionActions'
import { COMMON_FOODS } from '../data/commonFoods'
import { groupLoggedFoods } from '../lib/nutritionDayGrouping'
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
  weightAmountForUnitSwitch,
  foodMeasureMultiplier,
  parseFoodCountFromContext,
  resolveFoodMeasureBasisForUnit,
  resolveFoodServingBasis,
  resolveFoodServingCountBasis,
  resolveNutritionLabelConsumptionMeasurement,
  servingFractionDisplay,
} from '../lib/nutritionMeasurement'
import {
  detectNutritionBarcode,
  normalizeBarcodeDigits,
} from '../lib/nutritionBarcode'
import {
  applyReusableMealPreviewToRecipe,
  buildReusableMealAdjustments,
  buildReusableMealIngredientFromFood,
  buildReusableMealRecipe,
  calculateReusableMealTotals,
} from '../lib/reusableMealRecipes'

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
  const [logCaptureMode, setLogCaptureMode] = useState(null)
  const [logBrowseMode, setLogBrowseMode] = useState('Recent')
  const [selectedFood, setSelectedFood] = useState(null)
  const [editingLoggedFood, setEditingLoggedFood] = useState(null)
  const [editingLoggedAmount, setEditingLoggedAmount] = useState('')
  const [selectedMultiplier, setSelectedMultiplier] = useState(1)
  const [selectedMeasureUnit, setSelectedMeasureUnit] = useState(FOOD_MEASURE_UNIT.SERVING)
  const [selectedMeasureAmount, setSelectedMeasureAmount] = useState('1')
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
  const [reusableMealLogTarget, setReusableMealLogTarget] = useState(null)
  const [reusableMealWorkingIngredients, setReusableMealWorkingIngredients] = useState([])
  const [reusableMealAdjustments, setReusableMealAdjustments] = useState([])
  const [reusableIngredientSearch, setReusableIngredientSearch] = useState('')
  const [reusableIngredientResults, setReusableIngredientResults] = useState([])
  const [reusableIngredientSearchState, setReusableIngredientSearchState] = useState('idle')
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
  const [scanSavedAsReusable, setScanSavedAsReusable] = useState(false)
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

  useAppModalLayer(Boolean(
    selectedFood ||
    editingLoggedFood ||
    recipeLogTarget ||
    reusableMealLogTarget ||
    scanPreview ||
    scanResult
  ))

  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition?.goals ?? {}) }
  const nutritionConfigured =
    hasConfiguredNutritionTargets(goals) && !editingTargets
  const visibleTabs = nutritionConfigured
    ? tabs
    : tabs.filter((item) => item.value !== 'Insights')
  const day = nutrition?.days?.[date] ?? emptyNutritionDay(date)

  const logDestinationLabel = date === nutritionDateKey() ? 'today' : `the selected day (${date})`

  const resolvedDayFoods = useMemo(
    () => (day.foods ?? []).map((food) =>
      resolveFatSecretRuntimeEntry(food, fatSecretDetailCache),
    ),
    [day.foods, fatSecretDetailCache],
  )

  const loggedFoodGroups = useMemo(() => groupLoggedFoods(resolvedDayFoods), [resolvedDayFoods])

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
  const favoriteSnapshots = nutrition?.favoriteFoodSnapshots ?? []
  const recentIds = nutrition?.recentFoodIds ?? []
  const foodMatches = useMemo(() => {
    const query = foodSearch.trim().toLowerCase()
    const saved = (nutrition.savedFoods ?? []).map((food) => ({ ...food, sourceLabel: 'Saved', category: food.category ?? 'Saved' }))
    const common = COMMON_FOODS.map((food) => ({ ...food, sourceLabel: food.brand }))
    const combined = [...saved, ...common]
    return combined
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
  }, [foodSearch, favoriteIds, recentIds, nutrition.savedFoods])

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
          sourceLabel: 'Verified',
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

  useEffect(() => {
    const query = reusableIngredientSearch.trim()
    if (!reusableMealLogTarget || query.length < 2) {
      setReusableIngredientResults([])
      setReusableIngredientSearchState('idle')
      return undefined
    }

    const localQuery = query.toLowerCase()
    const localMatches = [
      ...(nutrition.savedFoods ?? []).map((food) => ({
        ...food,
        sourceLabel: 'Saved',
      })),
      ...COMMON_FOODS.map((food) => ({
        ...food,
        sourceLabel: food.brand ?? 'AVAREN',
      })),
    ]
      .filter((food) =>
        `${food.name} ${food.brand ?? ''} ${food.keywords ?? ''}`
          .toLowerCase()
          .includes(localQuery),
      )
      .slice(0, 6)

    setReusableIngredientResults(localMatches)
    setReusableIngredientSearchState('loading')

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchFatSecretFoods(query, { maxResults: 8 })
        if (cancelled) return
        const remote = (result.foods ?? []).map((food) => ({
          id: `fatsecret:${food.foodId}`,
          foodId: food.foodId,
          provider: 'fatsecret',
          sourceLabel: 'FatSecret',
          name: food.name,
          brand: food.brand || 'FatSecret',
          serving:
            food.description?.match(/^Per ([^-]+?)\s+-/i)?.[1]?.trim() ??
            '1 serving',
          calories: Number(food.summaryNutrition?.calories ?? 0),
          protein: Number(food.summaryNutrition?.protein ?? 0),
          carbs: Number(food.summaryNutrition?.carbs ?? 0),
          fat: Number(food.summaryNutrition?.fat ?? 0),
          fiber: 0,
          description: food.description,
        }))
        setReusableIngredientResults([
          ...localMatches,
          ...remote.filter(
            (food) =>
              !localMatches.some(
                (local) =>
                  local.name.toLowerCase() === food.name.toLowerCase(),
              ),
          ),
        ].slice(0, 10))
        setReusableIngredientSearchState('success')
      } catch {
        if (cancelled) return
        setReusableIngredientSearchState('success')
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    reusableIngredientSearch,
    reusableMealLogTarget,
    nutrition.savedFoods,
  ])

  const activeFoodSearch = foodSearch.trim().length >= 2

  const visibleFoodMatches = useMemo(() => {
    const query = foodSearch.trim()
    if (query.length < 2) return foodMatches

    const remoteIds = new Set(fatSecretFoods.map((food) => food.id))
    return [
      ...foodMatches.filter((food) => !remoteIds.has(food.id)),
      ...fatSecretFoods,
    ].slice(0, 12)
  }, [foodMatches, fatSecretFoods, foodSearch])

  const quickLogFoods = useMemo(() => {
    const byId = new Map(
      [...favoriteSnapshots, ...foodMatches].map((food) => [food.id, food]),
    )
    const ids = logBrowseMode === 'Favorites' ? favoriteIds : recentIds
    const preferred = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
    const fallback =
      logBrowseMode === 'Favorites'
        ? foodMatches.filter((food) => favoriteIds.includes(food.id))
        : foodMatches

    return (preferred.length ? preferred : fallback).slice(0, 6)
  }, [
    favoriteIds,
    favoriteSnapshots,
    foodMatches,
    logBrowseMode,
    recentIds,
  ])

  const quickSavedMeals = useMemo(
    () =>
      [...(nutrition?.recipes ?? [])]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime(),
        )
        .slice(0, 3),
    [nutrition?.recipes],
  )

  const recentLoggedFoods = useMemo(() => {
    const rows = Object.values(nutrition?.days ?? {})
      .flatMap((entry) =>
        (entry?.foods ?? []).map((food) => ({
          ...resolveFatSecretRuntimeEntry(food, fatSecretDetailCache),
          recentDate: entry?.date ?? '',
        })),
      )
      .filter((food) => food?.name)
      .sort(
        (a, b) =>
          new Date(b.loggedAt || 0).getTime() -
          new Date(a.loggedAt || 0).getTime(),
      )

    const seen = new Set()
    return rows.filter((food) => {
      const measurementKey = food.measurement
        ? [
            food.measurement.amount,
            food.measurement.unit,
            food.measurement.itemLabel,
          ].join(':')
        : ''
      const key = [
        String(food.name).toLowerCase(),
        measurementKey,
        Math.round(Number(food.calories || 0) * 10) / 10,
        Math.round(Number(food.protein || 0) * 10) / 10,
      ].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)
  }, [nutrition?.days, fatSecretDetailCache])

  const repeatRecentFood = (food) => {
    patch((current) =>
      repeatLoggedFoodEntry(current, date, food).nutrition,
    )
    const amount =
      foodMeasureDisplay(food.measurement) ||
      food.serving ||
      'same amount'
    setNotice(`${food.name} · ${amount} logged to ${logDestinationLabel}.`)
  }

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

  const scheduleNutritionModalCleanup = () => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resetDocumentModalLayer()
      })
    })
  }

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
    setScanMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
    setScanMeasureAmount('1')
    setScanMatches([])
    setScanSavedAsReusable(false)
    setBarcodeManualValue('')
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    if (barcodeInputRef.current) barcodeInputRef.current.value = ''
    scheduleNutritionModalCleanup()
  }

  const openBarcodeMatch = async (barcode) => {
    const digits = normalizeBarcodeDigits(barcode)
    if (!digits) {
      throw new Error('Enter or scan a valid 8, 12, or 13 digit barcode.')
    }

    const matched = await getFatSecretFoodByBarcode(digits)
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
  }

  const lookupManualBarcode = async () => {
    try {
      setScanState('loading')
      setScanError('')
      await openBarcodeMatch(barcodeManualValue)
    } catch (error) {
      setScanState('idle')
      const message = error?.message ?? 'Barcode lookup failed.'
      setScanError(message)
      setNotice(message)
    }
  }

  const runFoodScan = async (file, contextOverride = null, mode = 'food') => {
    try {
      setScanError('')

      if (mode === 'food' && file) {
        const prepared = await prepareNutritionScanImage(file)
        if (!prepared) throw new Error('Choose a photo first.')
        setScanPreview(prepared)
        setScanResult(null)
        setScanDraft(null)
        setScanMatches([])
        setScanState('context')
        return
      }

      setScanState('loading')

      if (mode === 'barcode' && file) {
        const detectedBarcode = await detectNutritionBarcode(file)
        if (detectedBarcode) {
          await openBarcodeMatch(detectedBarcode)
          return
        }
      }

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
        const barcode = normalizeBarcodeDigits(result.barcode)
        if (!barcode) {
          throw new Error(
            'The barcode was not readable. Try a closer photo or enter the digits below.',
          )
        }
        await openBarcodeMatch(barcode)
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

      const resultServingBasis = resolveFoodServingBasis({
        servingAmount: result.servingAmount,
        servingUnit: result.servingUnit,
        servingDescription: result.servingDescription,
      })
      const resultCountBasis = resolveFoodServingCountBasis({
        servingDescription: result.servingDescription,
      })
      const userCount =
        result.sourceType === 'label_read'
          ? parseFoodCountFromContext(
              contextOverride ?? scanContext,
              resultCountBasis,
            )
          : null
      const labelConsumption =
        result.sourceType === 'label_read'
          ? resolveNutritionLabelConsumptionMeasurement({
              servingBasis: resultServingBasis,
              context: contextOverride ?? scanContext,
            })
          : null

      setScanResult(result)
      setScanDraft(draft)

      if (userCount) {
        setScanMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
        setScanMeasureAmount(String(userCount.amount))
        setScanQuantity(userCount.multiplier)
      } else if (labelConsumption?.source === 'user_context') {
        setScanMeasureUnit(labelConsumption.unit)
        setScanMeasureAmount(String(labelConsumption.amount))
        setScanQuantity(labelConsumption.multiplier)
      } else if (resultCountBasis) {
        setScanMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
        setScanMeasureAmount(String(resultCountBasis.amount))
        setScanQuantity(1)
      } else if (labelConsumption) {
        setScanMeasureUnit(labelConsumption.unit)
        setScanMeasureAmount(String(labelConsumption.amount))
        setScanQuantity(labelConsumption.multiplier)
      } else {
        setScanQuantity(1)
        setScanMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
        setScanMeasureAmount('1')
      }

      setScanMatches([])
      setScanSavedAsReusable(false)

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
      scheduleNutritionModalCleanup()
    }
  }

  const scanServingBasis = scanResult
    ? resolveFoodServingBasis({
        servingAmount: scanResult.servingAmount,
        servingUnit: scanResult.servingUnit,
        servingDescription: scanResult.servingDescription,
      })
    : null
  const scanCountBasis = scanResult
    ? resolveFoodServingCountBasis({
        servingDescription: scanResult.servingDescription,
      })
    : null
  const scanMeasureValue = Math.max(
    0.01,
    Number(scanMeasureAmount || scanQuantity || 1),
  )
  const scanQuantityValue =
    foodMeasureMultiplier({
      amount: scanMeasureValue,
      unit: scanMeasureUnit,
      servingBasis: resolveFoodMeasureBasisForUnit({
        unit: scanMeasureUnit,
        weightBasis: scanServingBasis,
        countBasis: scanCountBasis,
      }),
    }) ?? Math.max(0.01, Number(scanQuantity || 1))
  const scanMeasurement = {
    amount: scanMeasureValue,
    unit: scanMeasureUnit,
    servingAmount:
      scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM
        ? scanCountBasis?.amount ?? 1
        : scanServingBasis?.amount ?? 1,
    servingUnit:
      scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM
        ? FOOD_MEASURE_UNIT.ITEM
        : scanServingBasis?.unit ?? FOOD_MEASURE_UNIT.SERVING,
    itemLabel:
      scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM
        ? scanCountBasis?.label ?? 'items'
        : '',
  }
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

  const saveScannedMealAsReusable = () => {
    if (!scanDraft?.name?.trim()) return

    const recipe = buildReusableMealRecipe({
      name: scanDraft.name,
      components: scanResult?.components ?? [],
      totals: {
        calories: Number(scaledScanDraft?.calories || 0),
        protein: Number(scaledScanDraft?.protein || 0),
        carbs: Number(scaledScanDraft?.carbs || 0),
        fat: Number(scaledScanDraft?.fat || 0),
        fiber: Number(scaledScanDraft?.fiber || 0),
      },
      context: scanContext,
      sourceImageKind: scanResult?.kind ?? 'meal',
    })

    patch((current) => ({
      ...current,
      recipes: [recipe, ...(current.recipes ?? [])],
    }))

    setScanSavedAsReusable(true)
    setNotice(`${recipe.name} saved to Library for one-tap logging.`)
  }

  const logScannedFood = () => {
    if (!scanDraft?.name?.trim()) return

    const foodToLog = {
      ...scanDraft,
      servings: scanQuantityValue,
      measurement: scanMeasurement,
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
      foodMeasureDisplay(scanMeasurement) ||
      (scanQuantityValue === 1
        ? '1 serving'
        : `${round(scanQuantityValue)} servings`)

    setNotice(
      scanResult?.sourceType === 'label_read'
        ? `${scanDraft.name} · ${quantityLabel} added to ${logDestinationLabel} from the nutrition label.`
        : `${scanDraft.name} · ${quantityLabel} estimate added to ${logDestinationLabel}. You can edit or remove it anytime.`,
    )
    resetFoodScan()
    setTab('Today')
    scheduleNutritionModalCleanup()
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

  const openLoggedFoodEditor = (food) => {
    const amount = Number(
      food.measurement?.amount ??
        food.quantity ??
        food.servings ??
        1,
    )
    setEditingLoggedFood(food)
    setEditingLoggedAmount(
      Number.isFinite(amount) && amount > 0 ? String(round(amount)) : '1',
    )
  }

  const saveLoggedFoodAmount = () => {
    if (!editingLoggedFood) return

    try {
      const result = updateLoggedFoodAmount(
        nutrition,
        date,
        editingLoggedFood.id,
        editingLoggedAmount,
      )
      onChange(result.nutrition)
      setNotice(
        `${editingLoggedFood.name} updated to ${
          result.entry.measurement
            ? foodMeasureDisplay(result.entry.measurement)
            : `${round(Number(editingLoggedAmount))} servings`
        }.`,
      )
      setEditingLoggedFood(null)
      setEditingLoggedAmount('')
      scheduleNutritionModalCleanup()
    } catch (error) {
      setNotice(error?.message ?? 'Could not update that amount.')
    }
  }

  const duplicateLoggedFood = (food) => {
    try {
      const result = duplicateLoggedFoodEntry(nutrition, date, food.id)
      onChange(result.nutrition)
      setNotice(`${food.name} duplicated.`)
      setEditingLoggedFood(null)
      setEditingLoggedAmount('')
      scheduleNutritionModalCleanup()
    } catch (error) {
      setNotice(error?.message ?? 'Could not duplicate that food.')
    }
  }

  const removeLoggedFood = (food) => {
    patchDay((current) => ({
      ...current,
      foods: (current.foods ?? []).filter((item) => item.id !== food.id),
    }))
    setEditingLoggedFood(null)
    setEditingLoggedAmount('')
    setNotice(`${food.name} removed.`)
    scheduleNutritionModalCleanup()
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
    setNotice(`${food.name.trim()} added to ${logDestinationLabel}.`)
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
    const snapshots = current.favoriteFoodSnapshots ?? []
    const isFavorite = ids.includes(food.id)

    return {
      ...current,
      favoriteFoodIds: isFavorite
        ? ids.filter((id) => id !== food.id)
        : [food.id, ...ids],
      favoriteFoodSnapshots: isFavorite
        ? snapshots.filter((item) => item.id !== food.id)
        : [
            {
              ...food,
              sourceLabel:
                food.provider === 'fatsecret'
                  ? 'Verified'
                  : food.sourceLabel,
            },
            ...snapshots.filter((item) => item.id !== food.id),
          ].slice(0, 50),
    }
  })

  const openFood = async (food) => {
    setSelectedFood(food)
    setSelectedMultiplier(1)
    setSelectedMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
    setSelectedMeasureAmount('1')

    if (food.provider !== 'fatsecret') {
      const countBasis = resolveFoodServingCountBasis(food)
      setSelectedMeasureUnit(
        countBasis ? FOOD_MEASURE_UNIT.ITEM : FOOD_MEASURE_UNIT.SERVING,
      )
      setSelectedMeasureAmount(
        countBasis ? String(countBasis.amount) : '1',
      )
      setSelectedMultiplier(1)
      setFatSecretDetailState('idle')
      setFatSecretDetailError('')
      setSelectedFatSecretServingId('')
      setFatSecretQuantity('1')
      setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
      setFatSecretMeasureAmount('1')
      return
    }

    setFatSecretDetailState('loading')
    setFatSecretDetailError('')
    setSelectedFatSecretServingId('')
    setFatSecretQuantity('1')
    setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
    setFatSecretMeasureAmount('1')

    try {
      const cached = fatSecretDetailCache[food.foodId]
      const detail = cached ?? await getFatSecretFood(food.foodId)

      setFatSecretDetailCache((current) => ({
        ...current,
        [food.foodId]: detail,
      }))

      const firstServing = detail.servings?.[0]
      const countBasis = resolveFoodServingCountBasis(firstServing ?? {})
      setSelectedFatSecretServingId(firstServing?.servingId ?? '')
      if (countBasis) {
        setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
        setFatSecretMeasureAmount(String(countBasis.amount))
        setFatSecretQuantity('1')
      }
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

    const detail = fatSecretDetailCache[selectedFood.foodId]
    const serving = detail?.servings?.find(
      (item) =>
        String(item.servingId) === String(selectedFatSecretServingId),
    )
    const servingBasis = resolveFoodServingBasis(serving ?? {})
    const countBasis = resolveFoodServingCountBasis(serving ?? {})
    const measureAmount = Number(fatSecretMeasureAmount || fatSecretQuantity)
    const quantity =
      foodMeasureMultiplier({
        amount: measureAmount,
        unit: fatSecretMeasureUnit,
        servingBasis: resolveFoodMeasureBasisForUnit({
          unit: fatSecretMeasureUnit,
          weightBasis: servingBasis,
          countBasis,
        }),
      }) ?? Number(fatSecretQuantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice('Enter an amount greater than 0.')
      return
    }

    const measurement = {
      amount: measureAmount,
      unit: fatSecretMeasureUnit,
      servingAmount:
        fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
          ? countBasis?.amount ?? 1
          : servingBasis?.amount ?? 1,
      servingUnit:
        fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
          ? FOOD_MEASURE_UNIT.ITEM
          : servingBasis?.unit ?? FOOD_MEASURE_UNIT.SERVING,
      itemLabel:
        fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
          ? countBasis?.label ?? 'items'
          : '',
    }

    patch((current) =>
      appendFatSecretFoodReference(current, date, {
        foodId: selectedFood.foodId,
        servingId: selectedFatSecretServingId,
        quantity,
        measurement,
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

    setNotice(
      `${detail?.name ?? selectedFood.name} · ${foodMeasureDisplay(measurement) || `${round(quantity)} servings`} added to ${logDestinationLabel}.`,
    )
    setSelectedFood(null)
    setFoodSearch('')
    setFatSecretFoods([])
    setFatSecretDetailState('idle')
    setSelectedFatSecretServingId('')
    setFatSecretQuantity('1')
    setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
    setFatSecretMeasureAmount('1')
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
        remainingServings:
          recipe.trackInventory === false ? null : recipe.servings,
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

  const openReusableMealAdjuster = (recipe) => {
    setReusableMealLogTarget(recipe)
    setReusableMealWorkingIngredients(recipe.ingredients ?? [])
    setReusableMealAdjustments(buildReusableMealAdjustments(recipe))
    setReusableIngredientSearch('')
    setReusableIngredientResults([])
    setReusableIngredientSearchState('idle')
  }

  const reusableMealPreview = reusableMealLogTarget
    ? calculateReusableMealTotals(
        {
          ...reusableMealLogTarget,
          ingredients: reusableMealWorkingIngredients,
        },
        reusableMealAdjustments,
      )
    : null

  const removeReusableMealIngredient = (ingredientId) => {
    setReusableMealWorkingIngredients((current) =>
      current.filter((item) => item.id !== ingredientId),
    )
    setReusableMealAdjustments((current) =>
      current.filter((item) => item.id !== ingredientId),
    )
  }

  const addReusableMealIngredient = async (food) => {
    try {
      let resolvedFood = food

      if (food.provider === 'fatsecret' && food.foodId) {
        const detail = await getFatSecretFood(food.foodId)
        const serving = detail.servings?.[0]
        if (!serving) throw new Error('No serving information is available for that food.')

        resolvedFood = {
          name: detail.name || food.name,
          serving: serving.description,
          servingBasis: resolveFoodServingBasis(serving),
          calories: Number(serving.calories || 0),
          protein: Number(serving.protein || 0),
          carbs: Number(serving.carbs || 0),
          fat: Number(serving.fat || 0),
          fiber: Number(serving.fiber || 0),
          basis: 'database',
        }
      }

      const ingredient = buildReusableMealIngredientFromFood(resolvedFood)
      setReusableMealWorkingIngredients((current) => [...current, ingredient])
      setReusableMealAdjustments((current) => [
        ...current,
        ...buildReusableMealAdjustments({ ingredients: [ingredient] }),
      ])
      setReusableIngredientSearch('')
      setReusableIngredientResults([])
      setReusableIngredientSearchState('idle')
      setNotice(`${ingredient.name} added to today’s meal edit.`)
    } catch (error) {
      setNotice(error?.message ?? 'Could not add that ingredient.')
    }
  }

  const updateSavedReusableMeal = () => {
    if (!reusableMealLogTarget || !reusableMealPreview) return

    const updated = applyReusableMealPreviewToRecipe(
      {
        ...reusableMealLogTarget,
        ingredients: reusableMealWorkingIngredients,
      },
      reusableMealPreview,
    )

    patch((current) => ({
      ...current,
      recipes: (current.recipes ?? []).map((recipe) =>
        recipe.id === updated.id ? updated : recipe,
      ),
    }))

    setReusableMealLogTarget(updated)
    setReusableMealWorkingIngredients(updated.ingredients ?? [])
    setReusableMealAdjustments(buildReusableMealAdjustments(updated))
    setNotice(`${updated.name} updated as your new default meal.`)
  }

  const logAdjustedReusableMeal = () => {
    if (!reusableMealLogTarget || !reusableMealPreview) return

    const payload = {
      id: reusableMealLogTarget.id,
      name: reusableMealLogTarget.name,
      calories: reusableMealPreview.totals.calories,
      protein: reusableMealPreview.totals.protein,
      carbs: reusableMealPreview.totals.carbs,
      fat: reusableMealPreview.totals.fat,
      fiber: reusableMealPreview.totals.fiber,
      servings: 1,
      recipeId: reusableMealLogTarget.id,
      reusableMeal: true,
      components: reusableMealPreview.ingredients.map((item) => ({
        name: item.name,
        amount: item.adjustedAmount,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        fiber: item.fiber,
      })),
    }

    patch((current) =>
      appendFoodToNutrition(
        current,
        date,
        payload,
        'reusable_meal',
      ).nutrition,
    )

    setNotice(`${reusableMealLogTarget.name} added to ${logDestinationLabel} with your adjustments.`)
    setReusableMealLogTarget(null)
    setReusableMealWorkingIngredients([])
    setReusableMealAdjustments([])
    setReusableIngredientSearch('')
    setReusableIngredientResults([])
    setTab('Today')
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

      <input
        ref={cameraInputRef}
        className="nutrition-scan-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          if (file) {
            void runFoodScan(file, null, 'food').finally(() => {
              input.value = ''
            })
          }
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
          const input = event.currentTarget
          const file = input.files?.[0]
          if (file) {
            void runFoodScan(file, '', 'barcode').finally(() => {
              input.value = ''
            })
          }
        }}
      />

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
          {resolvedDayFoods.length ? (
            <div className="nutrition-today-food-list">
              {loggedFoodGroups.map((group) => (
                <div className="nutrition-today-log-group" key={group.key}>
                  {group.foods.length > 1 && (
                    <div className="nutrition-today-group-label">
                      <span>Logged around the same time</span>
                      <span>{group.foods.length} items</span>
                    </div>
                  )}
                  {group.foods.map((food) => (
                <button
                  type="button"
                  key={food.id}
                  className="nutrition-today-food-row"
                  onClick={() => openLoggedFoodEditor(food)}
                >
                  <span className="nutrition-today-food-copy">
                    <strong>{food.name}</strong>
                    <small>
                      {food.source === 'fatsecret' && (food.name === 'Loading food…' || food.name === 'Food unavailable')
                        ? (food.name === 'Loading food…' ? 'Refreshing nutrition…' : 'Nutrition unavailable')
                        : `${food.measurement ? `${foodMeasureDisplay(food.measurement)} · ` : ''}${Math.round(Number(food.calories || 0))} cal`}
                    </small>
                  </span>
                  <span className="nutrition-today-food-macros">
                    <small>P {round(food.protein)} · C {round(food.carbs)} · F {round(food.fat)}</small>
                    <ChevronRight size={17}/>
                  </span>
                </button>
                  ))}
                </div>
              ))}
            </div>
          ) : <div className="nutrition-empty"><Utensils/><p>Log your first meal to start today’s dashboard.</p></div>}
        </section>

        {editingLoggedFood && typeof document !== 'undefined' && createPortal(
          <div
            className="nutrition-food-sheet-backdrop"
            data-app-ui-backdrop="open"
            onClick={() => {
              setEditingLoggedFood(null)
              setEditingLoggedAmount('')
            }}
          >
            <section
              className="nutrition-food-sheet nutrition-log-entry-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span className="eyebrow">LOGGED FOOD</span>
                  <h2>{editingLoggedFood.name}</h2>
                  <p>Correct the amount without searching for the food again.</p>
                </div>
                <button onClick={() => {
                  setEditingLoggedFood(null)
                  setEditingLoggedAmount('')
                }}><X size={18}/></button>
              </header>

              {(() => {
                const originalAmount = Number(
                  editingLoggedFood.measurement?.amount ??
                    editingLoggedFood.quantity ??
                    editingLoggedFood.servings ??
                    1,
                )
                const nextAmount = Number(editingLoggedAmount)
                const safeOriginal = Number.isFinite(originalAmount) && originalAmount > 0 ? originalAmount : 1
                const multiplier = Number.isFinite(nextAmount) && nextAmount > 0 ? nextAmount / safeOriginal : 0
                const unitLabel = editingLoggedFood.measurement
                  ? (
                      editingLoggedFood.measurement.unit === FOOD_MEASURE_UNIT.ITEM
                        ? editingLoggedFood.measurement.itemLabel || 'items'
                        : editingLoggedFood.measurement.unit
                    )
                  : 'servings'

                return <>
                  <div className="nutrition-sheet-macros">
                    <article><span>Calories</span><strong>{Math.round(Number(editingLoggedFood.calories || 0) * multiplier)}</strong></article>
                    <article><span>Protein</span><strong>{round(Number(editingLoggedFood.protein || 0) * multiplier)}g</strong></article>
                    <article><span>Carbs</span><strong>{round(Number(editingLoggedFood.carbs || 0) * multiplier)}g</strong></article>
                    <article><span>Fat</span><strong>{round(Number(editingLoggedFood.fat || 0) * multiplier)}g</strong></article>
                  </div>

                  <label className="nutrition-log-entry-amount">
                    <span>Amount eaten</span>
                    <div className="nutrition-measure-input">
                      <input
                        type="number"
                        min="0.01"
                        step={editingLoggedFood.measurement?.unit === FOOD_MEASURE_UNIT.ITEM ? '1' : '0.1'}
                        value={editingLoggedAmount}
                        onChange={(event) => setEditingLoggedAmount(event.target.value)}
                        inputMode="decimal"
                      />
                      <strong>{unitLabel}</strong>
                    </div>
                    <small>
                      Originally logged as {
                        editingLoggedFood.measurement
                          ? foodMeasureDisplay(editingLoggedFood.measurement)
                          : `${round(safeOriginal)} servings`
                      }.
                    </small>
                  </label>

                  <div className="nutrition-log-entry-primary">
                    <button
                      className="gold-button machined"
                      onClick={saveLoggedFoodAmount}
                      disabled={!Number.isFinite(nextAmount) || nextAmount <= 0}
                    >
                      <Save size={16}/>
                      Save amount
                    </button>
                  </div>

                  <div className="nutrition-log-entry-actions">
                    <button type="button" onClick={() => duplicateLoggedFood(editingLoggedFood)}>
                      <Copy size={16}/>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeLoggedFood(editingLoggedFood)}
                    >
                      <Trash2 size={16}/>
                      Remove
                    </button>
                  </div>
                </>
              })()}
            </section>
          </div>,
          document.body,
        )}
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

        {!activeFoodSearch && !showCustomFood && <>
          <div className="nutrition-log-quick-actions">
            <button
              type="button"
              className={logCaptureMode === 'photo' ? 'active' : ''}
              onClick={() => setLogCaptureMode((mode) => mode === 'photo' ? null : 'photo')}
            >
              <Camera size={18}/>
              <span>Photo</span>
            </button>
            <button
              type="button"
              className={logCaptureMode === 'barcode' ? 'active' : ''}
              onClick={() => setLogCaptureMode((mode) => mode === 'barcode' ? null : 'barcode')}
            >
              <ScanLine size={18}/>
              <span>Barcode</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLogCaptureMode(null)
                setShowCustomFood(true)
              }}
            >
              <Plus size={18}/>
              <span>Custom</span>
            </button>
          </div>

          {logCaptureMode === 'photo' ? (
            <div className="nutrition-log-capture-panel">
              <button type="button" onClick={() => cameraInputRef.current?.click()}>
                <Camera size={17}/>
                <span><strong>Take photo</strong><small>Meal, package, or label</small></span>
              </button>
              <button type="button" onClick={() => uploadInputRef.current?.click()}>
                <ImagePlus size={17}/>
                <span><strong>Choose photo</strong><small>Use one from your library</small></span>
              </button>
            </div>
          ) : null}

          {logCaptureMode === 'barcode' ? (
            <div className="nutrition-log-barcode-panel">
              <button
                type="button"
                className="nutrition-log-scan-barcode"
                onClick={() => barcodeInputRef.current?.click()}
              >
                <ScanLine size={17}/>
                Scan barcode
              </button>
              <div className="nutrition-log-manual-barcode">
                <input
                  value={barcodeManualValue}
                  onChange={(event) =>
                    setBarcodeManualValue(event.target.value.replace(/\D/g, '').slice(0, 13))
                  }
                  inputMode="numeric"
                  placeholder="Or enter 8, 12, or 13 digits"
                />
                <button
                  type="button"
                  onClick={lookupManualBarcode}
                  disabled={!normalizeBarcodeDigits(barcodeManualValue)}
                >
                  Look up
                </button>
              </div>
            </div>
          ) : null}

          {!activeFoodSearch && quickSavedMeals.length ? (
            <section className="nutrition-log-saved-meals">
              <header>
                <div>
                  <span className="eyebrow">SAVED MEALS</span>
                  <strong>Your shortcuts</strong>
                </div>
                <button type="button" onClick={() => setTab('Library')}>
                  Manage
                </button>
              </header>
              <div>
                {quickSavedMeals.map((recipe) => {
                  const servings = Math.max(1, Number(recipe.servings || 1))
                  const totals = recipe.totals ?? {
                    calories: recipe.calories,
                    protein: recipe.protein,
                    carbs: recipe.carbs,
                    fat: recipe.fat,
                  }
                  const perServingCalories = recipe.reusableMeal
                    ? Number(totals.calories || 0)
                    : Number(totals.calories || 0) / servings
                  const perServingProtein = recipe.reusableMeal
                    ? Number(totals.protein || 0)
                    : Number(totals.protein || 0) / servings

                  return (
                    <article key={`quick-meal-${recipe.id}`}>
                      <button
                        type="button"
                        className="nutrition-log-saved-main"
                        onClick={() =>
                          recipe.reusableMeal
                            ? openReusableMealAdjuster(recipe)
                            : (() => {
                                setRecipeLogAmount(1)
                                setRecipeLogTarget(recipe)
                              })()
                        }
                      >
                        <strong>{recipe.name}</strong>
                        <small>
                          {Math.round(perServingCalories)} cal · P {round(perServingProtein)}g
                        </small>
                      </button>
                      <button
                        type="button"
                        className="nutrition-log-saved-add"
                        onClick={() => logRecipe(recipe, 1)}
                      >
                        <Plus size={15}/>
                        Log
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          <div className="nutrition-log-quick-heading">
            <div>
              <span className="eyebrow">{logBrowseMode === 'Favorites' ? 'FAVORITES' : 'RECENT'}</span>
              <strong>{logBrowseMode === 'Favorites' ? 'Foods you come back to' : 'Log again'}</strong>
            </div>
            <div className="nutrition-log-quick-toggle">
              <button
                type="button"
                className={logBrowseMode === 'Recent' ? 'active' : ''}
                onClick={() => setLogBrowseMode('Recent')}
              >
                Recent
              </button>
              <button
                type="button"
                className={logBrowseMode === 'Favorites' ? 'active' : ''}
                onClick={() => setLogBrowseMode('Favorites')}
              >
                Favorites
              </button>
            </div>
          </div>
        </>}

        {!showCustomFood && <>
          {foodSearch.trim().length >= 2 && (
            <div className="nutrition-live-search-status" data-state={fatSecretSearchState}>
              {fatSecretSearchState === 'loading' && <span>Searching verified foods…</span>}
              {fatSecretSearchState === 'success' && fatSecretFoods.length > 0 && <span>Verified food database</span>}
              {fatSecretSearchState === 'error' && <span>{fatSecretSearchError}</span>}
            </div>
          )}
          {!activeFoodSearch && logBrowseMode === 'Recent' ? (
            <div className="nutrition-repeat-list">
              {recentLoggedFoods.length ? recentLoggedFoods.map((food) => (
                <article key={`recent-${food.id}-${food.loggedAt}`} className="nutrition-repeat-row">
                  <div className="nutrition-repeat-copy">
                    <strong>{food.name}</strong>
                    <small>
                      {foodMeasureDisplay(food.measurement) || food.serving || 'Same portion'}
                      {' · '}
                      {Math.round(Number(food.calories || 0))} cal
                    </small>
                    <span>P {round(food.protein)} · C {round(food.carbs)} · F {round(food.fat)}</span>
                  </div>
                  <button
                    type="button"
                    className="nutrition-repeat-button"
                    onClick={() => repeatRecentFood(food)}
                  >
                    <Plus size={15}/>
                    Log again
                  </button>
                </article>
              )) : (
                <div className="nutrition-no-results compact">
                  <Utensils/>
                  <strong>No recent foods yet</strong>
                  <span>Log something once and the exact portion will stay here for one-tap repeat logging.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="nutrition-food-results">
              {(activeFoodSearch ? visibleFoodMatches : quickLogFoods).length ? (activeFoodSearch ? visibleFoodMatches : quickLogFoods).map((food) => (
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
              )) : <div className="nutrition-no-results compact"><Utensils/><strong>{activeFoodSearch ? 'No match yet' : 'No favorites yet'}</strong><span>{activeFoodSearch ? 'Try another search, a photo, barcode, or custom food.' : 'Favorite foods you use often and they will stay here.'}</span>{activeFoodSearch ? <button onClick={() => { setFoodDraft({...blankFood,name:foodSearch}); setShowCustomFood(true) }}>Create “{foodSearch}”</button> : null}</div>}
            </div>
          )}
        </>}

        {(scanPreview || scanResult) && typeof document !== 'undefined' && createPortal(
          <div className="nutrition-food-sheet-backdrop" data-app-ui-backdrop="open" onClick={resetFoodScan}>
            <section
              className="nutrition-food-sheet nutrition-scan-sheet"
              data-scan-state={scanState}
              aria-live="polite"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span className="eyebrow">
                    {scanState === 'context' ? 'PHOTO DETAILS' : 'SCAN FOOD'}
                  </span>
                  <h2>
                    {scanState === 'context'
                      ? 'Help AVA estimate this meal'
                      : scanState === 'loading'
                        ? 'AVA is reading your food…'
                        : scanResult?.title || 'Food photo'}
                  </h2>
                  <p>
                    {scanState === 'context'
                      ? 'Add anything you know before AVA calculates the macros, or skip for the best visual estimate.'
                      : scanState === 'loading'
                        ? 'Checking the image, any details you gave, and the best nutrition source.'
                        : scanResult?.servingDescription || 'Review before adding.'}
                  </p>
                </div>
                <button onClick={resetFoodScan}><X size={18}/></button>
              </header>

              {scanPreview ? <img className="nutrition-scan-preview" src={scanPreview} alt="Food scan preview"/> : null}

              {scanState === 'context' ? (
                <section className="nutrition-scan-preanalysis">
                  <div className="nutrition-scan-preanalysis-copy">
                    <span className="eyebrow">OPTIONAL DETAILS</span>
                    <strong>Tell AVA what you know</strong>
                    <small>
                      Exact ingredients and scale weights take priority over the photo.
                      Anything you leave out will be estimated visually.
                    </small>
                  </div>

                  <label>
                    <span>Ingredients, amounts, or cooking details</span>
                    <textarea
                      value={scanContext}
                      onChange={(event) => setScanContext(event.target.value)}
                      placeholder="Example: 6 oz grilled chicken, 150 g cooked rice, 40 g avocado, Greek-yogurt sauce"
                      maxLength={600}
                      rows={3}
                    />
                  </label>

                  <div className="nutrition-scan-preanalysis-examples">
                    <span>Useful details:</span>
                    <small>weights · brands · cooking oil · sauces · portions</small>
                  </div>

                  <div className="nutrition-scan-preanalysis-actions">
                    <button
                      type="button"
                      className="nutrition-secondary-button"
                      onClick={() => runFoodScan(null, '', 'food')}
                    >
                      Best estimate
                    </button>
                    <button
                      type="button"
                      className="gold-button machined"
                      onClick={() => runFoodScan(null, scanContext, 'food')}
                    >
                      <Sparkles size={16}/>
                      {scanContext.trim() ? 'Analyze with details' : 'Analyze photo'}
                    </button>
                  </div>
                </section>
              ) : null}

              {scanState === 'loading' ? <div className="nutrition-scan-loading"><Sparkles size={20}/><span>Analyzing image…</span></div> : null}
              {scanState === 'error' ? <div className="nutrition-fatsecret-detail-state error"><strong>Couldn’t analyze this photo.</strong><span>{scanError}</span><button onClick={() => runFoodScan(null, scanContext, 'food')}>Try Again</button></div> : null}

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
                    <span className="eyebrow">
                      {scanResult.sourceType === 'label_read' ? 'MEASURED AMOUNT' : 'PORTIONS'}
                    </span>
                    <strong>{scanResult.sourceType === 'label_read' ? 'How much did you have?' : 'How much did you have?'}</strong>
                    <small>
                      {scanResult.sourceType === 'label_read' && scanCountBasis
                        ? `1 serving = ${foodMeasureDisplay({ amount: scanCountBasis.amount, unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: scanCountBasis.label })}. Enter the number you actually ate — AVAREN handles the fraction.`
                        : scanResult.sourceType === 'label_read' && scanServingBasis
                          ? `Label nutrition is based on ${foodMeasureDisplay({ amount: scanServingBasis.amount, unit: scanServingBasis.unit })}. Enter the amount you actually had.`
                          : scanResult.sourceType === 'label_read'
                            ? 'Label values are per serving. AVAREN will scale the totals before logging.'
                            : 'Choose the amount you actually ate. AVAREN will scale the estimate once.'}
                    </small>
                  </div>

                  {(scanServingBasis || scanCountBasis) ? <div className="nutrition-measure-tabs" role="group" aria-label="Scanned food amount unit">
                    <button type="button" className={scanMeasureUnit === FOOD_MEASURE_UNIT.SERVING ? 'active' : ''} onClick={() => {
                      setScanMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
                      setScanMeasureAmount('1')
                      setScanQuantity(1)
                    }}>Serving</button>
                    {scanCountBasis ? <button type="button" className={scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? 'active' : ''} onClick={() => {
                      setScanMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
                      setScanMeasureAmount(String(scanCountBasis.amount))
                      setScanQuantity(1)
                    }}>{scanCountBasis.label}</button> : null}
                    {scanServingBasis ? <button type="button" className={scanMeasureUnit === FOOD_MEASURE_UNIT.GRAM ? 'active' : ''} onClick={() => {
                      setScanMeasureUnit(FOOD_MEASURE_UNIT.GRAM)
                      setScanMeasureAmount(weightAmountForUnitSwitch(scanMeasureAmount, scanMeasureUnit, FOOD_MEASURE_UNIT.GRAM, String(FOOD_MEASURE_UNIT.GRAM === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(scanServingBasis.amount) * (scanServingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(scanServingBasis.amount) * (scanServingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>g</button> : null}
                    {scanServingBasis ? <button type="button" className={scanMeasureUnit === FOOD_MEASURE_UNIT.OUNCE ? 'active' : ''} onClick={() => {
                      setScanMeasureUnit(FOOD_MEASURE_UNIT.OUNCE)
                      setScanMeasureAmount(weightAmountForUnitSwitch(scanMeasureAmount, scanMeasureUnit, FOOD_MEASURE_UNIT.OUNCE, String(FOOD_MEASURE_UNIT.OUNCE === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(scanServingBasis.amount) * (scanServingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(scanServingBasis.amount) * (scanServingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>oz</button> : null}
                  </div> : null}

                  {scanMeasureUnit === FOOD_MEASURE_UNIT.SERVING ? (
                    <div className="nutrition-scan-portion-options" role="group" aria-label="Portion amount">
                      {[0.5, 1, 1.5, 2].map((quantity) => (
                        <button
                          type="button"
                          key={quantity}
                          className={Number(scanMeasureAmount) === quantity ? 'active' : ''}
                          onClick={() => {
                            setScanQuantity(quantity)
                            setScanMeasureAmount(String(quantity))
                          }}
                        >
                          {quantity}×
                        </button>
                      ))}
                      <label>
                        <span>Custom</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.25"
                          value={scanMeasureAmount}
                          onChange={(event) => {
                            setScanMeasureAmount(event.target.value)
                            setScanQuantity(event.target.value)
                          }}
                          inputMode="decimal"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="nutrition-scan-weight-input">
                      <span>{scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? `${scanCountBasis?.singularLabel ?? 'Item'} count` : 'Amount eaten'}</span>
                      <div className="nutrition-measure-input">
                        <input
                          type="number"
                          min="0.1"
                          step={scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? '1' : '0.1'}
                          value={scanMeasureAmount}
                          onChange={(event) => setScanMeasureAmount(event.target.value)}
                          inputMode="decimal"
                        />
                        <strong>{scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? scanCountBasis?.label ?? 'items' : scanMeasureUnit}</strong>
                      </div>
                      {scanMeasureUnit === FOOD_MEASURE_UNIT.ITEM && scanCountBasis ? <small className="nutrition-portion-intelligence">
                        {foodMeasureDisplay({ amount: scanMeasureValue, unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: scanCountBasis.label })} = {servingFractionDisplay(scanQuantityValue)}
                      </small> : null}
                    </label>
                  )}
                </section>

                <div className="nutrition-sheet-macros">
                  <article><span>Calories</span><strong>{Math.round(Number(scaledScanDraft?.calories || 0))}</strong></article>
                  <article><span>Protein</span><strong>{round(scaledScanDraft?.protein)}g</strong></article>
                  <article><span>Carbs</span><strong>{round(scaledScanDraft?.carbs)}g</strong></article>
                  <article><span>Fat</span><strong>{round(scaledScanDraft?.fat)}g</strong></article>
                </div>

                {scanResult.followUpQuestion ? <div className="nutrition-scan-followup">
                  <strong>{scanResult.followUpQuestion}</strong>
                  <div>
                    <input value={scanContext} onChange={(event) => setScanContext(event.target.value)} placeholder="Add one detail"/>
                    <button onClick={() => runFoodScan(null, scanContext, 'food')}>Refine</button>
                  </div>
                  <button className="nutrition-scan-skip" onClick={() => setScanResult((current) => ({...current, followUpQuestion:''}))}>Use estimate as-is</button>
                </div> : null}

                <details className="nutrition-scan-review">
                  <summary>Review or correct nutrition</summary>
                  <div className="nutrition-scan-review-body">
                    <p className="nutrition-scan-edit-hint">
                      Only change these if AVA read the label or food incorrectly.
                    </p>
                    <div className="nutrition-scan-edit-grid">
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

                    {scanResult.notes ? <p className="nutrition-scan-note">{scanResult.notes}</p> : null}
                  </div>
                </details>

                <div className="nutrition-sheet-actions nutrition-scan-final-actions">
                  <button
                    type="button"
                    className="nutrition-secondary-button"
                    onClick={saveScannedMealAsReusable}
                    disabled={scanSavedAsReusable}
                  >
                    {scanSavedAsReusable ? <BookmarkCheck/> : <BookmarkPlus/>}
                    {scanSavedAsReusable ? 'Saved' : 'Save meal'}
                  </button>
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
              const serving = detail?.servings?.find(
                (item) =>
                  String(item.servingId) ===
                  String(selectedFatSecretServingId),
              )
              const servingBasis = resolveFoodServingBasis(serving ?? {})
              const countBasis = resolveFoodServingCountBasis(serving ?? {})
              const supportsWeight =
                servingBasis?.unit === FOOD_MEASURE_UNIT.GRAM ||
                servingBasis?.unit === FOOD_MEASURE_UNIT.OUNCE
              const measuredQuantity = foodMeasureMultiplier({
                amount: Number(fatSecretMeasureAmount),
                unit: fatSecretMeasureUnit,
                servingBasis: resolveFoodMeasureBasisForUnit({
                  unit: fatSecretMeasureUnit,
                  weightBasis: servingBasis,
                  countBasis,
                }),
              })
              const quantity =
                Number.isFinite(measuredQuantity) && measuredQuantity > 0
                  ? measuredQuantity
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

                {(detail?.servings ?? []).length > 1 ? <div className="nutrition-serving-picker">
                  <span>Serving options</span>
                  <div>{(detail?.servings ?? []).map((option) => <button key={option.servingId} className={String(selectedFatSecretServingId) === String(option.servingId) ? 'active' : ''} onClick={() => {
                    const optionCountBasis = resolveFoodServingCountBasis(option)
                    setSelectedFatSecretServingId(option.servingId)
                    setFatSecretMeasureUnit(
                      optionCountBasis
                        ? FOOD_MEASURE_UNIT.ITEM
                        : FOOD_MEASURE_UNIT.SERVING,
                    )
                    setFatSecretMeasureAmount(
                      optionCountBasis ? String(optionCountBasis.amount) : '1',
                    )
                    setFatSecretQuantity('1')
                  }}>{option.description}</button>)}</div>
                </div> : null}

                <section className="nutrition-measure-control">
                  <div className="nutrition-measure-tabs" role="group" aria-label="Amount unit">
                    <button type="button" className={fatSecretMeasureUnit === FOOD_MEASURE_UNIT.SERVING ? 'active' : ''} onClick={() => {
                      setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
                      setFatSecretMeasureAmount('1')
                    }}>Serving</button>
                    {countBasis ? <button type="button" className={fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? 'active' : ''} onClick={() => {
                      setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
                      setFatSecretMeasureAmount(String(countBasis.amount))
                    }}>{countBasis.label}</button> : null}
                    {supportsWeight ? <>
                      <button type="button" className={fatSecretMeasureUnit === FOOD_MEASURE_UNIT.GRAM ? 'active' : ''} onClick={() => {
                        setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.GRAM)
                        setFatSecretMeasureAmount(weightAmountForUnitSwitch(fatSecretMeasureAmount, fatSecretMeasureUnit, FOOD_MEASURE_UNIT.GRAM, String(FOOD_MEASURE_UNIT.GRAM === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>g</button>
                      <button type="button" className={fatSecretMeasureUnit === FOOD_MEASURE_UNIT.OUNCE ? 'active' : ''} onClick={() => {
                        setFatSecretMeasureUnit(FOOD_MEASURE_UNIT.OUNCE)
                        setFatSecretMeasureAmount(weightAmountForUnitSwitch(fatSecretMeasureAmount, fatSecretMeasureUnit, FOOD_MEASURE_UNIT.OUNCE, String(FOOD_MEASURE_UNIT.OUNCE === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>oz</button>
                    </> : null}
                  </div>
                  <label>
                    <span>{
                      fatSecretMeasureUnit === FOOD_MEASURE_UNIT.SERVING
                        ? 'Servings eaten'
                        : fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                          ? `${countBasis?.singularLabel ?? 'Item'} count`
                          : 'Weight eaten'
                    }</span>
                    <div className="nutrition-measure-input">
                      <input
                        type="number"
                        min="0.01"
                        step={
                          fatSecretMeasureUnit === FOOD_MEASURE_UNIT.SERVING
                            ? '0.25'
                            : fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                              ? '1'
                              : '0.1'
                        }
                        value={fatSecretMeasureAmount}
                        onChange={(event) => {
                          setFatSecretMeasureAmount(event.target.value)
                          if (fatSecretMeasureUnit === FOOD_MEASURE_UNIT.SERVING) {
                            setFatSecretQuantity(event.target.value)
                          }
                        }}
                        inputMode="decimal"
                      />
                      <strong>{
                        fatSecretMeasureUnit === FOOD_MEASURE_UNIT.SERVING
                          ? 'serving'
                          : fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                            ? countBasis?.label ?? 'items'
                            : fatSecretMeasureUnit
                      }</strong>
                    </div>
                    {fatSecretMeasureUnit === FOOD_MEASURE_UNIT.ITEM && countBasis ? <small className="nutrition-portion-intelligence">
                      {foodMeasureDisplay({ amount: Number(fatSecretMeasureAmount), unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: countBasis.label })} = {servingFractionDisplay(quantity)}
                    </small> : null}
                  </label>
                  {countBasis ? <small>
                    1 serving = {foodMeasureDisplay({ amount: countBasis.amount, unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: countBasis.label })}.
                  </small> : servingBasis ? <small>
                    1 serving = {foodMeasureDisplay({ amount: servingBasis.amount, unit: servingBasis.unit })}. Macros scale to the exact amount you enter.
                  </small> : <small>This food only has serving-based nutrition from the database.</small>}
                </section>

                <div className="nutrition-sheet-actions">
                  <button className="nutrition-secondary-button" onClick={() => toggleFavorite(selectedFood)}>{favoriteIds.includes(selectedFood.id) ? <BookmarkCheck/> : <BookmarkPlus/>}{favoriteIds.includes(selectedFood.id) ? 'Favorited' : 'Favorite'}</button>
                  <button
                    className="gold-button machined"
                    disabled={
                      !selectedFatSecretServingId ||
                      !Number.isFinite(quantity) ||
                      quantity <= 0
                    }
                    onClick={addFatSecretFood}
                  >
                    <Plus/>Add to Today
                  </button>
                </div>
                <p className="nutrition-fatsecret-detail-note">Verified serving nutrition stays linked to FatSecret while AVAREN records the exact amount you actually ate.</p>
              </>
            })() : (() => {
              const servingBasis = resolveFoodServingBasis(selectedFood)
              const countBasis = resolveFoodServingCountBasis(selectedFood)
              const supportsWeight =
                servingBasis?.unit === FOOD_MEASURE_UNIT.GRAM ||
                servingBasis?.unit === FOOD_MEASURE_UNIT.OUNCE
              const measuredMultiplier =
                selectedMeasureUnit === FOOD_MEASURE_UNIT.SERVING
                  ? selectedMultiplier
                  : foodMeasureMultiplier({
                      amount: Number(selectedMeasureAmount),
                      unit: selectedMeasureUnit,
                      servingBasis: resolveFoodMeasureBasisForUnit({
                        unit: selectedMeasureUnit,
                        weightBasis: servingBasis,
                        countBasis,
                      }),
                    })
              const multiplier =
                Number.isFinite(measuredMultiplier) && measuredMultiplier > 0
                  ? measuredMultiplier
                  : 0
              const measurement = {
                amount:
                  selectedMeasureUnit === FOOD_MEASURE_UNIT.SERVING
                    ? selectedMultiplier
                    : Number(selectedMeasureAmount),
                unit: selectedMeasureUnit,
                servingAmount:
                  selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                    ? countBasis?.amount ?? 1
                    : servingBasis?.amount ?? 1,
                servingUnit:
                  selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                    ? FOOD_MEASURE_UNIT.ITEM
                    : servingBasis?.unit ?? FOOD_MEASURE_UNIT.SERVING,
                itemLabel:
                  selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM
                    ? countBasis?.label ?? 'items'
                    : '',
              }

              return <>
                <div className="nutrition-sheet-macros">
                  <article><span>Calories</span><strong>{Math.round(Number(selectedFood.calories || 0) * multiplier)}</strong></article>
                  <article><span>Protein</span><strong>{round(Number(selectedFood.protein || 0) * multiplier)}g</strong></article>
                  <article><span>Carbs</span><strong>{round(Number(selectedFood.carbs || 0) * multiplier)}g</strong></article>
                  <article><span>Fat</span><strong>{round(Number(selectedFood.fat || 0) * multiplier)}g</strong></article>
                </div>
                {(selectedFood.servingOptions ?? []).length > 1 ? <div className="nutrition-serving-picker">
                  <span>Serving options</span>
                  <div>{selectedFood.servingOptions.map((option) => <button key={`${option.label}-${option.multiplier}`} className={selectedMeasureUnit === FOOD_MEASURE_UNIT.SERVING && selectedMultiplier === option.multiplier ? 'active' : ''} onClick={() => {
                    setSelectedMultiplier(option.multiplier)
                    setSelectedMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
                    setSelectedMeasureAmount(String(option.multiplier))
                  }}>{option.label}</button>)}</div>
                </div> : null}

                {(supportsWeight || countBasis) ? <section className="nutrition-measure-control">
                  <div className="nutrition-measure-tabs" role="group" aria-label="Amount unit">
                    <button type="button" className={selectedMeasureUnit === FOOD_MEASURE_UNIT.SERVING ? 'active' : ''} onClick={() => {
                      setSelectedMeasureUnit(FOOD_MEASURE_UNIT.SERVING)
                      setSelectedMeasureAmount(String(selectedMultiplier))
                    }}>Serving</button>
                    {countBasis ? <button type="button" className={selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? 'active' : ''} onClick={() => {
                      setSelectedMeasureUnit(FOOD_MEASURE_UNIT.ITEM)
                      setSelectedMeasureAmount(String(countBasis.amount))
                    }}>{countBasis.label}</button> : null}
                    {supportsWeight ? <button type="button" className={selectedMeasureUnit === FOOD_MEASURE_UNIT.GRAM ? 'active' : ''} onClick={() => {
                      setSelectedMeasureUnit(FOOD_MEASURE_UNIT.GRAM)
                      setSelectedMeasureAmount(weightAmountForUnitSwitch(selectedMeasureAmount, selectedMeasureUnit, FOOD_MEASURE_UNIT.GRAM, String(FOOD_MEASURE_UNIT.GRAM === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>g</button> : null}
                    {supportsWeight ? <button type="button" className={selectedMeasureUnit === FOOD_MEASURE_UNIT.OUNCE ? 'active' : ''} onClick={() => {
                      setSelectedMeasureUnit(FOOD_MEASURE_UNIT.OUNCE)
                      setSelectedMeasureAmount(weightAmountForUnitSwitch(selectedMeasureAmount, selectedMeasureUnit, FOOD_MEASURE_UNIT.OUNCE, String(FOOD_MEASURE_UNIT.OUNCE === FOOD_MEASURE_UNIT.GRAM ? Math.round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.GRAM ? 1 : 28.3495)) : round(Number(servingBasis.amount) * (servingBasis.unit === FOOD_MEASURE_UNIT.OUNCE ? 1 : 1 / 28.3495)))))
                    }}>oz</button> : null}
                  </div>
                  {selectedMeasureUnit !== FOOD_MEASURE_UNIT.SERVING ? <label>
                    <span>{selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? `${countBasis?.singularLabel ?? 'Item'} count` : 'Weight eaten'}</span>
                    <div className="nutrition-measure-input">
                      <input type="number" min={selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? '1' : '0.1'} step={selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? '1' : '0.1'} value={selectedMeasureAmount} onChange={(event) => setSelectedMeasureAmount(event.target.value)} inputMode="decimal"/>
                      <strong>{selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM ? countBasis?.label ?? 'items' : selectedMeasureUnit}</strong>
                    </div>
                    {selectedMeasureUnit === FOOD_MEASURE_UNIT.ITEM && countBasis ? <small className="nutrition-portion-intelligence">
                      {foodMeasureDisplay({ amount: Number(selectedMeasureAmount), unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: countBasis.label })} = {servingFractionDisplay(multiplier)}
                    </small> : null}
                  </label> : null}
                  <small>{countBasis
                    ? `1 serving = ${foodMeasureDisplay({ amount: countBasis.amount, unit: FOOD_MEASURE_UNIT.ITEM, itemLabel: countBasis.label })}.`
                    : `1 serving = ${foodMeasureDisplay({ amount: servingBasis.amount, unit: servingBasis.unit })}.`
                  }</small>
                </section> : null}

                <div className="nutrition-sheet-actions">
                  <button className="nutrition-secondary-button" onClick={() => toggleFavorite(selectedFood)}>{favoriteIds.includes(selectedFood.id) ? <BookmarkCheck/> : <BookmarkPlus/>}{favoriteIds.includes(selectedFood.id) ? 'Favorited' : 'Favorite'}</button>
                  <button
                    className="gold-button machined"
                    disabled={!Number.isFinite(multiplier) || multiplier <= 0}
                    onClick={() =>
                      addFood(
                        {
                          ...selectedFood,
                          servings: multiplier,
                          measurement,
                        },
                        selectedFood.sourceLabel === 'Saved' ? 'saved' : 'catalog',
                      )
                    }
                  ><Plus/>Add to Today</button>
                </div>
              </>
            })()}
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
        <header><div><span className="eyebrow">LIBRARY</span><h2>Your saved meals.</h2><p>Reusable meals and recipes first. Build something new only when you need to.</p></div></header>

        <details className="nutrition-recipe-builder nutrition-recipe-builder--collapsed">
          <summary>
            <div><ChefHat size={19}/><span><strong>Create a recipe</strong><small>Open the builder only when you need it.</small></span></div>
            <Plus size={17}/>
          </summary>
          <div className="nutrition-recipe-builder-body">
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
          </div>
        </details>

        <section className="nutrition-saved-recipes">
          <header><div><span className="eyebrow">YOUR RECIPES</span><h2>{(nutrition.recipes ?? []).length ? `${nutrition.recipes.length} saved` : 'No recipes yet'}</h2></div></header>
          <div className="nutrition-recipe-list">
            {(nutrition.recipes ?? []).map((recipe) => {
              const servings = Math.max(1, Number(recipe.servings || 1))
              const totals = recipe.totals ?? { calories: recipe.calories, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat, fiber: recipe.fiber }
              const remainingServings = Number(recipe.remainingServings ?? recipe.servings ?? 0)
              return <article key={recipe.id} className={`nutrition-recipe-card${recipe.reusableMeal ? ' is-reusable-meal' : ''}`}>
                <header>
                  <div>
                    <strong>{recipe.name}</strong>
                    <span>
                      {recipe.reusableMeal
                        ? `AVA reusable meal · ${Math.round(Number(totals.calories || 0))} cal`
                        : `${servings} serving batch · ${Math.round(Number(totals.calories || 0) / servings)} cal per serving`}
                    </span>
                  </div>
                  {recipe.reusableMeal ? <Sparkles size={19}/> : <PackageCheck size={19}/>}
                </header>

                {recipe.reusableMeal ? (
                  <div className="nutrition-reusable-meal-summary">
                    <span>{(recipe.ingredients ?? []).length ? `${recipe.ingredients.length} remembered components` : 'Saved macro estimate'}</span>
                    {recipe.context ? <small>{recipe.context}</small> : null}
                  </div>
                ) : (
                  <div className="nutrition-recipe-inventory"><span>Remaining</span><strong>{round(remainingServings)} <small>of {servings}</small></strong><ProgressBar value={remainingServings} goal={servings}/></div>
                )}

                <div className="nutrition-recipe-card-actions">
                  {recipe.reusableMeal ? (
                    <>
                      <button onClick={() => logRecipe(recipe, 1)}><Plus size={15}/>Log Again</button>
                      <button onClick={() => openReusableMealAdjuster(recipe)}><Scale size={15}/>Adjust & Log</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setRecipeLogTarget(recipe); setRecipeLogAmount(1) }}><Plus size={15}/>Log Portion</button>
                      <button onClick={() => resetRecipeBatch(recipe)}><RotateCcw size={15}/>New Batch</button>
                    </>
                  )}
                  <button onClick={() => duplicateRecipe(recipe)}><Copy size={15}/>Duplicate</button>
                  <button className="danger" onClick={() => deleteRecipe(recipe)}><Trash2 size={15}/>Delete</button>
                </div>
              </article>
            })}
          </div>
        </section>

        {reusableMealLogTarget && <div className="nutrition-food-sheet-backdrop" data-app-ui-backdrop="open" onClick={() => {
          setReusableMealLogTarget(null)
          setReusableMealWorkingIngredients([])
          setReusableMealAdjustments([])
          setReusableIngredientSearch('')
          setReusableIngredientResults([])
        }}>
          <section className="nutrition-food-sheet nutrition-reusable-meal-sheet" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="eyebrow">ADJUST & LOG</span>
                <h2>{reusableMealLogTarget.name}</h2>
                <p>Change what was different today. AVAREN rescales each measurable ingredient before logging.</p>
              </div>
              <button onClick={() => {
                setReusableMealLogTarget(null)
                setReusableMealWorkingIngredients([])
                setReusableMealAdjustments([])
                setReusableIngredientSearch('')
                setReusableIngredientResults([])
              }}><X size={18}/></button>
            </header>

            <div className="nutrition-reusable-adjustments">
              {reusableMealWorkingIngredients.length ? reusableMealWorkingIngredients.map((ingredient) => {
                const adjustment = reusableMealAdjustments.find((item) => item.id === ingredient.id)
                const measured = ingredient.baseAmount != null && ingredient.baseUnit
                return <article key={ingredient.id}>
                  <div>
                    <strong>{ingredient.name}</strong>
                    <small>{ingredient.amount || 'AVA estimate'} · {Math.round(Number(ingredient.calories || 0))} cal baseline</small>
                  </div>
                  <div className="nutrition-reusable-adjustment-input">
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      inputMode="decimal"
                      value={adjustment?.amount ?? ''}
                      onChange={(event) => setReusableMealAdjustments((current) =>
                        current.map((item) =>
                          item.id === ingredient.id
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )}
                    />
                    {measured ? (
                      <select
                        value={adjustment?.unit ?? ingredient.baseUnit}
                        onChange={(event) => setReusableMealAdjustments((current) =>
                          current.map((item) =>
                            item.id === ingredient.id
                              ? { ...item, unit: event.target.value }
                              : item,
                          ),
                        )}
                      >
                        <option value="g">g</option>
                        <option value="oz">oz</option>
                      </select>
                    ) : (
                      <strong>×</strong>
                    )}
                  </div>
                  <button
                    type="button"
                    className="nutrition-reusable-remove"
                    aria-label={`Remove ${ingredient.name}`}
                    onClick={() => removeReusableMealIngredient(ingredient.id)}
                  >
                    <Trash2 size={15}/>
                  </button>
                </article>
              }) : <div className="nutrition-empty compact"><Utensils/><p>No ingredients in this version yet.</p></div>}
            </div>

            <section className="nutrition-reusable-add">
              <div>
                <span className="eyebrow">ADD INGREDIENT</span>
                <strong>Search AVAREN foods</strong>
                <small>Add something that is in today’s version but not the saved meal.</small>
              </div>
              <div className="nutrition-reusable-add-search">
                <Search size={16}/>
                <input
                  value={reusableIngredientSearch}
                  onChange={(event) => setReusableIngredientSearch(event.target.value)}
                  placeholder="Try cheese, Greek yogurt, avocado..."
                />
              </div>
              {reusableIngredientSearchState === 'loading' ? (
                <small className="nutrition-reusable-search-status">Searching verified foods…</small>
              ) : null}
              {reusableIngredientResults.length ? (
                <div className="nutrition-reusable-add-results">
                  {reusableIngredientResults.map((food) => (
                    <button
                      type="button"
                      key={`${food.sourceLabel ?? 'food'}-${food.id ?? food.name}`}
                      onClick={() => void addReusableMealIngredient(food)}
                    >
                      <span>
                        <strong>{food.name}</strong>
                        <small>{food.serving ?? '1 serving'} · {food.sourceLabel ?? food.brand ?? 'AVAREN'}</small>
                      </span>
                      <Plus size={15}/>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            {reusableMealPreview ? <div className="nutrition-sheet-macros">
              <article><span>Calories</span><strong>{Math.round(Number(reusableMealPreview.totals.calories || 0))}</strong></article>
              <article><span>Protein</span><strong>{round(reusableMealPreview.totals.protein)}g</strong></article>
              <article><span>Carbs</span><strong>{round(reusableMealPreview.totals.carbs)}g</strong></article>
              <article><span>Fat</span><strong>{round(reusableMealPreview.totals.fat)}g</strong></article>
            </div> : null}

            <div className="nutrition-reusable-final-actions">
              <button
                type="button"
                className="nutrition-secondary-button"
                onClick={updateSavedReusableMeal}
                disabled={!reusableMealWorkingIngredients.length}
              >
                <Save size={16}/>
                Update saved meal
              </button>
              <button
                className="gold-button machined"
                onClick={logAdjustedReusableMeal}
                disabled={!reusableMealWorkingIngredients.length}
              >
                <Plus/>
                Add adjusted meal
              </button>
            </div>
          </section>
        </div>}

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
        <header><div><span className="eyebrow">LAST 7 DAYS</span><h2>Your nutrition rhythm</h2><p>Start with the weekly pattern. Deeper adjustment details stay below.</p></div></header>
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
