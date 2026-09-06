# AVA Food Vision — Future Contract (9.3)

**Status:** Architecture note only. **Not implemented in 9.0.**

## Goal

Future AVA food vision must log through the **same canonical nutrition pipeline** as manual and text-based AVA logging. Photo-derived values are never nutrition truth until the athlete confirms them.

## Two distinct modes

### A. Nutrition label scan

1. Athlete captures a package nutrition label photo.
2. AVA extracts structured fields:
   - serving size
   - calories
   - protein
   - carbohydrates
   - fat
   - servings count (when present)
3. Athlete confirms quantity consumed.
4. Confirmed result enters the existing nutrition log write path.

### B. Meal photo estimate

1. Athlete captures a meal photo (example: grilled chicken + white rice).
2. AVA identifies likely foods and estimates portion sizes/macros.
3. Output is explicitly labeled **estimate**.
4. Athlete can:
   - accept
   - change portions
   - edit foods
5. Only confirmed structured output is logged.

Example UX copy:

> Looks like: Grilled chicken + white rice  
> Estimated: 610 cal · 52g protein · 64g carbs · 14g fat  
> [Looks right] [Change portions] [Edit foods]

## Canonical logging contract

Future vision flows must produce the same payload shape used by current nutrition logging:

```ts
{
  foodName: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbohydrates: number
  fat: number
  source: 'ava_confirmed' | 'manual'
  confidence?: 'estimate' | 'label_scan'
  capturedAt?: string
}
```

Rules:

- Do **not** create a separate `photo_food_logs` table.
- Do **not** treat model output as persisted truth.
- Confirmation step is mandatory for both modes.
- Label scan may start with higher confidence than meal estimate, but still requires confirmation.

## Integration points (current codebase)

- Nutrition state: `src/lib/nutrition.js`
- AVA nutrition pipeline: `src/ava/avaNutrition*.js`
- Existing food candidates/refinement helpers should accept structured confirmed payloads from vision.

## Non-goals for 9.3 design

- No automatic logging from camera alone
- No separate analytics stream for photo entries
- No coach-facing food vision in v1 of the feature
