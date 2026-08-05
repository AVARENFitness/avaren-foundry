import {
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
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

const tabs = ['Today', 'Foods', 'Recipes', 'History', 'Goals']
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
  const [recipeDraft, setRecipeDraft] = useState({ name: '', servings: 4, calories: '', protein: '', carbs: '', fat: '', fiber: '' })
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

  const addWater = (ounces) => patchDay((current) => ({ ...current, waterOz: round(Number(current.waterOz || 0) + ounces) }))

  const changeDate = (offset) => {
    const next = new Date(`${date}T12:00:00`)
    next.setDate(next.getDate() + offset)
    setDate(nutritionDateKey(next))
  }

  return (
    <div className="nutrition-screen">
      <header className="nutrition-screen-header">
        <div><span className="eyebrow">NUTRITION</span><h1>Today’s Nutrition</h1><p>Fast daily tracking for solo athletes and coached clients.</p></div>
        <button onClick={() => setTab('Goals')}><Settings2 size={18}/>Goals</button>
      </header>

      <nav className="nutrition-tabs">
        {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
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
          <button onClick={() => setTab('Foods')}><Plus/><strong>Log Food</strong><span>Manual, saved, or recent</span></button>
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8))}><Droplets/><strong>1 Bottle</strong><span>{goals.bottleOz} oz</span></button>
          <button onClick={() => addWater(Number(goals.bottleOz || 33.8) / 2)}><Droplets/><strong>½ Bottle</strong><span>{round(Number(goals.bottleOz || 33.8) / 2)} oz</span></button>
          <button onClick={() => setTab('Goals')}><Scale/><strong>Log Weight</strong><span>{day.weight || 'Add today’s weight'}</span></button>
        </section>

        <section className="nutrition-hydration-card"><div><Droplets/><span><strong>Hydration</strong><small>{round(day.waterOz)} of {goals.waterOz} oz</small></span></div><ProgressBar value={day.waterOz} goal={goals.waterOz}/></section>

        <section className="nutrition-food-log">
          <header><div><span className="eyebrow">FOOD LOG</span><h2>{day.foods.length ? `${day.foods.length} items` : 'Nothing logged yet'}</h2></div><button onClick={() => setTab('Foods')}><Plus/>Add</button></header>
          {day.foods.length ? day.foods.map((food) => <article key={food.id}><div><strong>{food.name}</strong><span>{food.calories} cal · P {food.protein} · C {food.carbs} · F {food.fat}</span></div><button onClick={() => patchDay((current) => ({ ...current, foods: current.foods.filter((item) => item.id !== food.id) }))}><Trash2 size={16}/></button></article>) : <div className="nutrition-empty"><Utensils/><p>Log your first meal to start today’s dashboard.</p></div>}
        </section>
      </>}

      {tab === 'Foods' && <section className="nutrition-panel nutrition-quick-log-panel">
        <header><div><span className="eyebrow">QUICK LOG</span><h2>What did you have?</h2><p>Search a common food, choose something saved, or create a custom item only when needed.</p></div></header>

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

      {tab === 'Recipes' && <section className="nutrition-panel">
        <header><div><span className="eyebrow">RECIPES & BATCHES</span><h2>Save meals once. Log portions later.</h2></div></header>
        <div className="nutrition-food-form">
          <label className="wide"><span>Recipe name</span><input value={recipeDraft.name} onChange={(e)=>setRecipeDraft({...recipeDraft,name:e.target.value})}/></label>
          {['servings','calories','protein','carbs','fat','fiber'].map((field)=><label key={field}><span>{field}</span><input type="number" value={recipeDraft[field]} onChange={(e)=>setRecipeDraft({...recipeDraft,[field]:e.target.value})}/></label>)}
        </div>
        <button className="gold-button machined" onClick={()=>{ if(!recipeDraft.name.trim()) return; const recipe={...recipeDraft,id:crypto.randomUUID()}; patch((current)=>({...current,recipes:[recipe,...(current.recipes??[])]})); setRecipeDraft({name:'',servings:4,calories:'',protein:'',carbs:'',fat:'',fiber:''}) }}><Save/>Save Recipe</button>
        <div className="nutrition-recipe-list">{(nutrition.recipes??[]).map((recipe)=><article key={recipe.id}><div><strong>{recipe.name}</strong><span>{recipe.servings} servings · {recipe.calories} calories total</span></div><button onClick={()=>addFood({name:recipe.name,calories:Number(recipe.calories)/Number(recipe.servings||1),protein:Number(recipe.protein)/Number(recipe.servings||1),carbs:Number(recipe.carbs)/Number(recipe.servings||1),fat:Number(recipe.fat)/Number(recipe.servings||1),fiber:Number(recipe.fiber)/Number(recipe.servings||1),servings:1},'recipe')}>Log serving</button></article>)}</div>
      </section>}

      {tab === 'History' && <section className="nutrition-panel">
        <header><div><span className="eyebrow">HISTORY</span><h2>Daily nutrition</h2></div></header>
        <div className="nutrition-history-list">{Object.values(nutrition.days ?? {}).sort((a,b)=>b.date.localeCompare(a.date)).map((entry)=>{const t=nutritionTotals(entry);return <article key={entry.date}><div><strong>{new Date(`${entry.date}T12:00:00`).toLocaleDateString()}</strong><span>{entry.foods.length} foods · {round(entry.waterOz)} oz water</span></div><div><strong>{Math.round(t.calories)} cal</strong><span>{round(t.protein)}g protein</span></div></article>})}</div>
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
      {tab !== 'Foods' && <button className="nutrition-fab" onClick={() => setTab('Foods')}><Plus size={20}/><span>Log Food</span></button>}
    </div>
  )
}
