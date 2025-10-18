import { calcState } from './state.js';
import { deriveIncomeTargets } from './income.js';

export const ZELFSTANDIGENAFTREK_2025 = 2470;
export const STARTERSAFTREK_2025 = 2123;
export const MKB_VRIJSTELLING_RATE_2025 = 0.1331;
export const ZVW_RATE_2025 = 0.0532;
export const ZVW_MAXIMUM_INCOME_2025 = 80000;

const BOX1_BRACKETS_2025 = [
  { limit: 75518, rate: 0.3697 },
  { limit: Infinity, rate: 0.495 }
];

const TAX_SOLVER_EPSILON = 0.5;
const TAX_SOLVER_MAX_ITERATIONS = 60;

const TAX_TOGGLE_DEFAULTS = {
  zelfstandigenaftrek: true,
  startersaftrek: false,
  mkbVrijstelling: true,
  includeZvw: true
};

function readTaxToggle(key, state, defaultValue) {
  const overrides = calcState && calcState.tax;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
    const override = overrides[key];
    if (override !== undefined) {
      return Boolean(override);
    }
  }

  if (state && state.tax && Object.prototype.hasOwnProperty.call(state.tax, key)) {
    const configured = state.tax[key];
    if (configured !== undefined) {
      return Boolean(configured);
    }
  }

  return defaultValue;
}

export function isZelfstandigenaftrekEnabled(state) {
  return readTaxToggle('zelfstandigenaftrek', state, TAX_TOGGLE_DEFAULTS.zelfstandigenaftrek);
}

export function isStartersaftrekEnabled(state) {
  return readTaxToggle('startersaftrek', state, TAX_TOGGLE_DEFAULTS.startersaftrek);
}

export function isMkbVrijstellingEnabled(state) {
  return readTaxToggle('mkbVrijstelling', state, TAX_TOGGLE_DEFAULTS.mkbVrijstelling);
}

export function isZvwContributionEnabled(state) {
  return readTaxToggle('includeZvw', state, TAX_TOGGLE_DEFAULTS.includeZvw);
}

function resolveTaxSettings(state) {
  return {
    zelfstandigenaftrek: isZelfstandigenaftrekEnabled(state),
    startersaftrek: isStartersaftrekEnabled(state),
    mkbVrijstelling: isMkbVrijstellingEnabled(state),
    includeZvw: isZvwContributionEnabled(state)
  };
}

function computeProgressiveTax(income) {
  let remaining = Math.max(income, 0);
  let tax = 0;
  let lowerBound = 0;

  for (const bracket of BOX1_BRACKETS_2025) {
    if (remaining <= 0) {
      break;
    }

    const span = bracket.limit === Infinity ? remaining : Math.max(bracket.limit - lowerBound, 0);
    if (span <= 0) {
      lowerBound = bracket.limit;
      continue;
    }

    const taxable = bracket.limit === Infinity ? remaining : Math.min(remaining, span);
    if (taxable <= 0) {
      lowerBound = bracket.limit;
      continue;
    }

    tax += taxable * bracket.rate;
    remaining -= taxable;
    lowerBound = bracket.limit;
  }

  return tax;
}

function computeTaxBreakdown(profitBeforeTax, settings) {
  const normalizedProfit = Math.max(profitBeforeTax, 0);
  const zelfstandigenaftrek = settings.zelfstandigenaftrek
    ? Math.min(ZELFSTANDIGENAFTREK_2025, normalizedProfit)
    : 0;
  const startersaftrek = settings.startersaftrek
    ? Math.min(STARTERSAFTREK_2025, Math.max(normalizedProfit - zelfstandigenaftrek, 0))
    : 0;

  const taxableProfitBeforeMkb = Math.max(normalizedProfit - zelfstandigenaftrek - startersaftrek, 0);
  const mkbVrijstellingRate = settings.mkbVrijstelling ? MKB_VRIJSTELLING_RATE_2025 : 0;
  const mkbVrijstelling = taxableProfitBeforeMkb * mkbVrijstellingRate;
  const taxableProfitAfterMkb = Math.max(taxableProfitBeforeMkb - mkbVrijstelling, 0);

  const incomeTax = computeProgressiveTax(taxableProfitAfterMkb);
  const zvwBase = Math.max(Math.min(taxableProfitBeforeMkb, ZVW_MAXIMUM_INCOME_2025), 0);
  const zvwContribution = settings.includeZvw ? zvwBase * ZVW_RATE_2025 : 0;
  const taxReserve = incomeTax + zvwContribution;
  const netIncome = normalizedProfit - taxReserve;

  return {
    profitBeforeTax: normalizedProfit,
    zelfstandigenaftrek,
    startersaftrek,
    taxableProfitBeforeMkb,
    mkbVrijstellingRate,
    mkbVrijstelling,
    taxableProfitAfterMkb,
    incomeTax,
    zvwBase,
    zvwContribution,
    taxReserve,
    netIncome
  };
}

function solveTaxBreakdown(targetNet, settings, costs) {
  if (!Number.isFinite(targetNet) || targetNet <= 0) {
    return computeTaxBreakdown(0, settings);
  }

  let low = targetNet;
  let high;

  const manualRate = costs && Number.isFinite(costs.taxRate) ? Math.max(Math.min(costs.taxRate, 0.95), 0) : 0;
  const manualEstimateDenominator = Math.max(1 - manualRate, 0.05);
  high = Math.max(targetNet / manualEstimateDenominator, targetNet + 1);

  let lowBreakdown = computeTaxBreakdown(low, settings);
  if (Math.abs(lowBreakdown.netIncome - targetNet) <= TAX_SOLVER_EPSILON) {
    return lowBreakdown;
  }

  if (lowBreakdown.netIncome > targetNet) {
    return lowBreakdown;
  }

  let highBreakdown = computeTaxBreakdown(high, settings);
  let guard = 0;
  while (highBreakdown.netIncome < targetNet && guard < 25) {
    low = high;
    high = high * 1.5;
    highBreakdown = computeTaxBreakdown(high, settings);
    guard += 1;
  }

  let bestBreakdown = highBreakdown;

  for (let i = 0; i < TAX_SOLVER_MAX_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    const midBreakdown = computeTaxBreakdown(mid, settings);
    const delta = midBreakdown.netIncome - targetNet;
    bestBreakdown = midBreakdown;

    if (Math.abs(delta) <= TAX_SOLVER_EPSILON) {
      return midBreakdown;
    }

    if (delta > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return bestBreakdown;
}

export function calculateDutchTax2025(state, capacity, costs) {
  const safeState = state && typeof state === 'object' ? state : {};
  const safeCapacity = capacity && typeof capacity === 'object' ? capacity : {};
  const normalizedConfig = safeState.config && typeof safeState.config === 'object'
    ? { ...safeState.config }
    : {};
  if (!normalizedConfig.defaults || typeof normalizedConfig.defaults !== 'object') {
    normalizedConfig.defaults = {};
  }
  if (!normalizedConfig.defaults.incomeTargets || typeof normalizedConfig.defaults.incomeTargets !== 'object') {
    normalizedConfig.defaults.incomeTargets = {};
  }
  const normalizedState = { ...safeState, config: normalizedConfig };
  const income = deriveIncomeTargets(normalizedState, safeCapacity);
  const targetNet = Number.isFinite(income.targetNet) ? Math.max(income.targetNet, 0) : 0;
  const settings = resolveTaxSettings(safeState);
  const breakdown = solveTaxBreakdown(targetNet, settings, costs);
  const effectiveTaxRate = breakdown.profitBeforeTax > 0
    ? breakdown.taxReserve / breakdown.profitBeforeTax
    : 0;

  return {
    targetNet,
    profitBeforeTax: breakdown.profitBeforeTax,
    incomeTax: breakdown.incomeTax,
    zvwContribution: breakdown.zvwContribution,
    taxReserve: breakdown.taxReserve,
    effectiveTaxRate,
    zelfstandigenaftrek: breakdown.zelfstandigenaftrek,
    startersaftrek: breakdown.startersaftrek,
    mkbVrijstellingRate: breakdown.mkbVrijstellingRate,
    mkbVrijstelling: breakdown.mkbVrijstelling,
    taxableProfitBeforeMkb: breakdown.taxableProfitBeforeMkb,
    taxableProfitAfterMkb: breakdown.taxableProfitAfterMkb,
    zvwBase: breakdown.zvwBase
  };
}

export { computeTaxBreakdown as _internalComputeTaxBreakdown };
