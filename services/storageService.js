const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../config/user_db.json');
const PLAN_PATH = path.join(__dirname, '../config/training_plan.json');

async function getLocalData() {
    console.log("📂 [DEBUG] Start načítání dat...");
    
    const userData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const trainingPlan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));

    const currentWeek = userData.config?.currentWeek || 1;
    console.log(`🔍 [DEBUG] Aktuální týden z DB: ${currentWeek}`);
    console.log(`🔍 [DEBUG] Má plán sekci 'weeks'?: ${!!trainingPlan.weeks}`);

    const weekData = trainingPlan.weeks ? trainingPlan.weeks[String(currentWeek)] : null;
    
    if (!weekData) {
        console.error("❌ [DEBUG] KRITICKÁ CHYBA: Data pro týden nebyla nalezena v training_plan.json!");
        // Vrátíme aspoň nouzový objekt, aby aiService nespadl na 'phase'
        return {
            ...userData.profile,
            ...userData.config,
            ...userData.plan,
            currentWeek,
            periodization: { phase: "Nouzová", intensity: "N/A", rpeTarget: 8, volumeWeight: 0.7 },
            user1RM: userData.user1RM
        };
    }

    console.log(`✅ [DEBUG] Periodizace nalezena: ${weekData.phase}`);

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

// Funkce pro budoucí posun týdne (nahradí incrementWeek ze Sheets)
async function incrementLocalWeek(currentWeek) {
    const userData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    
    let nextWeek = currentWeek + 1;
    if (nextWeek > 12) {
        console.log("♻️ Cyklus dokončen. Restartuji na týden 1.");
        nextWeek = 1;
    }

    userData.config.currentWeek = nextWeek;
    fs.writeFileSync(DB_PATH, JSON.stringify(userData, null, 2));
    console.log(`📅 Týden v lokální DB posunut na: ${nextWeek}`);
}

module.exports = { getLocalData, incrementLocalWeek };
