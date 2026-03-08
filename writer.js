const fs = require("fs");
const path = require("path");
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
async function exportPlanToHevyFiles(aiPlan, originalRoutines) {
  console.log(
    "📂 [Module: Writer] Exporting routines to /exports (English labels)...",
  );
  const dir = "./exports";

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
        }

        // --- WARMUP SAFETY GUARD ---
        let currentSets = [...aiEx.sets];
        const aiWarmupCount = currentSets.filter(
          (s) => s.type === "warmup",
        ).length;
        const templateData = templatesMap[origEx.exercise_template_id];
        if (templateData && templateData.primary_muscle_group === "cardio") {
          console.log(
            `🛡️ [Writer] Detekováno Kardio (${templateData.title}). Ignoruji AI a vracím tvoje nastavení!`,
          );
          currentSets = origEx.raw_sets ?? currentSets;
        }

        if (aiWarmupCount < origEx.warmup_sets) {
          const missingCount = origEx.warmup_sets - aiWarmupCount;
          const firstWorkSet = currentSets.find((s) => s.type === "normal") || {
            weight_kg: 20,
            reps: 10,
          };
          const emergencyWarmups = [];
          for (let i = 0; i < missingCount; i++) {
            emergencyWarmups.push({
              type: "warmup",
              weight_kg: Math.round((firstWorkSet.weight_kg * 0.5) / 2.5) * 2.5,
              reps: firstWorkSet.reps + 2,
            });
          }
          currentSets = [...emergencyWarmups, ...currentSets];
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

    const hevyFormat = {
      routine: {
        title: sourceRoutine.routine_name,
        notes: aiPlan.coach_message || "",
        exercises: normalizedExercises,
      },
    };

    const filePath = path.join(dir, `routine_${sourceRoutine.routine_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(hevyFormat, null, 2), "utf-8");
    console.log(
      `✅ [Writer] File generated: routine_${sourceRoutine.routine_id}.json`,
    );
  }
}

module.exports = { exportPlanToHevyFiles };
