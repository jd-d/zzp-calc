export function computeCosts(state, capacityMetrics) {
  const taxRatePercent = Math.min(Math.max(state.costs.taxRatePercent, 0), 99.9);
  const taxRate = taxRatePercent / 100;
  const fixedCosts = Math.max(state.costs.fixedCosts, 0);
  const variableCostPerClass = Math.max(state.costs.variableCostPerClass, 0);
  const vatRatePercent = Math.max(state.costs.vatRatePercent, 0);
  const vatRate = vatRatePercent / 100;
  const bufferPercent = Math.max(state.costs.bufferPercent, 0);
  const buffer = bufferPercent / 100;
  const workingDaysPerYear = Number.isFinite(capacityMetrics.workingDaysPerYear)
    ? capacityMetrics.workingDaysPerYear
    : 0;
  const annualVariableCosts = variableCostPerClass * workingDaysPerYear;
  const currencySymbol = state.config.currencySymbol || '€';

  return {
    taxRate,
    taxRatePercent,
    fixedCosts,
    variableCostPerClass,
    vatRate,
    vatRatePercent,
    buffer,
    bufferPercent,
    annualVariableCosts,
    currencySymbol
  };
}
