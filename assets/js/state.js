import {
  TARGET_NET_BASIS_VALUES,
  TARGET_INCOME_MODES,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK,
  TARGET_NET_DEFAULT
} from './constants.js';
import { deriveCapacity } from './capacity.js';
import { computeCosts } from './costs.js';
import { DEFAULT_MODIFIERS, applyModifierDefaults } from './modifiers.js';
import { deriveTargetNetDefaults } from './income.js';

const TAX_MODE_VALUES = ['simple', 'dutch2025'];

const initialState = {
  incomeTargets: {
    mode: 'net',
    basis: 'year',
    year: 0,
    week: 0,
    month: 0,
    averageWeek: 0,
    averageMonth: 0
  },
  modifiers: {
    ...DEFAULT_MODIFIERS
  },
  sessionLength: 1.5,
  capacity: {
    monthsOff: 0,
    weeksOffCycle: 0,
    daysOffWeek: 0
  },
  costs: {
    taxRatePercent: 40,
    fixedCosts: 0,
    variableCostPerClass: 0,
    vatRatePercent: 21,
    bufferPercent: 15
  },
  tax: {
    mode: 'simple',
    zelfstandigenaftrek: true,
    startersaftrek: false,
    mkbVrijstelling: true,
    includeZvw: true
  },
  config: {
    currencySymbol: '€',
    defaults: {
      incomeTargets: {
        year: 0,
        week: 0,
        month: 0,
        averageWeek: 0,
        averageMonth: 0
      }
    }
  }
};

let state = deepClone(initialState);
let derivedState = buildDerivedState(state);

const subscribers = new Set();

const serviceOverrides = Object.create(null);
const taxOverrides = Object.create(null);
taxOverrides.mode = initialState.tax.mode;

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map(deepClone);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, deepClone(val)])
    );
  }
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(target, source) {
  if (!isPlainObject(source)) {
    return deepClone(source);
  }

  const base = isPlainObject(target) ? { ...target } : {};

  for (const [key, value] of Object.entries(source)) {
    const existing = base[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      base[key] = mergeDeep(existing, value);
    } else if (Array.isArray(value)) {
      base[key] = value.map(deepClone);
    } else if (isPlainObject(value)) {
      base[key] = mergeDeep({}, value);
    } else {
      base[key] = value;
    }
  }

  return base;
}

function buildDerivedState(currentState) {
  const safeState = currentState && typeof currentState === 'object'
    ? currentState
    : initialState;

  const capacity = deriveCapacity(safeState.capacity || {}, safeState.modifiers || {});
  const costs = computeCosts(safeState, capacity);

  return {
    capacity,
    costs
  };
}

function notify() {
  const currentState = state;
  const currentDerived = derivedState;
  for (const listener of subscribers) {
    listener(currentState, currentDerived);
  }
}

export function get() {
  return state;
}

export function getDerived() {
  return deepClone(derivedState);
}

export function set(nextState) {
  state = deepClone(nextState);
  derivedState = buildDerivedState(state);
  notify();
  return state;
}

export function patch(partialState) {
  state = mergeDeep(state, partialState);
  derivedState = buildDerivedState(state);
  notify();
  return state;
}

export function subscribe(listener) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function parseNumber(value, fallback = 0, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function refreshIncomeTargetDefaultsFromState() {
  const capacityMetrics = derivedState.capacity
    || deriveCapacity(state.capacity, state.modifiers);
  const defaults = deriveTargetNetDefaults(capacityMetrics);
  patch({
    config: {
      defaults: {
        incomeTargets: defaults
      }
    }
  });
  return capacityMetrics;
}

export function setTargetNetBasis(basis) {
  if (TARGET_NET_BASIS_VALUES.includes(basis)) {
    patch({
      incomeTargets: { basis }
    });
  }
}

export function setIncomeTargetMode(mode) {
  const normalized = typeof mode === 'string' && TARGET_INCOME_MODES.includes(mode)
    ? mode
    : initialState.incomeTargets.mode;
  patch({
    incomeTargets: { mode: normalized }
  });
  return normalized;
}

export function setIncomeTargetValue(key, rawValue) {
  const defaults = (state.config.defaults && state.config.defaults.incomeTargets) || {};
  const fallback = Number.isFinite(defaults[key]) ? defaults[key] : state.incomeTargets[key];
  const normalized = Math.max(parseNumber(rawValue, fallback || 0), 0);
  patch({
    incomeTargets: { [key]: normalized }
  });
}

export function setMonthsOff(rawValue) {
  const normalized = parseNumber(rawValue, state.capacity.monthsOff || 0, { min: 0, max: 12 });
  patch({
    capacity: { monthsOff: normalized }
  });
  return refreshIncomeTargetDefaultsFromState();
}

export function setWeeksOffCycle(rawValue) {
  const normalized = parseNumber(rawValue, state.capacity.weeksOffCycle || 0, { min: 0, max: 4 });
  patch({
    capacity: { weeksOffCycle: normalized }
  });
  return refreshIncomeTargetDefaultsFromState();
}

export function setDaysOffWeek(rawValue) {
  const normalized = parseNumber(rawValue, state.capacity.daysOffWeek || 0, {
    min: 0,
    max: BASE_WORK_DAYS_PER_WEEK
  });
  patch({
    capacity: { daysOffWeek: normalized }
  });
  return refreshIncomeTargetDefaultsFromState();
}

export function setSessionLength(rawValue) {
  const fallback = Number.isFinite(state.sessionLength) ? state.sessionLength : 1.5;
  const normalized = parseNumber(rawValue, fallback, { min: 0.25, max: 12 });
  patch({ sessionLength: normalized });
  return normalized;
}

export function setTaxMode(nextMode) {
  const mode = typeof nextMode === 'string' && TAX_MODE_VALUES.includes(nextMode)
    ? nextMode
    : initialState.tax.mode;
  taxOverrides.mode = mode;
  patch({
    tax: { mode }
  });
  return mode;
}

export function setTaxRatePercent(rawValue) {
  const fallback = Number.isFinite(state.costs.taxRatePercent) ? state.costs.taxRatePercent : 40;
  const normalized = Math.min(Math.max(parseNumber(rawValue, fallback, { min: 0, max: 99.9 }), 0), 99.9);
  patch({
    costs: { taxRatePercent: normalized }
  });
}

export function setVariableCostPerClass(rawValue) {
  const fallback = Number.isFinite(state.costs.variableCostPerClass)
    ? state.costs.variableCostPerClass
    : 0;
  const normalized = Math.max(parseNumber(rawValue, fallback, { min: 0 }), 0);
  patch({
    costs: { variableCostPerClass: normalized }
  });
}

export function setVatRatePercent(rawValue) {
  const fallback = Number.isFinite(state.costs.vatRatePercent) ? state.costs.vatRatePercent : 21;
  const normalized = Math.max(parseNumber(rawValue, fallback, { min: 0 }), 0);
  patch({
    costs: { vatRatePercent: normalized }
  });
}

export function setBufferPercent(rawValue) {
  const fallback = Number.isFinite(state.costs.bufferPercent) ? state.costs.bufferPercent : 15;
  const normalized = Math.max(parseNumber(rawValue, fallback, { min: 0 }), 0);
  patch({
    costs: { bufferPercent: normalized }
  });
}

export function setCurrencySymbol(rawValue) {
  const symbol = typeof rawValue === 'string' ? rawValue.trim() : '';
  patch({
    config: { currencySymbol: symbol || '€' }
  });
}

function setModifierValue(key, rawValue, { min = 0, max = 100 } = {}) {
  const defaults = applyModifierDefaults(state.modifiers || {});
  const base = Number.isFinite(state.modifiers?.[key])
    ? state.modifiers[key]
    : defaults[key];
  const normalized = parseNumber(rawValue, base, { min, max });
  patch({
    modifiers: { [key]: normalized }
  });
  return normalized;
}

export function setComfortMarginPercent(rawValue) {
  return setModifierValue('comfortMarginPercent', rawValue, { min: 0, max: 60 });
}

export function setSeasonalityPercent(rawValue) {
  return setModifierValue('seasonalityPercent', rawValue, { min: 0, max: 75 });
}

export function setTravelFrictionPercent(rawValue) {
  return setModifierValue('travelFrictionPercent', rawValue, { min: 0, max: 150 });
}

export function setHandsOnQuotaPercent(rawValue) {
  return setModifierValue('handsOnQuotaPercent', rawValue, { min: 0, max: 100 });
}

export const calcState = {
  get,
  getDerived,
  set,
  patch,
  subscribe,
  services: serviceOverrides,
  tax: taxOverrides
};

export {
  initialState,
  TARGET_NET_BASIS_VALUES,
  TARGET_INCOME_MODES,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK,
  TARGET_NET_DEFAULT,
  TAX_MODE_VALUES
};
