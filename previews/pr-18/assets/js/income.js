import {
  TARGET_NET_BASIS_VALUES,
  TARGET_NET_DEFAULT,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR
} from './constants.js';

export function deriveTargetNetDefaults(capacityMetrics) {
  const { workingWeeks, activeMonths } = capacityMetrics;
  return {
    year: TARGET_NET_DEFAULT,
    week: workingWeeks > 0 ? TARGET_NET_DEFAULT / workingWeeks : TARGET_NET_DEFAULT,
    month: activeMonths > 0 ? TARGET_NET_DEFAULT / activeMonths : TARGET_NET_DEFAULT,
    averageWeek: TARGET_NET_DEFAULT / WEEKS_PER_YEAR,
    averageMonth: TARGET_NET_DEFAULT / MONTHS_PER_YEAR
  };
}

export function deriveIncomeTargets(state, capacityMetrics) {
  const defaults = state.config.defaults.incomeTargets || deriveTargetNetDefaults(capacityMetrics);
  const basis = TARGET_NET_BASIS_VALUES.includes(state.incomeTargets.basis)
    ? state.incomeTargets.basis
    : 'year';
  const year = Math.max(state.incomeTargets.year, 0);
  const week = Math.max(state.incomeTargets.week, 0);
  const month = Math.max(state.incomeTargets.month, 0);
  const averageWeek = Math.max(state.incomeTargets.averageWeek, 0);
  const averageMonth = Math.max(state.incomeTargets.averageMonth, 0);

  let targetNet = year;
  if (basis === 'week') {
    targetNet = capacityMetrics.workingWeeks > 0 ? week * capacityMetrics.workingWeeks : year;
  } else if (basis === 'month') {
    targetNet = capacityMetrics.activeMonths > 0 ? month * capacityMetrics.activeMonths : year;
  } else if (basis === 'avgWeek') {
    targetNet = averageWeek * WEEKS_PER_YEAR;
  } else if (basis === 'avgMonth') {
    targetNet = averageMonth * MONTHS_PER_YEAR;
  }

  targetNet = Math.max(targetNet, 0);

  const hasWorkingWeeks = capacityMetrics.workingWeeks > 0;
  const hasActiveMonths = capacityMetrics.activeMonths > 0;

  return {
    basis,
    year,
    week,
    month,
    averageWeek,
    averageMonth,
    targetNet,
    targetNetPerWeek: hasWorkingWeeks ? targetNet / capacityMetrics.workingWeeks : null,
    targetNetPerMonth: hasActiveMonths ? targetNet / capacityMetrics.activeMonths : null,
    targetNetAveragePerWeek: targetNet / WEEKS_PER_YEAR,
    targetNetAveragePerMonth: targetNet / MONTHS_PER_YEAR,
    hasWorkingWeeks,
    hasActiveMonths,
    defaults
  };
}
