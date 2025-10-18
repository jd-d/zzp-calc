import { calcState } from './state.js';

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
