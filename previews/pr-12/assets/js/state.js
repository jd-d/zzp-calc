const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;
const BASE_WORK_DAYS_PER_WEEK = 7;
const TARGET_NET_DEFAULT = 50000;

const TARGET_NET_BASIS_VALUES = ['year', 'week', 'month', 'avgWeek', 'avgMonth'];

const initialState = {
  incomeTargets: {
    basis: 'year',
    year: 0,
    week: 0,
    month: 0,
    averageWeek: 0,
    averageMonth: 0
  },
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

function notify() {
  for (const listener of subscribers) {
    listener(state);
  }
}

export function get() {
  return state;
}

export function set(nextState) {
  state = deepClone(nextState);
  notify();
  return state;
}

export function patch(partialState) {
  state = mergeDeep(state, partialState);
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

export function computeCapacityMetrics(capacityState) {
  const monthsOff = Math.min(Math.max(Number(capacityState.monthsOff) || 0, 0), 12);
  const weeksOffPerCycle = Math.min(Math.max(Number(capacityState.weeksOffCycle) || 0, 0), 4);
  const daysOffPerWeek = Math.min(
    Math.max(Number(capacityState.daysOffWeek) || 0, 0),
    BASE_WORK_DAYS_PER_WEEK
  );
  const activeMonthShare = Math.min(Math.max((MONTHS_PER_YEAR - monthsOff) / MONTHS_PER_YEAR, 0), 1);
  const activeMonths = MONTHS_PER_YEAR * activeMonthShare;
  const weeksShare = Math.min(Math.max((4 - weeksOffPerCycle) / 4, 0), 1);
  const workingWeeks = WEEKS_PER_YEAR * activeMonthShare * weeksShare;
  const workingDaysPerWeek = Math.max(
    0,
    Math.min(BASE_WORK_DAYS_PER_WEEK, BASE_WORK_DAYS_PER_WEEK - daysOffPerWeek)
  );
  const workingDaysPerYear = workingWeeks * workingDaysPerWeek;

  return {
    monthsOff,
    weeksOffPerCycle,
    daysOffPerWeek,
    activeMonthShare,
    activeMonths,
    weeksShare,
    workingWeeks,
    workingDaysPerWeek,
    workingDaysPerYear
  };
}

export function computeTargetNetDefaults(capacityMetrics) {
  const { workingWeeks, activeMonths } = capacityMetrics;
  return {
    year: TARGET_NET_DEFAULT,
    week: workingWeeks > 0 ? TARGET_NET_DEFAULT / workingWeeks : TARGET_NET_DEFAULT,
    month: activeMonths > 0 ? TARGET_NET_DEFAULT / activeMonths : TARGET_NET_DEFAULT,
    averageWeek: TARGET_NET_DEFAULT / WEEKS_PER_YEAR,
    averageMonth: TARGET_NET_DEFAULT / MONTHS_PER_YEAR
  };
}

function refreshIncomeTargetDefaultsFromState() {
  const capacityMetrics = computeCapacityMetrics(state.capacity);
  const defaults = computeTargetNetDefaults(capacityMetrics);
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

export {
  initialState,
  TARGET_NET_BASIS_VALUES,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK,
  TARGET_NET_DEFAULT
};
