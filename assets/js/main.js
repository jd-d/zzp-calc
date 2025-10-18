import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';
import { bindSliderPair } from './ui/components.js';

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';

export function initializeApp() {
  initializePageUi();
  const calculator = initializeCalculatorUI();

  bindSliderPair({
    sliderId: 'monthsOff',
    inputId: 'months-off',
    stateKey: 'monthsOff'
  });

  bindSliderPair({
    sliderId: 'hoursPerWeek',
    inputId: 'hours-per-week',
    stateKey: 'hoursPerWeek'
  });

  return {
    calculator,
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
