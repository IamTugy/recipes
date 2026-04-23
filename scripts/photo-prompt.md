# Recipe Illustration Prompt

Used by `generate-images.mjs` to generate anime/watercolor recipe illustrations via Pollinations.ai (flux model).

Style matches the Ghibli-inspired site redesign: chalky watercolor, muted pastels, ingredients-only composition.

## Prompt Template

```
Anime-style food illustration, Studio Ghibli inspired, soft watercolor and gouache textures,
chalky muted pastel palette, warm natural lighting, hand-painted look with visible brush strokes,
top-down three-quarter view of the finished dish on a simple ceramic plate or bowl,
against a cream linen or chalky off-white paper background.
Dish: {TITLE}.
Show ONLY these ingredients, appetizingly arranged: {INGREDIENTS}.
No text, no labels, no utensils, no hands, no extra garnish that is not listed.
Cozy, detailed but clean, subtle steam if the dish is hot. Square composition,
soft edges, slightly desaturated, dreamy atmosphere. No photorealism.
```

## Variables
- `{TITLE}` — `recipe.titleEn ?? recipe.title`
- `{INGREDIENTS}` — flattened `ingredients[].items[].nameEn ?? name`, parenthetical notes stripped, deduped, capped at 14 items.

## Workflow
1. Dry run to inspect prompts: `node scripts/generate-images.mjs --dry-run --limit=5`
2. Small batch to review: `node scripts/generate-images.mjs --limit=5`
3. Inspect `public/images/*.jpg` and the patched YAML `image:` fields
4. Full run: `node scripts/generate-images.mjs`
