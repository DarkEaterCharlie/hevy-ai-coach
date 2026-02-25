const fs = require('fs');
const path = require('path');
const { updateHevyRoutine } = require('./services/hevyService');

/**
 * Batch-uploads all generated routine files from /exports to Hevy via PUT requests.
 */
async function syncExportsToHevy(apiKey) {
    const dir = './exports';
    console.log("📤 [Module: Uploader] Starting sync with Hevy Cloud...");

    if (!fs.existsSync(dir)) {
        console.warn("⚠️ [Uploader] /exports directory does not exist. Nothing to upload.");
        return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        try {
            // Extract routine ID from filename (routine_ID.json)
            const routineId = file.replace('routine_', '').replace('.json', '');
            const filePath = path.join(dir, file);
            const routineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            console.log(`⏳ [Uploader] Uploading ${file}...`);
            await updateHevyRoutine(apiKey, routineId, routineData);
            console.log(`✅ [Uploader] Routine ${routineId} synced.`);

        } catch (error) {
            console.error(`❌ [Uploader] Error uploading ${file}:`, error.message);
        }
    }
}

module.exports = { syncExportsToHevy };
