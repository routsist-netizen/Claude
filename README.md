# Προζύμι — sourdough companion

A mobile-first web app for home bread bakers (mainly sourdough), in Greek. Three tools share the same recipe data:

1. **Recipe calculator**: baker's percentages → exact grams, live. It handles flour blends picked from a catalogue of Swiss flours (Weissmehl, Halbweissmehl, Ruchmehl, Vollkornmehl, Dinkel, Roggen… with a suggested hydration for the blend) or any custom flour, levain (with its own flour and water subtracted so the final hydration is exact), optional yeast and inclusions. Recipes can be saved, edited and duplicated.
2. **Backwards baking schedule**: pick a recipe, the time you want bread out of the oven and your kitchen temperature. The app works backwards through every step, scales fermentation to temperature, flags steps between 23:00 and 07:00, and suggests a cold retard or a shifted bake time. You can export the plan to your calendar (`.ics`) or get in-app notifications.
3. **Bake journal**: logs each bake with a snapshot of the recipe, actual times and temperatures per step, notes, crust and crumb photos, and a 1–5 rating. It also has a starter feeding log and a stats view relating bulk time, hydration and temperature to your ratings.

Four example recipes (country sourdough, Ruchbrot, 20% whole wheat, focaccia) are built in and marked "Παράδειγμα".

## Stack

Everything runs on **Netlify**. There is no other service to sign up for.

| Part | What |
|---|---|
| Frontend | Vite + React + TypeScript, hand-written CSS (`src/styles.css`) |
| API | One Netlify Function, `netlify/functions/api.ts` → `server/api.ts` |
| Database & photos | [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (enabled automatically, free tier) |
| Accounts | Username + password (scrypt-hashed), signed HttpOnly session cookie |
| Tests | Vitest |

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

That's it. `@netlify/vite-plugin` emulates the Function and Blobs inside the Vite dev server, and local data is stored in `.netlify/` (git-ignored). Create an account on the login screen. You don't need a Netlify account for local development.

Other commands:

```bash
npm test             # calculator, schedule, stats and API tests
npm run typecheck
npm run build        # production build into dist/
```

## Deploy to Netlify

1. Push this repository to GitHub.
2. In Netlify, choose **Add new site → Import an existing project** and pick the repo.
   The build settings come from `netlify.toml` (`npm run build`, publish `dist`, functions in `netlify/functions`), so leave them as they are.
3. Click **Deploy**. Blobs storage is provisioned automatically.

Every push to the main branch redeploys. The free tier is plenty for personal use.

### Environment variables

None are required.

| Variable | Required | Purpose |
|---|---|---|
| `PROZYMI_SECRET` | no | Secret used to sign session cookies. If unset, a random one is generated on first use and stored in Blobs. Set it only if you want to control it; changing it logs everyone out. |

## Notes and limits

- **Privacy is basic by design.** Each user's data is stored under their own key prefix and the API only serves the logged-in user's records, but there is no email, password reset or admin panel. If someone forgets their password, a new account is the fix.
- Photos are resized in the browser (≤1600 px JPEG) before upload.
- Notifications fire only while the app is open in a tab. For reliable reminders on a phone, use the `.ics` export.
- Data is kept in Blobs under the store name `prozymi`. You can browse it under **Netlify → Site → Blobs**.

## How the numbers work

**Calculator** (`src/domain/recipe.ts`): every percentage is relative to the *total* flour, including the flour inside the levain.

```
total flour   F = dough weight / (1 + hydration + salt + yeast + Σ inclusions)
levain        L = F × levain%
levain flour    = L / (1 + levain hydration),  levain water = L − levain flour
flour to add    = F − levain flour,            water to add = F × hydration − levain water
```

The levain flour is taken from the flour you feed it with (selectable), or spread across the blend.

**Schedule** (`src/domain/schedule.ts`): base durations are for a "standard" dough at 24 °C with 20% levain and no yeast. Fermentation steps (levain, bulk, room-temperature proof) scale by

```
duration(T) = base × 2.5 ^ ((24 − T) / 10)      (Q10 ≈ 2.5)
```

Bulk and proof also scale with the amount of levain, `(20 / levain%)^0.35`, and with commercial yeast, `1 / (1 + 1.5 × yeast%)`. Mixing, shaping, preheat and bake are fixed. A cold retard has a fixed length that you choose. Every base duration is editable per recipe under **Χρόνοι βημάτων**.

## Project layout

```
src/domain/     pure logic + tests (recipe, schedule, ics, stats, journal, examples)
src/i18n/el.ts  every Greek UI string, in one place
src/pages/      screens (Recipes, RecipeEditor, Schedule, Journal, BakeDetail, Stats, Login)
src/components/ shared controls (number steppers, stars, icons)
server/         API handler, auth and storage adapter (+ tests)
netlify/        the Netlify Function entry point
```

## Adding English

Copy `src/i18n/el.ts` to `src/i18n/en.ts`, type it as `Messages` (`const en: Messages = { ... }`) and translate it; TypeScript will point out anything missing. Then select it in `src/i18n/index.ts`, for example from a setting or `navigator.language`.
