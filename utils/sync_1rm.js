require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');

async function sync1RMToSheets(userBw) {
    const apiKey = process.env.HEVY_API_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!apiKey || !spreadsheetId) {
        console.error("❌ ERROR: Check your .env file — HEVY_API_KEY or SPREADSHEET_ID is missing.");
        return;
    }
    if (!userBw) {
        console.error("❌ ERROR: No bodyweight provided for 1RM calculation!");
        return;
    }

    try {
        // --- 1. LOAD LOCAL EXERCISE DATABASE ---
        console.log("📂 Loading local exercise catalog (templates_db.json)...");
        if (!fs.existsSync('./templates_db.json')) {
            console.error("❌ ERROR: templates_db.json not found. Run sync_templates.js first!");
            return;
        }
        const templatesArray = JSON.parse(fs.readFileSync('./templates_db.json', 'utf-8'));
        const templatesMap = {};
        templatesArray.forEach(t => templatesMap[t.id] = t);
        console.log(`✅ Loaded ${templatesArray.length} exercises from disk.\n`);

        // --- 2. FETCH WORKOUT HISTORY FROM HEVY (last 6 months) ---
        console.log("🔄 Fetching workout history (up to 6 months back)...");
        let page = 1;
        let allWorkouts = [];
        let keepFetching = true;

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        while (keepFetching) {
            process.stdout.write(`⏳ Page ${page}... `);
            const response = await fetch(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, {
                headers: { 'api-key': apiKey }
            });

            if (response.status === 404) {
                console.log("🏁 End of history (404).");
                break;
            }
            if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);

            const data = await response.json();
            const workouts = Array.isArray(data) ? data : (data.workouts || []);

            if (workouts.length === 0) break;

            for (const workout of workouts) {
                if (new Date(workout.start_time) < sixMonthsAgo) {
                    keepFetching = false;
                    break;
                }
                allWorkouts.push(workout);
            }
            if (workouts.length < 10) keepFetching = false;

            console.log("OK");
            page++;
        }
        console.log(`✅ Processing ${allWorkouts.length} workouts...\n`);

        // --- 3. CALCULATE SMART 1RM ---
        const best1RM = {};

        allWorkouts.forEach(workout => {
            if (!workout.exercises) return;

            workout.exercises.forEach(exercise => {
                const exId = exercise.exercise_template_id;
                const template = templatesMap[exId];

                if (!template || template.type === 'reps_only' || template.type === 'duration') return;

                const exName = exercise.title || template.title;

                exercise.sets.forEach(set => {
                    if (set.set_type === 'warmup' || !set.reps) return;

                    let liftedWeight = set.weight_kg || 0;

                    // For bodyweight exercises, add athlete bodyweight to bar weight
                    if (template.equipment === 'none' || template.equipment === 'body_only' || template.type === 'bodyweight') {
                        liftedWeight += userBw;
                    }
                    if (liftedWeight === 0) return;

                    const rpe = set.rpe || 10;
                    const rir = 10 - rpe;
                    const effectiveReps = set.reps + rir;
                    const raw1rm = liftedWeight * (1 + effectiveReps / 30);

                    // --- TIME DECAY (Corrosion) ---
                    // Reduce estimated 1RM by 2.5% per month of staleness
                    const workoutDate = new Date(workout.start_time);
                    const today = new Date();
                    const diffDays = (today - workoutDate) / (1000 * 60 * 60 * 24);
                    const diffMonths = Math.max(0, diffDays / 30);

                    const penaltyMultiplier = Math.max(0.5, 1 - (diffMonths * 0.025));
                    const current1RM = raw1rm * penaltyMultiplier;
                    // --- END TIME DECAY ---

                    if (!best1RM[exId] || current1RM > best1RM[exId].rm) {
                        best1RM[exId] = {
                            id: exId,
                            name: exName,
                            rm: Math.round(current1RM * 10) / 10,
                            date: workoutDate.toLocaleDateString('en-US'),
                            info: `${set.weight_kg || 0}kg x ${set.reps} @ RPE ${rpe} (Decay: -${Math.round((1 - penaltyMultiplier) * 100)}%)`
                        };
                    }
                });
            });
        });

        // --- 4. PREPARE DATA FOR GOOGLE SHEETS ---
        // Sort alphabetically by exercise name
        const resultsArray = Object.values(best1RM).sort((a, b) => a.name.localeCompare(b.name));

        const sheetsData = [
            ['Exercise', 'Current_1RM_kg', 'Date_Updated', 'Hevy_ID', 'Source_Calculation'] // Header row
        ];

        resultsArray.forEach(item => {
            sheetsData.push([item.name, item.rm, item.date, item.id, item.info]);
        });

        // --- 5. WRITE TO GOOGLE SHEETS ---
        console.log("📊 Connecting to Google Sheets...");
        const auth = new google.auth.GoogleAuth({
            keyFile: './google-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

        // Clear old data first to avoid stale entries
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: '1RM!A:E',
        });

        // Write updated data
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: '1RM!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: sheetsData },
        });

        console.log(`✅ Successfully wrote ${resultsArray.length} exercises to Google Sheets (1RM tab).`);

    } catch (error) {
        console.error("❌ ERROR:", error.message);
    }
}

module.exports = { sync1RMToSheets };
