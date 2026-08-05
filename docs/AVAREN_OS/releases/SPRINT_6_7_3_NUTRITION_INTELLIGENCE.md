# Sprint 6.7.3 — Nutrition Intelligence

## Product
- Expanded built-in catalog to more than 150 common, restaurant, supplement, and meal entries.
- Added category browsing, favorites, recent foods, and improved search ranking.
- Added a food detail sheet with selectable serving sizes and live macro scaling.
- Added one-tap logging from the food detail sheet.

## UX
- Default food logging remains search-first.
- Favorites and recent foods rise to the top automatically.
- Manual macro entry remains behind Create Custom Food.
- Added a persistent Log Food quick action.

## Engineering
- Favorites and recent food IDs are stored inside the account-scoped nutrition state.
- Food catalog entries use normalized categories, keywords, and serving multipliers.
- No database migration is required because the existing nutrition profile payload stores these fields.
