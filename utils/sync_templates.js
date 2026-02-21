// Upravený utils/sync_templates.js
require('dotenv').config();
const fs = require('fs');

async function downloadExerciseDatabase() {
    const apiKey = process.env.HEVY_API_KEY;
    if (!apiKey) throw new Error("Chybí HEVY_API_KEY!");

    console.log("📥 Stahuji aktuální katalog z Hevy...");
    let page = 1;
    let allTemplates = [];
    let keepFetching = true;

    while (keepFetching) {
        const response = await fetch(`https://api.hevyapp.com/v1/exercise_templates?page=${page}&pageSize=10`, {
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
        });

        if (response.status === 404) break;
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        const templates = Array.isArray(data) ? data : (data.exercise_templates || []);
        if (templates.length === 0) break;

        allTemplates.push(...templates);
        if (templates.length < 10) keepFetching = false;
        page++;
    }

    const filePath = './templates_db.json';
    fs.writeFileSync(filePath, JSON.stringify(allTemplates, null, 2));
    console.log(`✅ Katalog uložen (${allTemplates.length} cviků).`);
    return allTemplates;
}

module.exports = { downloadExerciseDatabase };
