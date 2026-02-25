const fs = require('fs');
const path = require('path');

/**
 * Transforms an AI-generated training plan into Hevy-compatible JSON files,
 * one file per routine, saved to the /exports directory.
 */
async function exportPlanToHevyFiles(aiPlan, originalRoutines) {
    console.log("📂 [Module: Writer] Clearing old exports and transforming data...");
    const dir = './exports';

    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir);

    for (const workout of aiPlan.weekly_plan) {

        const sourceRoutine = originalRoutines.find(r =>
            r.routine_name.toLowerCase() === workout.workout_name.toLowerCase()
        );

        if (!sourceRoutine) {
            console.warn(`⚠️ [Writer] Routine "${workout.workout_name}" not found in Hevy templates.`);
            continue;
        }

        const hevyFormat = {
            routine: {
                title: workout.workout_name,
                notes: aiPlan.coach_message || "",
                exercises: workout.exercises.map(ex => {
                    // Look up the original exercise to determine the required warmup count
                    const originalEx = sourceRoutine.exercises.find(c => c.hevy_id === ex.exercise_template_id);
                    const requiredWarmups = originalEx ? originalEx.warmup_sets : 0;

                    // Current sets returned by the AI
                    let currentSets = [...ex.sets];
                    const aiWarmupCount = currentSets.filter(s => s.type === 'warmup').length;

                    // --- WARMUP SAFETY GUARD ---
                    if (aiWarmupCount < requiredWarmups) {
                        console.warn(`⚠️ [Writer] AI removed warmup for exercise ${ex.exercise_template_id}. Restoring...`);

                        const missingCount = requiredWarmups - aiWarmupCount;
                        const firstWorkSet = currentSets.find(s => s.type === 'normal') || { weight_kg: 20, reps: 10 };

                        const emergencyWarmups = [];
                        for (let i = 0; i < missingCount; i++) {
                            emergencyWarmups.push({
                                type: 'warmup',
                                weight_kg: Math.round((firstWorkSet.weight_kg * 0.5) / 2.5) * 2.5,
                                reps: firstWorkSet.reps + 2
                            });
                        }
                        // Prepend missing warmups
                        currentSets = [...emergencyWarmups, ...currentSets];
                    }
                    // --- END WARMUP SAFETY GUARD ---

                    const rpeNotes = currentSets
                        .filter(s => s.type === 'normal')
                        .map((s, idx) => `S${idx + 1}: RPE ${s.rpe || '?'}`)
                        .join(', ');

                    const exercise = {
                        exercise_template_id: ex.exercise_template_id,
                        superset_id: ex.superset_id ?? null,
                        rest_seconds: ex.rest_seconds || 90,
                        sets: currentSets.map(s => ({
                            type: s.type === 'warmup' ? 'warmup' : 'normal',
                            weight_kg: s.weight_kg || 0,
                            reps: s.reps || 0,
                            duration_seconds: s.duration_seconds || null
                        }))
                    };

                    const finalNotes = [];
                    if (ex.notes) finalNotes.push(ex.notes);
                    if (rpeNotes) finalNotes.push(`Target: ${rpeNotes}`);

                    if (finalNotes.length > 0) {
                        exercise.notes = finalNotes.join(' | ');
                    }

                    return exercise;
                })
            }
        };

        const filePath = path.join(dir, `routine_${sourceRoutine.routine_id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(hevyFormat, null, 2), 'utf-8');
        console.log(`✅ [Writer] Generated Hevy file: routine_${sourceRoutine.routine_id}.json`);
    }
}

module.exports = { exportPlanToHevyFiles };
