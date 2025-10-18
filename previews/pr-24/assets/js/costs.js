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

export function computeCosts(state, capacityMetrics = {}) {
  const costsState = (state && state.costs) || {};

  const taxRatePercent = normalizePercent(costsState.taxRatePercent, 40, { min: 0, max: 99.9 });
  const taxRate = taxRatePercent / 100;

  const vatRatePercent = normalizePercent(costsState.vatRatePercent, 21, { min: 0 });
  const vatRate = vatRatePercent / 100;

  const bufferPercent = normalizePercent(costsState.bufferPercent, 15, { min: 0 });
  const buffer = bufferPercent / 100;

  const fixedCosts = Math.max(sumFixedCosts(costsState), 0);

  const variableCosts = computeVariableCostTotals(costsState, capacityMetrics);
  const annualVariableCosts = Math.max(variableCosts.annualTotal, 0);

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
    fixedCosts,
    annualVariableCosts,
    variableCostPerClass: variableCosts.perWorkingDay,
    variableCosts,
    currencySymbol
  };
}

export { sumFixedCosts, computeVariableCostTotals, normalizePercent };
