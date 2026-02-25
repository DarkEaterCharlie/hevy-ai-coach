const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function discoverExerciseRelationships(apiKey, exercisesToAnalyze) {
    console.log("🔍 [Discovery] Analyzing exercise catalog...");

    const dbPath = path.join(__dirname, '../templates_db.json');
    const catalogPath = path.join(__dirname, '../config/smart_catalog.json');
    const promptPath = path.join(__dirname, '../prompts/discovery.txt');

    let relevantExercises;

    if (exercisesToAnalyze) {
        // Use the pre-filtered delta list passed in by the caller
        relevantExercises = exercisesToAnalyze;
    } else {
        // Standalone mode: load and filter the full database from disk
        if (!fs.existsSync(dbPath)) {
            throw new Error("❌ templates_db.json is missing! Run sync_templates.js first.");
        }
        const templates = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        relevantExercises = templates.filter(ex =>
            ex.type === 'weight_reps' || ex.type === 'reps_only' || ex.type.includes('bodyweight')
        );
    }

    const basePrompt = fs.readFileSync(promptPath, 'utf-8');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: { responseMimeType: "application/json" }
    });

    // Combine the static prompt with the dynamic exercise list
    const finalPrompt = `
        ${basePrompt}

        EXERCISE LIST TO ANALYZE:
        ${JSON.stringify(relevantExercises.map(ex => ({ id: ex.id, title: ex.title })))}
    `;

    try {
        const result = await model.generateContent(finalPrompt);
        const data = JSON.parse(result.response.text());

        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);

        fs.writeFileSync(catalogPath, JSON.stringify(data.families, null, 2));
        console.log(`✅ [Discovery] smart_catalog.json created with ${data.families.length} exercise families.`);
    } catch (error) {
        console.error("🧨 [Discovery] AI analysis failed:", error.message);
    }
}

module.exports = { discoverExerciseRelationships };
