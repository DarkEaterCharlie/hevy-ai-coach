require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const { getSheetsData, incrementWeek } = require("./services/sheetsService");
const {
  getFolderRoutines,
  getLastWorkouts,
} = require("./services/hevyService");
const { generateTrainingPlan } = require("./services/aiService");
const { exportPlanToHevyFiles } = require("./writer");
const { syncExportsToHevy } = require("./uploader");
const { sync1RMToSheets } = require("./utils/sync_1rm");

async function runModularCoach() {
  console.log("🤖 START: Initializing Hybrid AI Coach (v5 Powerbuilding)...\n");

  try {
    // 1. Read user profile and bodyweight from Google Sheets
    console.log(
      "📊 [Module: Sheets] Reading profile and bodyweight from Google Sheets...",
    );
    let sheetsData = await getSheetsData(process.env.SPREADSHEET_ID);

    // 2. Sync 1RM calculations using the bodyweight from Sheets
    console.log(
      `🔄 [Module: Sync 1RM] Recalculating maxes for bodyweight ${sheetsData.bodyweight} kg...`,
    );
    await sync1RMToSheets(sheetsData.bodyweight);
    console.log(
      "✅ [Module: Sync 1RM] Maxes updated and written to spreadsheet!\n",
    );

    // 3. Re-read Sheets to give the AI freshly calculated 1RM values
    console.log(
      "📊 [Module: Sheets] Loading freshly updated 1RM data for AI...",
    );
    sheetsData = await getSheetsData(process.env.SPREADSHEET_ID);

    // 4. Load local periodization plan from disk
    console.log("📂 [Module: Storage] Reading static periodization plan...");
    const planPath = path.join(__dirname, "./config/training_plan.json");
    const trainingPlan = JSON.parse(fs.readFileSync(planPath, "utf-8"));

    // Get rules for the current week (fallback to week 1 if not found)
    const periodization =
      trainingPlan.weeks[String(sheetsData.currentWeek)] ||
      trainingPlan.weeks["1"];

    // Load Smart Catalog for exercise progression
    console.log(
      "📖 [Module: Storage] Reading Smart Catalog (exercise progression)...",
    );
    const catalogPath = path.join(__dirname, "./config/smart_catalog.json");
    let smartCatalog = [];
    if (fs.existsSync(catalogPath)) {
      smartCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
    }

    console.log("📜 [Module: Hevy] Analyzing recent workout history...");
    const rawHistory = await getLastWorkouts(process.env.HEVY_API_KEY, 10);

    // --- DELOAD FILTER ---
    let history = rawHistory;
    const prevWeek = sheetsData.currentWeek - 1;

    if (prevWeek > 0 && trainingPlan.weeks[String(prevWeek)]) {
      const prevPhase = trainingPlan.weeks[String(prevWeek)].phase;

      if (prevPhase.toLowerCase().includes("deload")) {
        console.log(
          "⚠️ [Deload Filter] Previous week was DELOAD. Removing last 7 days from AI history...",
        );
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        history = rawHistory.filter((w) => w.timestamp < sevenDaysAgo);
      }
    }

    // 🔥 TADY BYL TEN ZTRACENÝ ŘÁDEK
    console.log(
      `🏋️ [Module: Hevy] Downloading routine templates from folder: ${sheetsData.targetFolderId}...`,
    );
    const routines = await getFolderRoutines(
      process.env.HEVY_API_KEY,
      sheetsData.targetFolderId,
    );

    // ADDED: Load database for exercise categorization
    const templatesArray = JSON.parse(
      fs.readFileSync(path.join(__dirname, "./templates_db.json"), "utf-8"),
    );
    const templatesMap = {};
    templatesArray.forEach((t) => (templatesMap[t.id] = t));

    console.log(
      "🛠️ [Module: Transform] Injecting 1RM and Progression Tiers into exercises...",
    );
    const routinesWith1RM = routines.map((routine) => ({
      routine_name: routine.routine_name,
      routine_id: routine.routine_id,
      exercises: routine.exercises.map((exercise) => {
        const template = templatesMap[exercise.hevy_id] || {};

        // --- AI CATEGORIZATION LOGIC ---
        let tier = "ISOLATION_MACHINE"; // Default for machines, dumbbells, and CORE

        if (template.primary_muscle_group === "cardio") {
          tier = "CARDIO_IGNORE"; // AI will ignore this
        } else if (template.type === "bodyweight_weighted") {
          tier = "WEIGHTED_BODYWEIGHT";
        } else if (
          template.type === "reps_only" &&
          (template.equipment === "none" || template.equipment === "suspension")
        ) {
          tier = "PURE_BODYWEIGHT";
        } else if (
          template.equipment === "barbell" &&
          [
            "chest",
            "shoulders",
            "quadriceps",
            "glutes",
            "hamstrings",
            "upper_back",
            "lats",
          ].includes(template.primary_muscle_group)
        ) {
          tier = "HEAVY_COMPOUND";
        }

        return {
          name: exercise.name,
          hevy_id: exercise.hevy_id,
          prescribed_sets: exercise.prescribed_sets,
          warmup_sets: exercise.warmup_sets,
          current_1rm_kg: sheetsData.user1RM[exercise.hevy_id] || 0,
          progression_tier: tier, // 🔥 Passing the exact instruction to the AI
        };
      }),
    }));

    // Generate training plan via AI
    console.log("🧠 [Module: AI] Generating training plan...");
    const plan = await generateTrainingPlan({
      currentWeek: sheetsData.currentWeek,
      periodization: periodization,
      phase: periodization.phase,
      // Merge notes from local JSON and Google Sheets
      rules: periodization.note || sheetsData.currentRules,
      history: history,
      routines: routinesWith1RM,
      bodyweight: sheetsData.bodyweight,
      age: sheetsData.age,
      gender: sheetsData.gender,
      otherSports: sheetsData.otherSports,
      injuries: sheetsData.injuries,
      smartCatalog: smartCatalog,
    });

    // Export plan to Hevy-compatible files and print summary
    await exportPlanToHevyFiles(plan, routines);
    printPlanLocally(plan);

    // Interactive approval and upload
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("---");
    rl.question(
      `❓ Plan is ready. Upload to Hevy and advance week to ${sheetsData.currentWeek + 1}? (yes/no): `,
      async (answer) => {
        if (answer.toLowerCase() === "yes") {
          console.log("\n🚀 Starting upload...");

          await syncExportsToHevy(process.env.HEVY_API_KEY);
          await incrementWeek(
            process.env.SPREADSHEET_ID,
            sheetsData.currentWeek,
          );

          console.log(
            "✅ Routines synced to Hevy and week counter updated in spreadsheet.",
          );
        } else {
          console.log(
            "ℹ️ Upload cancelled. Files remain in /exports for manual upload.",
          );
        }
        rl.close();
        console.log("\n👋 AI Coach session complete.");
      },
    );
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    if (error.stack) console.error(error.stack);
  }
}

function printPlanLocally(plan) {
  if (!plan || !plan.weekly_plan) {
    console.log("⚠️ No plan to display.");
    return;
  }

  console.log(`\n🏆 AI COACH PLAN PROPOSAL:`);
  console.log(`🗣️ ${plan.coach_message}\n`);

  plan.weekly_plan.forEach((workout) => {
    console.log(`--- 🏋️ ${workout.workout_name} ---`);

    const rows = workout.exercises.map((ex) => {
      const normalSets = ex.sets.filter((s) => s.type === "normal");
      const warmupSets = ex.sets.filter((s) => s.type === "warmup");

      // Build weight display (single value or range if sets differ)
      const weights = normalSets.map((s) => s.weight_kg);
      const weightDisplay =
        weights.length > 0
          ? Math.min(...weights) === Math.max(...weights)
            ? `${weights[0]} kg`
            : `${Math.min(...weights)} - ${Math.max(...weights)} kg`
          : "0 kg";

      // Build RPE display
      const rpes = normalSets.map((s) => s.rpe).filter((r) => r != null);
      const rpeDisplay = rpes.length > 0 ? rpes.join(" / ") : "-";

      return {
        "Exercise (ID)": ex.exercise_template_id,
        Warmup: warmupSets.length > 0 ? `${warmupSets.length}x` : "-",
        Sets: normalSets.length,
        Reps: normalSets[0]?.reps || 0,
        "Weight (Work)": weightDisplay,
        RPE: rpeDisplay,
        Notes: ex.notes || "",
      };
    });

    console.table(rows);
    console.log("\n");
  });
}

runModularCoach();
