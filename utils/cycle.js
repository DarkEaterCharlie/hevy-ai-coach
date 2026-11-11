const fs = require("fs");
const path = require("path");

const PROFILE_PATH = path.join(__dirname, "..", "config", "cycle_profile.json");

const PHASE_ORDER = [
  "menstrual",
  "follicular",
  "ovulatory",
  "early_luteal",
  "late_luteal",
];

function loadCycleProfile() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
}

function isAffirmative(value) {
  return /^(yes|y|true|1|ano|on|enabled)$/i.test(String(value || "").trim());
}

/** Accepts YYYY-MM-DD, DD.MM.YYYY and DD/MM/YYYY. Returns a UTC midnight Date or null. */
function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  }

  match = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (match) {
    return new Date(Date.UTC(+match[3], +match[2] - 1, +match[1]));
  }

  const fallback = new Date(raw);
  if (isNaN(fallback.getTime())) return null;
  return new Date(
    Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()),
  );
}

function toUtcMidnight(date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}

/**
 * Maps a cycle day onto a phase. The luteal phase is roughly fixed (~14 days),
 * so the follicular phase absorbs the variability of longer/shorter cycles.
 */
function resolvePhase(cycleDay, cycleLength, profile) {
  const menstrualEnd = Math.min(profile.menstrual_days, cycleLength);
  const ovulationDay = Math.max(
    menstrualEnd + 1,
    cycleLength - profile.luteal_phase_days,
  );
  const ovulatoryStart = ovulationDay - profile.ovulatory_window_days;
  const ovulatoryEnd = ovulationDay + profile.ovulatory_window_days;
  const lateLutealStart = cycleLength - 5;

  if (cycleDay <= menstrualEnd) return "menstrual";
  if (cycleDay < ovulatoryStart) return "follicular";
  if (cycleDay <= ovulatoryEnd) return "ovulatory";
  if (cycleDay < lateLutealStart) return "early_luteal";
  return "late_luteal";
}

function disabled(reason) {
  return {
    enabled: false,
    reason,
    loadMultiplier: 1,
    volumeMultiplier: 1,
    rpeCap: null,
    restBonusSeconds: 0,
  };
}

/**
 * Resolves the athlete's current cycle phase and the autoregulation it implies.
 * Returns a disabled state (all multipliers neutral) whenever tracking is off,
 * the start date is missing/unparsable, or the data is too old to trust.
 */
function getCycleState({
  tracking,
  lastPeriodStart,
  cycleLength,
  phaseOverride,
  today = new Date(),
} = {}) {
  const profile = loadCycleProfile();

  if (!isAffirmative(tracking)) {
    return disabled("Cycle tracking is off (CYCLE_TRACKING).");
  }

  const length = Math.round(
    Number(cycleLength) || profile.default_cycle_length,
  );
  if (length < 20 || length > 45) {
    return disabled(
      `CYCLE_LENGTH ${cycleLength} is outside the supported 20-45 day range.`,
    );
  }

  const override = String(phaseOverride || "")
    .trim()
    .toLowerCase();
  if (override && !PHASE_ORDER.includes(override)) {
    return disabled(
      `CYCLE_PHASE_OVERRIDE "${phaseOverride}" is not one of: ${PHASE_ORDER.join(", ")}.`,
    );
  }

  let cycleDay = null;
  if (!override) {
    const start = parseDate(lastPeriodStart);
    if (!start) {
      return disabled(
        "LAST_PERIOD_START is missing or unreadable (use YYYY-MM-DD).",
      );
    }

    const daysSince = Math.floor(
      (toUtcMidnight(today) - start) / (24 * 60 * 60 * 1000),
    );
    if (daysSince < 0) {
      return disabled("LAST_PERIOD_START is in the future.");
    }
    if (daysSince > length * profile.max_stale_multiplier) {
      return disabled(
        `LAST_PERIOD_START is ${daysSince} days old - too stale to guess a phase. Update it or set CYCLE_PHASE_OVERRIDE.`,
      );
    }

    cycleDay = (daysSince % length) + 1;
  }

  const phase = override || resolvePhase(cycleDay, length, profile);
  const rules = profile.phases[phase];

  return {
    enabled: true,
    reason: null,
    phase,
    label: rules.label,
    cycleDay,
    cycleLength: length,
    manualOverride: Boolean(override),
    loadMultiplier: rules.load_multiplier,
    volumeMultiplier: rules.volume_multiplier,
    rpeCap: rules.rpe_cap,
    restBonusSeconds: rules.rest_bonus_seconds,
    note: rules.note,
  };
}

function roundToStep(weight, step) {
  const safeStep = step > 0 ? step : 1;
  return Math.round(weight / safeStep) * safeStep;
}

/**
 * Applies the phase load multiplier to working sets.
 * Bodyweight (0 kg) and duration-only sets are left untouched.
 */
function applyCycleScaling(sets, cycleState, { step = 2.5 } = {}) {
  if (!cycleState || !cycleState.enabled || cycleState.loadMultiplier === 1) {
    return sets;
  }

  return sets.map((set) => {
    if (set.type === "warmup") return set;
    if (!set.weight_kg) return set;

    const scaled = roundToStep(set.weight_kg * cycleState.loadMultiplier, step);
    return { ...set, weight_kg: scaled > 0 ? scaled : set.weight_kg };
  });
}

/** Caps the number of working sets by the phase volume multiplier (never below 1). */
function applyCycleVolume(sets, cycleState) {
  if (!cycleState || !cycleState.enabled || cycleState.volumeMultiplier >= 1) {
    return sets;
  }

  const working = sets.filter((s) => s.type === "normal");
  const keep = Math.max(
    1,
    Math.round(working.length * cycleState.volumeMultiplier),
  );
  if (keep >= working.length) return sets;

  let kept = 0;
  return sets.filter((s) => {
    if (s.type !== "normal") return true;
    kept += 1;
    return kept <= keep;
  });
}

function describeCycleState(cycleState) {
  if (!cycleState || !cycleState.enabled) return null;

  const position = cycleState.manualOverride
    ? "manual override"
    : `day ${cycleState.cycleDay}/${cycleState.cycleLength}`;
  const load = Math.round((cycleState.loadMultiplier - 1) * 100);
  const loadText =
    load === 0 ? "load unchanged" : `load ${load > 0 ? "+" : ""}${load}%`;

  return `Cycle: ${cycleState.label} (${position}) - ${loadText}, RPE cap ${cycleState.rpeCap}`;
}

module.exports = {
  getCycleState,
  applyCycleScaling,
  applyCycleVolume,
  describeCycleState,
  resolvePhase,
  parseDate,
  roundToStep,
  loadCycleProfile,
  PHASE_ORDER,
};
