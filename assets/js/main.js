import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';
import { mountScenarioToolbar } from './ui/scenario-toolbar.js';
import { mountPortfolio } from './ui/portfolio.js';
import { bindSliderPair } from './ui/components.js';

const percentFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const monthFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatPercentDisplay(value) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  const formatted = percentFormatter.format(value);
  return `${formatted}%`;
}

function formatMonthsDisplay(value) {
  if (!Number.isFinite(value)) {
    return '0 months';
  }
  const formatted = monthFormatter.format(value);
  const singular = Math.abs(value - 1) < 0.001;
  return `${formatted} ${singular ? 'month' : 'months'}`;
}

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';
export { mountScenarioToolbar } from './ui/scenario-toolbar.js';
export { mountPortfolio } from './ui/portfolio.js';
export * from './ui/i18n.js';
export * from './ui/theming.js';
export { calculateDutchTax2025 } from './tax2025.js';

export function initializeApp() {
  initializePageUi();
  const calculator = initializeCalculatorUI();
  const scenario = mountScenarioToolbar(store);
  const portfolio = mountPortfolio(store);

  bindSliderPair({
    sliderId: 'monthsOff',
    inputId: 'months-off',
    stateKey: ['capacity', 'monthsOff'],
    displayId: 'months-off-display',
    format: formatMonthsDisplay,
    debounceMs: 180
  });

  bindSliderPair({
    sliderId: 'utilization-slider',
    inputId: 'utilization',
    stateKey: ['capacity', 'utilizationPercent'],
    displayId: 'utilization-display',
    format: formatPercentDisplay,
    debounceMs: 180
  });

  bindSliderPair({
    sliderId: 'hoursPerWeek',
    inputId: 'hours-per-week',
    stateKey: ['capacity', 'hoursPerWeek']
  });

  bindSliderPair({
    sliderId: 'comfort-margin-slider',
    inputId: 'comfort-margin',
    stateKey: ['modifiers', 'comfortMarginPercent']
  });

  bindSliderPair({
    sliderId: 'seasonality-slider',
    inputId: 'seasonality',
    stateKey: ['modifiers', 'seasonalityPercent']
  });

  bindSliderPair({
    sliderId: 'tax-reserve-slider',
    inputId: 'tax-rate',
    stateKey: ['costs', 'taxRatePercent'],
    displayId: 'tax-reserve-display',
    format: formatPercentDisplay,
    debounceMs: 180
  });

  bindSliderPair({
    sliderId: 'travel-friction-slider',
    inputId: 'travel-friction',
    stateKey: ['modifiers', 'travelFrictionPercent'],
    displayId: 'travel-friction-display',
    format: formatPercentDisplay,
    debounceMs: 180
  });

  bindSliderPair({
    sliderId: 'hands-on-quota-slider',
    inputId: 'hands-on-quota',
    stateKey: ['modifiers', 'handsOnQuotaPercent']
  });

  return {
    calculator,
    scenario,
    portfolio,
    store
  };
}

function onReady(callback) {
  if (document.readyState === 'loading') {
    const handler = () => {
      document.removeEventListener('DOMContentLoaded', handler);
      callback();
    };
    document.addEventListener('DOMContentLoaded', handler);
  } else {
    callback();
  }
}

onReady(initializeApp);
