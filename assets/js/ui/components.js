import { calcState } from '../state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function resolveRoot(root) {
  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    return root;
  }

  return document;
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

  let element = null;
  if (typeof target === 'string') {
    element = qs(target, root);
  } else if (target instanceof EventTarget) {
    element = target;
  }

  if (!element || typeof element.addEventListener !== 'function') {
    return () => {};
  }

  element.addEventListener(type, handler, options);

  return () => {
    element.removeEventListener(type, handler, options);
  };
}

export function setText(el, value = '') {
  if (!(el instanceof Node)) {
    return;
  }

  const nextValue = value == null ? '' : String(value);
  el.textContent = nextValue;
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

let liveRegion = null;
let pendingAnnouncement = null;

export function announce(message) {
  if (typeof message !== 'string' || !message) {
    return;
  }

  if (!liveRegion || !(liveRegion instanceof HTMLElement)) {
    const region = document.getElementById('sr-status');
    liveRegion = region instanceof HTMLElement ? region : null;
  }

  if (!liveRegion) {
    return;
  }

  liveRegion.textContent = '';

  if (typeof cancelAnimationFrame === 'function' && pendingAnnouncement != null) {
    cancelAnimationFrame(pendingAnnouncement);
    pendingAnnouncement = null;
  }

  const commit = () => {
    liveRegion.textContent = message;
    pendingAnnouncement = null;
  };

  if (typeof requestAnimationFrame === 'function') {
    pendingAnnouncement = requestAnimationFrame(commit);
  } else {
    commit();
  }
}

function parseSliderValue(rawValue) {
  if (rawValue == null) {
    return null;
  }

  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  const normalized = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue);
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectControl(id) {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

export function bindSliderPair({ sliderId, inputId, stateKey }) {
  const slider = selectControl(sliderId);
  const input = selectControl(inputId);

  if (!slider && !input) {
    return () => {};
  }

  const setControlsValue = value => {
    const valueString = value == null ? '' : String(value);

    if (slider && slider.value !== valueString) {
      slider.value = valueString;
    }

    if (input && input.value !== valueString) {
      input.value = valueString;
    }
  };

  const readStateValue = () => {
    if (!stateKey || !calcState || typeof calcState.get !== 'function') {
      return null;
    }

    const snapshot = calcState.get();
    const capacity = snapshot && snapshot.capacity;
    const value = capacity ? capacity[stateKey] : null;

    return Number.isFinite(value) ? value : null;
  };

  const initialValue =
    parseSliderValue(input && input.value) ??
    parseSliderValue(slider && slider.value) ??
    readStateValue();

  if (initialValue != null) {
    setControlsValue(initialValue);
  }

  let lastCommitted = initialValue != null ? initialValue : null;

  const commitValue = rawValue => {
    const nextValue = parseSliderValue(rawValue);
    if (nextValue == null) {
      return;
    }

    setControlsValue(nextValue);

    if (lastCommitted === nextValue) {
      return;
    }

    if (stateKey && calcState && typeof calcState.patch === 'function') {
      calcState.patch({
        capacity: { [stateKey]: nextValue }
      });
    }

    lastCommitted = nextValue;
    announce('Scenario slider changed');
  };

  const sliderHandler = slider
    ? event => {
        const value = event && event.target ? event.target.value : slider.value;
        commitValue(value);
      }
    : null;

  const inputHandler = input
    ? event => {
        const value = event && event.target ? event.target.value : input.value;
        commitValue(value);
      }
    : null;

  if (slider && sliderHandler) {
    slider.addEventListener('input', sliderHandler);
  }

  if (input && inputHandler) {
    input.addEventListener('input', inputHandler);
  }

  const unsubscribe =
    stateKey && calcState && typeof calcState.subscribe === 'function'
      ? calcState.subscribe(nextState => {
          if (!nextState || !nextState.capacity) {
            return;
          }

          const value = nextState.capacity[stateKey];
          if (!Number.isFinite(value) || value === lastCommitted) {
            return;
          }

          lastCommitted = value;
          setControlsValue(value);
        })
      : null;

  return () => {
    if (slider && sliderHandler) {
      slider.removeEventListener('input', sliderHandler);
    }

    if (input && inputHandler) {
      input.removeEventListener('input', inputHandler);
    }

    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
}
