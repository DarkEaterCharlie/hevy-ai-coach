require('dotenv').config();
//const { getSheetsData, incrementWeek } = require('./services/sheetsService');
const { getLocalData, incrementLocalWeek } = require('./services/storageService');
const { getFolderRoutines, getLastWorkouts } = require('./services/hevyService');
const { generateTrainingPlan } = require('./services/aiService');
const { exportPlanToHevyFiles } = require('./writer');
const { syncExportsToHevy } = require('./uploader');
const { runOnboarding } = require('./utils/onboarding'); // 👈 TADY JE TEN CHYBĚJÍCÍ IMPORT
const readline = require('readline');

async function runModularCoach() {
    console.log("🤖 START: Probouzím modulárního AI Trenéra...\n");

    try {
        // 0. ONBOARDING: Zkontroluje/vytvoří databázi a vytěží maximálky
        await runOnboarding(); // 👈 TADY ZASTAVÍME BĚH A VYTVOŘÍME SOUBOR
        // 1. Sběr dat
        console.log("📊 [Modul: Sheets] Čtu Google Tabulku...");
       // const sheetsData = await getSheetsData(process.env.SPREADSHEET_ID);
        const sheetsData = await getLocalData();
        
        console.log("📜 [Modul: Hevy] Analyzuji tvou nedávnou historii...");
        const history = await getLastWorkouts(process.env.HEVY_API_KEY, 5);

        console.log(`🏋️ [Modul: Hevy] Stahuji šablony rutiny...`);
        const routines = await getFolderRoutines(process.env.HEVY_API_KEY, sheetsData.targetFolderId);

        // 2. Generování plánu
                console.log("🛠️ [Modul: Transformace] Injektuji 1RM přímo do šablon...");
                
                // Vytvoříme novou strukturu rutin, kde ke každému cviku přilepíme jeho 1RM z databáze
                const routinesWith1RM = routines.map(rutina => ({
                    nazev_rutiny: rutina.nazev_rutiny,
                    id_rutiny: rutina.id_rutiny,
                    cviky: rutina.cviky.map(cvik => ({
                        nazev: cvik.nazev,
                        hevy_id: cvik.hevy_id,
                        pocet_predepsanych_serii: cvik.pocet_predepsanych_serii,
                        pocet_warmup_serii: cvik.pocet_warmup_serii,
                        aktualni_1RM_kg: sheetsData.user1RM[cvik.hevy_id] || 0 // Tohle AIčkem konečně trkne!
                    }))
                }));

                console.log("🧠 [Modul: AI] Generuji tréninkový plán...");
                const plan = await generateTrainingPlan({
                    currentWeek: sheetsData.currentWeek,
                    periodization: sheetsData.periodization,
                    phase: sheetsData.currentPhase,
                    rules: sheetsData.currentRules,
                    history: history,
                    routines: routinesWith1RM, // 👈 Podstrčíme ty obohacené rutiny
                    bodyweight: sheetsData.bodyweight,
                    age: sheetsData.age,
                    gender: sheetsData.gender,
                    otherSports: sheetsData.otherSports,
                    injuries: sheetsData.injuries
                    // maxima: sheetsData.user1RM  <-- TOHLE JSEM SMAZAL, UŽ TO TAM NEPOTŘEBUJEME
                });
        // 3. Lokální transformace a výpis (příprava souborů v /exports)
        await exportPlanToHevyFiles(plan, routines);
        printPlanLocally(plan);

        // 4. Interaktivní finále
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log("---");
        rl.question(`❓ Plán je ready. Chceš ho nahrát do Hevy a posunout týden v tabulce na ${sheetsData.currentWeek + 1}? (ano/ne): `, async (answer) => {
            if (answer.toLowerCase() === 'ano') {
                console.log("\n🚀 Startuji nahrávání...");
                
                // Spuštění mikroservisu pro Hevy
             //   await syncExportsToHevy(process.env.HEVY_API_KEY);
                
                // Posun týdne v tabulce
                //await incrementWeek(process.env.SPREADSHEET_ID, sheetsData.currentWeek);
                //await incrementLocalWeek(sheetsData.currentWeek);
                
                console.log("✅ Všechno je v mobilu i v tabulce.");
            } else {
                console.log("ℹ️ Akce zrušena. Soubory zůstaly v /exports, pokud je chceš nahrát ručně.");
            }
            rl.close();
            console.log("\n👋 Trenér Jarda končí šichtu. Ať to roste!");
        });

    } catch (error) {
        console.error("\n❌ CHYBA:", error.message);
        if (error.stack) console.error(error.stack);
    }
}

function printPlanLocally(plan) {
    if (!plan || !plan.tydenni_plan) {
        console.log("⚠️ Žádný plán k výpisu.");
        return;
    }

    console.log(`\n🏆 NÁVRH TRENÉRA JARDY:`);
    console.log(`🗣️ ${plan.zprava_od_kouce}\n`);

    plan.tydenni_plan.forEach(trening => {
        console.log(`--- 🏋️ ${trening.nazev_treninku} ---`);
        
        const vypisCviky = trening.exercises.map(ex => {
            const normalSets = ex.sets.filter(s => s.type === 'normal');
            const warmupSets = ex.sets.filter(s => s.type === 'warmup');
            
            // Získání vah z pracovních sérií (pokud se mění, vypíše rozsah)
            const weights = normalSets.map(s => s.weight_kg);
            const weightDisplay = weights.length > 0
                ? (Math.min(...weights) === Math.max(...weights)
                    ? `${weights[0]} kg`
                    : `${Math.min(...weights)} - ${Math.max(...weights)} kg`)
                : "0 kg";

            // Získání RPE z pracovních sérií
            const rpes = normalSets.map(s => s.rpe).filter(r => r != null);
            const rpeDisplay = rpes.length > 0 ? rpes.join(' / ') : '-';

            return {
                'Cvik (ID)': ex.exercise_template_id,
                'Warmup': warmupSets.length > 0 ? `${warmupSets.length}x` : '-',
                'Série': normalSets.length,
                'Reps': normalSets[0]?.reps || 0,
                'Váha (Pracovní)': weightDisplay,
                'RPE': rpeDisplay,
                'Poznámka': ex.notes || ""
            };
        });

        console.table(vypisCviky);
        console.log("\n");
    });
}

runModularCoach();
