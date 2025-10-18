import {
  MONTHS_PER_YEAR,
  WEEKS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK
} from './constants.js';

export function deriveCapacity(capacityState) {
  const monthsOff = Math.min(Math.max(Number(capacityState.monthsOff) || 0, 0), 12);
  const weeksOffPerCycle = Math.min(Math.max(Number(capacityState.weeksOffCycle) || 0, 0), 4);
  const daysOffPerWeek = Math.min(
    Math.max(Number(capacityState.daysOffWeek) || 0, 0),
    BASE_WORK_DAYS_PER_WEEK
  );
  const activeMonthShare = Math.min(
    Math.max((MONTHS_PER_YEAR - monthsOff) / MONTHS_PER_YEAR, 0),
    1
  );
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
