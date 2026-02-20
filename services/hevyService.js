// hevyService.js

// Upravená funkce v hevyService.js
async function getFolderRoutines(apiKey, folderId) {
    console.log(`   [DEBUG] Volám Hevy API pro složku ID: ${folderId}`);
    try {
        let page = 1;
        let allRoutines = [];
        let keepFetching = true;

        // Stránkování - stáhneme ÚPLNĚ VŠECHNY rutiny, co v appce máš
        while (keepFetching) {
            const response = await fetch(`https://api.hevyapp.com/v1/routines?page=${page}&pageSize=10`, {
                headers: { 'api-key': apiKey }
            });
            
            if (response.status === 404) {
                break; // Narazili jsme na konec seznamu
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Hevy API vrátilo HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            const routines = Array.isArray(data) ? data : (data.routines || []);

            if (routines.length === 0) {
                keepFetching = false;
                break;
            }

            allRoutines.push(...routines);

            // Pokud nám API vrátilo méně než 10 rutin, jsme na poslední stránce
            if (routines.length < 10) {
                keepFetching = false;
            }
            
            page++;
        }

        console.log(`   [DEBUG] Staženo celkem ${allRoutines.length} rutin. Filtruji složku...`);

        // Teď teprve filtrujeme podle složky
        const folderRoutines = allRoutines.filter(r => String(r.folder_id) === String(folderId));

        if (folderRoutines.length === 0) {
            throw new Error(`Ve složce s ID ${folderId} nejsou žádné rutiny.`);
        }

        console.log(`   [DEBUG] Ve složce nalezeno ${folderRoutines.length} rutin!`);

        // hevyService.js - Úprava mapování rutin
        return folderRoutines.map(routine => ({
            nazev_rutiny: routine.title || routine.name,
            id_rutiny: routine.id,
            cviky: routine.exercises.map(ex => ({
                nazev: ex.title || ex.name,
                hevy_id: ex.exercise_template_id,
                pocet_predepsanych_serii: ex.sets.length,
                // PŘIDÁNO: Spočítáme warmup série v šabloně
                pocet_warmup_serii: ex.sets.filter(s => s.type === 'warmup').length,
                rest_seconds: ex.rest_seconds,
                superset_id: ex.superset_id
            }))
        }));
    } catch (error) {
        console.error("🧨 [DEBUG HevyService] Selhání při komunikaci s Hevy!");
        throw error;
    }
}

// Přidaná funkce pro historii
async function getLastWorkouts(apiKey, count = 5) {
    try {
        const response = await fetch(`https://api.hevyapp.com/v1/workouts?page=1&pageSize=${count}`, {
            headers: { 'api-key': apiKey }
        });
        
        if (!response.ok) throw new Error(`Hevy API historie selhala: ${response.status}`);
        
        const data = await response.json();
        const workouts = Array.isArray(data) ? data : (data.workouts || []);

        return workouts.map(w => ({
            nazev: w.title,
            datum: new Date(w.start_time).toLocaleDateString('cs-CZ'),
            cviky: w.exercises.map(ex => ({
                nazev: ex.title,
                serie: ex.sets.map(s => `${s.weight_kg}kg x ${s.reps} (RPE ${s.rpe || '?'})`)
            }))
        }));
    } catch (error) {
        console.error("🧨 Chyba při stahování historie!");
        throw error;
    }
}
// Do hevyService.js přidej:

async function updateHevyRoutine(apiKey, routineId, routineData) {
    const response = await fetch(`https://api.hevyapp.com/v1/routines/${routineId}`, {
        method: 'PUT',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(routineData)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hevy API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
}

// Nezapomeň ji vyexportovat
module.exports = { getFolderRoutines, getLastWorkouts, updateHevyRoutine };


