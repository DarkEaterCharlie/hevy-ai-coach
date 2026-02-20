const fs = require('fs');
const path = require('path');
const { updateHevyRoutine } = require('./services/hevyService'); // Změněno [cite: 1, 7]

/**
 * Mikroservis pro hromadné nahrání vygenerovaných plánů do Hevy
 */
async function syncExportsToHevy(apiKey) {
    const dir = './exports';
    console.log("📤 [Modul: Uploader] Začínám synchronizaci s Hevy Cloudem...");

    if (!fs.existsSync(dir)) {
        console.warn("⚠️ [Uploader] Složka /exports neexistuje. Není co nahrávat.");
        return;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        try {
            // Vytáhneme ID rutiny z názvu souboru (routine_ID.json) [cite: 5, 37]
            const routineId = file.replace('routine_', '').replace('.json', '');
            const filePath = path.join(dir, file);
            const routineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            console.log(`⏳ [Uploader] Nahrávám ${file}...`);
            await updateHevyRoutine(apiKey, routineId, routineData);
            console.log(`✅ [Uploader] Rutina ${routineId} synchronizována.`);
            
        } catch (error) {
            console.error(`❌ [Uploader] Chyba při nahrávání souboru ${file}:`, error.message);
        }
    }
}

module.exports = { syncExportsToHevy };
