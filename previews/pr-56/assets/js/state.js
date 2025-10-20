import {
  TARGET_NET_BASIS_VALUES,
  TARGET_INCOME_MODES,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK,
  TARGET_NET_DEFAULT
} from './constants.js';
import {
  deriveCapacity,
  calculateBillableHours,
  calculateWeeklyCapacity,
  normalizeTimeOff,
  WEEKS_PER_CYCLE
} from './capacity.js';
import { computeCosts } from './costs.js';
import { DEFAULT_MODIFIERS, applyModifierDefaults, normalizeScenarioModifiers } from './modifiers.js';
import { deriveTargetNetDefaults } from './income.js';
import { SERVICE_COPY, SERVICE_DEFAULTS } from './config/services.js';

const CANONICAL_CALENDAR = Object.freeze({
  monthsPerYear: MONTHS_PER_YEAR,
  weeksPerYear: WEEKS_PER_YEAR,
  weeksPerCycle: WEEKS_PER_CYCLE,
  baseWorkDaysPerWeek: BASE_WORK_DAYS_PER_WEEK
});

const CANONICAL_TARGETS = Object.freeze({
  modes: TARGET_INCOME_MODES.slice(),
  basisValues: TARGET_NET_BASIS_VALUES.slice(),
  defaultNet: TARGET_NET_DEFAULT
});

const CANONICAL_SERVICES = Object.freeze({
  defaults: deepClone(SERVICE_DEFAULTS),
  copy: deepClone(SERVICE_COPY)
});

const TAX_MODE_VALUES = ['simple', 'dutch2025'];

const DEFAULT_CAPACITY_STATE = {
  monthsOff: 2,
  weeksOffCycle: 1,
  daysOffWeek: 2,
  utilizationPercent: 70
};

const DEFAULT_SESSION_LENGTH = 1.5;

const DEFAULT_CAPACITY_METRICS = deriveCapacity(
  DEFAULT_CAPACITY_STATE,
  DEFAULT_MODIFIERS,
  { sessionLength: DEFAULT_SESSION_LENGTH }
);

const DEFAULT_INCOME_TARGETS = {
  mode: 'net',
  basis: 'year',
  year: TARGET_NET_DEFAULT,
  week: 2000,
  month: 5000,
  averageWeek: Number((TARGET_NET_DEFAULT / WEEKS_PER_YEAR).toFixed(2)),
  averageMonth: Number((TARGET_NET_DEFAULT / MONTHS_PER_YEAR).toFixed(2))
};

const DEFAULT_INCOME_DEFAULTS = deriveTargetNetDefaults(DEFAULT_CAPACITY_METRICS);

const DEFAULT_FIXED_COST_TOTAL = 25140;

const initialState = {
  incomeTargets: {
    ...DEFAULT_INCOME_TARGETS
  },
  modifiers: {
    ...DEFAULT_MODIFIERS
  },
  sessionLength: DEFAULT_SESSION_LENGTH,
  capacity: {
    ...DEFAULT_CAPACITY_STATE
  },
  services: {},
  costs: {
    taxRatePercent: 40,
    fixedCosts: DEFAULT_FIXED_COST_TOTAL,
    variableCostPerClass: 0,
    vatRatePercent: 21,
    bufferPercent: 15
  },
  tax: {
    mode: 'simple',
    zelfstandigenaftrek: true,
    startersaftrek: false,
    mkbVrijstelling: true,
    includeZvw: true,
    overrides: {}
  },
  config: {
    calendar: { ...CANONICAL_CALENDAR },
    targets: {
      modes: CANONICAL_TARGETS.modes.slice(),
      basisValues: CANONICAL_TARGETS.basisValues.slice(),
      defaultNet: CANONICAL_TARGETS.defaultNet
    },
    services: {
      defaults: deepClone(CANONICAL_SERVICES.defaults),
      copy: deepClone(CANONICAL_SERVICES.copy)
    },
    currencySymbol: '€',
    defaults: {
      incomeTargets: {
        ...DEFAULT_INCOME_DEFAULTS
      }
    }
  }
};

let state = deepClone(initialState);
let derivedState = buildDerivedState(state);

const subscribers = new Set();


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

function resolveSessionLength(snapshot = state) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : state;
  const value = source && Number.isFinite(source.sessionLength)
    ? source.sessionLength
    : initialState.sessionLength;
  return value;
}

function computeCapacityMetrics(snapshot = state) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : state;
  const sessionLength = resolveSessionLength(source);

  if (source === state) {
    return derivedState.capacity
      || deriveCapacity(state.capacity || {}, state.modifiers || {}, { sessionLength });
  }

  return deriveCapacity(source.capacity || {}, source.modifiers || {}, { sessionLength });
}

export function translateTimeOffToWeekly(snapshot = state) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : state;
  const timeOff = normalizeTimeOff(source.capacity || {});
  const modifiers = normalizeScenarioModifiers(source.modifiers || {});
  const weekly = calculateWeeklyCapacity(timeOff, modifiers);
  return { ...timeOff, ...weekly };
}

export function getCapacityMetrics(snapshot = state) {
  return deepClone(computeCapacityMetrics(snapshot));
}

export function getBillableHours(snapshot = state) {
  const metrics = computeCapacityMetrics(snapshot);
  if (Number.isFinite(metrics.billableHoursPerYear)) {
    return metrics.billableHoursPerYear;
  }
  const { billableHoursPerYear } = calculateBillableHours(metrics, resolveSessionLength(snapshot));
  return Number.isFinite(billableHoursPerYear) ? billableHoursPerYear : null;
}

export function getNonBillableShare(snapshot = state) {
  const metrics = computeCapacityMetrics(snapshot);
  if (Number.isFinite(metrics.nonBillableShare)) {
    return metrics.nonBillableShare;
  }
  const workingDays = Number.isFinite(metrics.workingDaysPerYear) ? metrics.workingDaysPerYear : null;
  const billableDays = Number.isFinite(metrics.billableDaysAfterTravel)
    ? metrics.billableDaysAfterTravel
    : Number.isFinite(metrics.billableDaysPerYear)
      ? metrics.billableDaysPerYear
      : null;
  if (workingDays && workingDays > 0 && Number.isFinite(billableDays)) {
    return Math.max(workingDays - billableDays, 0) / workingDays;
  }
  return null;
}

export function getTravelDaysPerYear(snapshot = state) {
  const metrics = computeCapacityMetrics(snapshot);
  if (Number.isFinite(metrics.travelAllowanceDays)) {
    return metrics.travelAllowanceDays;
  }
  if (Number.isFinite(metrics.travelDaysPerYear)) {
    return metrics.travelDaysPerYear;
  }
  return 0;
}

function cloneConfigSection(section, fallback = {}) {
  if (section && typeof section === 'object') {
    return deepClone(section);
  }
  return deepClone(fallback);
}

export function getCalendarConfig() {
  const current = state?.config?.calendar;
  return cloneConfigSection(current, initialState.config.calendar);
}

export function getTargetConfig() {
  const current = state?.config?.targets;
  return cloneConfigSection(current, initialState.config.targets);
}

export function getServiceCatalog() {
  const current = state?.config?.services || {};
  const fallback = initialState.config.services;
  return {
    defaults: cloneConfigSection(current.defaults, fallback.defaults),
    copy: cloneConfigSection(current.copy, fallback.copy)
  };
}

function buildDerivedState(currentState) {
  const safeState = currentState && typeof currentState === 'object'
    ? currentState
    : initialState;

  const sessionLength = Number.isFinite(safeState.sessionLength)
    ? safeState.sessionLength
    : initialState.sessionLength;
  const capacity = deriveCapacity(
    safeState.capacity || {},
    safeState.modifiers || {},
    { sessionLength }
  );
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
  const sessionLength = Number.isFinite(state.sessionLength)
    ? state.sessionLength
    : initialState.sessionLength;
  const capacityMetrics = derivedState.capacity
    || deriveCapacity(state.capacity, state.modifiers, { sessionLength });
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

export function setUtilizationPercent(rawValue) {
  const normalized = parseNumber(rawValue, state.capacity.utilizationPercent || 0, {
    min: 0,
    max: 100
  });
  patch({
    capacity: { utilizationPercent: normalized }
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
  patch({
    tax: { mode }
  });
  return mode;
}

export function setZelfstandigenaftrekEnabled(rawValue) {
  const enabled = Boolean(rawValue);
  patch({
    tax: { zelfstandigenaftrek: enabled }
  });
  return enabled;
}

export function setStartersaftrekEnabled(rawValue) {
  const enabled = Boolean(rawValue);
  patch({
    tax: { startersaftrek: enabled }
  });
  return enabled;
}

export function setMkbVrijstellingEnabled(rawValue) {
  const enabled = Boolean(rawValue);
  patch({
    tax: { mkbVrijstelling: enabled }
  });
  return enabled;
}

export function setIncludeZvwEnabled(rawValue) {
  const enabled = Boolean(rawValue);
  patch({
    tax: { includeZvw: enabled }
  });
  return enabled;
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
  subscribe
};

Object.defineProperties(calcState, {
  services: {
    get() {
      if (!state.services || typeof state.services !== 'object') {
        state.services = {};
      }
      return state.services;
    },
    enumerable: true
  },
  tax: {
    get() {
      if (!state.tax || typeof state.tax !== 'object') {
        state.tax = deepClone(initialState.tax);
      }
      if (!state.tax.overrides || typeof state.tax.overrides !== 'object') {
        state.tax.overrides = {};
      }
      return state.tax;
    },
    enumerable: true
  },
  capacity: {
    get() {
      if (!state.capacity || typeof state.capacity !== 'object') {
        state.capacity = deepClone(initialState.capacity);
      }
      return state.capacity;
    },
    enumerable: true
  },
  modifiers: {
    get() {
      if (!state.modifiers || typeof state.modifiers !== 'object') {
        state.modifiers = { ...DEFAULT_MODIFIERS };
      }
      return state.modifiers;
    },
    enumerable: true
  },
  incomeTargets: {
    get() {
      if (!state.incomeTargets || typeof state.incomeTargets !== 'object') {
        state.incomeTargets = deepClone(initialState.incomeTargets);
      }
      return state.incomeTargets;
    },
    enumerable: true
  },
  costs: {
    get() {
      if (!state.costs || typeof state.costs !== 'object') {
        state.costs = deepClone(initialState.costs);
      }
      return state.costs;
    },
    enumerable: true
  },
  config: {
    get() {
      if (!state.config || typeof state.config !== 'object') {
        state.config = deepClone(initialState.config);
      }
      return state.config;
    },
    enumerable: true
  },
  sessionLength: {
    get() {
      return resolveSessionLength();
    },
    enumerable: true
  },
  billableHours: {
    get() {
      const value = getBillableHours();
      return Number.isFinite(value) ? value : null;
    },
    enumerable: true
  },
  nonBillableShare: {
    get() {
      const value = getNonBillableShare();
      return Number.isFinite(value) ? value : null;
    },
    enumerable: true
  },
  travelDaysPerYear: {
    get() {
      const value = getTravelDaysPerYear();
      return Number.isFinite(value) ? value : 0;
    },
    enumerable: true
  }
});

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
