const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function discoverExerciseRelationships(apiKey) {
    console.log("🔍 [Discovery] Analyzuji katalog cviků pro v2.0...");
    
    const dbPath = path.join(__dirname, '../templates_db.json');
    const catalogPath = path.join(__dirname, '../config/smart_catalog.json');
    const promptPath = path.join(__dirname, '../prompts/discovery.txt'); // <-- Cesta k novému promptu

    if (!fs.existsSync(dbPath)) {
        throw new Error("❌ Chybí templates_db.json! Nejdřív stáhni data z Hevy.");
    }

    const templates = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const basePrompt = fs.readFileSync(promptPath, 'utf-8'); // <-- Načtení promptu
    
    const relevantExercises = templates.filter(ex =>
        ex.type === 'weight_reps' || ex.type === 'reps_only' || ex.type.includes('bodyweight')
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: { responseMimeType: "application/json" }
    });

    // Sestavení finálního promptu: Text ze souboru + dynamická data (seznam cviků)
    const finalPrompt = `
        ${basePrompt}
        
        SEZNAM CVIKŮ K ANALÝZE:
        ${JSON.stringify(relevantExercises.map(ex => ({id: ex.id, title: ex.title})))}
    `;

    try {
        const result = await model.generateContent(finalPrompt);
        const data = JSON.parse(result.response.text());
        
        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);

        fs.writeFileSync(catalogPath, JSON.stringify(data.families, null, 2));
        console.log(`✅ [Discovery] Katalog 'smart_catalog.json' vytvořen! Nalezeno ${data.families.length} rodin.`);
    } catch (error) {
        console.error("🧨 [Discovery] AI analýza selhala:", error.message);
    }
}

module.exports = { discoverExerciseRelationships };
