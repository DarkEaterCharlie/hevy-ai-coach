require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../config/user_db.json');

// ==========================================
// 🛠️ POMOCNÉ FUNKCE
// ==========================================
function askQuestion(query, rl) {
    return new Promise(resolve => rl.question(query, resolve));
}

// ==========================================
// 🔑 KROK 0: NASTAVENÍ API KLÍČŮ (.env)
// ==========================================
async function setupEnvFile(rl) {
    const envPath = path.join(__dirname, '../.env');
    
    if (fs.existsSync(envPath)) {
        return;
    }

    console.log("\n🔑 --- Nastavení API Klíčů ---");
    console.log("Soubor .env nebyl nalezen. Budu od tebe potřebovat klíče:");
    
    const hevyKey = await askQuestion("👉 Vlož svůj HEVY_API_KEY: ", rl);
    const geminiKey = await askQuestion("👉 Vlož svůj GOOGLE_GENAI_API_KEY: ", rl);

    const envContent = `HEVY_API_KEY=${hevyKey.trim()}\nGOOGLE_GENAI_API_KEY=${geminiKey.trim()}`;
    
    fs.writeFileSync(envPath, envContent);
    console.log("✅ Soubor .env byl vytvořen.");
    require('dotenv').config();
}

// ==========================================
// 👤 KROK 1: DOTAZNÍK PROFILU
// ==========================================
async function gatherUserProfile(rl) {
    console.log("\n👤 --- Osobní Profil ---");
    const age = await askQuestion("1️⃣ Kolik ti je let? ", rl);
    const gender = await askQuestion("2️⃣ Jaké je tvé pohlaví? ", rl);
    const bodyweight = await askQuestion("3️⃣ Kolik aktuálně vážíš (kg)? ", rl);
    const injuries = await askQuestion("4️⃣ Máš nějaká zranění? (Enter pro žádná): ", rl);
    const otherSports = await askQuestion("5️⃣ Děláš další sporty? (Enter pro nic): ", rl);
    const currentPhase = await askQuestion("6️⃣ Tvůj aktuální cíl (např. Strength)? ", rl);

    return {
        age: Number(age) || 30,
        gender: gender.trim() || "muž",
        bodyweight: Number(bodyweight) || 85,
        otherSports: otherSports.trim() || "nic",
        injuries: injuries.trim() || "žádná",
        currentPhase: currentPhase.trim() || "Hypertrophy"
    };
}

// ==========================================
// 📁 KROK 2: VÝBĚR SLOŽKY Z HEVY
// ==========================================
 async function selectTargetFolder(apiKey, rl) {
    console.log("\n📂 [Hevy API] Načítám seznam tvých složek...");
    try {
        const response = await fetch('https://api.hevyapp.com/v1/routine_folders', {
            headers: { 'api-key': apiKey }
        });
        
        if (!response.ok) {
            console.log(`⚠️ Chyba API: ${response.status}. Klíč asi není správný.`);
            return "";
        }

        const data = await response.json();
        // Hevy API vrací složky v poli 'routine_folders'
        const folderList = data.routine_folders || [];

        if (folderList.length === 0) {
            console.log("⚠️ V Hevy účtu nebyly nalezeny žádné složky.");
            return "";
        }

        console.log("Nalezené složky:");
        folderList.forEach((f, i) => {
            console.log(`  [${i + 1}] ${f.title || f.name}`);
        });
        
        const choice = await askQuestion(`\n7️⃣ Vyber číslo složky, kam mám ukládat (1-${folderList.length}): `, rl);
        const selected = folderList[parseInt(choice) - 1];
        
        if (selected) {
            console.log(`✅ Vybrána složka: ${selected.title || selected.name}`);
            return String(selected.id).trim();
        }
        return "";
    } catch (e) {
        console.log("❌ Chyba při komunikaci s Hevy:", e.message);
        return "";
    }
}

// ==========================================
// ⛏️ KROK 3: DOLOVÁNÍ MAXIMÁLEK (1RM)
// ==========================================
async function mineHistorical1RM(apiKey) {
    console.log("\n⛏️ Doluji tvou historii pro výpočet 1RM...");
    const calculated1RM = {};
    try {
        for (let page = 1; page <= 10; page++) {
            const response = await fetch(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, { headers: { 'api-key': apiKey } });
            const data = await response.json();
            const workouts = data.workouts || [];
            if (workouts.length === 0) break;

            workouts.forEach(w => {
                w.exercises.forEach(ex => {
                    const id = ex.exercise_template_id;
                    ex.sets.forEach(s => {
                        if (s.weight_kg && s.reps) {
                            const e1rm = Math.round(s.weight_kg * (1 + (s.reps / 30)));
                            if (!calculated1RM[id] || e1rm > calculated1RM[id]) calculated1RM[id] = e1rm;
                        }
                    });
                });
            });
            if (workouts.length < 10) break;
        }
        return calculated1RM;
    } catch (e) {
        return {};
    }
}

// ==========================================
// 🚀 START
// ==========================================
async function runOnboarding() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        await setupEnvFile(rl);
        if (fs.existsSync(DB_PATH)) return true;

        const apiKey = process.env.HEVY_API_KEY;
        const userProfile = await gatherUserProfile(rl);
        const folderId = await selectTargetFolder(apiKey, rl);
        const user1RM = await mineHistorical1RM(apiKey);

        const initialDB = {
            profile: { ...userProfile },
            config: { currentWeek: 1, targetFolderId: folderId },
            plan: { currentPhase: userProfile.currentPhase, currentRules: "Fokus na progres." },
            user1RM
        };

        if (!fs.existsSync(path.join(__dirname, '../config'))) fs.mkdirSync(path.join(__dirname, '../config'));
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
        console.log("\n🎉 Hotovo! 'user_db.json' vytvořen.");
    } finally {
        rl.close();
    }
    return true;
}

module.exports = { runOnboarding };
