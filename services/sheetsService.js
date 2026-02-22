const { google } = require('googleapis');

async function getSheetsData(spreadsheetId) {
    // 0. Autorizace ke Google Sheets
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    // 1. Čtení Configu (S ošetřením prázdných buněk)
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
            // Zabráníme pádu, pokud je buňka ve sloupci B prázdná
            const val = row[1] ? row[1].trim() : "";
            
            if (row[0] === 'CURRENT_WEEK') currentWeek = parseInt(val) || 1;
            if (row[0] === 'HEVY_FOLDER_ID') targetFolderId = val;
            if (row[0] === 'BODYWEIGHT') bodyweight = parseFloat(val) || 85;
            if (row[0] === 'AGE') age = parseInt(val) || 30;
            if (row[0] === 'GENDER') gender = val || "muž";
            if (row[0] === 'OTHER_SPORTS') otherSports = val || "nic";
            if (row[0] === 'INJURIES') injuries = val || "žádná";
        });
    }

    // 2. Čtení Plánu
    const planData = await sheets.spreadsheets.values.get({ spreadsheetId, range: `Plan!A${currentWeek + 1}:C${currentWeek + 1}` });
    const currentPhase = planData.data.values[0][1];
    const currentRules = planData.data.values[0][2];

    // 3. Čtení 1RM (Nový formát pro AI injektáž!)
    const rmData = await sheets.spreadsheets.values.get({ spreadsheetId, range: '1RM!A2:E200' });
    const user1RM = {};
    if (rmData.data.values) {
        rmData.data.values.forEach(row => {
            const maxKg = parseFloat(row[1]);
            const hevyId = row[3];
            // Pokud máme ID a váha je platné číslo, přidáme do slovníku
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
    // ... obsah funkce incrementWeek zůstává úplně stejný jako máš doteď ...
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

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

module.exports = {
    getSheetsData,
    incrementWeek
};
