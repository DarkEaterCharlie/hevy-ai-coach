const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Helper to load prompt files
const loadPrompt = (fileName) => {
    try {
        const filePath = path.join(__dirname, '..', 'prompts', fileName);
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.warn(`⚠️ Warning: prompts/${fileName} not found, skipping.`);
        return "";
    }
};

const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        coach_message: { type: SchemaType.STRING },
        weekly_plan: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    workout_name: { type: SchemaType.STRING },
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
                                            duration_seconds: { type: SchemaType.NUMBER },
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
                required: ["workout_name", "exercises"]
            }
        }
    },
    required: ["coach_message", "weekly_plan"]
};

async function generateTrainingPlan(data) {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
        throw new Error("❌ Missing GOOGLE_GENAI_API_KEY in .env file");
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2 // Low temperature for consistent, precise output
        }
    });

    const prompt = `
        ${loadPrompt('role.txt')}

        [TRAINING CYCLE STRATEGY - WEEK ${data.currentWeek || '1'}/12]
        - Phase: ${data.periodization?.phase || 'Stabilization'}
        - Intensity: ${data.periodization?.intensity || 'Moderate'}
        - Target RPE: ${data.periodization?.rpeTarget || 8}
        - Percentage of 1RM: ${((data.periodization?.volumeWeight || 0.75) * 100).toFixed(0)}%
        - Week note: ${data.periodization?.note || 'Standard progression'}

        [ATHLETE PROFILE]
        - Age: ${data.age} years
        - Gender: ${data.gender}
        - Current bodyweight: ${data.bodyweight} kg
        - Other sports: ${data.otherSports}
        - Injuries / Limitations: ${data.injuries}
        - Current focus: ${data.currentPhase}

        ${loadPrompt('safety.txt')}
        ${loadPrompt('components.txt')}
        ${loadPrompt('progression.txt')}

        [SMART CATALOG - EXERCISE FAMILIES AND REP THRESHOLDS]
        ${JSON.stringify(data.smartCatalog)}

        [YOUR WORKSPACE - ROUTINE TEMPLATES]
        ${JSON.stringify(data.routines)}

        [RECENT WORKOUT HISTORY]
        ${JSON.stringify(data.history)}

        ${loadPrompt('output.txt')}
    `;

    try {
        const result = await model.generateContent(prompt);
        return JSON.parse(result.response.text());
    } catch (e) {
        console.error("❌ Critical AI generation error:", e);
        throw e;
    }
}

module.exports = { generateTrainingPlan };
