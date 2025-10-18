import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';
import { mountScenarioToolbar } from './ui/scenario-toolbar.js';
import { bindSliderPair } from './ui/components.js';

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';
export { mountScenarioToolbar } from './ui/scenario-toolbar.js';

export function initializeApp() {
  initializePageUi();
  const calculator = initializeCalculatorUI();
  const scenario = mountScenarioToolbar(store);

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

  return {
    calculator,
    scenario,
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
