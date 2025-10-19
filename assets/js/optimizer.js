import { deriveCapacity } from './capacity.js';
import { computeCosts } from './costs.js';
import { normalizeScenarioModifiers } from './modifiers.js';
import { deriveIncomeTargets } from './income.js';
import {
  services as defaultServices,
  computeServiceHours,
  computeServiceRevenue
} from './services.js';

const DEFAULT_SESSION_LENGTH = 1.5;
const DEFAULT_MULTIPLIERS = [0, 0.5, 0.75, 1, 1.25, 1.5];
const HANDS_ON_SERVICE_IDS = new Set(['ops', 'qc', 'training']);
const EPSILON = 1e-6;

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

function clamp(value, min, max) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(normalized, min), max);
}

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, clonePlain(val)])
    );
  }
  return value;
}

function mergeConfig(base, overrides) {
  const result = isPlainObject(base) ? clonePlain(base) : {};
  if (!isPlainObject(overrides)) {
    return result;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map(clonePlain);
      continue;
    }
    if (isPlainObject(value)) {
      result[key] = mergeConfig(result[key], value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function resolveSnapshot(state) {
  if (!state) {
    return {};
  }
  if (typeof state.get === 'function') {
    try {
      const snapshot = state.get();
      return isPlainObject(snapshot) ? snapshot : {};
    } catch (error) {
      return {};
    }
  }
  return isPlainObject(state) ? state : {};
}

function resolveSessionLength(state) {
  const raw = state && Number(state.sessionLength);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_SESSION_LENGTH;
}

function roundUnits(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
}

function resolveHandsOnWeight(id, config = {}) {
  const explicitWeight = Number(config.handsOnWeight);
  if (Number.isFinite(explicitWeight)) {
    return clamp(explicitWeight, 0, 1);
  }
  if (config.handsOn === true) {
    return 1;
  }
  if (config.handsOn === false) {
    return 0;
  }
  return HANDS_ON_SERVICE_IDS.has(id) ? 1 : 0;
}

function buildServiceCandidates(entry, context, multipliers) {
  const { capacity, modifiers, costs, activeMonths } = context;
  const baseHours = computeServiceHours(entry.config, capacity, modifiers);
  const baseUnits = Math.max(baseHours.unitsPerMonth || 0, 0);
  const candidateMultipliers = multipliers && multipliers.length
    ? multipliers
    : DEFAULT_MULTIPLIERS;

  const explicitUnits = Number(entry.config.unitsPerMonth);
  const baseCandidates = candidateMultipliers.map(multiplier => {
    if (!Number.isFinite(multiplier)) {
      return 0;
    }
    if (multiplier === 0) {
      return 0;
    }
    if (baseUnits <= 0) {
      return multiplier;
    }
    return baseUnits * multiplier;
  });

  if (Number.isFinite(explicitUnits) && explicitUnits >= 0) {
    baseCandidates.push(explicitUnits);
  }

  const unitsCandidates = uniqueSorted(baseCandidates.map(roundUnits));

  if (!unitsCandidates.length) {
    unitsCandidates.push(0);
  }

  return unitsCandidates.map(units => {
    const config = { ...entry.config, unitsPerMonth: units };
    const hours = computeServiceHours(config, capacity, modifiers);
    const revenue = computeServiceRevenue(config, hours, costs);

    const serviceDays = hours.annualDaysForService || 0;
    const travelDays = hours.annualTravelDays || 0;
    const annualHours = hours.annualHours || 0;
    const annualUnits = hours.annualUnits || (units * activeMonths);

    const revenueAnnual = (revenue.revenue || 0) * activeMonths;
    const directCostAnnual = (revenue.directCost || 0) * activeMonths;
    const taxAnnual = (revenue.tax || 0) * activeMonths;
    const netAnnual = (revenue.net || 0) * activeMonths;
    const pricePerUnit = Number.isFinite(revenue.pricePerUnit) ? revenue.pricePerUnit : 0;
    const grossMargin = revenue.revenue > EPSILON
      ? Math.max((revenue.revenue - revenue.directCost) / revenue.revenue, 0)
      : 0;

    const handsOnWeight = resolveHandsOnWeight(entry.id, entry.config);
    const handsOnDays = serviceDays * handsOnWeight;

    return {
      id: entry.id,
      descriptor: entry.descriptor,
      unitsPerMonth: hours.unitsPerMonth || units,
      annualUnits,
      serviceDays,
      travelDays,
      handsOnDays,
      annualHours,
      revenueAnnual,
      directCostAnnual,
      taxAnnual,
      netAnnual,
      pricePerUnit,
      grossMargin,
      buffer: Number.isFinite(revenue.buffer) ? revenue.buffer : 0
    };
  });
}

function summarizeSelection(selection, context) {
  const { capacity, targetNet, hoursLimitPerWeek, travelLimitPerMonth, activeMonths, billableWeeks } = context;

  const totals = selection.reduce((acc, option) => {
    acc.revenue += option.revenueAnnual;
    acc.directCost += option.directCostAnnual;
    acc.tax += option.taxAnnual;
    acc.net += option.netAnnual;
    acc.serviceDays += option.serviceDays;
    acc.travelDays += option.travelDays;
    acc.handsOnDays += option.handsOnDays;
    acc.annualHours += option.annualHours;
    return acc;
  }, {
    revenue: 0,
    directCost: 0,
    tax: 0,
    net: 0,
    serviceDays: 0,
    travelDays: 0,
    handsOnDays: 0,
    annualHours: 0
  });

  const travelDaysPerMonth = activeMonths > 0 ? totals.travelDays / activeMonths : 0;
  const hoursPerWeek = billableWeeks > 0 ? totals.annualHours / billableWeeks : 0;
  const utilization = hoursLimitPerWeek > 0 ? hoursPerWeek / hoursLimitPerWeek : null;
  const handsOnShare = totals.serviceDays > 0 ? totals.handsOnDays / totals.serviceDays : 0;
  const meetsTarget = totals.net + EPSILON >= targetNet;
  const netGap = totals.net - targetNet;

  return {
    totals,
    travelDaysPerMonth,
    hoursPerWeek,
    utilization,
    handsOnShare,
    meetsTarget,
    netGap,
    hoursLimitPerWeek,
    travelLimitPerMonth
  };
}

function detectViolations(summary, context) {
  const violations = [];
  const { modifiers } = context;
  const handsOnMin = Number.isFinite(modifiers.handsOnQuota) ? modifiers.handsOnQuota : 0;

  if (summary.hoursLimitPerWeek > 0 && summary.hoursPerWeek > summary.hoursLimitPerWeek + EPSILON) {
    violations.push({
      type: 'hours',
      actual: summary.hoursPerWeek,
      limit: summary.hoursLimitPerWeek,
      message: 'Weekly hours exceed allowance'
    });
  }

  if (Number.isFinite(summary.travelLimitPerMonth) && summary.travelLimitPerMonth >= 0) {
    if (summary.travelDaysPerMonth > summary.travelLimitPerMonth + EPSILON) {
      violations.push({
        type: 'travel',
        actual: summary.travelDaysPerMonth,
        limit: summary.travelLimitPerMonth,
        message: 'Travel days per month exceed allowance'
      });
    }
  }

  if (handsOnMin > 0 && summary.handsOnShare + EPSILON < handsOnMin) {
    violations.push({
      type: 'handsOn',
      actual: summary.handsOnShare,
      limit: handsOnMin,
      message: 'Hands-on share below minimum'
    });
  }

  return violations;
}

function buildMixDescriptor(selection) {
  return selection.reduce((acc, option) => {
    acc[option.id] = {
      unitsPerMonth: option.unitsPerMonth,
      annualUnits: option.annualUnits,
      serviceDays: option.serviceDays,
      travelDays: option.travelDays,
      handsOnDays: option.handsOnDays,
      revenue: option.revenueAnnual,
      directCost: option.directCostAnnual,
      tax: option.taxAnnual,
      net: option.netAnnual,
      pricePerUnit: option.pricePerUnit,
      grossMargin: option.grossMargin,
      buffer: option.buffer,
      descriptor: option.descriptor
    };
    return acc;
  }, {});
}

function compareCandidates(a, b, targetNet) {
  if (a.violations.length !== b.violations.length) {
    return a.violations.length - b.violations.length;
  }
  const aMeets = a.summary.meetsTarget;
  const bMeets = b.summary.meetsTarget;
  if (aMeets !== bMeets) {
    return aMeets ? -1 : 1;
  }

  const aGap = Math.abs(a.summary.netGap);
  const bGap = Math.abs(b.summary.netGap);
  if (aMeets && bMeets) {
    if (a.summary.netGap !== b.summary.netGap) {
      return a.summary.netGap - b.summary.netGap;
    }
  }
  if (aGap !== bGap) {
    return aGap - bGap;
  }
  if (a.summary.totals.net !== b.summary.totals.net) {
    return b.summary.totals.net - a.summary.totals.net;
  }
  return 0;
}

export function optimizeServiceMix(state, options = {}) {
  const snapshot = resolveSnapshot(state);
  const sessionLength = resolveSessionLength(snapshot);
  const modifiers = normalizeScenarioModifiers(snapshot.modifiers || {});
  const capacity = deriveCapacity(snapshot.capacity || {}, snapshot.modifiers || {}, { sessionLength });
  const costs = computeCosts(snapshot, capacity);
  const incomeTargets = deriveIncomeTargets({
    incomeTargets: snapshot.incomeTargets || {},
    config: snapshot.config || { defaults: { incomeTargets: {} } }
  }, capacity);

  const targetNet = Number.isFinite(incomeTargets?.targetNet) ? incomeTargets.targetNet : 0;
  const activeMonths = Math.max(toNumber(capacity.activeMonths, 12), 1);
  const billableWeeks = Math.max(toNumber(capacity.billableWeeks, capacity.workingWeeks || 52), 1);
  const hoursLimitPerWeek = Number.isFinite(capacity.billableHoursPerWeek)
    ? capacity.billableHoursPerWeek
    : Number.isFinite(capacity.workingHoursPerWeek)
      ? capacity.workingHoursPerWeek
      : null;
  const travelLimitPerMonth = Number.isFinite(capacity.travelDaysPerMonth)
    ? capacity.travelDaysPerMonth
    : Number.isFinite(capacity.travelAllowanceDays)
      ? capacity.travelAllowanceDays / activeMonths
      : null;

  const multipliers = Array.isArray(options.multipliers) && options.multipliers.length
    ? options.multipliers
    : DEFAULT_MULTIPLIERS;
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? options.maxCandidates
    : 5;

  const descriptors = Array.isArray(options.services) && options.services.length
    ? options.services
    : defaultServices;

  const serviceEntries = descriptors.map(descriptor => {
    const overrides = snapshot.services && isPlainObject(snapshot.services[descriptor.id])
      ? clonePlain(snapshot.services[descriptor.id])
      : {};
    const config = mergeConfig(descriptor.defaults || {}, overrides);
    return { id: descriptor.id, descriptor, config };
  });

  const context = {
    capacity,
    modifiers,
    costs,
    activeMonths,
    billableWeeks,
    targetNet,
    hoursLimitPerWeek,
    travelLimitPerMonth
  };

  const candidateSpaces = serviceEntries.map(entry => buildServiceCandidates(entry, context, multipliers));
  const selection = new Array(candidateSpaces.length);
  const candidates = [];
  let evaluations = 0;

  function iterate(depth) {
    if (depth >= candidateSpaces.length) {
      const filteredSelection = selection.filter(Boolean);
      const summary = summarizeSelection(filteredSelection, context);
      const violations = detectViolations(summary, context);
      const mix = buildMixDescriptor(filteredSelection);
      const remainingHours = summary.hoursLimitPerWeek > 0
        ? Math.max(summary.hoursLimitPerWeek - summary.hoursPerWeek, 0)
        : null;
      const remainingTravel = Number.isFinite(summary.travelLimitPerMonth)
        ? Math.max(summary.travelLimitPerMonth - summary.travelDaysPerMonth, 0)
        : null;

      candidates.push({
        mix,
        summary: {
          totals: summary.totals,
          hoursPerWeek: summary.hoursPerWeek,
          travelDaysPerMonth: summary.travelDaysPerMonth,
          utilization: summary.utilization,
          handsOnShare: summary.handsOnShare,
          meetsTarget: summary.meetsTarget,
          netGap: summary.netGap
        },
        metadata: {
          utilization: {
            rate: summary.utilization,
            hoursPerWeek: summary.hoursPerWeek,
            limit: summary.hoursLimitPerWeek
          },
          travelLoad: {
            daysPerMonth: summary.travelDaysPerMonth,
            limit: summary.travelLimitPerMonth,
            remaining: remainingTravel
          },
          remainingBuffer: {
            hoursPerWeek: remainingHours,
            travelDaysPerMonth: remainingTravel,
            netGap: summary.netGap
          }
        },
        violations
      });
      evaluations += 1;
      return;
    }

    const optionsForService = candidateSpaces[depth];
    if (!optionsForService || optionsForService.length === 0) {
      selection[depth] = null;
      iterate(depth + 1);
      return;
    }

    for (const option of optionsForService) {
      selection[depth] = option;
      iterate(depth + 1);
    }
  }

  iterate(0);

  const sorted = candidates.sort((a, b) => compareCandidates(a, b, targetNet));
  const topCandidates = sorted.slice(0, maxCandidates);

  return {
    candidates: topCandidates,
    meta: {
      evaluated: evaluations,
      targetNet,
      activeMonths,
      billableWeeks,
      hoursLimitPerWeek,
      travelLimitPerMonth,
      handsOnMinimum: modifiers.handsOnQuota
    }
  };
}

export default optimizeServiceMix;
