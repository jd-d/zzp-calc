import {
  MONTHS_PER_YEAR,
  WEEKS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK
} from './constants.js';

const WEEKS_PER_CYCLE = 4;

function toNumber(value, fallback = 0) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(Math.max(normalized, min), max);
}

function clampPercent(value, fallback = 0, { min = 0, max = 100 } = {}) {
  const normalized = toNumber(value, fallback);
  return clamp(normalized, min, max);
}

function deriveUtilization(capacityState) {
  const utilizationPercent = clampPercent(capacityState.utilizationPercent, 100);
  const utilizationRate = utilizationPercent / 100;
  return { utilizationPercent, utilizationRate };
}

function normalizeTravelDays(capacityState, context) {
  const { activeMonths, workingWeeks } = context;

  const travelDaysPerMonth = clamp(
    toNumber(capacityState.travelDaysPerMonth, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK * 4
  );

  const travelDaysPerCycle = clamp(
    toNumber(capacityState.travelDaysPerCycle, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK
  );

  const annualFromMonth = Number.isFinite(activeMonths)
    ? travelDaysPerMonth * activeMonths
    : 0;

  const cyclesPerYear = Number.isFinite(workingWeeks) && workingWeeks > 0
    ? workingWeeks / WEEKS_PER_CYCLE
    : WEEKS_PER_YEAR / WEEKS_PER_CYCLE;

  const annualFromCycle = travelDaysPerCycle * cyclesPerYear;

  const providedAnnual = toNumber(capacityState.travelDaysPerYear, 0);
  const travelDaysPerYear = clamp(
    providedAnnual > 0 ? providedAnnual : Math.max(annualFromMonth, annualFromCycle),
    0,
    Infinity
  );

  const travelWeeksPerYear = travelDaysPerYear / (BASE_WORK_DAYS_PER_WEEK || 1);

  return {
    travelDaysPerMonth,
    travelDaysPerCycle,
    travelDaysPerYear,
    travelWeeksPerYear
  };
}

function deriveTravelAllowances(capacityState, context) {
  const { workingDaysPerYear, billableDaysPerYear } = context;
  const travelMetrics = normalizeTravelDays(capacityState, context);

  const cappedTravelDays = Math.min(travelMetrics.travelDaysPerYear, Math.max(workingDaysPerYear, 0));
  const travelAllowanceDays = Math.max(cappedTravelDays, 0);

  const travelAllowanceShare = workingDaysPerYear > 0
    ? travelAllowanceDays / workingDaysPerYear
    : 0;

  const travelAllowanceBillableShare = billableDaysPerYear > 0
    ? travelAllowanceDays / billableDaysPerYear
    : 0;

  return {
    ...travelMetrics,
    travelAllowanceDays,
    travelAllowanceShare,
    travelAllowanceBillableShare
  };
}

export function deriveCapacity(capacityState = {}) {
  const monthsOff = clamp(
    toNumber(capacityState.monthsOff, 0),
    0,
    MONTHS_PER_YEAR
  );

  const activeMonths = MONTHS_PER_YEAR - monthsOff;
  const activeMonthShare = MONTHS_PER_YEAR > 0 ? activeMonths / MONTHS_PER_YEAR : 0;

  const weeksOffPerCycle = clamp(
    toNumber(capacityState.weeksOffCycle, 0),
    0,
    WEEKS_PER_CYCLE
  );

  const workingWeeksPerCycle = WEEKS_PER_CYCLE - weeksOffPerCycle;
  const weeksShare = WEEKS_PER_CYCLE > 0 ? workingWeeksPerCycle / WEEKS_PER_CYCLE : 0;

  const workingWeeks = WEEKS_PER_YEAR * activeMonthShare * weeksShare;

  const daysOffPerWeek = clamp(
    toNumber(capacityState.daysOffWeek, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK
  );

  const workingDaysPerWeek = BASE_WORK_DAYS_PER_WEEK - daysOffPerWeek;
  const workingDaysPerYear = workingWeeks * workingDaysPerWeek;

  const { utilizationPercent, utilizationRate } = deriveUtilization(capacityState);

  const billableWeeks = workingWeeks * utilizationRate;
  const billableDaysPerYear = workingDaysPerYear * utilizationRate;

  const travelAllowances = deriveTravelAllowances(capacityState, {
    activeMonths,
    workingWeeks,
    workingDaysPerYear,
    billableDaysPerYear
  });

  const billableDaysAfterTravel = Math.max(
    billableDaysPerYear - travelAllowances.travelAllowanceDays,
    0
  );

  return {
    monthsOff,
    weeksOffPerCycle,
    daysOffPerWeek,
    activeMonths,
    activeMonthShare,
    workingWeeksPerCycle,
    weeksShare,
    workingWeeks,
    workingDaysPerWeek,
    workingDaysPerYear,
    utilizationPercent,
    utilizationRate,
    billableWeeks,
    billableDaysPerYear,
    billableDaysAfterTravel,
    ...travelAllowances
  };
}

export { clampPercent as normalizePercentForCapacity };
