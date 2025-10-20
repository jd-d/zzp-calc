import { calcState } from '../state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function resolveRoot(root) {
  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    return root;
  }

  return document;
}

function resolveElement(target, root = document) {
  if (typeof target === 'string') {
    return qs(target, root);
  }

  if (target instanceof EventTarget) {
    return target;
  }

  return null;
}

function containsTarget(container, node) {
  if (!(node instanceof Node)) {
    return false;
  }

  if (container instanceof Element || container instanceof DocumentFragment) {
    return container.contains(node);
  }

  if (container instanceof Document) {
    const rootNode = container.documentElement;
    return rootNode ? rootNode.contains(node) : false;
  }

  return container === node;
}

export function qs(selector, root = document) {
  if (typeof selector !== 'string' || !selector) {
    return null;
  }

  const context = resolveRoot(root);
  if (!context || typeof context.querySelector !== 'function') {
    return null;
  }

  return context.querySelector(selector);
}

export function qsa(selector, root = document) {
  if (typeof selector !== 'string' || !selector) {
    return [];
  }

  const context = resolveRoot(root);
  if (!context || typeof context.querySelectorAll !== 'function') {
    return [];
  }

  return Array.from(context.querySelectorAll(selector));
}

export function on(target, type, handler, options, root = document) {
  if (typeof handler !== 'function' || typeof type !== 'string' || !type) {
    return () => {};
  }

  const element = resolveElement(target, root);
  if (!element || typeof element.addEventListener !== 'function') {
    return () => {};
  }

  let delegateSelector = '';
  let listenerOptions = options;

  if (typeof options === 'object' && options !== null) {
    delegateSelector = typeof options.delegate === 'string' ? options.delegate.trim() : '';
    if (delegateSelector) {
      listenerOptions = { ...options };
      delete listenerOptions.delegate;
    }
  }

  const listener = delegateSelector
    ? event => {
        const targetElement = event.target instanceof Element
          ? event.target.closest(delegateSelector)
          : null;

        if (!targetElement || !containsTarget(element, targetElement)) {
          return;
        }

        const hadDelegate = Object.prototype.hasOwnProperty.call(event, 'delegateTarget');
        const previousDelegate = hadDelegate ? event.delegateTarget : undefined;

        event.delegateTarget = targetElement;

        try {
          handler.call(targetElement, event);
        } finally {
          if (hadDelegate) {
            event.delegateTarget = previousDelegate;
          } else {
            delete event.delegateTarget;
          }
        }
      }
    : handler;

  element.addEventListener(type, listener, listenerOptions);

  return () => {
    element.removeEventListener(type, listener, listenerOptions);
  };
}

export function setText(el, value = '') {
  if (!(el instanceof Node)) {
    return;
  }

  const nextValue = value == null ? '' : String(value);
  el.textContent = nextValue;
}

let srStatusElement = null;

export function announce(message, { politeness = 'polite' } = {}) {
  if (!srStatusElement || !srStatusElement.isConnected) {
    srStatusElement = qs('#sr-status');
  }

  if (!(srStatusElement instanceof HTMLElement)) {
    return;
  }

  const politenessLevel = politeness === 'assertive' ? 'assertive' : 'polite';
  srStatusElement.setAttribute('aria-live', politenessLevel);

  setText(srStatusElement, '');

  const nextMessage = message == null ? '' : String(message);

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      setText(srStatusElement, nextMessage);
    });
  } else {
    setText(srStatusElement, nextMessage);
  }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function countStepDecimals(stepValue, rawStep) {
  if (!Number.isFinite(stepValue) || stepValue <= 0) {
    return 0;
  }

  const source = typeof rawStep === 'string' && rawStep.trim() ? rawStep : String(stepValue);
  const parts = source.split('.');
  if (parts.length === 2) {
    return parts[1].length;
  }

  return 0;
}

function buildPatchPayload(path, value) {
  let payload = value;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    payload = { [path[index]]: payload };
  }
  return payload;
}

function deriveStatePath(stateKey) {
  if (Array.isArray(stateKey)) {
    return stateKey.filter(part => typeof part === 'string' && part);
  }

  if (typeof stateKey === 'string') {
    return stateKey
      .split('.')
      .map(part => part.trim())
      .filter(Boolean);
  }

  return [];
}

function readStateValue(snapshot, path) {
  if (!snapshot || !path.length) {
    return null;
  }

  let current = snapshot;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return null;
    }
    current = current[segment];
  }

  return toFiniteNumber(current);
}

function formatSliderValue(value, decimals) {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (decimals > 0) {
    const fixed = value.toFixed(decimals);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  return String(value);
}

export function bindSliderPair({ sliderId, inputId, stateKey, displayId, format, debounceMs = 0 }) {
  const slider = typeof sliderId === 'string' ? document.getElementById(sliderId) : sliderId;
  const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;

  if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') {
    return () => {};
  }

  if (!(input instanceof HTMLInputElement)) {
    return () => {};
  }

  const path = deriveStatePath(stateKey);

  const displayElement = typeof displayId === 'string'
    ? document.getElementById(displayId)
    : displayId instanceof HTMLElement
      ? displayId
      : null;

  const min = toFiniteNumber(slider.min);
  const max = toFiniteNumber(slider.max);
  const step = toFiniteNumber(slider.step);
  const stepDecimals = countStepDecimals(step, slider.step);

  const formatDisplay = typeof format === 'function'
    ? format
    : value => formatSliderValue(value, stepDecimals);

  const normalize = rawValue => {
    const parsed = toFiniteNumber(rawValue);
    if (parsed === null) {
      return null;
    }

    let nextValue = parsed;

    if (Number.isFinite(min)) {
      nextValue = Math.max(nextValue, min);
    }

    if (Number.isFinite(max)) {
      nextValue = Math.min(nextValue, max);
    }

    if (Number.isFinite(step) && step > 0) {
      const offset = Number.isFinite(min) ? min : 0;
      const stepCount = Math.round((nextValue - offset) / step);
      nextValue = offset + stepCount * step;
      if (stepDecimals > 0) {
        nextValue = Number(nextValue.toFixed(stepDecimals));
      }
    }

    return Number.isFinite(nextValue) ? nextValue : null;
  };

  const setDisplayValue = value => {
    if (!(displayElement instanceof HTMLElement)) {
      return;
    }

    const nextText = formatDisplay(value);
    const normalized = nextText == null ? '' : String(nextText);
    if (displayElement.textContent !== normalized) {
      displayElement.textContent = normalized;
    }
  };

  const setElementValues = value => {
    const display = formatSliderValue(value, stepDecimals);
    if (slider.value !== display) {
      slider.value = display;
    }
    if (input.value !== display) {
      input.value = display;
    }
    setDisplayValue(value);
  };

  const applyState = value => {
    if (!path.length || typeof calcState.patch !== 'function') {
      return;
    }

    const payload = buildPatchPayload(path, value);
    calcState.patch(payload);
  };

  const readCurrentState = () => {
    if (typeof calcState.get !== 'function') {
      return null;
    }
    const snapshot = calcState.get();
    const valueFromState = readStateValue(snapshot, path);
    return normalize(valueFromState);
  };

  let currentValue = readCurrentState();
  let debounceTimer = null;

  if (currentValue === null) {
    const inputSeed = normalize(input.value);
    const sliderSeed = normalize(slider.value);
    currentValue = inputSeed !== null ? inputSeed : sliderSeed;
  }

  if (currentValue !== null) {
    setElementValues(currentValue);
  }

  const clearPendingCommit = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const dispatchChange = () => {
    if (currentValue === null) {
      return;
    }
    applyState(currentValue);
    announce('Scenario slider changed');
  };

  const commit = value => {
    if (value === null) {
      return;
    }

    if (currentValue !== null && Math.abs(currentValue - value) <= 1e-9) {
      setElementValues(currentValue);
      return;
    }

    currentValue = value;
    setElementValues(currentValue);

    if (debounceMs > 0) {
      clearPendingCommit();
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        dispatchChange();
      }, debounceMs);
      return;
    }

    dispatchChange();
  };

  const handleSliderInput = () => {
    const normalized = normalize(slider.value);
    if (normalized === null) {
      return;
    }
    commit(normalized);
  };

  const handleNumberInput = () => {
    const normalized = normalize(input.value);
    if (normalized === null) {
      return;
    }
    commit(normalized);
  };

  slider.addEventListener('input', handleSliderInput);
  input.addEventListener('input', handleNumberInput);

  let unsubscribe = null;
  if (path.length && typeof calcState.subscribe === 'function') {
    unsubscribe = calcState.subscribe(nextState => {
      const fromState = normalize(readStateValue(nextState, path));
      if (fromState === null) {
        return;
      }

      if (currentValue === null || Math.abs(currentValue - fromState) > 1e-6) {
        currentValue = fromState;
        setElementValues(currentValue);
        clearPendingCommit();
      }
    });
  }

  return () => {
    slider.removeEventListener('input', handleSliderInput);
    input.removeEventListener('input', handleNumberInput);
    clearPendingCommit();
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
}

export function bindStateInput(target, options = {}) {
  const input = resolveElement(target, options.root);

  if (!(input instanceof HTMLInputElement)) {
    return () => {};
  }

  const path = deriveStatePath(options.stateKey);
  const events = Array.isArray(options.events) && options.events.length
    ? options.events
    : ['input', 'change'];
  const parseOption = typeof options.parse === 'function'
    ? options.parse
    : (rawValue, meta) => ({ value: rawValue, raw: rawValue, valid: true, meta });
  const formatOption = typeof options.format === 'function'
    ? options.format
    : value => (value == null ? '' : String(value));
  const getValueOption = typeof options.getValue === 'function'
    ? options.getValue
    : state => (path.length ? readStateValue(state, path) : undefined);
  const compareOption = typeof options.compare === 'function'
    ? options.compare
    : (a, b) => a === b;

  const commitOption = typeof options.commit === 'function'
    ? options.commit
    : (payload) => {
        if (!path.length) {
          return;
        }
        if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'value')) {
          return;
        }
        const patchPayload = buildPatchPayload(path, payload.value);
        if (typeof calcState.patch === 'function') {
          calcState.patch(patchPayload);
        }
      };

  const afterCommit = typeof options.onAfterCommit === 'function'
    ? options.onAfterCommit
    : null;

  const announceMessage = typeof options.announce === 'string' ? options.announce : '';
  const announceCommit = announceMessage
    ? () => {
        announce(announceMessage);
      }
    : null;

  const toPayload = (result, rawValue) => {
    if (result && typeof result === 'object') {
      const payload = { raw: rawValue, ...result };
      if (!Object.prototype.hasOwnProperty.call(payload, 'raw')) {
        payload.raw = rawValue;
      }
      if (!Object.prototype.hasOwnProperty.call(payload, 'value')) {
        payload.value = rawValue;
      }
      return payload;
    }
    return { value: result, raw: rawValue };
  };

  let lastValue;

  const applyFromState = (state, { silent = false } = {}) => {
    const nextValue = getValueOption(state);
    if (nextValue === undefined) {
      return;
    }

    if (!silent && lastValue !== undefined && compareOption(nextValue, lastValue)) {
      return;
    }

    lastValue = nextValue;

    if (input.type === 'checkbox' || input.type === 'radio') {
      input.checked = Boolean(nextValue);
      return;
    }

    const formatted = formatOption(nextValue, { input, state });
    const normalizedDisplay = formatted == null ? '' : String(formatted);
    if (input.value !== normalizedDisplay) {
      input.value = normalizedDisplay;
    }
  };

  const initialState = typeof calcState.get === 'function' ? calcState.get() : null;
  if (initialState) {
    applyFromState(initialState, { silent: true });
  }

  const handleEvent = event => {
    const currentState = typeof calcState.get === 'function' ? calcState.get() : null;
    const rawValue = input.type === 'checkbox' || input.type === 'radio'
      ? input.checked
      : input.value;
    const parseResult = parseOption(rawValue, { event, input, state: currentState });

    if (parseResult && typeof parseResult === 'object' && parseResult.valid === false) {
      if (parseResult.display !== undefined && input.type !== 'checkbox' && input.type !== 'radio') {
        input.value = parseResult.display == null ? '' : String(parseResult.display);
      }
      return;
    }

    const payload = toPayload(parseResult, rawValue);

    if (!payload || (payload.value === undefined && payload.raw === undefined)) {
      return;
    }

    if (payload.display !== undefined && input.type !== 'checkbox' && input.type !== 'radio') {
      input.value = payload.display == null ? '' : String(payload.display);
    }

    commitOption(payload, { event, input, state: currentState });

    if (afterCommit) {
      afterCommit(payload, { event, input, state: currentState });
    }

    if (announceCommit) {
      announceCommit();
    }
  };

  events.forEach(type => {
    input.addEventListener(type, handleEvent);
  });

  let unsubscribe = null;
  if (typeof calcState.subscribe === 'function') {
    unsubscribe = calcState.subscribe(nextState => {
      applyFromState(nextState);
    });
  }

  return () => {
    events.forEach(type => {
      input.removeEventListener(type, handleEvent);
    });
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
}

export const fmt = {
  currency(value, locale = 'nl-NL', currency = 'EUR') {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    });

    const safeValue = typeof value === 'number' ? value : Number(value) || 0;
    return formatter.format(safeValue);
  },
  number(value, locale = 'nl-NL') {
    const formatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0
    });

    const safeValue = typeof value === 'number' ? value : Number(value) || 0;
    return formatter.format(safeValue);
  },
  percent(value, locale = 'nl-NL', options = {}) {
    const settings = typeof options === 'object' && options !== null ? options : {};
    const maximumFractionDigits = Number.isInteger(settings.maximumFractionDigits)
      ? settings.maximumFractionDigits
      : 0;
    const minimumFractionDigits = Number.isInteger(settings.minimumFractionDigits)
      ? settings.minimumFractionDigits
      : 0;

    const formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits,
      minimumFractionDigits
    });

    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return formatter.format(0);
    }

    return formatter.format(numeric);
  }
};

function defaultParse(value) {
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

function defaultFormat(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return String(value);
}

function isRangeInput(input) {
  return input instanceof HTMLInputElement && input.type === 'range';
}

export function registerSliderBinding(rangeTarget, inputTarget, options = {}) {
  const settings = typeof options === 'object' && options !== null ? options : {};
  const context = resolveRoot(settings.root);

  const range = resolveElement(rangeTarget, context);
  if (!isRangeInput(range)) {
    return {
      update() {},
      destroy() {}
    };
  }

  const inputElement = resolveElement(inputTarget, context);
  const numberInput = inputElement instanceof HTMLInputElement ? inputElement : null;

  const parseOption = typeof settings.parse === 'function' ? settings.parse : defaultParse;
  const formatOption = typeof settings.format === 'function' ? settings.format : defaultFormat;
  const onChange = typeof settings.onChange === 'function' ? settings.onChange : null;
  const syncOnInit = settings.syncOnInit !== false;
  const notifyOnInit = settings.notifyOnInit === true;

  const parseValue = value => {
    const parsed = parseOption(value);
    if (typeof parsed === 'number') {
      return Number.isFinite(parsed) ? parsed : NaN;
    }
    const numeric = Number(parsed);
    return Number.isFinite(numeric) ? numeric : NaN;
  };

  const formatValue = (value, meta) => {
    const formatted = formatOption(value, meta);
    if (formatted == null) {
      return '';
    }
    return typeof formatted === 'string' ? formatted : String(formatted);
  };

  const readInitialValue = () => {
    if (Number.isFinite(range.valueAsNumber)) {
      return range.valueAsNumber;
    }

    const fromRange = parseValue(range.value);
    if (Number.isFinite(fromRange)) {
      return fromRange;
    }

    if (numberInput) {
      const fromInput = parseValue(numberInput.value);
      if (Number.isFinite(fromInput)) {
        return fromInput;
      }
    }

    const min = Number(range.min);
    if (Number.isFinite(min)) {
      return min;
    }

    return 0;
  };

  let lastValue = readInitialValue();
  let destroyed = false;

  const applyValue = (value, meta = {}) => {
    if (destroyed) {
      return lastValue;
    }

    const nextValue = Number.isFinite(value) ? value : lastValue;
    lastValue = nextValue;

    const rangeValue = String(nextValue);
    if (range.value !== rangeValue) {
      range.value = rangeValue;
    }

    if (numberInput) {
      const formatted = formatValue(nextValue, { ...meta, range, input: numberInput });
      numberInput.value = formatted;
    }

    if (!meta.silent && onChange) {
      onChange(nextValue, { ...meta, range, input: numberInput });
    }

    return nextValue;
  };

  const handleRangeInput = event => {
    const nextValue = Number.isFinite(range.valueAsNumber)
      ? range.valueAsNumber
      : parseValue(range.value);
    applyValue(nextValue, { source: 'range', event });
  };

  const handleInputChange = event => {
    if (!numberInput) {
      return;
    }

    const nextValue = parseValue(numberInput.value);
    applyValue(nextValue, { source: 'input', event });
  };

  range.addEventListener('input', handleRangeInput);
  range.addEventListener('change', handleRangeInput);

  if (numberInput) {
    numberInput.addEventListener('input', handleInputChange);
    numberInput.addEventListener('change', handleInputChange);
  }

  if (syncOnInit) {
    applyValue(lastValue, { source: 'init', event: null, silent: !notifyOnInit });
  }

  const destroy = () => {
    if (destroyed) {
      return;
    }

    destroyed = true;
    range.removeEventListener('input', handleRangeInput);
    range.removeEventListener('change', handleRangeInput);

    if (numberInput) {
      numberInput.removeEventListener('input', handleInputChange);
      numberInput.removeEventListener('change', handleInputChange);
    }
  };

  return {
    update(value, meta = {}) {
      const options = typeof meta === 'object' && meta !== null ? meta : {};
      return applyValue(value, { ...options, source: options.source || 'external' });
    },
    destroy
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function interpolatePoint(points, data, position, minValue, maxValue, width, height) {
  if (!points.length) {
    return null;
  }

  if (points.length === 1) {
    return { ...points[0], value: data[0] };
  }

  const clamped = clamp(position, 0, 1);
  const scaled = clamped * (points.length - 1);
  const lowerIndex = Math.floor(scaled);
  const upperIndex = Math.ceil(scaled);
  const lower = points[lowerIndex];
  const upper = points[upperIndex];

  if (!lower || !upper) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return { ...lower, value: data[lowerIndex] };
  }

  const ratio = scaled - lowerIndex;
  const value = data[lowerIndex] + (data[upperIndex] - data[lowerIndex]) * ratio;
  const normalized = (value - minValue) / (maxValue - minValue || 1);
  const y = height - normalized * height;
  const x = lower.x + (upper.x - lower.x) * ratio;

  return { x, y, value };
}

export function renderSparkline(el, values, options = {}) {
  if (!(el instanceof HTMLElement)) {
    return;
  }

  const data = Array.isArray(values) ? values.filter(v => Number.isFinite(v)) : [];

  if (!data.length) {
    el.replaceChildren();
    el.setAttribute('aria-hidden', 'true');
    return;
  }

  const width = Number.isFinite(options.width) && options.width > 0 ? options.width : 96;
  const height = Number.isFinite(options.height) && options.height > 0 ? options.height : 32;

  const thresholdValue = Number.isFinite(options.thresholdValue) ? options.thresholdValue : null;
  const baselineValue = Number.isFinite(options.baselineValue) ? options.baselineValue : null;

  let minValue = Math.min(...data);
  let maxValue = Math.max(...data);

  if (thresholdValue !== null) {
    minValue = Math.min(minValue, thresholdValue);
    maxValue = Math.max(maxValue, thresholdValue);
  }

  if (baselineValue !== null) {
    minValue = Math.min(minValue, baselineValue);
    maxValue = Math.max(maxValue, baselineValue);
  }

  const range = maxValue - minValue || 1;
  const count = data.length;

  const points = data.map((value, index) => {
    const x = count === 1 ? width / 2 : (index / (count - 1)) * width;
    const normalized = (value - minValue) / range;
    const y = height - normalized * height;
    return { x, y, value };
  });

  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('focusable', 'false');

  if (options.responsive) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.width = '100%';
    svg.style.height = 'auto';
  }

  if (typeof options.ariaLabel === 'string' && options.ariaLabel.trim()) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.ariaLabel.trim());
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  if (typeof options.title === 'string' && options.title.trim()) {
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = options.title.trim();
    svg.append(title);
  }

  if (thresholdValue !== null) {
    const normalized = (thresholdValue - minValue) / range;
    const y = height - normalized * height;
    const threshold = document.createElementNS(SVG_NS, 'line');
    threshold.setAttribute('x1', '0');
    threshold.setAttribute('y1', y.toFixed(2));
    threshold.setAttribute('x2', String(width));
    threshold.setAttribute('y2', y.toFixed(2));
    threshold.setAttribute('stroke', 'currentColor');
    threshold.setAttribute('stroke-opacity', '0.2');
    threshold.setAttribute('stroke-dasharray', '4 2');
    threshold.setAttribute('stroke-width', '1');
    svg.append(threshold);
  }

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', options.stroke || 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);

  const baselineEnabled = options.baseline !== false;
  const baselineSource = baselineValue !== null ? baselineValue : data[data.length - 1];

  if (baselineEnabled && Number.isFinite(baselineSource)) {
    const normalized = (baselineSource - minValue) / range;
    const y = height - normalized * height;
    const baseline = document.createElementNS(SVG_NS, 'line');
    baseline.setAttribute('x1', '0');
    baseline.setAttribute('y1', y.toFixed(2));
    baseline.setAttribute('x2', String(width));
    baseline.setAttribute('y2', y.toFixed(2));
    baseline.setAttribute('stroke', options.baselineStroke || 'currentColor');
    baseline.setAttribute('stroke-opacity', '0.2');
    baseline.setAttribute('stroke-width', '1');
    svg.append(baseline);
  }

  const markerLayer = document.createElementNS(SVG_NS, 'g');

  const markers = Array.isArray(options.markers) ? options.markers : [];
  markers.forEach(marker => {
    if (!marker) {
      return;
    }

    let resolved;
    if (Number.isFinite(marker.position)) {
      resolved = interpolatePoint(points, data, marker.position, minValue, maxValue, width, height);
    } else if (Number.isFinite(marker.index)) {
      const idx = clamp(Math.round(marker.index), 0, points.length - 1);
      const base = points[idx];
      if (base) {
        resolved = { ...base };
      }
    }

    if (!resolved) {
      return;
    }

    const x = resolved.x;
    const y = resolved.y;
    const stroke = marker.stroke || 'var(--accent)';
    const fill = marker.fill || 'var(--surface-0)';
    const strokeWidth = Number.isFinite(marker.strokeWidth) ? marker.strokeWidth : 1.5;
    const radius = Number.isFinite(marker.radius) ? marker.radius : 3;

    if (marker.line === 'vertical') {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x.toFixed(2));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', x.toFixed(2));
      line.setAttribute('y2', String(height));
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', marker.dasharray || '2 2');
      line.setAttribute('stroke-opacity', marker.opacity != null ? String(marker.opacity) : '0.45');
      markerLayer.append(line);
    }

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x.toFixed(2));
    circle.setAttribute('cy', y.toFixed(2));
    circle.setAttribute('r', radius.toFixed(2));
    circle.setAttribute('stroke', stroke);
    circle.setAttribute('stroke-width', strokeWidth.toFixed(2));
    circle.setAttribute('fill', fill);
    circle.setAttribute('aria-hidden', 'true');

    if (typeof marker.className === 'string' && marker.className.trim()) {
      circle.setAttribute('class', marker.className.trim());
    }

    if (typeof marker.tooltip === 'string' && marker.tooltip.trim()) {
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = marker.tooltip.trim();
      circle.append(title);
    }

    markerLayer.append(circle);
  });

  if (markerLayer.childNodes.length > 0) {
    svg.append(markerLayer);
  }

  el.replaceChildren(svg);
  el.removeAttribute('aria-hidden');
}
