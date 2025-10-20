import { announce, fmt, on, qs, registerSliderBinding, setText } from './components.js';
import { translate } from './i18n.js';
import { translateTimeOffToWeekly } from '../state.js';
import { BASE_WORK_DAYS_PER_WEEK } from '../constants.js';

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
  currency: 'currency',
  weeklyhours: 'weekly',
  hoursperweek: 'weekly',
  hours: 'weekly',
  travelintensity: 'travel',
  travelmode: 'travel'
};

const PRESET_TOKEN_HANDLERS = {
  net: value => createNumericPatch(['incomeTargets', 'year'], value, { min: 0 }),
  tax: value => createNumericPatch(['costs', 'taxRatePercent'], value, { min: 0 }),
  buffer: value => createNumericPatch(['costs', 'bufferPercent'], value, { min: 0 }),
  timeoff: value => createNumericPatch(['capacity', 'monthsOff'], value, { min: 0, max: 12 }),
  weeks: value => createNumericPatch(['capacity', 'weeksOffCycle'], value, { min: 0 }),
  days: value => createNumericPatch(['capacity', 'daysOffWeek'], value, { min: 0 }),
  vat: value => createNumericPatch(['costs', 'vatRatePercent'], value, { min: 0 }),
  weekly: (value, context) => createWeeklyHoursPatch(value, context),
  travel: value => createTravelPresetPatch(value),
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
  },
  plan: (value, context) => createPlanPresetPatch(value, context)
};

const TRAVEL_INTENSITY_VALUES = Object.freeze({
  low: 0,
  base: 20,
  medium: 20,
  high: 45
});

const PLAN_PRESET_DEFINITIONS = Object.freeze({
  retainer: {
    id: 'retainer',
    services: {
      representation: 0.32,
      ops: 0.22,
      qc: 0.16,
      training: 0.18,
      intel: 0.12
    },
    constraints: {
      handsOnShareTarget: 0.38,
      handsOnShareTolerance: 0.12,
      comfortBuffer: 0.27
    }
  },
  ops: {
    id: 'ops',
    services: {
      representation: 0.26,
      ops: 0.36,
      qc: 0.16,
      training: 0.12,
      intel: 0.1
    },
    constraints: {
      handsOnShareTarget: 0.55,
      handsOnShareTolerance: 0.1,
      comfortBuffer: 0.24,
      maxTravelDays: 68
    }
  },
  qc: {
    id: 'qc',
    services: {
      representation: 0.24,
      ops: 0.22,
      qc: 0.32,
      training: 0.12,
      intel: 0.1
    },
    constraints: {
      handsOnShareTarget: 0.48,
      handsOnShareTolerance: 0.1,
      comfortBuffer: 0.26,
      maxTravelDays: 52
    }
  }
});

const NUMERIC_TOLERANCE = 0.01;

export function mountScenarioToolbar(calcState, root = document) {
  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const patch = typeof store.patch === 'function' ? store.patch : null;
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe : null;
  const getState = typeof store.get === 'function' ? store.get : null;
  const getDerived = typeof store.getDerived === 'function' ? store.getDerived : null;

  let latestState = typeof getState === 'function' ? getState() : null;
  let latestDerived = typeof getDerived === 'function' ? getDerived() : null;
  const context = resolveContext(root);

  const sliderBindings = patch
    ? setupQuickSliders(context, patch, () => latestState)
    : [];
  const cleanups = [];

  const presetGroups = patch
    ? setupPresetGroups(context, patch, () => latestState, () => latestDerived)
    : [];

  if (presetGroups.length) {
    presetGroups.forEach(group => {
      if (group && typeof group.sync === 'function') {
        group.sync(latestState, latestDerived);
      }
      if (group && typeof group.cleanup === 'function') {
        cleanups.push(group.cleanup);
      }
    });
  }

  if (sliderBindings.length) {
    syncSliderBindings(sliderBindings, latestState);
  }

  if (typeof subscribe === 'function') {
    const unsubscribe = subscribe((nextState, nextDerived) => {
      latestState = nextState;
      latestDerived = nextDerived;
      if (sliderBindings.length) {
        syncSliderBindings(sliderBindings, latestState);
      }
      if (presetGroups.length) {
        presetGroups.forEach(group => {
          if (group && typeof group.sync === 'function') {
            group.sync(latestState, latestDerived);
          }
        });
      }
    });
    if (typeof unsubscribe === 'function') {
      cleanups.push(unsubscribe);
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

function setupPresetGroups(context, patch, readState, readDerived) {
  if (!(context instanceof Document || context instanceof Element || context instanceof DocumentFragment)) {
    return [];
  }

  const containers = Array.from(context.querySelectorAll('[data-preset-group]'));
  return containers
    .map(container => createPresetGroupController(container, patch, readState, readDerived))
    .filter(controller => controller);
}

function createPresetGroupController(container, patch, readState, readDerived) {
  if (!(container instanceof HTMLElement) || typeof patch !== 'function') {
    return null;
  }

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

    const state = typeof readState === 'function' ? readState() : null;
    const derived = typeof readDerived === 'function' ? readDerived() : null;
    const presetPatch = buildPresetPatch(presetElement, state, derived);

    if (!presetPatch) {
      return;
    }

    patch(presetPatch);
    markActivePreset(container, presetElement);
    announce(translate('quickControls.status.updated'));
  };

  const detach = on(container, 'click', handlePresetClick, { delegate: '[data-preset]' });

  const syncFromState = (stateSnapshot, derivedSnapshot) => {
    const state = stateSnapshot || (typeof readState === 'function' ? readState() : null);
    const derived = derivedSnapshot || (typeof readDerived === 'function' ? readDerived() : null);
    const matchingPreset = findMatchingPreset(container, state, derived);
    if (matchingPreset) {
      markActivePreset(container, matchingPreset);
    } else {
      markActivePreset(container, null);
    }
  };

  syncFromState();

  return {
    cleanup() {
      if (typeof detach === 'function') {
        detach();
      }
    },
    sync: syncFromState
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

function buildPresetPatch(element, state, derived) {
  const attr = element && typeof element.getAttribute === 'function'
    ? element.getAttribute('data-preset')
    : '';

  if (!attr) {
    return null;
  }

  const context = { state, derived };

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
      return handler(value, context);
    })
    .filter(partial => isPlainObject(partial));

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

function createPlanPresetPatch(rawValue) {
  const key = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  if (!key) {
    return null;
  }

  const definition = PLAN_PRESET_DEFINITIONS[key];
  if (!definition) {
    return null;
  }

  const servicesPatch = {};
  if (definition.services && typeof definition.services === 'object') {
    Object.entries(definition.services).forEach(([serviceId, share]) => {
      if (!Number.isFinite(share)) {
        return;
      }
      servicesPatch[serviceId] = {
        shareOfCapacity: share,
        targetNetShare: share,
        unitsPerMonth: null,
        pricePerUnit: null,
        pricePerUnitOverride: null,
        lockedRate: false,
        lockedVolume: false
      };
    });
  }

  const constraintsPatch = {
    maxTravelDays: null,
    handsOnShareTarget: null,
    handsOnShareTolerance: null,
    comfortBuffer: null
  };
  const constraints = definition.constraints && typeof definition.constraints === 'object'
    ? definition.constraints
    : {};

  if (Number.isFinite(constraints.handsOnShareTarget)) {
    constraintsPatch.handsOnShareTarget = Math.min(Math.max(constraints.handsOnShareTarget, 0), 1);
  }
  if (Number.isFinite(constraints.handsOnShareTolerance)) {
    constraintsPatch.handsOnShareTolerance = Math.min(Math.max(constraints.handsOnShareTolerance, 0), 0.5);
  }
  if (Number.isFinite(constraints.comfortBuffer)) {
    constraintsPatch.comfortBuffer = Math.min(Math.max(constraints.comfortBuffer, 0), 0.95);
  }
  if (Number.isFinite(constraints.maxTravelDays)) {
    constraintsPatch.maxTravelDays = Math.max(constraints.maxTravelDays, 0);
  }

  const patch = {
    portfolio: {
      planPreset: definition.id
    },
    services: servicesPatch
  };

  patch.portfolioConstraints = constraintsPatch;

  return patch;
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

function createWeeklyHoursPatch(rawValue, context = {}) {
  const hours = toNumber(rawValue);
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }

  const derivedCapacity = context && context.derived && context.derived.capacity
    ? context.derived.capacity
    : null;

  let workingDaysPerWeek = derivedCapacity && Number.isFinite(derivedCapacity.workingDaysPerWeek)
    ? derivedCapacity.workingDaysPerWeek
    : NaN;

  if (!Number.isFinite(workingDaysPerWeek) || workingDaysPerWeek <= 0) {
    const metrics = translateTimeOffToWeekly(context && context.state ? context.state : undefined);
    if (metrics && Number.isFinite(metrics.workingDaysPerWeek)) {
      workingDaysPerWeek = metrics.workingDaysPerWeek;
    }
  }

  if (!Number.isFinite(workingDaysPerWeek) || workingDaysPerWeek <= 0) {
    workingDaysPerWeek = BASE_WORK_DAYS_PER_WEEK;
  }

  const safeWorkingDays = Math.max(workingDaysPerWeek, 1);
  const sessionLength = hours / safeWorkingDays;

  if (!Number.isFinite(sessionLength) || sessionLength <= 0) {
    return null;
  }

  const normalized = clampNumber(sessionLength, { min: 0.25, max: 12 });
  const rounded = Math.round(normalized * 100) / 100;
  return createNestedPatch(['sessionLength'], rounded);
}

function createTravelPresetPatch(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const key = String(rawValue).toLowerCase();
  let percent = Object.prototype.hasOwnProperty.call(TRAVEL_INTENSITY_VALUES, key)
    ? TRAVEL_INTENSITY_VALUES[key]
    : undefined;

  if (percent === undefined) {
    const numeric = toNumber(rawValue);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    percent = clampNumber(numeric, { min: 0, max: 150 });
  }

  return createNestedPatch(['modifiers', 'travelFrictionPercent'], percent);
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

function findMatchingPreset(container, state, derived) {
  if (!(container instanceof HTMLElement) || !isPlainObject(state)) {
    return null;
  }

  const buttons = Array.from(container.querySelectorAll('[data-preset]'));
  if (!buttons.length) {
    return null;
  }

  for (const button of buttons) {
    const targets = resolvePresetTargets(button, state, derived);
    if (!targets.length) {
      continue;
    }

    const matches = targets.every(({ path, value }) => stateValueMatches(state, path, value));
    if (matches) {
      return button;
    }
  }

  return null;
}

function resolvePresetTargets(button, state, derived) {
  const patch = buildPresetPatch(button, state, derived);
  if (!patch) {
    return [];
  }

  return flattenPresetPatch(patch);
}

function flattenPresetPatch(patch, prefix = []) {
  if (!isPlainObject(patch)) {
    return [{ path: prefix, value: patch }];
  }

  const entries = [];
  Object.entries(patch).forEach(([key, value]) => {
    const nextPath = prefix.concat(key);
    if (isPlainObject(value)) {
      entries.push(...flattenPresetPatch(value, nextPath));
    } else {
      entries.push({ path: nextPath, value });
    }
  });
  return entries;
}

function getStateValueAtPath(source, path) {
  if (!Array.isArray(path) || !path.length) {
    return undefined;
  }

  return path.reduce((acc, segment) => {
    if (!acc || typeof acc !== 'object') {
      return undefined;
    }
    return acc[segment];
  }, source);
}

function stateValueMatches(state, path, expected) {
  if (!Array.isArray(path) || !path.length) {
    return false;
  }

  const actual = getStateValueAtPath(state, path);

  if (typeof expected === 'number') {
    const numericActual = Number(actual);
    if (!Number.isFinite(numericActual)) {
      return false;
    }
    return Math.abs(numericActual - expected) <= NUMERIC_TOLERANCE;
  }

  if (typeof expected === 'string') {
    if (actual === null || actual === undefined) {
      return false;
    }
    return String(actual).toLowerCase() === expected.toLowerCase();
  }

  if (typeof expected === 'boolean') {
    return Boolean(actual) === expected;
  }

  return actual === expected;
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
