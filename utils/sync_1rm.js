require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');

async function sync1RMToSheets(userBw) {
    const apiKey = process.env.HEVY_API_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;
    
    if (!apiKey || !spreadsheetId) {
        console.error("❌ CHYBA: Zkontroluj .env! Chybí API klíč, SPREADSHEET_ID.");
        return;
    }
    if (!userBw) {
        console.error("❌ CHYBA: Nebyla zadána tělesná váha pro výpočet 1RM!");
        return;
    }
    
    try {
        // --- 1. NAČTENÍ LOKÁLNÍ DATABÁZE CVIKŮ ---
        console.log("📂 Načítám lokální katalog cviků (templates_db.json)...");
        if (!fs.existsSync('./templates_db.json')) {
            console.error("❌ CHYBA: Soubor templates_db.json neexistuje. Spusť nejdřív sync_templates.js!");
            return;
        }
        const templatesArray = JSON.parse(fs.readFileSync('./templates_db.json', 'utf-8'));
        const templatesMap = {};
        templatesArray.forEach(t => templatesMap[t.id] = t);
        console.log(`✅ Načteno ${templatesArray.length} cviků z disku.\n`);
        
        // --- 2. STAŽENÍ HISTORIE Z HEVY (Posledních 6 měsíců, pageSize=10) ---
        console.log("🔄 Stahuji historii tréninků (až 6 měsíců zpět)...");
        let page = 1;
        let allWorkouts = [];
        let keepFetching = true;
        
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        while (keepFetching) {
            process.stdout.write(`⏳ Strana ${page}... `);
            const response = await fetch(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, {
                headers: { 'api-key': apiKey }
            });
            
            if (response.status === 404) {
                console.log("🏁 Konec historie (404).");
                break;
            }
            if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);
            
            const data = await response.json();
            const workouts = Array.isArray(data) ? data : (data.workouts || []);
            
            if (workouts.length === 0) break;
            
            for (const workout of workouts) {
                if (new Date(workout.start_time) < sixMonthsAgo) {
                    keepFetching = false;
                    break;
                }
                allWorkouts.push(workout);
            }
            if (workouts.length < 10) keepFetching = false;
            
            console.log("OK");
            page++;
        }
        console.log(`✅ Zpracovávám ${allWorkouts.length} tréninků...\n`);
        
        // --- 3. VÝPOČET CHYTRÉHO 1RM ---
        const best1RM = {};
        
        allWorkouts.forEach(workout => {
            if (!workout.exercises) return;
            
            workout.exercises.forEach(exercise => {
                const exId = exercise.exercise_template_id;
                const template = templatesMap[exId];
                
                if (!template || template.type === 'reps_only' || template.type === 'duration') return;
                
                const exName = exercise.title || template.title;
                
                exercise.sets.forEach(set => {
                    if (set.set_type === 'warmup' || !set.reps) return;
                    
                    let zvednutaVaha = set.weight_kg || 0;
                    
                    if (template.equipment === 'none' || template.equipment === 'body_only' || template.type === 'bodyweight') {
                        zvednutaVaha += userBw;
                    }
                    if (zvednutaVaha === 0) return;
                    
                    const rpe = set.rpe || 10;
                    const rir = 10 - rpe;
                    const efektivniOpakovani = set.reps + rir;
                    const hrube1RM = zvednutaVaha * (1 + efektivniOpakovani / 30);
                    
                    // --- START KOROZE (Time Decay) ---
                    const workoutDate = new Date(workout.start_time);
                    const today = new Date();
                    const diffDays = (today - workoutDate) / (1000 * 60 * 60 * 24);
                    const diffMonths = Math.max(0, diffDays / 30); // Počet měsíců stáří
                    
                    // Strhneme 2.5% z 1RM za každý měsíc stáří
                    const penaltyMultiplier = Math.max(0.5, 1 - (diffMonths * 0.025));
                    const current1RM = hrube1RM * penaltyMultiplier;
                    // --- KONEC KOROZE ---
                    
                    if (!best1RM[exId] || current1RM > best1RM[exId].rm) {
                        best1RM[exId] = {
                            id: exId,
                            name: exName,
                            rm: Math.round(current1RM * 10) / 10,
                            date: workoutDate.toLocaleDateString('cs-CZ'),
                            info: `${set.weight_kg || 0}kg x ${set.reps} @ RPE ${rpe} (Koroze: -${Math.round((1 - penaltyMultiplier) * 100)}%)`
                        };
                    }
                });
            });
        });
        
        // --- 4. PŘÍPRAVA DAT PRO GOOGLE SHEETS ---
        // Převedeme slovník na pole a seřadíme abecedně podle názvu
        const resultsArray = Object.values(best1RM).sort((a, b) => a.name.localeCompare(b.name));
        
        // Vytvoříme 2D pole (tabulku), které pošleme do Googlu
        const sheetsData = [
            ['Cvik', 'Aktualni_1RM_kg', 'Datum_Aktualizace', 'Hevy_ID', 'Z_Ceho_Pocitano'] // Hlavička
        ];
        
        resultsArray.forEach(item => {
            sheetsData.push([item.name, item.rm, item.date, item.id, item.info]);
        });
        
        // --- 5. ODESLÁNÍ DO GOOGLE SHEETS ---
        console.log("📊 Připojuji se ke Google Sheets...");
        const auth = new google.auth.GoogleAuth({
            keyFile: './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
        
        // Nejdřív vymažeme stará data v listu 1RM (ať se nám tam nemíchají)
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: '1RM!A:E',
        });
        
        // Zapíšeme nová data
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: '1RM!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: sheetsData },
        });
        
        console.log(`✅ BUM! Úspěšně zapsáno ${resultsArray.length} cviků do tvé Google Tabulky (list 1RM)!`);
        
    } catch (error) {
        console.error("❌ CHYBA:", error.message);
    }
}

//sync1RMToSheets(); vypnuto pozustatek z verze kdy se spouštelo manualně
module.exports = { sync1RMToSheets };
