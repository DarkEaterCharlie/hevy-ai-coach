const fs = require('fs');
const path = require('path');

/**
 * Mikroservis pro transformaci a uložení plánu do Hevy-ready souborů
 */
async function exportPlanToHevyFiles(aiPlan, originalRoutines) {
    console.log("📂 [Modul: Writer] Čistím staré exporty a transformuji data...");
    const dir = './exports';
    
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir);

    for (const trening of aiPlan.tydenni_plan) {
        
        const sourceRoutine = originalRoutines.find(r =>
            r.nazev_rutiny.toLowerCase() === trening.nazev_treninku.toLowerCase()
        );

        if (!sourceRoutine) {
            console.warn(`⚠️ [Writer] Rutina "${trening.nazev_treninku}" nenalezena v Hevy šablonách.`);
            continue;
        }

        const hevyFormat = {
            routine: {
                title: trening.nazev_treninku,
                notes: aiPlan.zprava_od_kouce || "",
                exercises: trening.exercises.map(ex => {
                    // Najdeme si originální cvik ze šablony, abychom znali počet warmupů
                    const originalEx = sourceRoutine.cviky.find(c => c.hevy_id === ex.exercise_template_id);
                    const requiredWarmups = originalEx ? originalEx.pocet_warmup_serii : 0;
                    
                    // Aktuální počet warmupů, které vrátilo AI
                    let currentSets = [...ex.sets];
                    const aiWarmupCount = currentSets.filter(s => s.type === 'warmup').length;

                    // --- START POJISTKY ---
                    if (aiWarmupCount < requiredWarmups) {
                        console.warn(`⚠️ [Writer] AI smazalo warmup u cviku ${ex.exercise_template_id}. Opravuji...`);
                        
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
                        // Vložíme chybějící warmupy na začátek
                        currentSets = [...emergencyWarmups, ...currentSets];
                    }
                    // --- KONEC POJISTKY ---

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
                            reps: s.reps || 0
                        }))
                    };

                    const finalNotes = [];
                    if (ex.notes) finalNotes.push(ex.notes);
                    if (rpeNotes) finalNotes.push(`Cíl: ${rpeNotes}`);
                    
                    if (finalNotes.length > 0) {
                        exercise.notes = finalNotes.join(' | ');
                    }

                    return exercise;
                })
            }
        };

        const filePath = path.join(dir, `routine_${sourceRoutine.id_rutiny}.json`);
        fs.writeFileSync(filePath, JSON.stringify(hevyFormat, null, 2), 'utf-8');
        console.log(`✅ [Writer] Vygenerován Hevy soubor: routine_${sourceRoutine.id_rutiny}.json`);
    }
}

module.exports = { exportPlanToHevyFiles };
