import { calcState } from './state.js';
import { computeCosts } from './costs.js';
import { deriveIncomeTargets } from './income.js';

const SERVICE_COPY = {
  representation: {
    title: 'Representation'
  },
  ops: {
    title: 'Operations'
  },
  qc: {
    title: 'Quality control - arrivals'
  },
  training: {
    title: 'Training'
  },
  intel: {
    title: 'Intel'
  }
};

const SERVICE_DEFAULTS = {
  representation: {
    shareOfCapacity: 0.32,
    daysPerUnit: 1.5,
    basePrice: 2250,
    directCostPerUnit: 180,
    fixedCostShare: 0.34,
    variableCostShare: 0.28
  },
  ops: {
    shareOfCapacity: 0.22,
    daysPerUnit: 1,
    basePrice: 1450,
    directCostPerUnit: 140,
    fixedCostShare: 0.2,
    variableCostShare: 0.25
  },
  qc: {
    shareOfCapacity: 0.16,
    daysPerUnit: 0.6,
    basePrice: 980,
    directCostPerUnit: 90,
    fixedCostShare: 0.12,
    variableCostShare: 0.15
  },
  training: {
    shareOfCapacity: 0.18,
    daysPerUnit: 1.2,
    basePrice: 1180,
    directCostPerUnit: 105,
    fixedCostShare: 0.18,
    variableCostShare: 0.2
  },
  intel: {
    shareOfCapacity: 0.12,
    daysPerUnit: 0.5,
    basePrice: 760,
    directCostPerUnit: 80,
    fixedCostShare: 0.16,
    variableCostShare: 0.12
  }
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function buildUnitRange(entry, capacityMetrics) {
  const baselineHours = computeServiceHours(entry.config, capacityMetrics);
  const baseUnits = Math.max(baselineHours.unitsPerMonth || 0, 0);
  const activeMonths = Math.max(toNumber(capacityMetrics.activeMonths, 12), 1);
  const billableDays = Math.max(
    toNumber(capacityMetrics.billableDaysAfterTravel ?? capacityMetrics.billableDaysPerYear, 0),
    0
  );
  const daysPerUnit = Math.max(
    toNumber(entry.config.daysPerUnit, baselineHours.daysPerUnit || 1),
    0.01
  );
  const monthlyDayCapacity = activeMonths > 0 ? billableDays / activeMonths : 0;
  const capacityUnits = monthlyDayCapacity / daysPerUnit;
  const upperBound = Math.max(baseUnits * 1.5, capacityUnits * 1.1, baseUnits + 2, 0);
  const step = upperBound <= 6 ? 0.5 : Math.max(roundUnits(upperBound / 6) || 1, 0.5);

  const values = new Set([0]);
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

function evaluateServiceOption(entry, unitsPerMonth, capacityMetrics, costs) {
  const config = mergeConfig(entry.config, { unitsPerMonth });
  const hours = computeServiceHours(config, capacityMetrics);
  const revenueMetrics = computeServiceRevenue(config, hours, costs);
  const annualUnits = hours.annualUnits;
  const serviceDays = hours.annualDaysForService;
  const travelPerUnit = Math.max(
    toNumber(config.travelDaysPerUnit ?? config.travelPerUnit ?? 0, 0),
    0
  );
  const travelDays = travelPerUnit * annualUnits;

  const capacityDays = Math.max(
    toNumber(capacityMetrics.billableDaysAfterTravel ?? capacityMetrics.billableDaysPerYear, 0),
    0.01
  );
  const usageShare = capacityDays > 0 ? Math.min(serviceDays / capacityDays, 1) : 0;

  const fixedShare = clamp(toNumber(config.fixedCostShare, usageShare || hours.share), 0, 1);
  const variableShare = clamp(toNumber(config.variableCostShare, usageShare || hours.share), 0, 1);

  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);
  const fixedAnnual = Math.max(toNumber(costs.fixedCosts, 0), 0) * fixedShare;
  const variableAnnual = Math.max(toNumber(costs.annualVariableCosts, 0), 0) * variableShare;

  const revenueAnnual = revenueMetrics.pricePerUnit * annualUnits;
  const directCostAnnual = directCostPerUnit * annualUnits + fixedAnnual + variableAnnual;

  const taxRate = clamp(toNumber(config.taxRate, costs.taxRate ?? 0), 0, 1);
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

function normalizeSolverConstraints(snapshot, capacityMetrics, costs, serviceEntries) {
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
    handsOnTolerance
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

  const serviceEntries = descriptors.map((descriptor) => {
    const storeOverrides = readServiceOverrides(descriptor.id);
    const snapshotOverrides = readServiceOverridesFromStateSnapshot(snapshot, descriptor.id);
    const mergedOverrides = mergeConfig(storeOverrides, snapshotOverrides);
    const baseConfig = mergeConfig(descriptor.defaults || {}, mergedOverrides);
    return { id: descriptor.id, descriptor, config: baseConfig };
  });

  const constraints = normalizeSolverConstraints(snapshot, capacity, costs, serviceEntries);

  const serviceOptions = serviceEntries.map((entry) => {
    const candidates = buildUnitRange(entry, capacity);
    const normalizedCandidates = candidates.length > 0 ? candidates : [0];
    return normalizedCandidates.map((units) =>
      evaluateServiceOption(entry, units, capacity, costs)
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
      handsOnDays: 0
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
      selection[depth] = evaluateServiceOption(serviceEntries[depth], 0, capacity, costs);
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
      targetNet,
      netGap: -targetNet
    },
    violations: []
  };

  if (result.totals) {
    result.totals.iterations = iterations;
  }

  delete result.metrics;

  return result;
}

export function computeServiceHours(config, capacity = {}) {
  const share = clamp(toNumber(config.shareOfCapacity, 0), 0, 1);
  const daysPerUnit = Math.max(toNumber(config.daysPerUnit, 1), 0.01);
  const activeMonths = Math.max(toNumber(capacity.activeMonths, 12), 1);
  const billableDays = Math.max(
    toNumber(capacity.billableDaysAfterTravel, toNumber(capacity.billableDaysPerYear, 0)),
    0
  );

  const explicitUnitsPerMonth = toNumber(config.unitsPerMonth, NaN);
  const explicitUnitsPerYear = toNumber(config.unitsPerYear, NaN);

  let unitsPerMonth;
  if (Number.isFinite(explicitUnitsPerMonth) && explicitUnitsPerMonth >= 0) {
    unitsPerMonth = explicitUnitsPerMonth;
  } else if (Number.isFinite(explicitUnitsPerYear) && explicitUnitsPerYear >= 0) {
    unitsPerMonth = explicitUnitsPerYear / activeMonths;
  } else {
    const annualDaysForService = billableDays * share;
    const annualUnits = annualDaysForService / daysPerUnit;
    unitsPerMonth = annualUnits / activeMonths;
  }

  if (!Number.isFinite(unitsPerMonth) || unitsPerMonth < 0) {
    unitsPerMonth = 0;
  }

  const annualUnits = unitsPerMonth * activeMonths;
  const annualDaysForService = annualUnits * daysPerUnit;

  return {
    share,
    daysPerUnit,
    activeMonths,
    billableDays,
    unitsPerMonth,
    annualUnits,
    annualDaysForService
  };
}

export function computeServiceRevenue(config, hoursMetrics, costs = {}) {
  const buffer = clamp(toNumber(config.bufferOverride, costs.buffer ?? 0), 0, 5);
  const basePrice = toPositive(config.basePrice ?? config.pricePerUnit ?? 0, 0);
  const priceOverride = toPositive(config.pricePerUnitOverride ?? config.pricePerUnit, NaN);
  const pricePerUnit = Number.isFinite(priceOverride) && priceOverride > 0
    ? priceOverride
    : basePrice * (1 + buffer);

  const directCostPerUnit = toPositive(config.directCostPerUnit ?? config.costPerUnit, 0);
  const allocatedFixed = Math.max(toNumber(costs.fixedCosts, 0), 0) / 12 * clamp(
    toNumber(config.fixedCostShare, hoursMetrics.share),
    0,
    1
  );
  const allocatedVariable = Math.max(toNumber(costs.annualVariableCosts, 0), 0) / 12 * clamp(
    toNumber(config.variableCostShare, hoursMetrics.share),
    0,
    1
  );

  const units = hoursMetrics.unitsPerMonth;
  const revenue = units * pricePerUnit;
  const perUnitCost = units * directCostPerUnit;
  const directCost = perUnitCost + allocatedFixed + allocatedVariable;

  const taxRate = clamp(
    toNumber(config.taxRate, costs.taxRate ?? 0),
    0,
    1
  );
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

function createServiceDescriptor(id) {
  const defaults = SERVICE_DEFAULTS[id] || {};
  const copy = SERVICE_COPY[id] || { title: id };

  return {
    id,
    copy,
    defaults,
    compute(state, capacity, costs) {
      const overrides = readServiceOverrides(id);
      const config = mergeConfig(defaults, overrides);
      const hoursMetrics = computeServiceHours(config, capacity);
      const revenueMetrics = computeServiceRevenue(config, hoursMetrics, costs);
      return {
        units: revenueMetrics && Number.isFinite(hoursMetrics.unitsPerMonth)
          ? hoursMetrics.unitsPerMonth
          : 0,
        price: revenueMetrics.pricePerUnit,
        revenue: revenueMetrics.revenue,
        directCost: revenueMetrics.directCost,
        tax: revenueMetrics.tax,
        net: revenueMetrics.net
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
