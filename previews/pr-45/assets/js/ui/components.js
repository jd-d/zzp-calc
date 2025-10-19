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

export function bindSliderPair({ sliderId, inputId, stateKey }) {
  const slider = typeof sliderId === 'string' ? document.getElementById(sliderId) : sliderId;
  const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;

  if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') {
    return () => {};
  }

  if (!(input instanceof HTMLInputElement)) {
    return () => {};
  }

  const path = deriveStatePath(stateKey);

  const min = toFiniteNumber(slider.min);
  const max = toFiniteNumber(slider.max);
  const step = toFiniteNumber(slider.step);
  const stepDecimals = countStepDecimals(step, slider.step);

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

  const setElementValues = value => {
    const display = formatSliderValue(value, stepDecimals);
    if (slider.value !== display) {
      slider.value = display;
    }
    if (input.value !== display) {
      input.value = display;
    }
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

  if (currentValue === null) {
    const inputSeed = normalize(input.value);
    const sliderSeed = normalize(slider.value);
    currentValue = inputSeed !== null ? inputSeed : sliderSeed;
  }

  if (currentValue !== null) {
    setElementValues(currentValue);
  }

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
    applyState(currentValue);
    announce('Scenario slider changed');
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
      }
    });
  }

  return () => {
    slider.removeEventListener('input', handleSliderInput);
    input.removeEventListener('input', handleNumberInput);
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

export function renderSparkline(el, values, { width = 96, height = 32 } = {}) {
  if (!(el instanceof HTMLElement)) {
    return;
  }

  const data = Array.isArray(values) ? values.filter(v => Number.isFinite(v)) : [];

  if (!data.length) {
    el.replaceChildren();
    el.setAttribute('aria-hidden', 'true');
    return;
  }

  el.removeAttribute('aria-hidden');

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const count = data.length;

  const points = data.map((value, index) => {
    const x = count === 1 ? width / 2 : (index / (count - 1)) * width;
    const normalized = (value - min) / range;
    const y = height - normalized * height;
    return { x, y };
  });

  const pathData = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  const baselineY = Math.max(Math.min(points[points.length - 1].y, height), 0);
  const baseline = document.createElementNS(SVG_NS, 'line');
  baseline.setAttribute('x1', '0');
  baseline.setAttribute('y1', baselineY.toFixed(2));
  baseline.setAttribute('x2', String(width));
  baseline.setAttribute('y2', baselineY.toFixed(2));
  baseline.setAttribute('stroke', 'currentColor');
  baseline.setAttribute('stroke-opacity', '0.2');
  baseline.setAttribute('stroke-width', '1');

  svg.append(path, baseline);
  el.replaceChildren(svg);
}
