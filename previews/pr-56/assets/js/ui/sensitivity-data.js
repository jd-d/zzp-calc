import { deriveCapacity } from '../capacity.js';
import { solvePortfolio } from '../services.js';

const DEFAULT_SESSION_LENGTH = 1.5;

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

function getSessionLength(state) {
  if (Number.isFinite(state?.sessionLength)) {
    return state.sessionLength;
  }
  return DEFAULT_SESSION_LENGTH;
}

function evaluateNetForState(stateSnapshot) {
  const sessionLength = getSessionLength(stateSnapshot);
  const capacity = deriveCapacity(
    stateSnapshot.capacity || {},
    stateSnapshot.modifiers || {},
    { sessionLength }
  );

  try {
    const portfolio = solvePortfolio(stateSnapshot, capacity);
    const totals = portfolio && typeof portfolio === 'object' ? portfolio.totals : null;
    const net = Number.isFinite(totals?.net) ? totals.net : null;
    const targetNet = Number.isFinite(totals?.targetNet) ? totals.targetNet : null;
    return { net, targetNet };
  } catch (error) {
    console.error('Sensitivity net evaluation failed', error);
    return { net: null, targetNet: null };
  }
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function buildSampleValues(min, max, count, includeValue) {
  const values = new Set();
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? max : lower;
  const steps = Math.max(count, 2);
  const stepSize = (upper - lower) / (steps - 1);

  for (let index = 0; index < steps; index += 1) {
    const value = lower + stepSize * index;
    values.add(round(value, 4));
  }

  if (Number.isFinite(includeValue)) {
    values.add(round(includeValue, 4));
  }

  values.add(lower);
  values.add(upper);

  return Array.from(values).sort((a, b) => a - b);
}

function interpolateBreakEven(previous, current) {
  if (!previous || !current) {
    return null;
  }

  const prevDiff = previous.diff;
  const currentDiff = current.diff;
  const total = currentDiff - prevDiff;
  if (!Number.isFinite(total) || Math.abs(total) < 1e-9) {
    return {
      axisValue: current.axisValue,
      net: current.net,
      fraction: 0
    };
  }

  const ratio = Math.abs(prevDiff) / (Math.abs(prevDiff) + Math.abs(currentDiff));
  const clampedRatio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  const axisValue = previous.axisValue + (current.axisValue - previous.axisValue) * clampedRatio;
  const net = previous.net + (current.net - previous.net) * clampedRatio;
  return {
    axisValue,
    net,
    fraction: clampedRatio
  };
}

function findBreakEven(points, targetNet) {
  if (!Array.isArray(points) || points.length === 0 || !Number.isFinite(targetNet)) {
    return null;
  }

  let previous = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isFinite(point?.net)) {
      continue;
    }

    const diff = point.net - targetNet;
    point.diff = diff;

    if (diff === 0) {
      const position = points.length > 1 ? index / (points.length - 1) : 0;
      return {
        axisValue: point.axisValue,
        net: point.net,
        index,
        position,
        fraction: 0
      };
    }

    if (previous && previous.diff < 0 && diff > 0) {
      const interpolation = interpolateBreakEven(previous, point);
      if (interpolation) {
        const baseIndex = index - 1;
        const positionBase = points.length > 1 ? baseIndex / (points.length - 1) : 0;
        const position = positionBase + interpolation.fraction / Math.max(points.length - 1, 1);
        return {
          axisValue: interpolation.axisValue,
          net: interpolation.net,
          index: baseIndex,
          position,
          fraction: interpolation.fraction
        };
      }
    }

    if (previous && previous.diff > 0 && diff < 0) {
      const interpolation = interpolateBreakEven(point, previous);
      if (interpolation) {
        const baseIndex = index;
        const positionBase = points.length > 1 ? baseIndex / (points.length - 1) : 0;
        const position = positionBase + interpolation.fraction / Math.max(points.length - 1, 1);
        return {
          axisValue: interpolation.axisValue,
          net: interpolation.net,
          index: baseIndex,
          position,
          fraction: interpolation.fraction
        };
      }
    }

    previous = point;
  }

  return null;
}

function findClosestPoint(points, targetValue) {
  if (!Array.isArray(points) || !Number.isFinite(targetValue) || points.length === 0) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  points.forEach((point, index) => {
    const distance = Math.abs(point.axisValue - targetValue);
    if (distance < bestDistance) {
      best = { ...point, index };
      bestDistance = distance;
    }
  });

  if (!best) {
    return null;
  }

  const position = points.length > 1 ? best.index / (points.length - 1) : 0;
  return { ...best, position };
}

function buildSeries(stateSnapshot, axisConfig) {
  if (!stateSnapshot || typeof stateSnapshot !== 'object' || !axisConfig) {
    return null;
  }

  const baseState = deepClone(stateSnapshot);
  if (!baseState.capacity || typeof baseState.capacity !== 'object') {
    baseState.capacity = {};
  }

  const currentValue = axisConfig.readValue(baseState) ?? axisConfig.defaultValue;
  const samples = buildSampleValues(axisConfig.min, axisConfig.max, axisConfig.sampleCount, currentValue);
  const series = [];

  let referenceTarget = null;

  for (const value of samples) {
    const testState = deepClone(baseState);
    axisConfig.writeValue(testState, value);
    const { net, targetNet } = evaluateNetForState(testState);

    if (Number.isFinite(targetNet)) {
      referenceTarget = targetNet;
    }

    series.push({
      axisValue: value,
      net,
      targetNet
    });
  }

  const points = series.filter(point => Number.isFinite(point.net));
  if (!points.length) {
    return {
      values: [],
      axisValues: [],
      targetNet: Number.isFinite(referenceTarget) ? referenceTarget : null,
      currentValue,
      currentPoint: null,
      breakEven: null
    };
  }

  const targetNet = Number.isFinite(points[0].targetNet)
    ? points[0].targetNet
    : Number.isFinite(referenceTarget)
      ? referenceTarget
      : null;

  const breakEven = findBreakEven(points, targetNet);
  const currentPoint = findClosestPoint(points, currentValue);

  return {
    values: points.map(point => point.net),
    axisValues: points.map(point => point.axisValue),
    targetNet,
    currentValue,
    currentPoint,
    breakEven,
    sampleCount: points.length
  };
}

export function buildNetVsMonthsOffSeries(stateSnapshot) {
  return buildSeries(stateSnapshot, {
    min: 0,
    max: 12,
    sampleCount: 11,
    defaultValue: 0,
    readValue: state => Number(state?.capacity?.monthsOff) || 0,
    writeValue(state, value) {
      if (!state.capacity || typeof state.capacity !== 'object') {
        state.capacity = {};
      }
      state.capacity.monthsOff = value;
    }
  });
}

export function buildNetVsUtilizationSeries(stateSnapshot) {
  return buildSeries(stateSnapshot, {
    min: 0,
    max: 100,
    sampleCount: 9,
    defaultValue: 0,
    readValue: state => Number(state?.capacity?.utilizationPercent) || 0,
    writeValue(state, value) {
      if (!state.capacity || typeof state.capacity !== 'object') {
        state.capacity = {};
      }
      state.capacity.utilizationPercent = value;
    }
  });
}

export default {
  buildNetVsMonthsOffSeries,
  buildNetVsUtilizationSeries
};
