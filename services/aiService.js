const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Pomocník pro načítání promptů
const loadPrompt = (fileName) => {
    try {
        const filePath = path.join(__dirname, '..', 'prompts', fileName);
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.warn(`⚠️ Varování: Soubor prompts/${fileName} nenalezen, pokračuji bez něj.`);
        return "";
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
                                            type: { type: SchemaType.STRING },
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
    // 1. OPRAVA: Název klíče musí odpovídat tvému .env (GOOGLE_GENAI_API_KEY)
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
        throw new Error("❌ Missing GOOGLE_GENAI_API_KEY in .env file");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 2. OPRAVA: Model (použijeme aktuální flash, je bleskový a chytrý)
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2 // Trošku víc kreativity pro 'zpravu_od_kouce'
        }
    });

    // 3. SESTAVENÍ PROMPTU (Mapování na tvou novou DB strukturu)
    const prompt = `
        ${loadPrompt('role.txt')}
        
      [STRATEGIE CYKLU - TÝDEN ${data.currentWeek || '1'}/12]
              - Fáze: ${data.periodization?.phase || 'Stabilizace'}
              - Intenzita: ${data.periodization?.intensity || 'Střední'}
              - Cílové RPE: ${data.periodization?.rpeTarget || 8}
              - Procento z 1RM: ${((data.periodization?.volumeWeight || 0.75) * 100).toFixed(0)}%
              - Poznámka k týdnu: ${data.periodization?.note || 'Standardní progres'}

        [PROFIL ATLETA]
        - Věk: ${data.age} let
        - Pohlaví: ${data.gender}
        - Aktuální váha: ${data.bodyweight} kg
        - Ostatní sporty: ${data.otherSports}
        - Zranění/Omezení: ${data.injuries}
        - Aktuální zaměření: ${data.currentPhase}


        ${loadPrompt('safety.txt')}
        ${loadPrompt('components.txt')}
        ${loadPrompt('progression.txt')}
    
        [SMART CATALOG - RODINY CVIKŮ A LIMITY OPAKOVÁNÍ]
        ${JSON.stringify(data.smartCatalog)}
    
        [TVÁ PRACOVNÍ PLOCHA - ŠABLONY]
        ${JSON.stringify(data.routines)}

        [HISTORIE POSLEDNÍCH TRÉNINKŮ]
        ${JSON.stringify(data.history)}

        ${loadPrompt('output.txt')}
    `;

    try {
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (e) {
        console.error("❌ Kritická chyba AI generování:", e);
        throw e;
    }
}

module.exports = { generateTrainingPlan };
