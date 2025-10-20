import { MONTHS_PER_YEAR } from './constants.js';
import { normalizeScenarioModifiers } from './modifiers.js';

function toNumber(value, fallback = 0) {
  if (value == null || value === '') {
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
  const normalized = toNumber(value, fallback);
  return clamp(normalized, min, max);
}

function sumFixedCosts(costsState) {
  if (!costsState || typeof costsState !== 'object') {
    return 0;
  }

  if (Number.isFinite(costsState.fixedCosts)) {
    return Math.max(costsState.fixedCosts, 0);
  }

  const breakdown = costsState.fixedCostBreakdown || costsState.fixed || null;
  if (!breakdown || typeof breakdown !== 'object') {
    return 0;
  }

  return Object.values(breakdown).reduce((total, value) => {
    const numeric = toNumber(value, 0);
    return total + (numeric > 0 ? numeric : 0);
  }, 0);
}

function computeVariableCostTotals(costsState = {}, capacity = {}) {
  const perWorkingDay = Math.max(
    toNumber(costsState.variableCostPerWorkingDay ?? costsState.variableCostPerClass, 0),
    0
  );
  const perBillableDay = Math.max(
    toNumber(costsState.variableCostPerBillableDay, 0),
    0
  );
  const perTravelDay = Math.max(
    toNumber(costsState.travelCostPerDay ?? costsState.travelAllowancePerDay, 0),
    0
  );

  const workingDays = Math.max(toNumber(capacity.workingDaysPerYear, 0), 0);
  const billableDays = Math.max(
    toNumber(capacity.billableDaysAfterTravel ?? capacity.billableDaysPerYear, workingDays),
    0
  );
  const travelDays = Math.max(
    toNumber(capacity.travelAllowanceDays ?? capacity.travelDaysPerYear, 0),
    0
  );

  const annualWorkingDayCost = perWorkingDay * workingDays;
  const annualBillableDayCost = perBillableDay * billableDays;
  const annualTravelCost = perTravelDay * travelDays;
  const otherAnnualCost = Math.max(
    toNumber(costsState.variableCostsAnnual ?? costsState.additionalVariableAnnual, 0),
    0
  );

  const annualTotal = annualWorkingDayCost + annualBillableDayCost + annualTravelCost + otherAnnualCost;

  return {
    perWorkingDay,
    perBillableDay,
    perTravelDay,
    workingDays,
    billableDays,
    travelDays,
    annualWorkingDayCost,
    annualBillableDayCost,
    annualTravelCost,
    otherAnnualCost,
    annualTotal
  };
}

function computeFixedCostTotals(costsState = {}) {
  const annual = Math.max(sumFixedCosts(costsState), 0);
  return {
    annual,
    monthly: annual / MONTHS_PER_YEAR
  };
}

function computeHourlyCostTotals(variableCosts = {}, capacity = {}) {
  const workingContribution = Math.max(variableCosts.annualWorkingDayCost || 0, 0);
  const billableContribution = Math.max(variableCosts.annualBillableDayCost || 0, 0);
  const annual = workingContribution + billableContribution;
  const billableHours = Math.max(toNumber(capacity.billableHoursPerYear, 0), 0);

  return {
    annual,
    monthly: annual / MONTHS_PER_YEAR,
    perBillableHour: billableHours > 0 ? annual / billableHours : 0,
    perWorkingDay: variableCosts.perWorkingDay || 0,
    perBillableDay: variableCosts.perBillableDay || 0,
    workingDays: variableCosts.workingDays || 0,
    billableDays: variableCosts.billableDays || 0
  };
}

function computeTravelCostTotals(variableCosts = {}) {
  const annual = Math.max(variableCosts.annualTravelCost || 0, 0);
  return {
    annual,
    monthly: annual / MONTHS_PER_YEAR,
    perDay: variableCosts.perTravelDay || 0,
    days: variableCosts.travelDays || 0
  };
}

function computeOtherVariableCostTotals(variableCosts = {}) {
  const annual = Math.max(variableCosts.otherAnnualCost || 0, 0);
  return {
    annual,
    monthly: annual / MONTHS_PER_YEAR
  };
}

function aggregateCostTotals(costsState = {}, capacity = {}, variableCosts = null) {
  const variableDetail = variableCosts || computeVariableCostTotals(costsState, capacity);
  const fixed = computeFixedCostTotals(costsState);
  const hourly = computeHourlyCostTotals(variableDetail, capacity);
  const travel = computeTravelCostTotals(variableDetail);
  const other = computeOtherVariableCostTotals(variableDetail);
  const variableAnnual = Math.max(variableDetail.annualTotal || 0, 0);
  const variableMonthly = variableAnnual / MONTHS_PER_YEAR;
  const totalAnnual = fixed.annual + variableAnnual;

  return {
    fixed,
    hourly,
    travel,
    other,
    variable: {
      annual: variableAnnual,
      monthly: variableMonthly
    },
    total: {
      annual: totalAnnual,
      monthly: totalAnnual / MONTHS_PER_YEAR
    }
  };
}

export function computeCosts(state, capacityMetrics = {}) {
  const costsState = (state && state.costs) || {};

  const taxRatePercent = normalizePercent(costsState.taxRatePercent, 40, { min: 0, max: 99.9 });
  const taxRate = taxRatePercent / 100;

  const vatRatePercent = normalizePercent(costsState.vatRatePercent, 21, { min: 0 });
  const vatRate = vatRatePercent / 100;

  const bufferPercent = normalizePercent(costsState.bufferPercent, 15, { min: 0 });
  const modifiers = normalizeScenarioModifiers(state && state.modifiers);
  const comfortMarginPercent = modifiers.comfortMarginPercent;
  const bufferPercentEffective = bufferPercent + comfortMarginPercent;
  const buffer = bufferPercentEffective / 100;

  const variableCosts = computeVariableCostTotals(costsState, capacityMetrics);
  const annualVariableCosts = Math.max(variableCosts.annualTotal, 0);
  const totals = aggregateCostTotals(costsState, capacityMetrics, variableCosts);
  const fixedCosts = totals.fixed.annual;

  const currencySymbol =
    state && state.config && typeof state.config.currencySymbol === 'string'
      ? state.config.currencySymbol || '€'
      : '€';

  return {
    taxRate,
    taxRatePercent,
    vatRate,
    vatRatePercent,
    buffer,
    bufferPercent,
    bufferPercentBase: bufferPercent,
    comfortMarginPercent,
    fixedCosts,
    annualVariableCosts,
    variableCostPerClass: variableCosts.perWorkingDay,
    variableCosts,
    totals,
    currencySymbol
  };
}

export {
  sumFixedCosts,
  computeVariableCostTotals,
  normalizePercent,
  aggregateCostTotals
};
