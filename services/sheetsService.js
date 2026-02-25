const { google } = require('googleapis');

async function getSheetsData(spreadsheetId) {
    // Authenticate with Google Sheets API
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // 1. Read Config sheet (handle empty cells gracefully)
    const configData = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Config!A2:B20' });
    let currentWeek = 1;
    let targetFolderId = "";
    let bodyweight = 85;
    let age = 30;
    let gender = "male";
    let otherSports = "none";
    let injuries = "none";

    if (configData.data.values) {
        configData.data.values.forEach(row => {
            // Guard against empty column B cells
            const val = row[1] ? row[1].trim() : "";

            if (row[0] === 'CURRENT_WEEK') currentWeek = parseInt(val) || 1;
            if (row[0] === 'HEVY_FOLDER_ID') targetFolderId = val;
            if (row[0] === 'BODYWEIGHT') bodyweight = parseFloat(val) || 85;
            if (row[0] === 'AGE') age = parseInt(val) || 30;
            if (row[0] === 'GENDER') gender = val || "male";
            if (row[0] === 'OTHER_SPORTS') otherSports = val || "none";
            if (row[0] === 'INJURIES') injuries = val || "none";
        });
    }

    // 2. Read Plan sheet
    const planData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `Plan!A${currentWeek + 1}:C${currentWeek + 1}` });
    const currentPhase = planData.data.values[0][1];
    const currentRules = planData.data.values[0][2];

    // 3. Read 1RM sheet (for AI injection)
    const rmData = await sheets.spreadsheets.values.get({ spreadsheetId, range: '1RM!A2:E200' });
    const user1RM = {};
    if (rmData.data.values) {
        rmData.data.values.forEach(row => {
            const maxKg = parseFloat(row[1]);
            const hevyId = row[3];
            // Only include entries where we have both an ID and a valid weight
            if (hevyId && !isNaN(maxKg)) {
                user1RM[hevyId] = maxKg;
            }
        });
    }

    return {
        currentWeek,
        targetFolderId,
        bodyweight,
        currentPhase,
        currentRules,
        user1RM,
        age,
        gender,
        otherSports,
        injuries
    };
}

async function incrementWeek(spreadsheetId, currentWeek) {
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    let nextWeek = currentWeek + 1;
    if (nextWeek > 12) {
        console.log("♻️ Cycle complete. Resetting to week 1.");
        nextWeek = 1;
    }

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Config!B2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nextWeek]] },
    });

    console.log(`📅 Week counter in spreadsheet advanced to: ${nextWeek}`);
}

module.exports = {
    getSheetsData,
    incrementWeek
};
