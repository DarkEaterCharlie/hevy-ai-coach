const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../config/user_db.json');
const PLAN_PATH = path.join(__dirname, '../config/training_plan.json');

async function getLocalData() {
    console.log("📂 [DEBUG] Loading local data...");

    const userData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const trainingPlan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));

    const currentWeek = userData.config?.currentWeek || 1;
    console.log(`🔍 [DEBUG] Current week from DB: ${currentWeek}`);
    console.log(`🔍 [DEBUG] Plan has 'weeks' section: ${!!trainingPlan.weeks}`);

    const weekData = trainingPlan.weeks ? trainingPlan.weeks[String(currentWeek)] : null;

    if (!weekData) {
        console.error("❌ [DEBUG] CRITICAL: Week data not found in training_plan.json!");
        // Return a fallback object so aiService does not crash on missing 'phase'
        return {
            ...userData.profile,
            ...userData.config,
            ...userData.plan,
            currentWeek,
            periodization: { phase: "Emergency", intensity: "N/A", rpeTarget: 8, volumeWeight: 0.7 },
            user1RM: userData.user1RM
        };
    }

    console.log(`✅ [DEBUG] Periodization found: ${weekData.phase}`);

    return {
        ...userData.profile,
        ...userData.config,
        ...userData.plan,
        currentWeek: currentWeek,
        periodization: weekData,
        user1RM: userData.user1RM,
        targetFolderId: userData.config?.targetFolderId
    };
}

// Advances the local week counter (fallback when Sheets is unavailable)
async function incrementLocalWeek(currentWeek) {
    const userData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

    let nextWeek = currentWeek + 1;
    if (nextWeek > 12) {
        console.log("♻️ Cycle complete. Resetting to week 1.");
        nextWeek = 1;
    }

    userData.config.currentWeek = nextWeek;
    fs.writeFileSync(DB_PATH, JSON.stringify(userData, null, 2));
    console.log(`📅 Week counter in local DB advanced to: ${nextWeek}`);
}

module.exports = { getLocalData, incrementLocalWeek };
