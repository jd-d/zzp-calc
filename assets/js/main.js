import * as store from './state.js';
import { initializeCalculatorUI } from './ui/calculator.js';
import { initializePageUi } from './ui/main.js';

export * from './state.js';
export { initializeCalculatorUI } from './ui/calculator.js';
export { initializePageUi } from './ui/main.js';

export function initializeApp() {
  initializePageUi();
  return {
    calculator: initializeCalculatorUI(),
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
