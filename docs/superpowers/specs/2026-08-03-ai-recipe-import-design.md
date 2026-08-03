# AI Recipe Import (Gemini)

## Context

The user wants to add AI assistance to the recipe app, starting with "smart import": paste text, a URL, or a PDF/DOC, and have an AI extract and structure a complete bilingual recipe draft, landing in the existing edit form for review before saving - the same "AI fills it in, human can edit" pattern already used for the auto-translate feature.

This must be built as a **reusable Gemini integration**, not a one-off endpoint. The user explicitly wants Gemini for future features too: chatting about a recipe/recipes, auto-validating recipe quality, and more not yet specified. The design below establishes a shared, generic Gemini client that future features build on without re-architecting.

Google Gemini's free tier (Flash/Flash-Lite models via a Google AI Studio API key) was chosen over running a local model (the user has Ollama available) because it requires no local infrastructure, needs no vision model (photo OCR is explicitly out of scope - see below), and is free at this app's personal-use scale (a few requests per day, comfortably inside the free tier's daily quota).

**Explicitly out of scope for this spec:**
- Vision/photo-based extraction (OCR-ing a recipe photo). The user considered this and deferred it - photo upload in the import flow is the existing plain photo-upload feature, unrelated to Gemini.
- Chat-about-a-recipe and AI recipe-quality validation. These are future features the user named as "more to come" - this spec only builds the shared Gemini client they'll sit on top of, not the features themselves.

## Architecture

### 1. Shared Gemini module - `api/src/ai/`

A new NestJS module, structurally parallel to the existing `api/src/translations/` module (a thin wrapper service + no feature logic of its own).

- **Package:** `@google/genai` (Google's current official Node.js SDK for the Gemini API), added to `api/package.json`.
- **`GeminiService`** (`api/src/ai/gemini.service.ts`):
  - Constructed with the API key from `ConfigService` (`GEMINI_API_KEY`), read once in the constructor - if unset, the service still constructs (doesn't crash app boot) but throws a clear error the first time any method is called, matching the existing `TranslationsService` pattern of failing soft at the edges.
  - `async generateStructured<T>(prompt: string, schema: object): Promise<T>` - calls Gemini with `responseMimeType: 'application/json'` and the given JSON Schema as `responseSchema`, parses and returns the JSON response typed as `T`. This is the method the recipe-import feature uses.
  - `async generateText(prompt: string): Promise<string>` - plain text generation, no schema. Not used by this spec's feature, but exists now so a future chat feature doesn't need to touch `GeminiService` itself, only add its own module that calls this method.
  - Model: a current Flash-tier model (e.g. `gemini-2.5-flash`), configured as a single constant in this service - not per-caller, since every current and near-future use case is fine with Flash-tier quality/cost.
  - No caching in this service (unlike `TranslationsService`'s Redis cache for repeated identical strings) - recipe imports are one-off by nature, and adding caching here would be premature for a shared client that doesn't yet know what future callers need.

### 2. Recipe import feature - `api/src/recipes/import/`

A focused sub-module under the existing recipes area (not its own top-level NestJS module, since it's tightly coupled to the `Recipe` shape and only the recipes domain uses it).

- **`POST /recipes/import`** - accepts `{ text?: string; url?: string }` in the JSON body, or a PDF/DOC file via `multipart/form-data` (reusing the existing authenticated-upload pattern from `uploads.controller.ts` for the multipart handling itself). Exactly one of `text`, `url`, or a file must be provided; validated with `class-validator` at the DTO level, returning 400 if zero or more than one is given.
- **`RecipeImportService`**:
  - **Text input:** passed to Gemini as-is.
  - **URL input:** server-side `fetch` of the page. First checks for a `<script type="application/ld+json">` block containing schema.org `Recipe` structured data - if found, this is parsed directly into the recipe shape with **no Gemini call at all** (exact, free, instant). If not found (or parsing fails), the HTML is stripped to readable text (tags/scripts/styles removed) and that text is sent to Gemini exactly like pasted text.
  - **PDF/DOC input:** raw text extracted via `pdf-parse` (PDF) or `mammoth` (`.docx`) - both added as new `api/package.json` dependencies - then treated like pasted text. `.doc` (legacy binary format) is explicitly unsupported; the upload UI only accepts `.pdf` and `.docx`.
  - Once normalized to plain text (or already fully parsed from JSON-LD), builds a single prompt instructing Gemini to extract a complete bilingual recipe and calls `GeminiService.generateStructured<ImportedRecipeDto>(prompt, recipeJsonSchema)` in one shot - title/titleHe, description/descriptionEn, category, difficulty, cuisine, prepTime/cookTime/servings, tags/tagsEn, tips/tipsEn, ingredients (each with name/nameEn/amount/unit), steps (each with instruction/instructionEn/timerMinutes) - matching the existing `Recipe`/`IngredientGroup`/`StepGroup` shapes field-for-field, so the response can be handed to the frontend and slotted directly into `RecipeForm`'s existing state shape with no field mapping/renaming.
  - Returns the structured draft directly in the response (not saved to the database yet) - the frontend pre-fills the existing create-recipe form with it, and the recipe is only persisted when the user actually saves, identical to today's manual-entry flow.
  - Errors (bad URL/unreachable page, unparseable file, Gemini quota exceeded, Gemini returning malformed output) are caught and returned as a specific 4xx/5xx with a message the frontend can show inline - never a silent failure.

### 3. Frontend flow

- **"New Recipe" button** now offers a small choice instead of navigating straight to the blank form: **Start from scratch** (today's behavior, unchanged) or **Import with AI** (new).
- **Import screen** (new component, e.g. `RecipeImportPage.tsx`): a text area (paste anything), a URL input, a PDF/DOC file picker, and a photo picker (reusing the existing photo-upload widget from `RecipeForm.tsx` as-is) - all optional except at least one text/url/file source is required to enable the "Extract" button.
- On submit: calls `POST /recipes/import`, shows a loading state (this can take several seconds - Gemini calls aren't instant), then on success navigates to `RecipeForm` in create mode with its state pre-populated from the response (title, titleHe, ingredients, steps, etc. all pre-filled exactly as if the user had typed them) plus the uploaded photo URL if one was provided. The user reviews/edits every field before the first save, exactly like today.
- On failure: inline error message with the specific reason (e.g. "Couldn't reach that URL", "Gemini is temporarily unavailable, try again"), and a way to retry or fall back to **Start from scratch**.

## Configuration

- New env var `GEMINI_API_KEY`, sourced from a free Google AI Studio API key, stored as a new k8s sealed secret (`recipes-api-gemini` or added to the existing `recipes-api-clerk`-style per-concern secret pattern already used in this repo) and wired into the `recipes-api` deployment, mirroring how `CLERK_SECRET_KEY` etc. are already provisioned.
- No new secret needed for the frontend - all Gemini calls happen server-side; the API key never reaches the browser.

## Testing

- `GeminiService`: unit tests mocking the `@google/genai` client, verifying `generateStructured` parses and returns typed JSON, and that a missing API key throws a clear error rather than crashing silently.
- `RecipeImportService`: unit tests for each input path (JSON-LD found and parsed with no Gemini call; JSON-LD absent falls back to Gemini; PDF/DOC text extraction; Gemini error propagation), each with `GeminiService` mocked - no real network/API calls in tests.
- Frontend: at minimum, manual verification of the full flow (paste a real recipe URL, confirm the form pre-fills correctly) before considering this done, per this project's existing practice of testing UI changes in a browser.

## Error handling summary

| Failure | User-facing behavior |
|---|---|
| No source provided | 400, "Provide text, a URL, or a file" - button stays disabled client-side too |
| URL unreachable / non-HTML response | 400-level error, "Couldn't reach that page" |
| PDF/DOCX unparseable or empty | 400-level error, "Couldn't read that file" |
| Gemini quota/rate limit hit | 429 passed through, "AI import is temporarily unavailable, try again shortly" |
| Gemini returns malformed/non-conforming JSON | 502-level error, "Extraction failed, try again or fill in manually" |
