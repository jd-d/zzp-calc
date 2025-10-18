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
