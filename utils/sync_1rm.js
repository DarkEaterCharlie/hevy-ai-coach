require("dotenv").config();
const fs = require("fs");
const { google } = require("googleapis");

async function sync1RMToSheets(userBw) {
  const apiKey = process.env.HEVY_API_KEY;
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!apiKey || !spreadsheetId) {
    console.error(
      "❌ ERROR: Check your .env file — HEVY_API_KEY or SPREADSHEET_ID is missing.",
    );
    return;
  }
  if (!userBw) {
    console.error("❌ ERROR: No bodyweight provided for 1RM calculation!");
    return;
  }

  try {
    console.log(
      "📊 [Sync 1RM] Connecting to Google Sheets to read CURRENT maxes...",
    );
    const auth = new google.auth.GoogleAuth({
      keyFile: "./google-credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({
      version: "v4",
      auth: await auth.getClient(),
    });

    // --- 1. NAČTENÍ EXISTUJÍCÍCH DAT Z TABULKY (abychom je nemuseli tahat z Hevy) ---
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "1RM!A2:E200",
    });
    const best1RM = {};

    if (existingData.data.values) {
      existingData.data.values.forEach((row) => {
        const exId = row[3]; // Hevy_ID
        if (exId) {
          best1RM[exId] = {
            name: row[0],
            rm: parseFloat(row[1]) || 0,
            date: row[2],
            id: exId,
            info: row[4],
          };
        }
      });
    }
    console.log(
      `✅ Loaded ${Object.keys(best1RM).length} existing 1RMs from Sheets.`,
    );

    // --- 2. NAČTENÍ LOKÁLNÍ DATABÁZE CVIKŮ ---
    if (!fs.existsSync("./templates_db.json")) {
      console.error(
        "❌ ERROR: templates_db.json not found. Run sync_templates.js first!",
      );
      return;
    }
    const templatesArray = JSON.parse(
      fs.readFileSync("./templates_db.json", "utf-8"),
    );
    const templatesMap = {};
    templatesArray.forEach((t) => (templatesMap[t.id] = t));

    // --- 3. STAŽENÍ TRÉNINKŮ Z HEVY (POUZE POSLEDNÍCH 14 DNÍ!) ---
    console.log(
      "🔄 [Sync 1RM] Fetching recent workout history (last 14 days only)...",
    );
    let page = 1;
    let allWorkouts = [];
    let keepFetching = true;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 14); // Nastaveno na 14 dní dozadu

    while (keepFetching) {
      const response = await fetch(
        `https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`,
        {
          headers: { "api-key": apiKey },
        },
      );

      if (response.status === 404) break;
      if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);

      const data = await response.json();
      const workouts = Array.isArray(data) ? data : data.workouts || [];

      if (workouts.length === 0) break;

      for (const workout of workouts) {
        if (new Date(workout.start_time) < cutoffDate) {
          keepFetching = false; // Našli jsme starší trénink -> končíme stahování
          break;
        }
        allWorkouts.push(workout);
      }
      if (workouts.length < 10) keepFetching = false;
      page++;
    }
    console.log(`✅ Processing ${allWorkouts.length} recent workouts...`);

    // --- 4. VÝPOČET NOVÝCH MAXIMÁLEK A JEJICH POROVNÁNÍ SE STARÝMI ---
    allWorkouts.forEach((workout) => {
      if (!workout.exercises) return;

      workout.exercises.forEach((exercise) => {
        const exId = exercise.exercise_template_id;
        const template = templatesMap[exId];

        if (
          !template ||
          template.type === "reps_only" ||
          template.type === "duration"
        )
          return;

        const exName = exercise.title || template.title;

        exercise.sets.forEach((set) => {
          if (set.set_type === "warmup" || !set.reps) return;

          let liftedWeight = set.weight_kg || 0;

          // Pro bodyweight přidáme tělesnou váhu
          if (
            template.equipment === "none" ||
            template.equipment === "body_only" ||
            template.type === "bodyweight"
          ) {
            liftedWeight += userBw;
          }
          if (liftedWeight === 0) return;

          const rpe = set.rpe || 10;
          const rir = 10 - rpe;
          const effectiveReps = set.reps + rir;
          const current1RM = liftedWeight * (1 + effectiveReps / 30);

          // Pokud cvik v tabulce ještě není, NEBO jsme teď zvedli víc, aktualizujeme záznam
          if (!best1RM[exId] || current1RM > best1RM[exId].rm) {
            best1RM[exId] = {
              id: exId,
              name: exName,
              rm: Math.round(current1RM * 10) / 10,
              date: new Date(workout.start_time).toLocaleDateString("en-US"),
              info: `${set.weight_kg || 0}kg x ${set.reps} @ RPE ${rpe} (Recent)`,
            };
          }
        });
      });
    });

    // --- 5. ZÁPIS AKTUALIZOVANÝCH DAT ZPĚT DO GOOGLE SHEETS ---
    const resultsArray = Object.values(best1RM).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const sheetsData = [
      [
        "Exercise",
        "Current_1RM_kg",
        "Date_Updated",
        "Hevy_ID",
        "Source_Calculation",
      ],
    ];

    resultsArray.forEach((item) => {
      sheetsData.push([item.name, item.rm, item.date, item.id, item.info]);
    });

    // Smažeme stará data
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "1RM!A:E",
    });

    // Zapíšeme updatovaná data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "1RM!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: sheetsData },
    });

    console.log(
      `✅ Successfully updated ${resultsArray.length} exercises to Google Sheets (1RM tab).`,
    );
  } catch (error) {
    console.error("❌ ERROR:", error.message);
  }
}

module.exports = { sync1RMToSheets };
