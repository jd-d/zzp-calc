import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';
import { mountScenarioToolbar } from './ui/scenario-toolbar.js';
import { mountPortfolio } from './ui/portfolio.js';
import { bindSliderPair } from './ui/components.js';

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';
export { mountScenarioToolbar } from './ui/scenario-toolbar.js';
export { mountPortfolio } from './ui/portfolio.js';
export * from './ui/i18n.js';
export { calculateDutchTax2025 } from './tax.js';

export function initializeApp() {
  initializePageUi();
  const calculator = initializeCalculatorUI();
  const scenario = mountScenarioToolbar(store);
  const portfolio = mountPortfolio(store);

  bindSliderPair({
    sliderId: 'monthsOff',
    inputId: 'months-off',
    stateKey: ['capacity', 'monthsOff']
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
    sliderId: 'travel-friction-slider',
    inputId: 'travel-friction',
    stateKey: ['modifiers', 'travelFrictionPercent']
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
