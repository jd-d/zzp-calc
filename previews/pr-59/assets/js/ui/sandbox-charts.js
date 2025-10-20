import { qs, setText, renderSparkline } from './components.js';
import { buildNetVsMonthsOffSeries, buildNetVsUtilizationSeries } from './sensitivity-data.js';

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const monthFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatCurrency(symbol, value) {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  const formatted = numberFormatter.format(Math.abs(rounded));
  return rounded < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

function formatMonths(value) {
  if (!Number.isFinite(value)) {
    return '0 months';
  }
  const formatted = monthFormatter.format(value);
  const singular = Math.abs(value - 1) < 0.01;
  return `${formatted} ${singular ? 'month' : 'months'}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${percentFormatter.format(value)}%`;
}

function getCurrencySymbol(state) {
  const raw = state?.config?.currencySymbol;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '€';
}

function summarize(series, formatter, symbol) {
  if (!series || !Array.isArray(series.values) || series.values.length === 0) {
    return {
      text: 'Not enough data to plot sensitivity yet.',
      aria: 'Net sensitivity unavailable. Adjust sandbox inputs to generate projections.'
    };
  }

  const breakEven = series.breakEven;
  const current = series.currentPoint;
  const target = Number.isFinite(series.targetNet) ? series.targetNet : null;

  if (breakEven && Number.isFinite(breakEven.net)) {
    const axisLabel = formatter(breakEven.axisValue);
    const netLabel = formatCurrency(symbol, breakEven.net);
    return {
      text: `Break-even near ${axisLabel} (${netLabel}).`,
      aria: `Break-even occurs near ${axisLabel} with projected net ${netLabel}.`
    };
  }

  if (target !== null) {
    const maxNet = Math.max(...series.values);
    const minNet = Math.min(...series.values);
    const allAbove = minNet >= target;
    const allBelow = maxNet < target;

    if (allAbove) {
      return {
        text: `Net stays above target across sampled values (min ${formatCurrency(symbol, minNet)}).`,
        aria: `Net remains above target across sampled values. Minimum projected net ${formatCurrency(symbol, minNet)}.`
      };
    }

    if (allBelow) {
      return {
        text: `Net stays below target across sampled values (max ${formatCurrency(symbol, maxNet)}).`,
        aria: `Net remains below target across sampled values. Maximum projected net ${formatCurrency(symbol, maxNet)}.`
      };
    }
  }

  if (current && Number.isFinite(current.net)) {
    const axisLabel = formatter(current.axisValue);
    return {
      text: `Current plan at ${axisLabel} projects ${formatCurrency(symbol, current.net)} net.`,
      aria: `Current plan at ${axisLabel} projects ${formatCurrency(symbol, current.net)} annual net.`
    };
  }

  return {
    text: 'Sensitivity curve available.',
    aria: 'Sensitivity curve available.'
  };
}

function buildMarker(point, role, formatter, symbol) {
  if (!point || !Number.isFinite(point.position) || !Number.isFinite(point.net)) {
    return null;
  }

  const tooltip = `${role === 'break-even' ? 'Break-even' : 'Current plan'} · ${formatter(point.axisValue)} → ${formatCurrency(symbol, point.net)}`;
  return {
    position: Math.min(Math.max(point.position, 0), 1),
    tooltip,
    className: role === 'break-even' ? 'spark-marker--break' : 'spark-marker--current',
    line: role === 'break-even' ? 'vertical' : null,
    radius: role === 'break-even' ? 3.5 : 3,
    stroke: role === 'break-even' ? 'var(--accent)' : 'var(--text-strong)',
    strokeWidth: role === 'break-even' ? 1.5 : 1.25,
    fill: role === 'break-even' ? 'var(--surface-0)' : 'var(--surface-0)'
  };
}

function renderSensitivityChart(elementRefs, stateSnapshot, computeSeries, formatter) {
  const { spark, summary } = elementRefs;
  if (!spark || !summary) {
    return;
  }

  const series = computeSeries(stateSnapshot);
  const symbol = getCurrencySymbol(stateSnapshot);
  const summaryCopy = summarize(series, formatter, symbol);
  setText(summary, summaryCopy.text);

  if (!series || !Array.isArray(series.values) || series.values.length === 0) {
    spark.replaceChildren();
    spark.setAttribute('aria-hidden', 'true');
    return;
  }

  const markers = [];
  const breakMarker = buildMarker(series.breakEven, 'break-even', formatter, symbol);
  if (breakMarker) {
    markers.push(breakMarker);
  }
  const currentMarker = buildMarker(series.currentPoint, 'current', formatter, symbol);
  if (currentMarker) {
    markers.push(currentMarker);
  }

  const targetLabel = Number.isFinite(series.targetNet)
    ? ` Target net ${formatCurrency(symbol, series.targetNet)}.`
    : '';
  const ariaLabel = `${summaryCopy.aria}${targetLabel}`.trim();
  const title = `${summaryCopy.text}${targetLabel}`.trim();

  renderSparkline(spark, series.values, {
    width: 160,
    height: 56,
    thresholdValue: Number.isFinite(series.targetNet) ? series.targetNet : null,
    baseline: false,
    markers,
    ariaLabel,
    title,
    responsive: true
  });
}

export function mountSandboxCharts(calcState, root = document) {
  const context = root instanceof Element || root instanceof Document ? root : document;
  const section = qs('#sandbox-sensitivity', context);
  if (!(section instanceof HTMLElement)) {
    return () => {};
  }

  const monthsRefs = {
    spark: qs('#net-months-chart', section),
    summary: qs('#net-months-summary', section)
  };

  const utilizationRefs = {
    spark: qs('#net-utilization-chart', section),
    summary: qs('#net-utilization-summary', section)
  };

  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const getState = typeof store.get === 'function' ? store.get.bind(store) : null;
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe.bind(store) : null;

  const run = (stateSnapshot) => {
    const state = stateSnapshot || (getState ? getState() : null);
    if (!state) {
      return;
    }
    renderSensitivityChart(monthsRefs, state, buildNetVsMonthsOffSeries, formatMonths);
    renderSensitivityChart(utilizationRefs, state, buildNetVsUtilizationSeries, formatPercent);
  };

  run(getState ? getState() : null);

  if (subscribe) {
    const unsubscribe = subscribe((nextState) => {
      run(nextState);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }

  return () => {};
}

export default mountSandboxCharts;
