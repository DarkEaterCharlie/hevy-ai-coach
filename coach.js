require('dotenv').config();
const { getSheetsData, incrementWeek } = require('./services/sheetsService');
const { getFolderRoutines, getLastWorkouts } = require('./services/hevyService');
const { generateTrainingPlan } = require('./services/aiService');
const { exportPlanToHevyFiles } = require('./writer');
const { syncExportsToHevy } = require('./uploader');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
//přidáno pro automatické počítání po spuštění
const { sync1RMToSheets } = require('./utils/sync_1rm');
async function runModularCoach() {
    console.log("🤖 START: Probouzím hybridního AI Trenéra (v4)...\n");

    try {
     
                // 1. NEJDŘÍV přečteme data z Google Tabulky (získáme aktuální tělesnou váhu)
                console.log("📊 [Modul: Sheets] Čtu tvůj profil a váhu z Google Tabulky...");
                let sheetsData = await getSheetsData(process.env.SPREADSHEET_ID);

                // 2. TEPRVE TEĎ odpálíme přepočet 1RM a PŘEDÁME mu tvojí váhu ze Sheets!
                console.log(`🔄 [Modul: Sync 1RM] Přepočítávám tvá maxima pro váhu ${sheetsData.bodyweight} kg...`);
                await sync1RMToSheets(sheetsData.bodyweight); // <--- TADY SE PŘEDÁVÁ TA VÁHA
                console.log("✅ [Modul: Sync 1RM] Maxima jsou aktuální a zapsaná v tabulce!\n");

                // 3. ZNOVU načteme data ze Sheets, abychom do AI poslali už ty ČERSTVĚ zapsané maximálky!
                console.log("📊 [Modul: Sheets] Načítám čerstvě aktualizované 1RM pro AI...");
                sheetsData = await getSheetsData(process.env.SPREADSHEET_ID);

                // 4. Čtení tréninkové logiky (Z lokálního disku)
                console.log("📂 [Modul: Storage] Čtu statický plán periodizace...");
                const planPath = path.join(__dirname, './config/training_plan.json');
                const trainingPlan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        
        // Získáme pravidla pro aktuální týden (pokud neexistuje, fallback na týden 1)
        const periodization = trainingPlan.weeks[String(sheetsData.currentWeek)] || trainingPlan.weeks["1"];

        // ---> TADY JE PŘIDANÝ SMART CATALOG <---
        console.log("📖 [Modul: Storage] Čtu Smart Catalog (progresi cviků)...");
        const catalogPath = path.join(__dirname, './config/smart_catalog.json');
        let smartCatalog = [];
        if (fs.existsSync(catalogPath)) {
            smartCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
        }
        // ----------------------------------------

        console.log("📜 [Modul: Hevy] Analyzuji tvou nedávnou historii...");
                const rawHistory = await getLastWorkouts(process.env.HEVY_API_KEY, 10); // Necháme těch 10, ať máme data i z doby před deloadem

                // --- 🚦 VÝHYBKA PRO DELOAD ---
                let history = rawHistory;
                const prevWeek = sheetsData.currentWeek - 1;
                
                // Pokud nejsme v prvním týdnu, zkontrolujeme, jaký byl ten minulý
                if (prevWeek > 0 && trainingPlan.weeks[String(prevWeek)]) {
                    const prevPhase = trainingPlan.weeks[String(prevWeek)].phase;
                    
                    if (prevPhase.toLowerCase().includes('deload')) {
                        console.log("⚠️ [Výhybka] Minulý týden byl DELOAD. Mažu posledních 7 dní z paměti pro AI...");
                        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                        
                        // Pustíme do AI jen tréninky starší než 7 dní (ty tvrdé před deloadem)
                        history = rawHistory.filter(w => w.timestamp < sevenDaysAgo);
                    }
                }
        console.log(`🏋️ [Modul: Hevy] Stahuji šablony rutiny ze složky: ${sheetsData.targetFolderId}...`);
        const routines = await getFolderRoutines(process.env.HEVY_API_KEY, sheetsData.targetFolderId);

        // 3. Transformace: Injektáž online 1RM přímo do šablon
        console.log("🛠️ [Modul: Transformace] Injektuji 1RM ze Sheets přímo do cviků...");
        const routinesWith1RM = routines.map(rutina => ({
            nazev_rutiny: rutina.nazev_rutiny,
            id_rutiny: rutina.id_rutiny,
            cviky: rutina.cviky.map(cvik => ({
                nazev: cvik.nazev,
                hevy_id: cvik.hevy_id,
                pocet_predepsanych_serii: cvik.pocet_predepsanych_serii,
                pocet_warmup_serii: cvik.pocet_warmup_serii,
                aktualni_1RM_kg: sheetsData.user1RM[cvik.hevy_id] || 0 // Tady dojde ke spárování!
            }))
        }));

        // 4. Generování plánu
        console.log("🧠 [Modul: AI] Generuji tréninkový plán...");
        const plan = await generateTrainingPlan({
            currentWeek: sheetsData.currentWeek,
            periodization: periodization,
            phase: periodization.phase,
            // Sloučíme poznámky z lokálního JSONu a Google Sheets tabulky
            rules: periodization.note || sheetsData.currentRules,
            history: history,
            routines: routinesWith1RM, // Posíláme obohacené rutiny
            bodyweight: sheetsData.bodyweight,
            age: sheetsData.age,
            gender: sheetsData.gender,
            otherSports: sheetsData.otherSports,
            injuries: sheetsData.injuries,
            smartCatalog: smartCatalog // <--- TADY SE TO POSÍLÁ DO AI
        });

        // 5. Lokální uložení a výpis
        await exportPlanToHevyFiles(plan, routines);
        printPlanLocally(plan);

        // 6. Interaktivní finále a nahrávání
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log("---");
        rl.question(`❓ Plán je ready. Chceš ho nahrát do Hevy a posunout týden online na ${sheetsData.currentWeek + 1}? (ano/ne): `, async (answer) => {
            if (answer.toLowerCase() === 'ano') {
                console.log("\n🚀 Startuji nahrávání...");
                
                // Spuštění mikroservisu pro Hevy
                await syncExportsToHevy(process.env.HEVY_API_KEY);
                
                // Posun týdne v tabulce (zavolá Sheets API)
               await incrementWeek(process.env.SPREADSHEET_ID, sheetsData.currentWeek);
                
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
