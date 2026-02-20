const { google } = require('googleapis');

async function getSheetsData(spreadsheetId) {
    // 0. Autorizace ke Google Sheets
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // 1. Čtení Configu (Rozšířeno pro profil atleta)
    const configData = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Config!A2:B20' });
    let currentWeek = 1;
    let targetFolderId = "";
    let bodyweight = 85;
    let age = 30;
    let gender = "muž";
    let otherSports = "nic";
    let injuries = "žádná";

    if (configData.data.values) {
        configData.data.values.forEach(row => {
            if (row[0] === 'CURRENT_WEEK') currentWeek = parseInt(row[1]);
            if (row[0] === 'HEVY_FOLDER_ID') targetFolderId = row[1];
            if (row[0] === 'BODYWEIGHT') bodyweight = parseFloat(row[1]);
            if (row[0] === 'AGE') age = parseInt(row[1]);
            if (row[0] === 'GENDER') gender = row[1];
            if (row[0] === 'OTHER_SPORTS') otherSports = row[1];
            if (row[0] === 'INJURIES') injuries = row[1];
        });
    }

    // 2. Čtení Plánu
    const planData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `Plan!A${currentWeek + 1}:C${currentWeek + 1}` });
    const currentPhase = planData.data.values[0][1];
    const currentRules = planData.data.values[0][2];

    // 3. Čtení 1RM
    const rmData = await sheets.spreadsheets.values.get({ spreadsheetId, range: '1RM!A2:E100' });
    const user1RM = rmData.data.values ? rmData.data.values.map(row => ({
        cvik: row[0],
        max_kg: row[1],
        hevy_id: row[3]
    })) : [];

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

/**
 * Aktualizuje číslo týdne v Google Tabulce
 */
async function incrementWeek(spreadsheetId, currentWeek) {
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // Logika restartu: po 12 týdnech znova od 1
    let nextWeek = currentWeek + 1;
    if (nextWeek > 12) {
        console.log("♻️ Cyklus dokončen. Restartuji na týden 1.");
        nextWeek = 1;
    }

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Config!B2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nextWeek]] },
    });

    console.log(`📅 Týden v tabulce posunut na: ${nextWeek}`);
}

// JEDEN SPOLEČNÝ EXPORT PRO VŠECHNY FUNKCE
module.exports = {
    getSheetsData,
    incrementWeek
};
