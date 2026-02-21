const fs = require('fs');
const path = require('path');

function getNewExercises() {
    const dbPath = path.join(__dirname, '../templates_db.json');
    const catalogPath = path.join(__dirname, '../config/smart_catalog.json');

    const allTemplates = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    
    // Pokud smart_catalog ještě neexistuje, všechno je "nové"
    if (!fs.existsSync(catalogPath)) return allTemplates;

    const smartCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    
    // Vytvoříme seznam ID, která už v katalogu máme (v rodinách)
    const knownIds = new Set();
    smartCatalog.forEach(family => {
        if (family.bodyweight_id) knownIds.add(family.bodyweight_id);
        if (family.weighted_id) knownIds.add(family.weighted_id);
    });

    // Vrátíme jen ty cviky, které v katalogu chybí
    return allTemplates.filter(ex => !knownIds.has(ex.id));
}

module.exports = { getNewExercises };
