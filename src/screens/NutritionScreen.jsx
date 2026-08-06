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
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  DEFAULT_NUTRITION_GOALS,
  emptyNutritionDay,
  nutritionDateKey,
  nutritionTotals,
  remainingNutrition,
} from '../lib/nutrition'
import { COMMON_FOODS, FOOD_CATEGORIES } from '../data/commonFoods'
import { appUi } from '../lib/appUi'

const tabs = [
  { label: 'Today', value: 'Today' },
  { label: 'Meals', value: 'Meals' },
  { label: 'Library', value: 'Library' },
  { label: 'Insights', value: 'Insights' },
]
const blankFood = { name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servings: 1 }

const round = (value) => Math.round(Number(value || 0) * 10) / 10

const ProgressBar = ({ value, goal }) => {
  const percent = Math.max(0, Math.min(100, goal ? (value / goal) * 100 : 0))
  return <span className="nutrition-progress"><i style={{ width: `${percent}%` }} /></span>
}

export default function NutritionScreen({ nutrition, onChange }) {
  const [tab, setTab] = useState('Today')
  const [date, setDate] = useState(nutritionDateKey())
  const [foodDraft, setFoodDraft] = useState(blankFood)
  const [foodSearch, setFoodSearch] = useState('')
  const [showCustomFood, setShowCustomFood] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedMultiplier, setSelectedMultiplier] = useState(1)
  const [foodCategory, setFoodCategory] = useState('All')
  const [recipeDraft, setRecipeDraft] = useState({ name: '', servings: 4, ingredients: [] })
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeLogTarget, setRecipeLogTarget] = useState(null)
  const [recipeLogAmount, setRecipeLogAmount] = useState(1)
  const [notice, setNotice] = useState('')

  const goals = { ...DEFAULT_NUTRITION_GOALS, ...(nutrition?.goals ?? {}) }
  const day = nutrition?.days?.[date] ?? emptyNutritionDay(date)
  const totals = useMemo(() => nutritionTotals(day), [day])
  const remaining = useMemo(() => remainingNutrition(goals, totals, day), [goals, totals, day])
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

  const weeklyInsights = useMemo(() => {
    const today = new Date(`${nutritionDateKey()}T12:00:00`)
    const days = Array.from({ length: 7 }, (_, index) => {
      const current = new Date(today)
      current.setDate(today.getDate() - (6 - index))
      const key = nutritionDateKey(current)
      const entry = nutrition?.days?.[key] ?? emptyNutritionDay(key)
      const totalsForDay = nutritionTotals(entry)
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
  }, [nutrition?.days, goals.protein, goals.waterOz])

  const patch = (updater) => onChange((current) => {
    const base = current ?? { goals: DEFAULT_NUTRITION_GOALS, days: {}, savedFoods: [], recipes: [], recentFoodIds: [], favoriteFoodIds: [] }
    return typeof updater === 'function' ? updater(base) : updater
  })

  const patchDay = (updater) => patch((current) => {
    const currentDay = current.days?.[date] ?? emptyNutritionDay(date)
    const nextDay = typeof updater === 'function' ? updater(currentDay) : updater
    return { ...current, days: { ...(current.days ?? {}), [date]: nextDay } }
  })

  const addFood = (food, source = 'manual') => {
    if (!food.name.trim()) return setNotice('Add a food name first.')
    const servings = Number(food.servings || 1)
    const entry = {
      id: crypto.randomUUID(),
      source,
      name: food.name.trim(),
      servings,
      calories: round(Number(food.calories || 0) * servings),
      protein: round(Number(food.protein || 0) * servings),
      carbs: round(Number(food.carbs || 0) * servings),
      fat: round(Number(food.fat || 0) * servings),
      fiber: round(Number(food.fiber || 0) * servings),
      loggedAt: new Date().toISOString(),
    }
    patch((current) => {
      const currentDay = current.days?.[date] ?? emptyNutritionDay(date)
      const foodId = food.id ?? `${source}:${food.name}`
      return {
        ...current,
        recentFoodIds: [foodId, ...(current.recentFoodIds ?? []).filter((id) => id !== foodId)].slice(0, 30),
        days: {
          ...(current.days ?? {}),
          [date]: { ...currentDay, foods: [...(currentDay.foods ?? []), entry] },
        },
      }
    })
    setFoodDraft(blankFood)
    setFoodSearch('')
    setSelectedFood(null)
    setSelectedMultiplier(1)
    setNotice(`${entry.name} added to today.`)
    setTab('Today')
  }

  const saveFood = () => {
    if (!foodDraft.name.trim()) return setNotice('Add a food name first.')
    const saved = { ...foodDraft, id: crypto.randomUUID(), servings: 1 }
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

  const openFood = (food) => {
    setSelectedFood(food)
    setSelectedMultiplier(1)
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
          id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
    const servings = Math.max(1, Number(recipe.servings || 1))
    const multiplier = Math.max(0.01, Number(amount || 1))
    const totals = recipe.totals ?? (recipe.ingredients ?? []).reduce(
      (sum, item) => ({
        calories: sum.calories + Number(item.calories || 0) * Number(item.multiplier || 1),
        protein: sum.protein + Number(item.protein || 0) * Number(item.multiplier || 1),
        carbs: sum.carbs + Number(item.carbs || 0) * Number(item.multiplier || 1),
        fat: sum.fat + Number(item.fat || 0) * Number(item.multiplier || 1),
        fiber: sum.fiber + Number(item.fiber || 0) * Number(item.multiplier || 1),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    )
    addFood({
      id: recipe.id,
      name: recipe.name,
      calories: Number(totals.calories || 0) / servings,
      protein: Number(totals.protein || 0) / servings,
      carbs: Number(totals.carbs || 0) / servings,
      fat: Number(totals.fat || 0) / servings,
      fiber: Number(totals.fiber || 0) / servings,
      servings: multiplier,
    }, 'recipe')
    patch((current) => ({
      ...current,
      recipes: (current.recipes ?? []).map((item) =>
        item.id === recipe.id
          ? { ...item, remainingServings: Math.max(0, round(Number(item.remainingServings ?? item.servings ?? 0) - multiplier)), updatedAt: new Date().toISOString() }
          : item,
      ),
    }))
    setRecipeLogTarget(null)
    setRecipeLogAmount(1)
  }

  const addWater = (ounces) => patchDay((current) => ({ ...current, waterOz: round(Number(current.waterOz || 0) + ounces) }))

  const changeDate = (offset) => {
    const next = new Date(`${date}T12:00:00`)
    next.setDate(next.getDate() + offset)
    setDate(nutritionDateKey(next))
  }

  return (
    <div className="nutrition-screen">
      <header className="nutrition-screen-header">
        <div><span className="eyebrow">NUTRITION</span><h1>Today’s Nutrition</h1><p>Everything important today, with deeper tools one tap away.</p></div>
        <button onClick={() => setTab('Goals')}><Settings2 size={18}/>Goals</button>
      </header>

      <nav className="nutrition-tabs">
        {tabs.map((item) => <button key={item.value} className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label}</button>)}
      </nav>

      {notice && <div className="nutrition-notice">{notice}</div>}

      {tab === 'Today' && <>
        <div className="nutrition-date-switcher"><button onClick={() => changeDate(-1)}><ChevronLeft/></button><strong>{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</strong><button disabled={date === nutritionDateKey()} onClick={() => changeDate(1)}><ChevronRight/></button></div>

        <section className="nutrition-calorie-hero">
          <div><span className="eyebrow">CALORIES REMAINING</span><strong>{Math.round(remaining.calories)}</strong><small>{Math.round(totals.calories)} eaten · {Math.round(Number(goals.calories) + Number(day.workoutCalories || 0))} budget</small></div>
          <ProgressBar value={totals.calories} goal={Number(goals.calories) + Number(day.workoutCalories || 0)} />
        </section>

        <section className="nutrition-macro-grid">
          {[['Protein', totals.protein, goals.protein, 'g'], ['Carbs', totals.carbs, goals.carbs, 'g'], ['Fat', totals.fat, goals.fat, 'g'], ['Fiber', totals.fiber, goals.fiber, 'g']].map(([label,value,goal,unit]) => <article key={label}><span>{label}</span><strong>{round(value)}<small> / {goal}{unit}</small></strong><ProgressBar value={value} goal={goal}/></article>)}
        </section>

        <section className="nutrition-quick-grid">
          <button onClick={() => setTab('Meals')}><Plus/><strong>Log Food</strong><span>Manual, saved, or recent</span></button>
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8))}><Droplets/><strong>1 Bottle</strong><span>{goals.bottleOz} oz</span></button>
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8) / 2)}><Droplets/><strong>½ Bottle</strong><span>{round(Number(goals.bottleOz || 33.8) / 2)} oz</span></button>
          <button onClick={() => setTab('Goals')}><Scale/><strong>Log Weight</strong><span>{day.weight || 'Add today’s weight'}</span></button>
        </section>

        <section className="nutrition-hydration-card"><div><Droplets/><span><strong>Hydration</strong><small>{round(day.waterOz)} of {goals.waterOz} oz</small></span></div><ProgressBar value={day.waterOz} goal={goals.waterOz}/></section>

        <section className="nutrition-food-log">
          <header><div><span className="eyebrow">FOOD LOG</span><h2>{day.foods.length ? `${day.foods.length} items` : 'Nothing logged yet'}</h2></div><button onClick={() => setTab('Meals')}><Plus/>Add</button></header>
          {day.foods.length ? day.foods.map((food) => <article key={food.id}><div><strong>{food.name}</strong><span>{food.calories} cal · P {food.protein} · C {food.carbs} · F {food.fat}</span></div><button onClick={() => patchDay((current) => ({ ...current, foods: current.foods.filter((item) => item.id !== food.id) }))}><Trash2 size={16}/></button></article>) : <div className="nutrition-empty"><Utensils/><p>Log your first meal to start today’s dashboard.</p></div>}
        </section>
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
          {foodSearch && <button aria-label="Clear search" onClick={() => setFoodSearch('')}><X size={17}/></button>}
        </div>

        <div className="nutrition-search-tools">
          <span><Sparkles size={15}/>Nutrition is filled in for you</span>
          <button onClick={() => setShowCustomFood((value) => !value)}>{showCustomFood ? 'Hide custom food' : '+ Create Custom Food'}</button>
        </div>

        {!showCustomFood && <>
          <div className="nutrition-category-strip">
            {['All', 'Favorites', ...FOOD_CATEGORIES].map((category) => (
              <button key={category} className={foodCategory === category ? 'active' : ''} onClick={() => setFoodCategory(category)}>{category}</button>
            ))}
          </div>
          <div className="nutrition-food-results">
            {foodMatches.length ? foodMatches.map((food) => (
              <article key={`${food.sourceLabel}-${food.id ?? food.name}`}>
                <button className="nutrition-food-result-main" onClick={() => openFood(food)}>
                  <span className="nutrition-food-result-copy">
                    <strong>{food.name}</strong>
                    <small>{food.serving ?? '1 serving'} · {food.category ?? food.sourceLabel}</small>
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

        {selectedFood && <div className="nutrition-food-sheet-backdrop" onClick={() => setSelectedFood(null)}>
          <section className="nutrition-food-sheet" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">FOOD DETAIL</span><h2>{selectedFood.name}</h2><p>{selectedFood.brand} · values are per listed serving</p></div>
              <button onClick={() => setSelectedFood(null)}><X size={18}/></button>
            </header>
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
          </section>
        </div>}

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

        {recipeLogTarget && <div className="nutrition-food-sheet-backdrop" onClick={() => setRecipeLogTarget(null)}>
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
        <section className="nutrition-coaching-insight"><Sparkles size={18}/><div><strong>{weeklyInsights.proteinDays >= 5 ? 'Protein consistency is strong.' : 'Protein is the clearest opportunity.'}</strong><span>{weeklyInsights.proteinDays >= 5 ? 'Keep the same routine and focus on consistency.' : `You reached at least 90% of your protein goal on ${weeklyInsights.proteinDays} days.`}</span></div></section>
        <details className="nutrition-history-disclosure"><summary><History size={17}/>View daily history</summary><div className="nutrition-history-list">{Object.values(nutrition.days ?? {}).sort((a,b)=>b.date.localeCompare(a.date)).map((entry)=>{const t=nutritionTotals(entry);return <article key={entry.date}><div><strong>{new Date(`${entry.date}T12:00:00`).toLocaleDateString()}</strong><span>{entry.foods.length} foods · {round(entry.waterOz)} oz water</span></div><div><strong>{Math.round(t.calories)} cal</strong><span>{round(t.protein)}g protein</span></div></article>})}</div></details>
      </section>}

      {tab === 'Goals' && <section className="nutrition-panel">
        <header><div><span className="eyebrow">PERSONAL TARGETS</span><h2>Nutrition goals</h2></div></header>
        <div className="nutrition-food-form">
          {['calories','protein','carbs','fat','fiber','waterOz','bottleOz','weightGoal'].map((field)=><label key={field}><span>{field}</span><input type="number" value={goals[field]} onChange={(e)=>patch((current)=>({...current,goals:{...goals,[field]:e.target.value}}))}/></label>)}
          <label className="wide nutrition-toggle"><span><strong>Share nutrition with connected coach</strong><small>Optional. AVAREN works fully without a coach.</small></span><input type="checkbox" checked={Boolean(goals.coachAccess)} onChange={(e)=>patch((current)=>({...current,goals:{...goals,coachAccess:e.target.checked}}))}/></label>
          <label><span>Today’s weight</span><input type="number" step="0.1" value={day.weight} onChange={(e)=>patchDay((current)=>({...current,weight:e.target.value}))}/></label>
          <label><span>Workout calories</span><input type="number" value={day.workoutCalories} onChange={(e)=>patchDay((current)=>({...current,workoutCalories:e.target.value}))}/></label>
        </div>
      </section>}
      {tab !== 'Meals' && <button className="nutrition-fab" onClick={() => setTab('Meals')}><Plus size={20}/><span>Log Food</span></button>}
    </div>
  )
}
