# Hevy AI Coach - v4 Hybrid

An automated AI training plan generator that integrates with the [Hevy](https://hevy.com) fitness app. It reads your athlete profile and current 1RM data from Google Sheets, generates a personalized weekly training plan using Google Gemini, and pushes the plan directly into your existing Hevy routines via the Hevy API.

## How It Works

1. **Google Sheets** stores your profile (bodyweight, age, gender, injuries, other sports), tracks the current training week, and holds your calculated 1RM values.
2. **Workout history** is fetched from Hevy to calculate estimated 1RM (E-1RM) with a time-decay penalty (stale lifts count less).
3. **Gemini AI** receives your full profile, periodization rules, routine templates with injected 1RM values, and recent history — then generates a precise training plan in JSON format.
4. **Hevy API** receives the generated plan via PUT requests, updating your existing routines directly in the app.

## Key Features

- **Live 1RM injection** — AI sees your real E-1RM values per exercise and calculates working weights from them precisely, rounded to 2.5 kg.
- **Adaptive rep ranges** — Weight and rep count are linked: higher intensity → lower rep targets. Follows Prilepin-style logic.
- **Smart Catalog & Auto-Progression** — When you hit the rep threshold on a bodyweight exercise (e.g. pull-ups, push-ups), the system automatically upgrades you to the weighted variant and calculates the belt weight.
- **Deload Filter** — If the previous week was a deload, the last 7 days of history are stripped before the AI runs, so it plans from your peak-phase maxes, not your intentionally reduced deload loads.
- **Isometric / Cardio support** — Plank, Dead Hang, and similar exercises use `duration_seconds` instead of reps.
- **Mandatory warm-up** — No workout can start cold. Every routine carries a general warm-up block (cardio, joint prep, activation) in its notes, and every loaded exercise gets ramp-up sets forced in by the writer: 3 for heavy barbell lifts (40/60/80%), 2 for weighted bodyweight, 1 for machines. Template warm-ups are a floor, never a ceiling — they are never removed.
- **Menstrual cycle scaling** — Optional. With `CYCLE_TRACKING` on, the system resolves the current cycle phase and autoregulates the session: working weights are scaled (−10% during menstruation, −7% in the late luteal/PMS phase, +2% around ovulation), RPE is capped, accessory volume trimmed, and rest extended. The scaling is applied deterministically by the system after the AI output, so it can never be applied twice. Phase multipliers live in `config/cycle_profile.json`.
- **Auto week advance** — After you approve the plan, the week counter in Google Sheets increments by 1.

---

## Prerequisites

- Node.js 20+
- A [Hevy](https://hevy.com) account with API access (`HEVY_API_KEY`)
- A Google Cloud project with the **Google Sheets API** enabled
- A Google service account with a `google-credentials.json` key file
- A Google Gemini API key (`GOOGLE_GENAI_API_KEY`)
- A Google Spreadsheet set up with the required structure (see below)

---

## Setup

### 1. Clone the repository and install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```
HEVY_API_KEY=your_hevy_api_key
GOOGLE_GENAI_API_KEY=your_gemini_api_key
SPREADSHEET_ID=your_google_spreadsheet_id
```

### 3. Add `google-credentials.json`

Place your Google service account key file at the root of the project as `google-credentials.json`. This file is required for local runs. For GitHub Actions, it is injected from a secret at runtime (see the [GitHub Actions](#github-actions) section).

### 4. Set up your Google Spreadsheet

The spreadsheet must have three sheets with the following structure:

**Config sheet** (columns A and B, starting from row 2):

| Key | Value |
|---|---|
| CURRENT_WEEK | 1 |
| HEVY_FOLDER_ID | your_hevy_folder_id |
| BODYWEIGHT | 85 |
| AGE | 30 |
| GENDER | male |
| OTHER_SPORTS | none |
| INJURIES | none |
| CYCLE_TRACKING | no |
| CYCLE_LENGTH | 28 |
| LAST_PERIOD_START | 2026-10-28 |
| CYCLE_PHASE_OVERRIDE | *(leave empty)* |

**Menstrual cycle keys (optional):**

- `CYCLE_TRACKING` — `yes` turns the scaling on. Anything else leaves training untouched.
- `CYCLE_LENGTH` — Your average cycle length in days (20–45 supported, defaults to 28).
- `LAST_PERIOD_START` — First day of your most recent period, as `YYYY-MM-DD` (`DD.MM.YYYY` also works). **Keep this up to date** — once it is older than two cycle lengths the scaling switches itself off rather than guessing, and the coach tells you why on the next run.
- `CYCLE_PHASE_OVERRIDE` — For irregular cycles or when you just know better: set one of `menstrual`, `follicular`, `ovulatory`, `early_luteal`, `late_luteal` to pin the phase manually. It overrides the date calculation entirely. Leave empty for automatic tracking.

**Plan sheet** (columns A, B, C — one row per week, starting from row 2):

| Week | Phase | Notes |
|---|---|---|
| 1 | Accumulation | Focus on volume |
| 2 | Accumulation | ... |

**1RM sheet** — Written automatically by the coach on each run. Columns: `Exercise`, `Current_1RM_kg`, `Date_Updated`, `Hevy_ID`, `Source_Calculation`.

### 5. Set up your local periodization plan

Edit `config/training_plan.json` to define your 12-week periodization cycle. Each week entry needs: `phase`, `intensity`, `rpeTarget`, `volumeWeight`, and optionally `note`.

### 6. (Optional) Run the Smart Catalog discovery

The Smart Catalog maps bodyweight exercises to their weighted variants for auto-progression. Run this once, then update whenever you add new exercises:

```bash
node runDiscovery.js
```

This downloads your exercise templates from Hevy, sends them to Gemini for biomechanical family analysis, and saves the result to `config/smart_catalog.json`.

---

## Running the Coach

```bash
node coach.js
# or
npm start
```

The coach will:
1. Read your profile and bodyweight from Google Sheets
2. Sync and recalculate 1RM values from your Hevy workout history
3. Re-read the updated 1RM data from Sheets
4. Load the periodization plan and Smart Catalog from disk
5. Fetch your recent workout history from Hevy (with deload filtering)
6. Download your routine templates from the target Hevy folder
7. Inject current 1RM values into each exercise
8. Generate a training plan via Gemini AI
9. Export each routine as a JSON file to `/exports`
10. Print a summary table to the terminal
11. Ask: **"Upload to Hevy and advance week? (yes/no)"**

Answering `yes` uploads all routines to Hevy and increments the week counter in Google Sheets.

---

## Utilities

### Sync 1RM only (without generating a plan)

```bash
npm run sync-1rm
# or
node utils/sync_1rm.js
```

Requires `HEVY_API_KEY`, `SPREADSHEET_ID`, and `BODYWEIGHT` to be passed as environment variable or set in `.env`. Fetches the last 6 months of workout history, calculates E-1RM with time decay, and writes results to the `1RM` sheet.

### Download exercise templates

```bash
node utils/sync_templates.js
```

Downloads all exercise templates from Hevy and saves them to `templates_db.json`. Required before running discovery.

### First-time setup wizard

```bash
node utils/onboarding.js
```

Interactive CLI wizard that creates your `.env` file and `config/user_db.json` by asking for API keys, athlete profile, and target Hevy folder.

---

## GitHub Actions

The workflow at `.github/workflows/pondeli.yml` can be triggered manually (e.g. from your phone via the GitHub mobile app using the "Run workflow" button).

**Required GitHub repository secrets:**

| Secret name | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `HEVY_API_KEY` | Your Hevy API key |
| `SPREADSHEET_ID` | Your Google Spreadsheet ID |
| `GOOGLE_CREDENTIALS_JSON` | Full contents of your `google-credentials.json` file |

The workflow automatically approves the upload step (`echo "yes"`) so the plan is pushed to Hevy without manual interaction.

---

## Project Structure

```
coach.js                  — Main orchestrator
writer.js                 — Transforms AI output to Hevy JSON files
uploader.js               — Uploads /exports files to Hevy via PUT
runDiscovery.js           — Runs Smart Catalog discovery
services/
  aiService.js            — Gemini AI integration and prompt assembly
  hevyService.js          — Hevy API wrapper (routines, history, update)
  sheetsService.js        — Google Sheets read/write
  storageService.js       — Local JSON file fallback (unused in v4)
  discoveryService.js     — Exercise family discovery via AI
utils/
  sync_1rm.js             — 1RM calculation and Sheets sync
  sync_templates.js       — Hevy exercise template downloader
  onboarding.js           — First-time setup wizard
  cycle.js                — Menstrual cycle phase resolution and load scaling
  warmup.js               — Mandatory warm-up protocol and ramp-up set generation
  exercise_tier.js        — Progression tier classification (shared by coach and writer)
config/
  training_plan.json      — 12-week periodization plan
  smart_catalog.json      — Exercise family map (generated by discovery)
  cycle_profile.json      — Cycle phase definitions and multipliers (editable)
  warmup_protocol.json    — General warm-up text and per-tier ramp-up rules (editable)
prompts/
  role.txt                — AI coach persona
  safety.txt              — CNS safety rules and weight calculation
  progression.txt         — Smart Catalog upgrade logic
  components.txt          — Mandatory training components
  warmup.txt              — Mandatory warm-up requirements
  cycle.txt               — Menstrual cycle coaching rules
  output.txt              — JSON output format rules
  discovery.txt           — Exercise family discovery prompt
exports/                  — Generated routine JSON files (gitignored)
templates_db.json         — Cached Hevy exercise templates (gitignored)
```
