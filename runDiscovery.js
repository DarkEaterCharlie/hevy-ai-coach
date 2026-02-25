require("dotenv").config();
const { downloadExerciseDatabase } = require("./utils/sync_templates");
const { getNewExercises } = require("./services/comparisonService");
const {
  discoverExerciseRelationships,
} = require("./services/discoveryService");

async function run() {
  try {
    console.log("🚀 [v2.0] START: Aktualizace a Discovery...");

    // 1. Stáhni čerstvá data
    await downloadExerciseDatabase();

    // 2. Najdi rozdíly
    const newExercises = getNewExercises();

    if (newExercises.length === 0) {
      console.log("✨ Žádné nové cviky k analýze. Smart Catalog je aktuální.");
      return;
    }

    console.log(
      `🔍 Nalezeno ${newExercises.length} nových cviků. Spouštím AI analýzu...`,
    );

    // 3. Pošli jen novinky do Gemini (discoveryService.js, který už máš)'
    await discoverExerciseRelationships(
      process.env.GEMINI_API_KEY,
      newExercises,
    );

    console.log("🎯 Mise splněna. Tvůj Smart Catalog je v kondici!");
  } catch (err) {
    console.error("🧨 KRITICKÁ CHYBA:", err.message);
  }
}

run();
