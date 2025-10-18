import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';
import { mountScenarioToolbar } from './ui/scenario-toolbar.js';

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';
export { mountScenarioToolbar } from './ui/scenario-toolbar.js';

export function initializeApp() {
  initializePageUi();
  const calculator = initializeCalculatorUI();
  const scenario = mountScenarioToolbar(store);
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
