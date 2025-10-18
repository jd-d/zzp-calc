const DEFAULTS = {
  comfortMarginPercent: 10,
  seasonalityPercent: 0,
  travelFrictionPercent: 0,
  handsOnQuotaPercent: 50
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(normalized, min), max);
}

function normalizePercent(value, fallback = 0, { min = 0, max = 100 } = {}) {
  const numeric = toNumber(value, fallback);
  return clamp(numeric, min, max);
}

export function normalizeScenarioModifiers(rawModifiers = {}) {
  const comfortMarginPercent = normalizePercent(
    rawModifiers.comfortMarginPercent ?? rawModifiers.comfortMargin,
    DEFAULTS.comfortMarginPercent,
    { min: 0, max: 60 }
  );
  const seasonalityPercent = normalizePercent(
    rawModifiers.seasonalityPercent ?? rawModifiers.seasonality,
    DEFAULTS.seasonalityPercent,
    { min: 0, max: 75 }
  );
  const travelFrictionPercent = normalizePercent(
    rawModifiers.travelFrictionPercent ?? rawModifiers.travelFriction,
    DEFAULTS.travelFrictionPercent,
    { min: 0, max: 150 }
  );
  const handsOnQuotaPercent = normalizePercent(
    rawModifiers.handsOnQuotaPercent ?? rawModifiers.handsOnQuota,
    DEFAULTS.handsOnQuotaPercent,
    { min: 0, max: 100 }
  );

  return {
    comfortMarginPercent,
    comfortMargin: comfortMarginPercent / 100,
    seasonalityPercent,
    seasonality: seasonalityPercent / 100,
    travelFrictionPercent,
    travelFriction: travelFrictionPercent / 100,
    handsOnQuotaPercent,
    handsOnQuota: handsOnQuotaPercent / 100
  };
}

export function applyModifierDefaults(rawModifiers = {}) {
  const normalized = normalizeScenarioModifiers(rawModifiers);
  return {
    comfortMarginPercent: normalized.comfortMarginPercent,
    seasonalityPercent: normalized.seasonalityPercent,
    travelFrictionPercent: normalized.travelFrictionPercent,
    handsOnQuotaPercent: normalized.handsOnQuotaPercent
  };
}

export const DEFAULT_MODIFIERS = { ...DEFAULTS };
