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
