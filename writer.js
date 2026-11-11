const fs = require("fs");
const path = require("path");
const { getProgressionTier } = require("./utils/exercise_tier");
const {
  loadWarmupProtocol,
  buildGeneralWarmupText,
  ensureWarmupSets,
} = require("./utils/warmup");
const {
  applyCycleScaling,
  applyCycleVolume,
  describeCycleState,
} = require("./utils/cycle");

const templatesMap = {};
if (fs.existsSync("./templates_db.json")) {
  JSON.parse(fs.readFileSync("./templates_db.json", "utf-8")).forEach(
    (t) => (templatesMap[t.id] = t),
  );
}

/**
 * Writer Module (v4 Hybrid)
 * Transforms AI plan into Hevy-ready files.
 * Ensures: English labels, original exercise order, and superset rest logic.
 */
async function exportPlanToHevyFiles(aiPlan, originalRoutines, cycleState) {
  console.log(
    "📂 [Module: Writer] Exporting routines to /exports (English labels)...",
  );
  const dir = "./exports";
  const warmupProtocol = loadWarmupProtocol();
  const generalWarmup = buildGeneralWarmupText(warmupProtocol);
  const cycleSummary = describeCycleState(cycleState);

  if (cycleSummary) {
    console.log(`🌙 [Writer] Applying cycle autoregulation - ${cycleSummary}`);
  }

  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir);

  // Iterate through original routines to preserve exercise sequence
  for (const sourceRoutine of originalRoutines) {
    // Match AI workout by name (using English keys from v4)
    const aiWorkout = aiPlan.weekly_plan.find(
      (t) =>
        t.workout_name.toLowerCase() ===
        sourceRoutine.routine_name.toLowerCase(),
    );

    if (!aiWorkout) {
      console.warn(
        `⚠️ [Writer] Workout for "${sourceRoutine.routine_name}" not found in AI output.`,
      );
      continue;
    }

    let warmupsInjected = 0;

    const normalizedExercises = sourceRoutine.exercises
      .map((origEx, index) => {
        const aiEx = aiWorkout.exercises.find(
          (e) => e.exercise_template_id === origEx.hevy_id,
        );

        if (!aiEx) {
          console.error(
            `❌ [Writer] Exercise ${origEx.name} missing from AI output!`,
          );
          return null;
        }

        const templateData = templatesMap[origEx.hevy_id] || {};
        const tier = getProgressionTier(templateData);
        const isCardio = tier === "CARDIO_IGNORE";

        // --- SUPERSET REST LOGIC ---
        const nextEx = sourceRoutine.exercises[index + 1];
        let finalRest = aiEx.rest_seconds || origEx.rest_seconds || 90;

        // Reset rest to 0 if the next exercise belongs to the same superset
        if (
          origEx.superset_id !== null &&
          nextEx &&
          nextEx.superset_id === origEx.superset_id
        ) {
          finalRest = 0;
        } else if (cycleState && cycleState.enabled && !isCardio) {
          // Harder phases of the cycle get longer rest between working sets
          finalRest += cycleState.restBonusSeconds || 0;
        }

        let currentSets = [...aiEx.sets];

        if (isCardio) {
          console.log(
            `🛡️ [Writer] Cardio detected (${templateData.title || origEx.name}). Keeping your own template settings.`,
          );
          currentSets = origEx.raw_sets ?? currentSets;
        } else {
          // --- CYCLE AUTOREGULATION (system-side, never left to the AI) ---
          const weightStep = tier === "HEAVY_COMPOUND" ? 2.5 : 1;
          currentSets = applyCycleVolume(currentSets, cycleState);
          currentSets = applyCycleScaling(currentSets, cycleState, {
            step: weightStep,
          });

          if (cycleState && cycleState.enabled && cycleState.rpeCap) {
            currentSets = currentSets.map((s) =>
              s.type === "normal" && s.rpe && s.rpe > cycleState.rpeCap
                ? { ...s, rpe: cycleState.rpeCap }
                : s,
            );
          }

          // --- MANDATORY WARM-UP (ramp-up sets are forced, never optional) ---
          const { sets: warmedSets, added } = ensureWarmupSets({
            sets: currentSets,
            tier,
            templateWarmupCount: origEx.warmup_sets,
            protocol: warmupProtocol,
          });
          currentSets = warmedSets;

          if (added > 0) {
            warmupsInjected += added;
          }
        }

        // --- GENERATE ENGLISH TARGET NOTES ---
        const rpeNotes = currentSets
          .filter((s) => s.type === "normal")
          .map((s, idx) => `S${idx + 1}: RPE ${s.rpe || "?"}`)
          .join(", ");

        // Combine AI notes (upgrades, etc.) with RPE targets
        let exerciseNote = aiEx.notes || "";
        const targetNote = `Target: ${rpeNotes}`;

        return {
          exercise_template_id: origEx.hevy_id,
          superset_id: origEx.superset_id,
          rest_seconds: finalRest,
          notes: exerciseNote ? `${exerciseNote} | ${targetNote}` : targetNote,
          sets: currentSets.map((s) => ({
            type: s.type === "warmup" ? "warmup" : "normal",
            weight_kg: s.weight_kg || 0,
            reps: s.reps || 0,
            duration_seconds: s.duration_seconds || null,
          })),
        };
      })
      .filter((ex) => ex !== null);

    // Every routine carries the mandatory general warm-up in its notes
    const routineNotes = [
      generalWarmup,
      cycleSummary ? `\n${cycleSummary}\n${cycleState.note}` : "",
      aiPlan.coach_message ? `\n${aiPlan.coach_message}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const hevyFormat = {
      routine: {
        title: sourceRoutine.routine_name,
        notes: routineNotes,
        exercises: normalizedExercises,
      },
    };

    const filePath = path.join(dir, `routine_${sourceRoutine.routine_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(hevyFormat, null, 2), "utf-8");
    console.log(
      `✅ [Writer] File generated: routine_${sourceRoutine.routine_id}.json` +
        (warmupsInjected > 0
          ? ` (${warmupsInjected} mandatory warm-up sets injected)`
          : ""),
    );
  }
}

module.exports = { exportPlanToHevyFiles };
