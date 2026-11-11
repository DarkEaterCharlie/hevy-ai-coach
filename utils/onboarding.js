require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../config/user_db.json');

// ==========================================
// HELPERS
// ==========================================
function askQuestion(query, rl) {
    return new Promise(resolve => rl.question(query, resolve));
}

// ==========================================
// STEP 0: SET UP API KEYS (.env)
// ==========================================
async function setupEnvFile(rl) {
    const envPath = path.join(__dirname, '../.env');

    if (fs.existsSync(envPath)) {
        return;
    }

    console.log("\n🔑 --- API Key Setup ---");
    console.log(".env file not found. Please provide your API keys:");

    const hevyKey = await askQuestion("👉 Enter your HEVY_API_KEY: ", rl);
    const geminiKey = await askQuestion("👉 Enter your GOOGLE_GENAI_API_KEY: ", rl);

    const envContent = `HEVY_API_KEY=${hevyKey.trim()}\nGOOGLE_GENAI_API_KEY=${geminiKey.trim()}`;

    fs.writeFileSync(envPath, envContent);
    console.log("✅ .env file created.");
    require('dotenv').config();
}

// ==========================================
// STEP 1: ATHLETE PROFILE QUESTIONNAIRE
// ==========================================
async function gatherUserProfile(rl) {
    console.log("\n👤 --- Athlete Profile ---");
    const age = await askQuestion("1️⃣ How old are you? ", rl);
    const gender = await askQuestion("2️⃣ What is your gender? ", rl);
    const bodyweight = await askQuestion("3️⃣ What is your current bodyweight (kg)? ", rl);
    const injuries = await askQuestion("4️⃣ Any injuries or limitations? (Press Enter for none): ", rl);
    const otherSports = await askQuestion("5️⃣ Do you do other sports? (Press Enter for none): ", rl);
    const currentPhase = await askQuestion("6️⃣ Your current training goal (e.g. Strength, Hypertrophy): ", rl);

    // --- Optional menstrual cycle autoregulation ---
    const cycleAnswer = await askQuestion("7️⃣ Do you want training scaled to your menstrual cycle? (yes/no, Enter = no): ", rl);
    const cycleTracking = /^(yes|y|ano)$/i.test(cycleAnswer.trim()) ? "yes" : "no";

    let cycleLength = 28;
    let lastPeriodStart = "";
    if (cycleTracking === "yes") {
        const lengthAnswer = await askQuestion("   📅 Average cycle length in days (Enter = 28): ", rl);
        cycleLength = Number(lengthAnswer) || 28;
        const startAnswer = await askQuestion("   📅 First day of your last period (YYYY-MM-DD): ", rl);
        lastPeriodStart = startAnswer.trim();
        console.log("   ℹ️ Keep LAST_PERIOD_START up to date in the Config sheet - stale data disables the scaling.");
    }

    return {
        age: Number(age) || 30,
        gender: gender.trim() || "male",
        bodyweight: Number(bodyweight) || 85,
        otherSports: otherSports.trim() || "none",
        injuries: injuries.trim() || "none",
        currentPhase: currentPhase.trim() || "Hypertrophy",
        cycleTracking,
        cycleLength,
        lastPeriodStart,
        cyclePhaseOverride: ""
    };
}

// ==========================================
// STEP 2: SELECT TARGET FOLDER IN HEVY
// ==========================================
async function selectTargetFolder(apiKey, rl) {
    console.log("\n📂 [Hevy API] Loading your folders...");
    try {
        const response = await fetch('https://api.hevyapp.com/v1/routine_folders', {
            headers: { 'api-key': apiKey }
        });

        if (!response.ok) {
            console.log(`⚠️ API error: ${response.status}. Check your API key.`);
            return "";
        }

        const data = await response.json();
        const folderList = data.routine_folders || [];

        if (folderList.length === 0) {
            console.log("⚠️ No folders found in your Hevy account.");
            return "";
        }

        console.log("Available folders:");
        folderList.forEach((f, i) => {
            console.log(`  [${i + 1}] ${f.title || f.name}`);
        });

        const choice = await askQuestion(`\n8️⃣ Select the folder number to use (1-${folderList.length}): `, rl);
        const selected = folderList[parseInt(choice) - 1];

        if (selected) {
            console.log(`✅ Selected folder: ${selected.title || selected.name}`);
            return String(selected.id).trim();
        }
        return "";
    } catch (e) {
        console.log("❌ Error communicating with Hevy:", e.message);
        return "";
    }
}

// ==========================================
// STEP 3: MINE HISTORICAL 1RM DATA
// ==========================================
async function mineHistorical1RM(apiKey) {
    console.log("\n⛏️ Mining workout history to estimate 1RM values...");
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
// MAIN ENTRY POINT
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
            plan: { currentPhase: userProfile.currentPhase, currentRules: "Focus on progression." },
            user1RM
        };

        if (!fs.existsSync(path.join(__dirname, '../config'))) fs.mkdirSync(path.join(__dirname, '../config'));
        fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
        console.log("\n🎉 Done! user_db.json created successfully.");
    } finally {
        rl.close();
    }
    return true;
}

module.exports = { runOnboarding };
