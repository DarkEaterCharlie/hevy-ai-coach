require('dotenv').config();
const fs = require('fs');

async function downloadExerciseDatabase() {
    const apiKey = process.env.HEVY_API_KEY;

    if (!apiKey) {
        console.error("❌ CHYBA: Chybí Hevy API klíč v .env!");
        return;
    }

    console.log("📥 Začínám stahovat kompletní katalog cviků z Hevy...");

    let page = 1;
    let allTemplates = [];
    let keepFetching = true;

    try {
        while (keepFetching) {
            console.log(`⏳ Stahuji stranu ${page}...`);
            const response = await fetch(`https://api.hevyapp.com/v1/exercise_templates?page=${page}&pageSize=10`, {
                method: 'GET',
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });

            // ZACHYCENÍ 404: Tady jsme na konci seznamu!
            if (response.status === 404) {
                console.log("🏁 Narazili jsme na konec (404). Všechny cviky jsou staženy!");
                keepFetching = false;
                break;
            }

            if (!response.ok) {
                throw new Error(`HTTP Status: ${response.status}`);
            }

            const data = await response.json();
            const templates = Array.isArray(data) ? data : (data.exercise_templates || []);

            if (templates.length === 0) {
                keepFetching = false;
                break;
            }

            allTemplates.push(...templates);

            if (templates.length < 10) {
                keepFetching = false;
            }

            page++;
        }

        console.log(`✅ Úspěšně staženo celkem ${allTemplates.length} definic cviků.`);

        // Uložení do lokálního souboru
        const filePath = './templates_db.json';
        fs.writeFileSync(filePath, JSON.stringify(allTemplates, null, 2), 'utf-8');
        
        console.log(`💾 Katalog cviků byl bezpečně uložen do '${filePath}'.`);

    } catch (error) {
        console.error("❌ CHYBA PŘI STAHOVÁNÍ KATALOGU:", error.message);
    }
}

downloadExerciseDatabase();
