import {
  MONTHS_PER_YEAR,
  WEEKS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK
} from './constants.js';
import { normalizeScenarioModifiers } from './modifiers.js';

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

function deriveUtilization(capacityState, modifiers) {
  const baseUtilizationPercent = clampPercent(capacityState.utilizationPercent, 100);
  const seasonalityPenalty = Math.max(1 - (modifiers?.seasonality || 0), 0.1);
  const utilizationRate = Math.min(Math.max((baseUtilizationPercent / 100) * seasonalityPenalty, 0), 1);
  const utilizationPercent = utilizationRate * 100;
  return { utilizationPercent, utilizationRate, seasonalityPenalty };
}

function normalizeTravelDays(capacityState, context, modifiers) {
  const { activeMonths, workingWeeks } = context;

  const baseTravelDaysPerMonth = clamp(
    toNumber(capacityState.travelDaysPerMonth, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK * 4
  );

  const baseTravelDaysPerCycle = clamp(
    toNumber(capacityState.travelDaysPerCycle, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK
  );

  const annualFromMonth = Number.isFinite(activeMonths)
    ? baseTravelDaysPerMonth * activeMonths
    : 0;

  const cyclesPerYear = Number.isFinite(workingWeeks) && workingWeeks > 0
    ? workingWeeks / WEEKS_PER_CYCLE
    : WEEKS_PER_YEAR / WEEKS_PER_CYCLE;

  const annualFromCycle = baseTravelDaysPerCycle * cyclesPerYear;

  const providedAnnual = toNumber(capacityState.travelDaysPerYear, 0);
  const baseTravelDaysPerYear = clamp(
    providedAnnual > 0 ? providedAnnual : Math.max(annualFromMonth, annualFromCycle),
    0,
    Infinity
  );

  const frictionMultiplier = 1 + Math.max(modifiers?.travelFriction || 0, 0);
  const travelDaysPerYear = baseTravelDaysPerYear * frictionMultiplier;
  const travelDaysPerMonth = baseTravelDaysPerMonth * frictionMultiplier;
  const travelDaysPerCycle = baseTravelDaysPerCycle * frictionMultiplier;
  const travelWeeksPerYear = travelDaysPerYear / (BASE_WORK_DAYS_PER_WEEK || 1);

  return {
    travelDaysPerMonth,
    travelDaysPerCycle,
    travelDaysPerYear,
    travelWeeksPerYear,
    frictionMultiplier
  };
}

function deriveTravelAllowances(capacityState, context, modifiers) {
  const { workingDaysPerYear, billableDaysPerYear } = context;
  const travelMetrics = normalizeTravelDays(capacityState, context, modifiers);

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

export function deriveCapacity(capacityState = {}, modifiersState = {}) {
  const modifiers = normalizeScenarioModifiers(modifiersState);
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

  const baseWorkingWeeks = WEEKS_PER_YEAR * activeMonthShare * weeksShare;
  const workingWeeks = baseWorkingWeeks * Math.max(1 - modifiers.seasonality, 0.1);

  const daysOffPerWeek = clamp(
    toNumber(capacityState.daysOffWeek, 0),
    0,
    BASE_WORK_DAYS_PER_WEEK
  );

  const workingDaysPerWeek = BASE_WORK_DAYS_PER_WEEK - daysOffPerWeek;
  const workingDaysPerYear = workingWeeks * workingDaysPerWeek;

  const { utilizationPercent, utilizationRate, seasonalityPenalty } = deriveUtilization(capacityState, modifiers);

  const billableWeeks = workingWeeks * utilizationRate;
  const billableDaysPerYear = workingDaysPerYear * utilizationRate;

  const travelAllowances = deriveTravelAllowances(capacityState, {
    activeMonths,
    workingWeeks,
    workingDaysPerYear,
    billableDaysPerYear
  }, modifiers);

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
    ...travelAllowances,
    seasonalityPercent: modifiers.seasonalityPercent,
    seasonalityPenalty,
    travelFrictionPercent: modifiers.travelFrictionPercent,
    travelFrictionMultiplier: travelAllowances.frictionMultiplier
  };
}

export { clampPercent as normalizePercentForCapacity };
