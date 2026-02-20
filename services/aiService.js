const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// --- TADY JE TA FUNKCE PRO NAČÍTÁNÍ PROMPTŮ ---
// services/aiService.js
const loadPrompt = (fileName) => {
    try {
        // Přidali jsme '..', abychom se dostali ze složky services do rootu k prompts
        const filePath = path.join(__dirname, '..', 'prompts', fileName);
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`❌ Nelze načíst soubor: prompts/${fileName}.`);
        throw err;
    }
};

const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        zprava_od_kouce: { type: SchemaType.STRING },
        tydenni_plan: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    nazev_treninku: { type: SchemaType.STRING },
                    notes: { type: SchemaType.STRING },
                    exercises: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                exercise_template_id: { type: SchemaType.STRING },
                                superset_id: { type: SchemaType.NUMBER, nullable: true },
                                rest_seconds: { type: SchemaType.NUMBER },
                                notes: { type: SchemaType.STRING },
                                sets: {
                                    type: SchemaType.ARRAY,
                                    items: {
                                        type: SchemaType.OBJECT,
                                        properties: {
                                            type: { type: SchemaType.STRING }, // "warmup" / "normal"
                                            weight_kg: { type: SchemaType.NUMBER },
                                            reps: { type: SchemaType.NUMBER },
                                            rpe: { type: SchemaType.NUMBER }
                                        },
                                        required: ["type", "weight_kg", "reps"]
                                    }
                                }
                            },
                            required: ["exercise_template_id", "sets", "rest_seconds"]
                        }
                    }
                },
                required: ["nazev_treninku", "exercises"]
            }
        }
    },
    required: ["zprava_od_kouce", "tydenni_plan"]
};

async function generateTrainingPlan(data) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY environment variable");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.1 }
    });

    // Sestavení promptu z externích souborů
    const prompt = `
        ${loadPrompt('role.txt')}

        [PROFIL ATLETA]
        - Věk/Pohlaví: ${data.age}/${data.gender}
        - Váha: ${data.bodyweight} kg
        - Ostatní sporty: ${data.otherSports}
        - Zranění: ${data.injuries}

        [KONTEXT CYKLU]
        - Fáze: ${data.phase}
        - Pravidla týdne: ${data.rules}
        - Maxima: ${JSON.stringify(data.maxima)}

        ${loadPrompt('safety.txt')}
        ${loadPrompt('components.txt')}

        [TVÁ PRACOVNÍ PLOCHA]
        - KOSTRA: ${JSON.stringify(data.routines)}
        - HISTORIE: ${JSON.stringify(data.history)}

        ${loadPrompt('output.txt')}
    `;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("JSON parse failed. Raw response:", raw);
        throw e;
    }
}

module.exports = { generateTrainingPlan };
