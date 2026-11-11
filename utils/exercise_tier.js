const HEAVY_COMPOUND_MUSCLES = [
  "chest",
  "shoulders",
  "quadriceps",
  "glutes",
  "hamstrings",
  "upper_back",
  "lats",
];

/**
 * Single source of truth for progression tiers.
 * Used both when briefing the AI (coach.js) and when enforcing warm-ups (writer.js).
 */
function getProgressionTier(template = {}) {
  if (template.primary_muscle_group === "cardio") return "CARDIO_IGNORE";
  if (template.type === "bodyweight_weighted") return "WEIGHTED_BODYWEIGHT";
  if (
    template.type === "reps_only" &&
    (template.equipment === "none" || template.equipment === "suspension")
  ) {
    return "PURE_BODYWEIGHT";
  }
  if (
    template.equipment === "barbell" &&
    HEAVY_COMPOUND_MUSCLES.includes(template.primary_muscle_group)
  ) {
    return "HEAVY_COMPOUND";
  }
  return "ISOLATION_MACHINE";
}

module.exports = { getProgressionTier, HEAVY_COMPOUND_MUSCLES };
