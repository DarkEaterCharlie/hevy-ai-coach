const fs = require('fs');
const path = require('path');

function getNewExercises() {
    const dbPath = path.join(__dirname, '../templates_db.json');
    const catalogPath = path.join(__dirname, '../config/smart_catalog.json');

    const allTemplates = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // If smart_catalog doesn't exist yet, treat all exercises as new
    if (!fs.existsSync(catalogPath)) return allTemplates;

    const smartCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    
    // Build a set of exercise IDs already present in the catalog (across all families)
    const knownIds = new Set();
    smartCatalog.forEach(family => {
        if (family.bodyweight_id) knownIds.add(family.bodyweight_id);
        if (family.weighted_id) knownIds.add(family.weighted_id);
    });

    // Return only exercises that are missing from the catalog
    return allTemplates.filter(ex => !knownIds.has(ex.id));
}

module.exports = { getNewExercises };
