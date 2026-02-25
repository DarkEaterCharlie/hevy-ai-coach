// hevyService.js

async function getFolderRoutines(apiKey, folderId) {
    console.log(`   [Hevy] Fetching routines for folder ID: ${folderId}...`);
    try {
        let page = 1;
        let allRoutines = [];
        let keepFetching = true;

        // Paginate through ALL routines in the account
        while (keepFetching) {
            const response = await fetch(`https://api.hevyapp.com/v1/routines?page=${page}&pageSize=10`, {
                headers: { 'api-key': apiKey }
            });

            if (response.status === 404) {
                break; // Reached end of list
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Hevy API returned HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const routines = Array.isArray(data) ? data : (data.routines || []);

            if (routines.length === 0) {
                keepFetching = false;
                break;
            }

            allRoutines.push(...routines);

            // If API returned fewer than 10 routines, we're on the last page
            if (routines.length < 10) {
                keepFetching = false;
            }

            page++;
        }

        console.log(`   [Hevy] Downloaded ${allRoutines.length} routines total. Filtering by folder...`);

        // Filter by target folder
        const folderRoutines = allRoutines.filter(r => String(r.folder_id) === String(folderId));

        if (folderRoutines.length === 0) {
            throw new Error(`No routines found in folder with ID ${folderId}.`);
        }

        console.log(`   [Hevy] Found ${folderRoutines.length} routines in folder.`);

        return folderRoutines.map(routine => ({
            routine_name: routine.title || routine.name,
            routine_id: routine.id,
            exercises: routine.exercises.map(ex => ({
                name: ex.title || ex.name,
                hevy_id: ex.exercise_template_id,
                prescribed_sets: ex.sets.length,
                warmup_sets: ex.sets.filter(s => s.type === 'warmup').length,
                rest_seconds: ex.rest_seconds,
                superset_id: ex.superset_id
            }))
        }));
    } catch (error) {
        console.error("🧨 [Hevy] Failed to communicate with Hevy API!");
        throw error;
    }
}

async function getLastWorkouts(apiKey, count = 5) {
    try {
        const response = await fetch(`https://api.hevyapp.com/v1/workouts?page=1&pageSize=${count}`, {
            headers: { 'api-key': apiKey }
        });

        if (!response.ok) throw new Error(`Hevy API workout history request failed: ${response.status}`);

        const data = await response.json();
        const workouts = Array.isArray(data) ? data : (data.workouts || []);

        return workouts.map(w => ({
            name: w.title,
            date: new Date(w.start_time).toLocaleDateString('en-US'),
            timestamp: new Date(w.start_time).getTime(),
            exercises: w.exercises.map(ex => ({
                name: ex.title,
                sets: ex.sets.map(s => `${s.weight_kg}kg x ${s.reps} (RPE ${s.rpe || '?'})`)
            }))
        }));
    } catch (error) {
        console.error("🧨 Error fetching workout history!");
        throw error;
    }
}

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

module.exports = { getFolderRoutines, getLastWorkouts, updateHevyRoutine };
