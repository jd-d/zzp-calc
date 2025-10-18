import { announce, fmt, on, qs, registerSliderBinding, setText } from './components.js';
import { translate } from './i18n.js';

const percentFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const monthFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

const PRESET_ALIASES = {
  target: 'net',
  netincome: 'net',
  netyear: 'net',
  monthsoff: 'timeoff',
  off: 'timeoff',
  time: 'timeoff',
  bufferpercent: 'buffer',
  taxrate: 'tax',
  vat: 'vat',
  currency: 'currency'
};

const PRESET_TOKEN_HANDLERS = {
  net: value => createNumericPatch(['incomeTargets', 'year'], value, { min: 0 }),
  tax: value => createNumericPatch(['costs', 'taxRatePercent'], value, { min: 0 }),
  buffer: value => createNumericPatch(['costs', 'bufferPercent'], value, { min: 0 }),
  timeoff: value => createNumericPatch(['capacity', 'monthsOff'], value, { min: 0, max: 12 }),
  weeks: value => createNumericPatch(['capacity', 'weeksOffCycle'], value, { min: 0 }),
  days: value => createNumericPatch(['capacity', 'daysOffWeek'], value, { min: 0 }),
  vat: value => createNumericPatch(['costs', 'vatRatePercent'], value, { min: 0 }),
  basis: value => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      return null;
    }
    return createNestedPatch(['incomeTargets', 'basis'], normalized);
  },
  currency: value => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      return null;
    }
    return createNestedPatch(['config', 'currencySymbol'], normalized);
  }
};

export function mountScenarioToolbar(calcState, root = document) {
  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const patch = typeof store.patch === 'function' ? store.patch : null;
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe : null;
  const getState = typeof store.get === 'function' ? store.get : null;

  let latestState = typeof getState === 'function' ? getState() : null;
  const context = resolveContext(root);

  const sliderBindings = patch
    ? setupQuickSliders(context, patch, () => latestState)
    : [];

  const presetsContainer = qs('#scenario-presets', context);
  const cleanups = [];

  if (sliderBindings.length) {
    syncSliderBindings(sliderBindings, latestState);
  }

  if (typeof subscribe === 'function') {
    const unsubscribe = subscribe(nextState => {
      latestState = nextState;
      if (sliderBindings.length) {
        syncSliderBindings(sliderBindings, latestState);
      }
    });
    if (typeof unsubscribe === 'function') {
      cleanups.push(unsubscribe);
    }
  }

  if (presetsContainer && patch) {
    const handlePresetClick = event => {
      const presetElement = event.delegateTarget instanceof HTMLElement
        ? event.delegateTarget
        : event.target instanceof Element
          ? event.target.closest('[data-preset]')
          : null;

      if (!(presetElement instanceof HTMLElement)) {
        return;
      }

      event.preventDefault();

      const presetPatch = buildPresetPatch(presetElement);
      if (!presetPatch) {
        return;
      }

      patch(presetPatch);
      markActivePreset(presetsContainer, presetElement);
      announce(translate('quickControls.status.updated'));
    };

    const detach = on(presetsContainer, 'click', handlePresetClick, { delegate: '[data-preset]' });
    if (typeof detach === 'function') {
      cleanups.push(detach);
    }

    const initialActive = presetsContainer.querySelector('[data-preset][aria-pressed="true"]');
    if (initialActive instanceof HTMLElement) {
      markActivePreset(presetsContainer, initialActive);
    } else {
      markActivePreset(presetsContainer, null);
    }
  }

  return () => {
    cleanups.forEach(fn => {
      if (typeof fn === 'function') {
        fn();
      }
    });

    sliderBindings.forEach(entry => {
      if (entry && entry.binding && typeof entry.binding.destroy === 'function') {
        entry.binding.destroy();
      }
    });
  };
}

function setupQuickSliders(context, patch, readState) {
  const definitions = createSliderDefinitions();
  const bindings = [];

  definitions.forEach(definition => {
    const range = typeof definition.range === 'string'
      ? qs(definition.range, context)
      : definition.range;

    if (!(range instanceof HTMLInputElement) || range.type !== 'range') {
      return;
    }

    const input = typeof definition.input === 'string'
      ? qs(definition.input, context)
      : definition.input;
    const display = typeof definition.display === 'string'
      ? qs(definition.display, context)
      : definition.display;

    const binding = registerSliderBinding(range, input, {
      parse: value => {
        const numeric = toNumber(value);
        const state = readState();
        return definition.normalize(numeric, state);
      },
      onChange: value => {
        const state = readState();
        const normalized = definition.normalize(value, state);
        if (!Number.isFinite(normalized)) {
          return;
        }
        const payload = definition.createPatch
          ? definition.createPatch(normalized, state)
          : createNestedPatch(definition.path, normalized);
        if (payload) {
          patch(payload);
        }
        updateDisplay(display, normalized, definition, state);
      },
      syncOnInit: false
    });

    bindings.push({
      binding,
      definition,
      display
    });
  });

  return bindings;
}

function syncSliderBindings(bindings, state) {
  bindings.forEach(entry => {
    if (!entry || !entry.binding || typeof entry.binding.update !== 'function') {
      return;
    }
    const { binding, definition, display } = entry;
    const rawValue = definition.getValue(state);
    const fallback = definition.defaultValue ?? 0;
    const normalized = definition.normalize(
      Number.isFinite(rawValue) ? rawValue : fallback,
      state
    );
    binding.update(normalized, { silent: true });
    updateDisplay(display, normalized, definition, state);
  });
}

function buildPresetPatch(element) {
  const attr = element && typeof element.getAttribute === 'function'
    ? element.getAttribute('data-preset')
    : '';

  if (!attr) {
    return null;
  }

  const tokens = attr
    .split(/[,\s]+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return null;
  }

  const partials = tokens
    .map(token => {
      const separatorIndex = token.indexOf(':');
      if (separatorIndex === -1) {
        return null;
      }
      const rawKey = token.slice(0, separatorIndex).toLowerCase();
      const value = token.slice(separatorIndex + 1);
      const normalizedKey = PRESET_ALIASES[rawKey] || rawKey;
      const handler = PRESET_TOKEN_HANDLERS[normalizedKey];
      if (!handler) {
        return null;
      }
      return handler(value);
    })
    .filter(Boolean);

  if (!partials.length) {
    return null;
  }

  return partials.reduce((acc, partial) => mergeObjects(acc, partial), {});
}

function mergeObjects(target, source) {
  const base = isPlainObject(target) ? { ...target } : {};
  if (!isPlainObject(source)) {
    return base;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (isPlainObject(value)) {
      base[key] = mergeObjects(base[key], value);
    } else {
      base[key] = value;
    }
  });

  return base;
}

function createNestedPatch(path, value) {
  if (!Array.isArray(path) || !path.length) {
    return null;
  }

  return path.reduceRight((acc, key) => ({ [key]: acc }), value);
}

function createNumericPatch(path, rawValue, limits = {}) {
  const numeric = toNumber(rawValue);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = clampNumber(numeric, limits);
  return createNestedPatch(path, normalized);
}

function clampNumber(value, { min = -Infinity, max = Infinity } = {}) {
  let result = value;
  if (Number.isFinite(min) && result < min) {
    result = min;
  }
  if (Number.isFinite(max) && result > max) {
    result = max;
  }
  return result;
}

function normalizeNumber(value, limits = {}, fallback = 0) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return clampNumber(numeric, limits);
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return NaN;
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return NaN;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getNumeric(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveContext(root) {
  if (root instanceof Document || root instanceof Element || root instanceof DocumentFragment) {
    return root;
  }
  return document;
}

function updateDisplay(output, value, definition, state) {
  if (!(output instanceof HTMLElement)) {
    return;
  }

  let displayText = '';
  if (typeof definition.formatDisplay === 'function') {
    displayText = definition.formatDisplay(value, state);
  } else if (Number.isFinite(value)) {
    displayText = String(value);
  }

  setText(output, displayText);
}

function createSliderDefinitions() {
  const targetNet = createSliderDefinition({
    range: '#quick-target-net',
    input: '#target-net',
    display: '#quick-target-net-display',
    path: ['incomeTargets', 'year'],
    defaultValue: 50000,
    limits: { min: 0 },
    getValue: state => getNumeric(state?.incomeTargets?.year),
    formatDisplay: (value, state) => formatCurrencyDisplay(value, state)
  });

  const bufferPercent = createSliderDefinition({
    range: '#quick-buffer',
    input: '#buffer',
    display: '#quick-buffer-display',
    path: ['costs', 'bufferPercent'],
    defaultValue: 15,
    limits: { min: 0 },
    getValue: state => getNumeric(state?.costs?.bufferPercent),
    formatDisplay: value => formatPercentDisplay(value)
  });

  const monthsOff = createSliderDefinition({
    range: '#quick-months-off',
    input: '#months-off',
    display: '#quick-months-off-display',
    path: ['capacity', 'monthsOff'],
    defaultValue: 2,
    limits: { min: 0, max: 12 },
    getValue: state => getNumeric(state?.capacity?.monthsOff),
    formatDisplay: value => formatMonthsDisplay(value)
  });

  return [targetNet, bufferPercent, monthsOff];
}

function createSliderDefinition(config) {
  const { limits = {}, defaultValue = 0 } = config;

  return {
    ...config,
    defaultValue,
    normalize(value) {
      return normalizeNumber(value, limits, defaultValue);
    }
  };
}

function formatCurrencyDisplay(value, state) {
  if (!Number.isFinite(value)) {
    return '';
  }
  const symbol = getCurrencySymbol(state);
  const formatted = fmt.number(value);
  return `${symbol}${formatted}`;
}

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

function getCurrencySymbol(state) {
  const symbol = state && state.config && state.config.currencySymbol;
  if (typeof symbol === 'string' && symbol.trim()) {
    return symbol.trim();
  }
  return '€';
}

function markActivePreset(container, activeButton) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.querySelectorAll('[data-preset]').forEach(button => {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const isActive = button === activeButton;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
  });
}
