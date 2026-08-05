import { ArrowRight, Droplets, Goal, Scale, Utensils } from 'lucide-react'

export default function NutritionPreviewScreen() {
  return (
    <div className="nutrition-preview-screen">
      <header>
        <span className="eyebrow">NUTRITION</span>
        <h1>Nutrition is becoming a core AVAREN pillar.</h1>
        <p>This destination is now reserved for daily food, macro, water, weight, recipe, and progress tracking—whether you train alone or with a coach.</p>
      </header>

      <section className="nutrition-preview-hero">
        <div className="nutrition-preview-ring">
          <strong>6.7</strong>
          <span>Next system</span>
        </div>
        <div>
          <span className="eyebrow">FOUNDATION READY</span>
          <h2>Built for fast daily use.</h2>
          <p>The first release will focus on accurate tracking, saved foods, recipes, hydration, weight, and optional coach visibility.</p>
        </div>
      </section>

      <section className="nutrition-preview-grid">
        <article><Utensils size={20}/><strong>Food Log</strong><span>Calories and macros</span></article>
        <article><Droplets size={20}/><strong>Water</strong><span>Fast bottle shortcuts</span></article>
        <article><Scale size={20}/><strong>Weight</strong><span>Trends and averages</span></article>
        <article><Goal size={20}/><strong>Goals</strong><span>Personal targets</span></article>
      </section>

      <div className="nutrition-preview-note">
        <strong>Next build:</strong>
        <span>Nutrition Coach Foundation</span>
        <ArrowRight size={16}/>
      </div>
    </div>
  )
}
