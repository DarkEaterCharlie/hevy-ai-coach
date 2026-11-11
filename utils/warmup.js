const fs = require("fs");
const path = require("path");

const PROTOCOL_PATH = path.join(
  __dirname,
  "..",
  "config",
  "warmup_protocol.json",
);

function loadWarmupProtocol() {
  return JSON.parse(fs.readFileSync(PROTOCOL_PATH, "utf-8"));
}

function tierRules(tier, protocol) {
  return protocol.tiers[tier] || protocol.tiers.ISOLATION_MACHINE;
}

function roundToStep(weight, step) {
  const safeStep = step > 0 ? step : 1;
  return Math.round(weight / safeStep) * safeStep;
}

/** The general block that goes into every routine's notes in Hevy. */
function buildGeneralWarmupText(protocol = loadWarmupProtocol()) {
  const block = protocol.general_warmup;
  return [block.title, ...block.steps].join("\n");
}

/**
 * Builds ramp-up sets leading into the first working set.
 * Percentages/reps come from the tier rules; if more sets are required than the
 * rules define, the ramp is extended downwards from the lightest step.
 */
function buildWarmupSets({ tier, workSet, count, protocol }) {
  if (count <= 0) return [];

  const rules = tierRules(tier, protocol);
  const workWeight = workSet.weight_kg || 0;
  const workReps = workSet.reps || 8;

  const percentages = [...rules.percentages];
  const reps = [...rules.reps];
  while (percentages.length < count) {
    percentages.unshift(percentages.length ? percentages[0] / 2 : 0);
    reps.unshift(reps.length ? reps[0] + 3 : workReps + 4);
  }

  // Take the heaviest `count` steps so a 3-step ramp stays 40/60/80 %.
  const selectedPct = percentages.slice(percentages.length - count);
  const selectedReps = reps.slice(reps.length - count);

  const built = selectedPct.map((pct, i) => {
    let weight = roundToStep(workWeight * pct, rules.weight_step);
    if (workWeight > 0 && pct > 0 && rules.min_weight_kg) {
      weight = Math.max(weight, rules.min_weight_kg);
    }
    if (weight > workWeight) weight = workWeight;

    return {
      type: "warmup",
      weight_kg: weight,
      reps: selectedReps[i] ?? workReps + 2,
    };
  });

  // Light working weights can collapse several rungs onto the same load
  // (e.g. an empty bar); keep one set per distinct weight.
  const deduped = built.filter(
    (set, i) => i === 0 || set.weight_kg !== built[i - 1].weight_kg,
  );

  return deduped.length > 0 ? deduped : built.slice(0, 1);
}

/**
 * Guarantees the mandatory ramp-up for an exercise.
 * Existing warm-up sets are never removed - only the missing ones are prepended.
 * Returns { sets, added }.
 */
function ensureWarmupSets({
  sets,
  tier,
  templateWarmupCount = 0,
  protocol = loadWarmupProtocol(),
}) {
  const rules = tierRules(tier, protocol);
  const required = Math.max(rules.min_sets || 0, templateWarmupCount || 0);
  const existing = sets.filter((s) => s.type === "warmup").length;
  const missing = required - existing;

  const firstWorkSet = sets.find((s) => s.type === "normal");
  if (missing <= 0 || !firstWorkSet) {
    return { sets, added: 0 };
  }

  const generated = buildWarmupSets({
    tier,
    workSet: firstWorkSet,
    count: missing,
    protocol,
  });

  return { sets: [...generated, ...sets], added: generated.length };
}

module.exports = {
  loadWarmupProtocol,
  buildGeneralWarmupText,
  buildWarmupSets,
  ensureWarmupSets,
};
