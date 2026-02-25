require("dotenv").config();
const { downloadExerciseDatabase } = require("./utils/sync_templates");
const { getNewExercises } = require("./services/comparisonService");
const { discoverExerciseRelationships } = require("./services/discoveryService");

async function run() {
    try {
        console.log("🚀 [v2.0] START: Updating exercise catalog and running discovery...");

        // 1. Download fresh exercise data from Hevy
        await downloadExerciseDatabase();

        // 2. Find new exercises not yet in the Smart Catalog
        const newExercises = getNewExercises();

        if (newExercises.length === 0) {
            console.log("✨ No new exercises found. Smart Catalog is up to date.");
            return;
        }

        console.log(`🔍 Found ${newExercises.length} new exercises. Running AI analysis...`);

        // 3. Send only the new exercises to Gemini for analysis
        await discoverExerciseRelationships(
            process.env.GOOGLE_GENAI_API_KEY,
            newExercises,
        );

        console.log("🎯 Discovery complete. Smart Catalog updated.");
    } catch (err) {
        console.error("🧨 CRITICAL ERROR:", err.message);
    }
}

run();
