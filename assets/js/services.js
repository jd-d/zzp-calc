import { calcState } from './state.js';
import { computeCosts } from './costs.js';
import { deriveIncomeTargets } from './income.js';
import { normalizeScenarioModifiers } from './modifiers.js';
import { calculateTaxReserve } from './tax2025.js';
import { SERVICE_COPY, SERVICE_DEFAULTS } from './config/services.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTruthyFlag(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === 'locked';
  }
  return Boolean(value);
}

function isRateLocked(config = {}) {
  if (!isPlainObject(config)) {
    return false;
  }
  if (isTruthyFlag(config.lockedRate) || isTruthyFlag(config.rateLocked)) {
    return true;
  }
  if (typeof config.lock === 'string') {
    return config.lock.toLowerCase() === 'rate' || config.lock.toLowerCase() === 'price';
  }
  if (typeof config.lockMode === 'string') {
    return config.lockMode.toLowerCase() === 'rate' || config.lockMode.toLowerCase() === 'price';
  }
  return false;
}

function isVolumeLocked(config = {}) {
  if (!isPlainObject(config)) {
    return false;
  }
  if (isTruthyFlag(config.lockedVolume) || isTruthyFlag(config.volumeLocked)) {
    return true;
  }
  if (typeof config.lock === 'string') {
    return config.lock.toLowerCase() === 'volume' || config.lock.toLowerCase() === 'units';
  }
  if (typeof config.lockMode === 'string') {
    return config.lockMode.toLowerCase() === 'volume' || config.lockMode.toLowerCase() === 'units';
  }
  return false;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositive(value, fallback = 0) {
  const numeric = toNumber(value, fallback);
  return numeric > 0 ? numeric : 0;
}

function clamp(value, min, max) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(normalized, min), max);
}

function clonePlain(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => {
      if (Array.isArray(val)) {
        return [key, val.slice()];
      }
      if (isPlainObject(val)) {
        return [key, clonePlain(val)];
      }
      return [key, val];
    })
  );
}

function mergeConfig(defaults, overrides) {
  const base = { ...defaults };
  if (!isPlainObject(overrides)) {
    return base;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      base[key] = mergeConfig(base[key], value);
    } else if (Array.isArray(value)) {
      base[key] = value.slice();
    } else {
      base[key] = value;
    }
  }
  return base;
}

function readServiceOverrides(id) {
  const registry = calcState && calcState.services;
  if (registry && isPlainObject(registry[id])) {
    return clonePlain(registry[id]);
  }

  if (calcState && typeof calcState.get === 'function') {
    const stateSnapshot = calcState.get();
    if (stateSnapshot && isPlainObject(stateSnapshot.services) && isPlainObject(stateSnapshot.services[id])) {
      return clonePlain(stateSnapshot.services[id]);
    }
  }

  return {};
}

const HANDS_ON_SERVICE_IDS = new Set(['ops', 'qc', 'training']);
const EPSILON = 1e-6;

function clampScore(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function ratioScore(actual, target) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) {
    return null;
  }
  if (target <= 0) {
    return actual >= 0 ? 1 : 0;
  }
  if (actual >= target) {
    return 1;
  }
  return clampScore(actual / target);
}

function remainingScore(limit, actual) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return null;
  }
  if (!Number.isFinite(actual) || actual <= 0) {
    return 1;
  }
  if (actual >= limit) {
    return 0;
  }
  return clampScore(1 - actual / limit);
}

function bandScore(actual, target, tolerance = 0.1) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) {
    return null;
  }
  const allowedDeviation = Math.max(tolerance, 0.01);
  const delta = Math.abs(actual - target);
  if (delta <= allowedDeviation) {
    return 1;
  }
  return clampScore(Math.max(1 - delta / (allowedDeviation * 2), 0));
}

function computeComfortSnapshot({ totals = {}, constraints = {}, capacity = {}, modifiers = {} }) {
  const parts = [];
  const components = {};

  const marginScore = ratioScore(totals.grossMargin, constraints.comfortFloor);
  if (marginScore !== null) {
    parts.push(marginScore);
    components.margin = {
      score: marginScore,
      actual: totals.grossMargin,
      target: constraints.comfortFloor
    };
  }

  const serviceScore = remainingScore(constraints.maxServiceDays, totals.serviceDays);
  if (serviceScore !== null) {
    parts.push(serviceScore);
    components.service = {
      score: serviceScore,
      used: totals.serviceDays,
      limit: constraints.maxServiceDays
    };
  }

  const travelScore = remainingScore(constraints.maxTravelDays, totals.travelDays);
  if (travelScore !== null) {
    parts.push(travelScore);
    components.travel = {
      score: travelScore,
      used: totals.travelDays,
      limit: constraints.maxTravelDays
    };
  }

  const handsOnTarget = Number.isFinite(constraints.handsOnTarget)
    ? constraints.handsOnTarget
    : Number.isFinite(modifiers.handsOnQuota)
      ? modifiers.handsOnQuota
      : null;
  const handsOnScore = bandScore(totals.handsOnShare, handsOnTarget, constraints.handsOnTolerance);
  if (handsOnScore !== null) {
    parts.push(handsOnScore);
    components.handsOn = {
      score: handsOnScore,
      actual: totals.handsOnShare,
      target: handsOnTarget,
      tolerance: constraints.handsOnTolerance
    };
  }

  const seasonalityScore = clampScore(1 - (modifiers.seasonality || 0));
  if (seasonalityScore !== null) {
    parts.push(seasonalityScore);
    components.seasonality = {
      score: seasonalityScore,
      penalty: modifiers.seasonality || 0,
      capacityShare: capacity.seasonalityPenalty
    };
  }

  const travelFrictionScore = clampScore(1 / (1 + (modifiers.travelFriction || 0)));
  if (travelFrictionScore !== null) {
    parts.push(travelFrictionScore);
    components.travelFriction = {
      score: travelFrictionScore,
      factor: modifiers.travelFriction || 0,
      multiplier: capacity.travelFrictionMultiplier
    };
  }

  const score = parts.length ? parts.reduce((sum, value) => sum + value, 0) / parts.length : null;
  let level = 'unknown';
  let summary = 'Adjust your scenario to compute comfort.';

  if (score !== null) {
    if (score >= 0.75) {
      level = 'high';
      summary = 'Comfortable margin across workload, travel, and delivery targets.';
    } else if (score >= 0.5) {
      level = 'medium';
      summary = 'Mixed comfort. Review highlighted constraints to stay on track.';
    } else {
      level = 'low';
      summary = 'Comfort risk detected. Adjust capacity, travel, or pricing inputs.';
    }

    const flagged = [];
    if (marginScore !== null && marginScore < 0.75) {
      flagged.push('margin');
    }
    if (serviceScore !== null && serviceScore < 0.75) {
      flagged.push('service days');
    }
    if (travelScore !== null && travelScore < 0.75) {
      flagged.push('travel days');
    }
    if (handsOnScore !== null && handsOnScore < 0.75) {
      flagged.push('hands-on mix');
    }

    if (flagged.length === 1) {
      summary = `Focus on ${flagged[0]} to improve comfort.`;
    } else if (flagged.length > 1) {
      summary = `Focus on ${flagged.slice(0, -1).join(', ')} and ${flagged.slice(-1)}.`;
    }
  }

  return {
    score,
    scorePercent: score !== null ? Math.round(score * 100) : null,
    level,
    summary,
    components
  };
}

function resolveStateSnapshot(state) {
  if (!state) {
    if (calcState && typeof calcState.get === 'function') {
      try {
        return calcState.get();
      } catch (error) {
        return null;
      }
    }
    return null;
  }
  if (typeof state.get === 'function') {
    try {
      return state.get();
    } catch (error) {
      return null;
    }
  }
  return state;
}

function readServiceOverridesFromStateSnapshot(snapshot, id) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {};
  }
  const registry = snapshot.services;
  if (registry && isPlainObject(registry[id])) {
    return clonePlain(registry[id]);
  }
  return {};
}

function resolveHandsOnWeight(id, config = {}) {
  const explicit = toNumber(config.handsOnWeight, NaN);
  if (Number.isFinite(explicit)) {
    return clamp(explicit, 0, 1);
  }
  if (config.handsOn === true) {
    return 1;
  }
  if (config.handsOn === false) {
    return 0;
  }
  return HANDS_ON_SERVICE_IDS.has(id) ? 1 : 0;
}

function estimateHandsOnTarget(serviceEntries, capacityMetrics) {
  if (!Array.isArray(serviceEntries) || serviceEntries.length === 0) {
    return null;
  }

  let handsOnDays = 0;
  let totalDays = 0;

  for (const { id, config } of serviceEntries) {
    const baselineHours = computeServiceHours(config, capacityMetrics);
    const weight = resolveHandsOnWeight(id, config);
    handsOnDays += baselineHours.annualDaysForService * weight;
    totalDays += baselineHours.annualDaysForService;
  }

  if (totalDays <= 0) {
    return null;
  }

  return clamp(handsOnDays / totalDays, 0, 1);
}

function roundUnits(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function buildUnitRange(entry, capacityMetrics, modifiers = {}) {
  const baselineHours = computeServiceHours(entry.config, capacityMetrics, modifiers);
  const baseUnits = Math.max(baselineHours.unitsPerMonth || 0, 0);
  const activeMonths = Math.max(toNumber(capacityMetrics.activeMonths, 12), 1);
  const billableDays = Math.max(
    toNumber(capacityMetrics.billableDaysAfterTravel ?? capacityMetrics.billableDaysPerYear, 0),
    0
  );
  const daysPerUnit = Math.max(
    toNumber(entry.config.daysPerUnit, baselineHours.serviceDaysPerUnit || 1),
    0.01
  );
  const monthlyDayCapacity = activeMonths > 0 ? billableDays / activeMonths : 0;
  const capacityUnits = monthlyDayCapacity / daysPerUnit;
  const upperBound = Math.max(baseUnits * 1.5, capacityUnits * 1.1, baseUnits + 2, 0);
  const step = upperBound <= 6 ? 0.5 : Math.max(roundUnits(upperBound / 6) || 1, 0.5);

  const values = new Set([0]);
  if (baselineHours.lockedVolume) {
    values.add(roundUnits(baseUnits));
    return Array.from(values)
      .filter((value) => value >= 0)
      .sort((a, b) => a - b);
  }
  if (baseUnits > 0) {
    values.add(roundUnits(baseUnits));
    values.add(roundUnits(baseUnits * 0.5));
    values.add(roundUnits(baseUnits * 0.75));
    values.add(roundUnits(baseUnits * 1.25));
    values.add(roundUnits(baseUnits * 1.5));
  }

  const normalizedStep = Math.max(step, 0.5);
  for (let value = normalizedStep; value <= upperBound + normalizedStep / 2; value += normalizedStep) {
    values.add(roundUnits(value));
  }

  values.add(roundUnits(upperBound));

  return Array.from(values)
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
}

function evaluateServiceOption(entry, unitsPerMonth, capacityMetrics, costs, modifiers, taxStrategy) {
  const config = mergeConfig(entry.config, { unitsPerMonth });
  const hours = computeServiceHours(config, capacityMetrics, modifiers);
  const revenueMetrics = computeServiceRevenue(config, hours, costs);
  const annualUnits = hours.annualUnits;
  const serviceDays = hours.annualDaysForService;
  const travelDays = hours.annualTravelDays;

  const capacityDays = Math.max(
    toNumber(capacityMetrics.billableDaysAfterTravel ?? capacityMetrics.billableDaysPerYear, 0),
    0.01
  );
  const usageShare = Number.isFinite(hours.usageShare) ? hours.usageShare : capacityDays > 0
    ? Math.min(serviceDays / capacityDays, 1)
    : 0;

  const fixedShare = clamp(toNumber(config.fixedCostShare, usageShare || hours.share), 0, 1);
  const variableShare = clamp(toNumber(config.variableCostShare, usageShare || hours.share), 0, 1);

  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);
  const fixedAnnualTotal = Math.max(
    toNumber(costs?.totals?.fixed?.annual ?? costs?.fixedCosts, 0),
    0
  );
  const variableAnnualTotal = Math.max(
    toNumber(costs?.totals?.variable?.annual ?? costs?.annualVariableCosts, 0),
    0
  );
  const fixedAnnual = fixedAnnualTotal * fixedShare;
  const variableAnnual = variableAnnualTotal * variableShare;

  const revenueAnnual = revenueMetrics.pricePerUnit * annualUnits;
  const directCostAnnual = directCostPerUnit * annualUnits + fixedAnnual + variableAnnual;

  const manualTaxRate = clamp(toNumber(config.taxRate, costs.taxRate ?? 0), 0, 1);
  const strategyRate = Number.isFinite(taxStrategy?.effectiveTaxRate)
    ? clamp(taxStrategy.effectiveTaxRate, 0, 1)
    : null;
  const usesDutchStrategy = taxStrategy && taxStrategy.mode === 'dutch2025' && strategyRate !== null;
  const taxRate = usesDutchStrategy ? strategyRate : manualTaxRate;
  const taxAnnual = revenueAnnual * taxRate;
  const netAnnual = revenueAnnual - directCostAnnual - taxAnnual;

  const grossMargin = revenueAnnual > 0
    ? (revenueAnnual - directCostAnnual) / revenueAnnual
    : 0;

  const pricingFloor = toPositive(
    config.minPricePerUnit ?? config.minimumPrice ?? config.priceFloor ?? config.basePrice,
    0
  );
  const pricingCeiling = toPositive(
    config.maxPricePerUnit ?? config.maximumPrice ?? config.priceCeiling ?? (pricingFloor ? pricingFloor * 2 : Infinity),
    Infinity
  );
  const comfortFloor = clamp(
    toNumber(config.comfortBuffer ?? config.comfortBufferMin ?? costs.buffer ?? 0),
    0,
    0.95
  );

  const handsOnWeight = resolveHandsOnWeight(entry.id, config);
  const handsOnDays = serviceDays * handsOnWeight;

  const optionViolations = [];
  if (pricingFloor > 0 && revenueMetrics.pricePerUnit + EPSILON < pricingFloor) {
    optionViolations.push({
      type: 'pricingFloor',
      serviceId: entry.id,
      severity: pricingFloor - revenueMetrics.pricePerUnit,
      message: `${entry.descriptor.copy.title || entry.id} price below floor`
    });
  }
  if (Number.isFinite(pricingCeiling) && revenueMetrics.pricePerUnit - EPSILON > pricingCeiling) {
    optionViolations.push({
      type: 'pricingCeiling',
      serviceId: entry.id,
      severity: revenueMetrics.pricePerUnit - pricingCeiling,
      message: `${entry.descriptor.copy.title || entry.id} price above ceiling`
    });
  }
  if (revenueAnnual > EPSILON && grossMargin + EPSILON < comfortFloor) {
    optionViolations.push({
      type: 'comfortBuffer',
      serviceId: entry.id,
      severity: comfortFloor - grossMargin,
      message: `${entry.descriptor.copy.title || entry.id} gross margin below comfort buffer`
    });
  }

  return {
    id: entry.id,
    descriptor: entry.descriptor,
    unitsPerMonth,
    annualUnits,
    pricePerUnit: revenueMetrics.pricePerUnit,
    revenue: revenueAnnual,
    directCost: directCostAnnual,
    tax: taxAnnual,
    net: netAnnual,
    serviceDays,
    travelDays,
    handsOnDays,
    grossMargin,
    comfortFloor,
    pricingFloor,
    pricingCeiling,
    violations: optionViolations
  };
}

function normalizeSolverConstraints(snapshot, capacityMetrics, costs, serviceEntries, modifiers) {
  const overridesSource = isPlainObject(snapshot?.portfolioConstraints)
    ? snapshot.portfolioConstraints
    : isPlainObject(snapshot?.portfolio)
      ? snapshot.portfolio
      : {};

  const maxServiceDaysDefault = Math.max(
    toNumber(capacityMetrics.billableDaysAfterTravel ?? capacityMetrics.billableDaysPerYear, 0),
    0
  );
  const maxTravelDaysDefault = Math.max(
    toNumber(capacityMetrics.travelAllowanceDays ?? capacityMetrics.travelDaysPerYear, 0),
    0
  );

  const maxServiceDays = toPositive(
    overridesSource.maxServiceDays ?? overridesSource.billableDayLimit,
    maxServiceDaysDefault
  );
  const maxTravelDays = toPositive(
    overridesSource.maxTravelDays ?? overridesSource.travelDayLimit,
    maxTravelDaysDefault
  );

  let handsOnTarget = toNumber(overridesSource.handsOnShareTarget, NaN);
  if (!Number.isFinite(handsOnTarget)) {
    if (Number.isFinite(modifiers?.handsOnQuota)) {
      handsOnTarget = modifiers.handsOnQuota;
    }
    const estimated = estimateHandsOnTarget(serviceEntries, capacityMetrics);
    if (Number.isFinite(estimated)) {
      handsOnTarget = estimated;
    }
  }

  const handsOnTolerance = clamp(
    toNumber(overridesSource.handsOnShareTolerance, 0.1),
    0,
    0.5
  );
  const handsOnMin = Number.isFinite(handsOnTarget)
    ? clamp(handsOnTarget - handsOnTolerance, 0, 1)
    : null;
  const handsOnMax = Number.isFinite(handsOnTarget)
    ? clamp(handsOnTarget + handsOnTolerance, 0, 1)
    : null;

  const comfortFloor = clamp(
    toNumber(overridesSource.comfortBufferMin ?? overridesSource.bufferFloor ?? costs.buffer ?? 0),
    0,
    0.95
  );

  return {
    maxServiceDays,
    maxTravelDays,
    handsOnMin,
    handsOnMax,
    comfortFloor,
    handsOnTarget: Number.isFinite(handsOnTarget) ? clamp(handsOnTarget, 0, 1) : null,
    handsOnTolerance,
    modifiers
  };
}

function compareCandidates(next, current) {
  if (next.metrics.violationCount !== current.metrics.violationCount) {
    return next.metrics.violationCount - current.metrics.violationCount;
  }
  if (next.metrics.meetsTarget !== current.metrics.meetsTarget) {
    return next.metrics.meetsTarget ? -1 : 1;
  }

  const nextGap = Math.abs(next.metrics.diff);
  const currentGap = Math.abs(current.metrics.diff);

  if (nextGap !== currentGap) {
    return nextGap - currentGap;
  }

  if (next.metrics.net !== current.metrics.net) {
    return current.metrics.net - next.metrics.net;
  }

  return 0;
}

export function solvePortfolio(state, capacityMetrics, serviceDescriptors = services) {
  const snapshot = resolveStateSnapshot(state) || {};
  const capacity = capacityMetrics || {};
  const descriptors = Array.isArray(serviceDescriptors) && serviceDescriptors.length > 0
    ? serviceDescriptors
    : services;

  const safeState = isPlainObject(snapshot)
    ? snapshot
    : { incomeTargets: {}, config: { defaults: { incomeTargets: {} } } };

  const costs = computeCosts(safeState, capacity);
  const incomeTargets = deriveIncomeTargets(
    {
      incomeTargets: safeState.incomeTargets || {},
      config: safeState.config || { defaults: { incomeTargets: {} } }
    },
    capacity
  );
  const targetNet = incomeTargets.targetNet || 0;
  const modifiers = normalizeScenarioModifiers(snapshot.modifiers);
  const taxStrategy = calculateTaxReserve(safeState, capacity, costs, incomeTargets);

  const serviceEntries = descriptors.map((descriptor) => {
    const storeOverrides = readServiceOverrides(descriptor.id);
    const snapshotOverrides = readServiceOverridesFromStateSnapshot(snapshot, descriptor.id);
    const mergedOverrides = mergeConfig(storeOverrides, snapshotOverrides);
    const baseConfig = mergeConfig(descriptor.defaults || {}, mergedOverrides);
    return { id: descriptor.id, descriptor, config: baseConfig };
  });

  const constraints = normalizeSolverConstraints(snapshot, capacity, costs, serviceEntries, modifiers);

  const serviceOptions = serviceEntries.map((entry) => {
    const candidates = buildUnitRange(entry, capacity, modifiers);
    const normalizedCandidates = candidates.length > 0 ? candidates : [0];
    return normalizedCandidates.map((units) =>
      evaluateServiceOption(entry, units, capacity, costs, modifiers, taxStrategy)
    );
  });

  const selection = [];
  let iterations = 0;
  let bestCandidate = null;

  function evaluateSelection() {
    iterations += 1;

    const mix = {};
    const totals = {
      revenue: 0,
      directCost: 0,
      tax: 0,
      net: 0,
      serviceDays: 0,
      travelDays: 0,
      handsOnDays: 0,
      taxMode: taxStrategy ? taxStrategy.mode : null
    };
    const violations = [];

    for (const option of selection) {
      totals.revenue += option.revenue;
      totals.directCost += option.directCost;
      totals.tax += option.tax;
      totals.net += option.net;
      totals.serviceDays += option.serviceDays;
      totals.travelDays += option.travelDays;
      totals.handsOnDays += option.handsOnDays;

      if (option.violations.length > 0) {
        for (const violation of option.violations) {
          violations.push({ ...violation });
        }
      }

      mix[option.id] = {
        unitsPerMonth: option.unitsPerMonth,
        annualUnits: option.annualUnits,
        pricePerUnit: option.pricePerUnit,
        revenue: option.revenue,
        directCost: option.directCost,
        tax: option.tax,
        net: option.net,
        serviceDays: option.serviceDays,
        travelDays: option.travelDays,
        handsOnDays: option.handsOnDays,
        grossMargin: option.grossMargin,
        comfortFloor: option.comfortFloor,
        pricingFloor: option.pricingFloor,
        pricingCeiling: option.pricingCeiling
      };
    }

    const handsOnShare = totals.serviceDays > 0
      ? totals.handsOnDays / totals.serviceDays
      : 0;
    const grossMargin = totals.revenue > 0
      ? (totals.revenue - totals.directCost) / totals.revenue
      : 0;

    if (constraints.maxServiceDays > 0 && totals.serviceDays - EPSILON > constraints.maxServiceDays) {
      violations.push({
        type: 'serviceDays',
        severity: totals.serviceDays - constraints.maxServiceDays,
        message: `Required delivery days exceed capacity (${totals.serviceDays.toFixed(1)} > ${constraints.maxServiceDays.toFixed(1)})`,
        limit: constraints.maxServiceDays,
        actual: totals.serviceDays
      });
    }

    if (constraints.maxTravelDays > 0 && totals.travelDays - EPSILON > constraints.maxTravelDays) {
      violations.push({
        type: 'travelDays',
        severity: totals.travelDays - constraints.maxTravelDays,
        message: `Travel days exceed allowance (${totals.travelDays.toFixed(1)} > ${constraints.maxTravelDays.toFixed(1)})`,
        limit: constraints.maxTravelDays,
        actual: totals.travelDays
      });
    }

    if (constraints.handsOnMin !== null && handsOnShare + EPSILON < constraints.handsOnMin) {
      violations.push({
        type: 'handsOnMin',
        severity: constraints.handsOnMin - handsOnShare,
        message: `Hands-on share ${(handsOnShare * 100).toFixed(1)}% below minimum ${(constraints.handsOnMin * 100).toFixed(1)}%`,
        limit: constraints.handsOnMin,
        actual: handsOnShare
      });
    }

    if (constraints.handsOnMax !== null && handsOnShare - EPSILON > constraints.handsOnMax) {
      violations.push({
        type: 'handsOnMax',
        severity: handsOnShare - constraints.handsOnMax,
        message: `Hands-on share ${(handsOnShare * 100).toFixed(1)}% above maximum ${(constraints.handsOnMax * 100).toFixed(1)}%`,
        limit: constraints.handsOnMax,
        actual: handsOnShare
      });
    }

    if (constraints.comfortFloor > 0 && grossMargin + EPSILON < constraints.comfortFloor) {
      violations.push({
        type: 'comfortFloor',
        severity: constraints.comfortFloor - grossMargin,
        message: `Overall margin ${(grossMargin * 100).toFixed(1)}% below comfort ${(constraints.comfortFloor * 100).toFixed(1)}%`,
        limit: constraints.comfortFloor,
        actual: grossMargin
      });
    }

    const diff = totals.net - targetNet;
    const comfort = computeComfortSnapshot({
      totals: { ...totals, handsOnShare, grossMargin },
      constraints,
      capacity,
      modifiers
    });
    const candidate = {
      mix,
      totals: {
        ...totals,
        handsOnShare,
        grossMargin,
        targetNet,
        netGap: diff
      },
      violations,
      comfort,
      metrics: {
        violationCount: violations.length,
        meetsTarget: diff >= -EPSILON,
        diff,
        net: totals.net
      }
    };

    if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
      bestCandidate = candidate;
    }
  }

  function iterate(depth = 0) {
    if (depth >= serviceOptions.length) {
      evaluateSelection();
      return;
    }

    const options = serviceOptions[depth] || [];
    if (options.length === 0) {
      selection[depth] = evaluateServiceOption(
        serviceEntries[depth],
        0,
        capacity,
        costs,
        modifiers,
        taxStrategy
      );
      iterate(depth + 1);
      return;
    }

    for (const option of options) {
      selection[depth] = option;
      iterate(depth + 1);
    }
  }

  if (serviceOptions.length === 0) {
    bestCandidate = {
      mix: {},
      totals: {
        revenue: 0,
        directCost: 0,
        tax: 0,
        net: 0,
        serviceDays: 0,
        travelDays: 0,
        handsOnDays: 0,
        handsOnShare: 0,
        grossMargin: 0,
        taxMode: taxStrategy ? taxStrategy.mode : null,
        targetNet,
        netGap: -targetNet
      },
      violations: [],
      metrics: {
        violationCount: 0,
        meetsTarget: targetNet <= 0,
        diff: -targetNet,
        net: 0
      }
    };
  } else {
    iterate(0);
  }

  const result = bestCandidate ? { ...bestCandidate } : {
    mix: {},
    totals: {
      revenue: 0,
      directCost: 0,
      tax: 0,
      net: 0,
      serviceDays: 0,
      travelDays: 0,
      handsOnDays: 0,
      handsOnShare: 0,
      grossMargin: 0,
      taxMode: taxStrategy ? taxStrategy.mode : null,
      targetNet,
      netGap: -targetNet
    },
    violations: [],
    comfort: computeComfortSnapshot({
      totals: {
        revenue: 0,
        directCost: 0,
        tax: 0,
        net: 0,
        serviceDays: 0,
        travelDays: 0,
        handsOnDays: 0,
        handsOnShare: 0,
        grossMargin: 0
      },
      constraints,
      capacity,
      modifiers
    })
  };

  if (result.totals) {
    result.totals.iterations = iterations;
  }

  delete result.metrics;

  return result;
}

export function computeServiceHours(config, capacity = {}, modifiers = {}) {
  const share = clamp(toNumber(config.shareOfCapacity ?? config.capacityShare, 0), 0, 1);
  const serviceDaysPerUnit = Math.max(toNumber(config.daysPerUnit, 1), 0.01);
  const activeMonths = Math.max(toNumber(capacity.activeMonths, 12), 1);
  const billableDays = Math.max(
    toNumber(capacity.billableDaysAfterTravel, toNumber(capacity.billableDaysPerYear, 0)),
    0
  );

  const travelMultiplier = Number.isFinite(capacity.travelFrictionMultiplier)
    ? Math.max(capacity.travelFrictionMultiplier, 0)
    : 1 + Math.max(modifiers.travelFriction || 0, 0);
  const travelDaysPerUnitBase = Math.max(
    toNumber(config.travelDaysPerUnit ?? config.travelPerUnit ?? 0, 0),
    0
  );
  const travelHoursPerUnitBase = Math.max(toNumber(config.travelHoursPerUnit, 0), 0);
  const travelDaysPerUnit = travelDaysPerUnitBase * travelMultiplier;
  const travelHoursPerUnit = travelHoursPerUnitBase * travelMultiplier;

  const hoursPerBillableDay = Number.isFinite(capacity.billableHoursPerYear) && capacity.billableDaysAfterTravel > 0
    ? capacity.billableHoursPerYear / capacity.billableDaysAfterTravel
    : 8;

  const baseHoursPerUnit = toPositive(config.hoursPerUnit, NaN);
  const serviceHoursPerUnit = Number.isFinite(baseHoursPerUnit) && baseHoursPerUnit > 0
    ? baseHoursPerUnit
    : serviceDaysPerUnit * hoursPerBillableDay;

  const totalHoursPerUnit = serviceHoursPerUnit + travelHoursPerUnit + travelDaysPerUnit * hoursPerBillableDay;

  const explicitUnitsPerMonth = toNumber(config.unitsPerMonth, NaN);
  const explicitUnitsPerYear = toNumber(config.unitsPerYear, NaN);

  let unitsPerMonth;
  if (Number.isFinite(explicitUnitsPerMonth) && explicitUnitsPerMonth >= 0) {
    unitsPerMonth = explicitUnitsPerMonth;
  } else if (Number.isFinite(explicitUnitsPerYear) && explicitUnitsPerYear >= 0) {
    unitsPerMonth = explicitUnitsPerYear / activeMonths;
  } else {
    const annualDaysForService = billableDays * share;
    const annualUnits = annualDaysForService / serviceDaysPerUnit;
    unitsPerMonth = annualUnits / activeMonths;
  }

  if (!Number.isFinite(unitsPerMonth) || unitsPerMonth < 0) {
    unitsPerMonth = 0;
  }

  const lockedVolume = isVolumeLocked(config);
  if (lockedVolume && Number.isFinite(explicitUnitsPerMonth) && explicitUnitsPerMonth >= 0) {
    unitsPerMonth = explicitUnitsPerMonth;
  }

  const annualUnits = unitsPerMonth * activeMonths;
  const annualDaysForService = annualUnits * serviceDaysPerUnit;
  const annualTravelDays = annualUnits * travelDaysPerUnit;
  const annualHours = annualUnits * totalHoursPerUnit;
  const usageShare = billableDays > 0 ? Math.min(annualDaysForService / billableDays, 1) : 0;

  return {
    share,
    serviceDaysPerUnit,
    travelDaysPerUnit,
    travelHoursPerUnit,
    serviceHoursPerUnit,
    totalHoursPerUnit,
    activeMonths,
    billableDays,
    unitsPerMonth,
    annualUnits,
    annualDaysForService,
    annualTravelDays,
    annualHours,
    usageShare,
    lockedVolume
  };
}

function resolveTaxRate(config = {}, costs = {}, taxStrategy = null) {
  const fallbackTaxRate = Number.isFinite(costs?.taxRate)
    ? costs.taxRate
    : Number.isFinite(costs?.taxRatePercent)
      ? costs.taxRatePercent / 100
      : 0;
  const manualTaxRate = clamp(toNumber(config.taxRate, fallbackTaxRate), 0, 1);
  if (taxStrategy && taxStrategy.mode === 'dutch2025' && Number.isFinite(taxStrategy.effectiveTaxRate)) {
    return clamp(taxStrategy.effectiveTaxRate, 0, 1);
  }
  return manualTaxRate;
}

function computeAllocatedCosts(config = {}, costs = {}, fallbackShare = 0) {
  const fixedAnnualTotal = Math.max(
    toNumber(costs?.totals?.fixed?.annual ?? costs?.fixedCosts, 0),
    0
  );
  const variableAnnualTotal = Math.max(
    toNumber(costs?.totals?.variable?.annual ?? costs?.annualVariableCosts, 0),
    0
  );
  const resolvedShare = clamp(toNumber(fallbackShare, toNumber(config.shareOfCapacity, 0)), 0, 1);
  const fixedShare = clamp(toNumber(config.fixedCostShare, resolvedShare), 0, 1);
  const variableShare = clamp(toNumber(config.variableCostShare, resolvedShare), 0, 1);
  return {
    fixedAnnual: fixedAnnualTotal * fixedShare,
    variableAnnual: variableAnnualTotal * variableShare,
    fixedShare,
    variableShare
  };
}

function resolveServiceTargetNet(config = {}, options = {}) {
  if (Number.isFinite(options.targetNet)) {
    return options.targetNet;
  }

  const totalTargetNet = toNumber(options.totalTargetNet, NaN);
  const shareOverride = clamp(toNumber(options.targetNetShare, NaN), 0, 1);
  const configShare = clamp(toNumber(config.targetNetShare ?? config.shareOfCapacity, NaN), 0, 1);
  const share = Number.isFinite(shareOverride)
    ? shareOverride
    : Number.isFinite(configShare)
      ? configShare
      : 0;

  if (Number.isFinite(totalTargetNet)) {
    return totalTargetNet * share;
  }

  const explicitTarget = toNumber(
    config.targetNet ?? config.targetNetAnnual ?? config.targetNetContribution,
    NaN
  );
  if (Number.isFinite(explicitTarget)) {
    return explicitTarget;
  }

  return 0;
}

export function computeServiceRevenue(config, hoursMetrics, costs = {}) {
  const buffer = clamp(toNumber(config.bufferOverride, costs.buffer ?? 0), 0, 5);
  const basePrice = toPositive(config.basePrice ?? config.pricePerUnit ?? 0, 0);
  const lockedOverride = toPositive(
    config.lockedPricePerUnit ?? config.fixedPricePerUnit ?? config.rateLockedValue,
    NaN
  );
  const priceOverride = Number.isFinite(lockedOverride) && lockedOverride > 0
    ? lockedOverride
    : toPositive(config.pricePerUnitOverride ?? config.pricePerUnit, NaN);
  let pricePerUnit;
  if (isRateLocked(config)) {
    if (Number.isFinite(priceOverride) && priceOverride > 0) {
      pricePerUnit = priceOverride;
    } else {
      pricePerUnit = basePrice;
    }
  } else if (Number.isFinite(priceOverride) && priceOverride > 0) {
    pricePerUnit = priceOverride;
  } else {
    pricePerUnit = basePrice * (1 + buffer);
  }

  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);
  const fallbackFixedMonthly = Number.isFinite(costs?.fixedCosts) ? costs.fixedCosts / 12 : 0;
  const fixedMonthlyTotal = Math.max(
    toNumber(costs?.totals?.fixed?.monthly ?? fallbackFixedMonthly, 0),
    0
  );
  const fallbackVariableMonthly = Number.isFinite(costs?.annualVariableCosts)
    ? costs.annualVariableCosts / 12
    : 0;
  const variableMonthlyTotal = Math.max(
    toNumber(costs?.totals?.variable?.monthly ?? fallbackVariableMonthly, 0),
    0
  );
  const allocatedFixed = fixedMonthlyTotal * clamp(
    toNumber(config.fixedCostShare, hoursMetrics.share),
    0,
    1
  );
  const allocatedVariable = variableMonthlyTotal * clamp(
    toNumber(config.variableCostShare, hoursMetrics.share),
    0,
    1
  );

  const units = hoursMetrics.unitsPerMonth;
  const revenue = units * pricePerUnit;
  const perUnitCost = units * directCostPerUnit;
  const directCost = perUnitCost + allocatedFixed + allocatedVariable;

  const taxRate = resolveTaxRate(config, costs);
  const tax = revenue * taxRate;
  const net = revenue - directCost - tax;

  return {
    pricePerUnit,
    revenue,
    directCost,
    tax,
    net
  };
}

export function solveServiceRateTarget(config = {}, capacity = {}, costs = {}, options = {}) {
  const modifiers = options.modifiers || {};
  const hours = computeServiceHours(config, capacity, modifiers);
  const targetNet = resolveServiceTargetNet(config, options);
  const annualUnits = hours.annualUnits;
  const allocation = computeAllocatedCosts(config, costs, hours.usageShare ?? hours.share ?? 0);
  const taxRate = resolveTaxRate(config, costs, options.taxStrategy || null);
  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);

  if (!Number.isFinite(annualUnits) || annualUnits <= 0) {
    return {
      pricePerUnit: null,
      unitsPerMonth: hours.unitsPerMonth ?? 0,
      annualUnits: 0,
      locked: isRateLocked(config),
      targetNet,
      annualTravelDays: hours.annualTravelDays,
      serviceDays: hours.annualDaysForService,
      hoursPerUnit: hours.totalHoursPerUnit
    };
  }

  if (isRateLocked(config)) {
    const revenueMetrics = computeServiceRevenue(config, hours, costs);
    return {
      pricePerUnit: revenueMetrics.pricePerUnit,
      unitsPerMonth: hours.unitsPerMonth,
      annualUnits,
      locked: true,
      targetNet,
      projectedNet: revenueMetrics.net,
      annualTravelDays: hours.annualTravelDays,
      serviceDays: hours.annualDaysForService,
      hoursPerUnit: hours.totalHoursPerUnit
    };
  }

  const annualDirectCosts = directCostPerUnit * annualUnits;
  const baselineCost = annualDirectCosts + allocation.fixedAnnual + allocation.variableAnnual;
  const denominator = annualUnits * (1 - taxRate);

  const pricePerUnit = denominator > 0
    ? (targetNet + baselineCost) / denominator
    : null;

  return {
    pricePerUnit,
    unitsPerMonth: hours.unitsPerMonth,
    annualUnits,
    locked: false,
    targetNet,
    annualTravelDays: hours.annualTravelDays,
    serviceDays: hours.annualDaysForService,
    hoursPerUnit: hours.totalHoursPerUnit
  };
}

export function solveServiceVolumeTarget(config = {}, capacity = {}, costs = {}, options = {}) {
  const modifiers = options.modifiers || {};
  const hours = computeServiceHours(config, capacity, modifiers);
  const allocation = computeAllocatedCosts(config, costs, hours.usageShare ?? hours.share ?? 0);
  const taxRate = resolveTaxRate(config, costs, options.taxStrategy || null);
  const targetNet = resolveServiceTargetNet(config, options);
  const revenueMetrics = computeServiceRevenue(config, hours, costs);
  const pricePerUnit = revenueMetrics.pricePerUnit;
  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);

  if (isVolumeLocked(config)) {
    return {
      unitsPerMonth: hours.unitsPerMonth,
      annualUnits: hours.annualUnits,
      locked: true,
      targetNet,
      projectedNet: revenueMetrics.net,
      pricePerUnit,
      annualTravelDays: hours.annualTravelDays,
      serviceDays: hours.annualDaysForService,
      hoursPerUnit: hours.totalHoursPerUnit
    };
  }

  const marginPerUnit = pricePerUnit * (1 - taxRate) - directCostPerUnit;
  if (!Number.isFinite(marginPerUnit) || marginPerUnit <= 0) {
    return {
      unitsPerMonth: null,
      annualUnits: null,
      locked: false,
      targetNet,
      pricePerUnit,
      annualTravelDays: hours.annualTravelDays,
      serviceDays: hours.annualDaysForService,
      hoursPerUnit: hours.totalHoursPerUnit
    };
  }

  const requiredAnnualUnits = (targetNet + allocation.fixedAnnual + allocation.variableAnnual) / marginPerUnit;
  const annualUnits = Math.max(requiredAnnualUnits, 0);
  const unitsPerMonth = hours.activeMonths > 0 ? annualUnits / hours.activeMonths : null;
  const annualTravelDays = annualUnits * hours.travelDaysPerUnit;
  const serviceDays = annualUnits * hours.serviceDaysPerUnit;

  return {
    unitsPerMonth,
    annualUnits,
    locked: false,
    targetNet,
    pricePerUnit,
    annualTravelDays,
    serviceDays,
    hoursPerUnit: hours.totalHoursPerUnit,
    usageShare: hours.billableDays > 0 ? Math.min(serviceDays / hours.billableDays, 1) : null
  };
}

const SERVICE_BLUEPRINTS = [
  {
    id: 'representation',
    archetype: 'representation retainers',
    copy: {
      ...SERVICE_COPY.representation,
      subtitle: 'Representation retainers',
      description: 'Account coverage, brokerage representation, and seasonal contracting support.'
    },
    defaults: {
      ...SERVICE_DEFAULTS.representation,
      targetNetShare: 0.34,
      travelDaysPerUnit: 0.25,
      travelHoursPerUnit: 4,
      hoursPerUnit: 10,
      lockedRate: false,
      lockedVolume: false
    }
  },
  {
    id: 'ops',
    archetype: 'ops advisory',
    copy: {
      ...SERVICE_COPY.ops,
      subtitle: 'Operations advisory',
      description: 'On-site operations audits, performance dashboards, and process improvement cadences.'
    },
    defaults: {
      ...SERVICE_DEFAULTS.ops,
      targetNetShare: 0.22,
      travelDaysPerUnit: 0.3,
      travelHoursPerUnit: 3,
      hoursPerUnit: 8,
      lockedRate: false,
      lockedVolume: false
    }
  },
  {
    id: 'qc',
    archetype: 'qc inspections',
    copy: {
      ...SERVICE_COPY.qc,
      subtitle: 'QC inspections',
      description: 'Arrival inspections, ripeness checks, and traceability sampling for inbound loads.'
    },
    defaults: {
      ...SERVICE_DEFAULTS.qc,
      targetNetShare: 0.18,
      travelDaysPerUnit: 0.2,
      travelHoursPerUnit: 2,
      hoursPerUnit: 6,
      lockedRate: false,
      lockedVolume: false
    }
  },
  {
    id: 'training',
    archetype: 'training',
    copy: {
      ...SERVICE_COPY.training,
      subtitle: 'Training intensives',
      description: 'Curriculum design, workshops, and follow-up coaching for produce teams.'
    },
    defaults: {
      ...SERVICE_DEFAULTS.training,
      targetNetShare: 0.16,
      travelDaysPerUnit: 0.28,
      travelHoursPerUnit: 3,
      hoursPerUnit: 7.5,
      lockedRate: false,
      lockedVolume: false
    }
  },
  {
    id: 'intel',
    archetype: 'market intel',
    copy: {
      ...SERVICE_COPY.intel,
      subtitle: 'Market intelligence',
      description: 'Subscription reporting, buyer telemetry, and trade lane sentiment tracking.'
    },
    defaults: {
      ...SERVICE_DEFAULTS.intel,
      targetNetShare: 0.1,
      travelDaysPerUnit: 0.12,
      travelHoursPerUnit: 1.5,
      hoursPerUnit: 5,
      lockedRate: false,
      lockedVolume: false
    }
  }
];

const SERVICE_BLUEPRINT_LOOKUP = SERVICE_BLUEPRINTS.reduce((acc, entry) => {
  acc[entry.id] = entry;
  return acc;
}, {});

function createServiceDescriptor(id) {
  const blueprint = SERVICE_BLUEPRINT_LOOKUP[id] || { defaults: SERVICE_DEFAULTS[id] || {}, copy: SERVICE_COPY[id] || { title: id } };
  const defaults = blueprint.defaults || {};
  const copy = blueprint.copy || { title: id };

  return {
    id,
    archetype: blueprint.archetype || null,
    copy,
    defaults,
    compute(state, capacity, costs) {
      const snapshot = resolveStateSnapshot(state) || {};
      const capacityMetrics = capacity || {};
      const storeOverrides = readServiceOverrides(id);
      const snapshotOverrides = readServiceOverridesFromStateSnapshot(snapshot, id);
      const mergedOverrides = mergeConfig(storeOverrides, snapshotOverrides);
      const config = mergeConfig(defaults, mergedOverrides);
      const modifiers = normalizeScenarioModifiers(snapshot.modifiers || {});

      const hoursMetrics = computeServiceHours(config, capacityMetrics, modifiers);
      const costMetrics = costs || computeCosts(snapshot, capacityMetrics);
      const revenueMetrics = computeServiceRevenue(config, hoursMetrics, costMetrics);

      const incomeTargets = deriveIncomeTargets(
        {
          incomeTargets: snapshot.incomeTargets || {},
          config: snapshot.config || { defaults: { incomeTargets: {} } }
        },
        capacityMetrics
      );
      const taxStrategy = calculateTaxReserve(snapshot, capacityMetrics, costMetrics, incomeTargets);
      const totalTargetNet = incomeTargets?.targetNet ?? 0;

      const rateTarget = solveServiceRateTarget(config, capacityMetrics, costMetrics, {
        totalTargetNet,
        modifiers,
        taxStrategy
      });
      const volumeTarget = solveServiceVolumeTarget(config, capacityMetrics, costMetrics, {
        totalTargetNet,
        modifiers,
        taxStrategy
      });

      return {
        units: Number.isFinite(hoursMetrics.unitsPerMonth)
          ? hoursMetrics.unitsPerMonth
          : 0,
        price: revenueMetrics.pricePerUnit,
        revenue: revenueMetrics.revenue,
        directCost: revenueMetrics.directCost,
        tax: revenueMetrics.tax,
        net: revenueMetrics.net,
        travelDaysPerUnit: hoursMetrics.travelDaysPerUnit,
        annualTravelDays: hoursMetrics.annualTravelDays,
        hoursPerUnit: hoursMetrics.totalHoursPerUnit,
        targets: {
          pricePerUnit: rateTarget.pricePerUnit,
          unitsPerMonth: volumeTarget.unitsPerMonth,
          lockedRate: rateTarget.locked,
          lockedVolume: volumeTarget.locked
        }
      };
    }
  };
}

export const services = [
  createServiceDescriptor('representation'),
  createServiceDescriptor('ops'),
  createServiceDescriptor('qc'),
  createServiceDescriptor('training'),
  createServiceDescriptor('intel')
];

export { SERVICE_COPY as serviceCopy, SERVICE_DEFAULTS as serviceDefaults };

export default services;
