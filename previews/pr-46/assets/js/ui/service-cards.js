import { qs, qsa, on, setText, fmt, renderSparkline } from './components.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_ICON_KEY = 'briefcase';

const TABLER_ICON_LIBRARY = {
  briefcase: [
    { el: 'path', attrs: { d: 'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v11a2 2 0 0 1 -2 2H6a2 2 0 0 1 -2 -2z' } },
    { el: 'path', attrs: { d: 'M9 7V5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2' } },
    { el: 'path', attrs: { d: 'M3 13h18' } }
  ],
  settings: [
    { el: 'path', attrs: { d: 'M10.5 6.5l1.5 -1.5l1.5 1.5a2 2 0 0 0 2.828 0l1.172 -1.172l1.5 1.5l-1.172 1.172a2 2 0 0 0 0 2.828l1.5 1.5l-1.5 1.5l-1.172 -1.172a2 2 0 0 0 -2.828 0l-1.5 1.5l-1.5 -1.5a2 2 0 0 0 -2.828 0l-1.172 1.172l-1.5 -1.5l1.172 -1.172a2 2 0 0 0 0 -2.828l-1.172 -1.172l1.5 -1.5l1.172 1.172a2 2 0 0 0 2.828 0z' } },
    { el: 'circle', attrs: { cx: '12', cy: '12', r: '2' } }
  ],
  shieldCheck: [
    { el: 'path', attrs: { d: 'M12 3l7 4v5c0 5 -3.5 9 -7 9s-7 -4 -7 -9V7z' } },
    { el: 'path', attrs: { d: 'M9 12l2 2l4 -4' } }
  ],
  presentation: [
    { el: 'rect', attrs: { x: '4', y: '4', width: '16', height: '12', rx: '2' } },
    { el: 'path', attrs: { d: 'M4 14l6 -3l4 2l6 -5' } },
    { el: 'path', attrs: { d: 'M12 20v-4' } }
  ],
  bulb: [
    { el: 'path', attrs: { d: 'M9 18h6' } },
    { el: 'path', attrs: { d: 'M10 22h4' } },
    { el: 'path', attrs: { d: 'M12 2a7 7 0 0 1 7 7c0 2.49 -1.182 4.32 -2.5 5.716A5.15 5.15 0 0 0 15 18H9a5.19 5.19 0 0 0 -1.5 -3.284C6.182 13.32 5 11.49 5 9a7 7 0 0 1 7 -7z' } }
  ]
};

function resolveRoot(root) {
  if (root instanceof Document || root instanceof Element || root instanceof DocumentFragment) {
    return root;
  }
  return document;
}

function resolveIconDefinition(service) {
  if (!service) {
    return TABLER_ICON_LIBRARY[DEFAULT_ICON_KEY] || null;
  }

  const icon = service.icon;
  if (Array.isArray(icon)) {
    return icon;
  }

  if (icon && typeof icon === 'object' && Array.isArray(icon.shapes)) {
    return icon.shapes;
  }

  if (typeof icon === 'string' && TABLER_ICON_LIBRARY[icon]) {
    return TABLER_ICON_LIBRARY[icon];
  }

  return TABLER_ICON_LIBRARY[DEFAULT_ICON_KEY] || null;
}

function createTablerIcon(service) {
  const definition = resolveIconDefinition(service);
  if (!Array.isArray(definition) || definition.length === 0 || typeof document === 'undefined') {
    return null;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const shape of definition) {
    if (!shape || typeof shape !== 'object') {
      continue;
    }
    const elName = shape.el || 'path';
    const attrs = shape.attrs || {};
    const element = document.createElementNS(SVG_NS, elName);
    for (const [attr, value] of Object.entries(attrs)) {
      element.setAttribute(attr, value);
    }
    svg.appendChild(element);
  }

  return svg;
}

function ensureIconContainer(card) {
  if (!(card instanceof HTMLElement)) {
    return null;
  }
  const header = qs('.service-h', card) || card;
  let container = qs('.service-icon', header);
  if (!(container instanceof HTMLElement)) {
    container = document.createElement('span');
    container.className = 'service-icon';
    container.setAttribute('aria-hidden', 'true');
    header.prepend(container);
  } else {
    container.setAttribute('aria-hidden', 'true');
  }
  return container;
}

function activateTab(tabs, panelMap, tab, { focus = false } = {}) {
  if (!tabs.length || !panelMap || !tab) {
    return;
  }

  const tabValue = tab.dataset ? tab.dataset.tab : undefined;

  for (const item of tabs) {
    const isActive = item === tab;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-selected', String(isActive));
    item.setAttribute('tabindex', isActive ? '0' : '-1');
  }

  for (const [key, panel] of panelMap.entries()) {
    const match = key === tabValue;
    if (match) {
      panel.removeAttribute('hidden');
      panel.setAttribute('tabindex', '0');
    } else {
      panel.setAttribute('hidden', '');
      panel.setAttribute('tabindex', '-1');
    }
  }

  if (focus && typeof tab.focus === 'function') {
    try {
      tab.focus({ preventScroll: true });
    } catch (error) {
      tab.focus();
    }
  }
}

function setupTabs(card, service, cleanup) {
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const tabList = qs('[role="tablist"]', card) || qs('.tabs', card);
  if (!(tabList instanceof HTMLElement)) {
    return;
  }

  tabList.setAttribute('role', 'tablist');
  if (!tabList.getAttribute('aria-label')) {
    const label = service && service.label ? `${service.label} views` : 'Service views';
    tabList.setAttribute('aria-label', label);
  }
  if (!tabList.getAttribute('aria-orientation')) {
    tabList.setAttribute('aria-orientation', 'horizontal');
  }

  let tabs = qsa('[role="tab"]', tabList);
  if (!tabs.length) {
    tabs = qsa('[data-tab]', tabList);
    for (const tab of tabs) {
      tab.setAttribute('role', 'tab');
    }
  }

  if (!tabs.length) {
    return;
  }

  let panels = qsa('[role="tabpanel"]', card);
  if (!panels.length) {
    panels = qsa('[data-tab-panel]', card);
    for (const panel of panels) {
      panel.setAttribute('role', 'tabpanel');
    }
  }

  const panelMap = new Map();
  panels.forEach((panel, index) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const value = panel.dataset ? panel.dataset.tabPanel || panel.dataset.tab : undefined;
    const key = value || String(index);
    if (!panel.id) {
      const suffix = value ? value.replace(/[^a-z0-9_-]+/gi, '-') : `panel-${index}`;
      panel.id = `${service && service.id ? service.id : 'service'}-${suffix}`;
    }
    panel.setAttribute('tabindex', '-1');
    if (panel.dataset) {
      panel.dataset.tabPanel = key;
    }
    panelMap.set(key, panel);
  });

  const defaultTab = tabs.find(item => item.classList.contains('is-active') || item.getAttribute('aria-selected') === 'true') || tabs[0];
  tabs.forEach((tab, index) => {
    const value = tab.dataset ? tab.dataset.tab : undefined;
    if (!tab.id) {
      const suffix = value ? value.replace(/[^a-z0-9_-]+/gi, '-') : `tab-${index}`;
      tab.id = `${service && service.id ? service.id : 'service'}-${suffix}`;
    }
    const panel = value ? panelMap.get(value) : undefined;
    if (panel) {
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('aria-labelledby', tab.id);
    }

    const handleClick = event => {
      event.preventDefault();
      activateTab(tabs, panelMap, tab, { focus: true });
    };
    const handleKeydown = event => {
      const { key } = event;
      const currentIndex = tabs.indexOf(tab);
      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        event.preventDefault();
        const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        activateTab(tabs, panelMap, tabs[nextIndex], { focus: true });
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        activateTab(tabs, panelMap, tabs[nextIndex], { focus: true });
      } else if (key === 'Home') {
        event.preventDefault();
        activateTab(tabs, panelMap, tabs[0], { focus: true });
      } else if (key === 'End') {
        event.preventDefault();
        activateTab(tabs, panelMap, tabs[tabs.length - 1], { focus: true });
      }
    };

    cleanup.push(on(tab, 'click', handleClick));
    cleanup.push(on(tab, 'keydown', handleKeydown));
  });

  if (defaultTab) {
    activateTab(tabs, panelMap, defaultTab);
  }
}

function updateMetric(root, id, key, value, formatter) {
  if (!id || !key) {
    return;
  }

  const target = qs(`#${id}-${key}`, root) || qs(`#${id}-${key}`);
  if (!target) {
    return;
  }

  const safeValue = Number.isFinite(value) ? value : 0;
  const format = typeof formatter === 'function' ? formatter : val => val;
  setText(target, format(safeValue));
}

function getSparkData(service, result, state, capacity, costs) {
  if (result && Array.isArray(result.sparkline)) {
    return result.sparkline;
  }
  if (service && typeof service.getSparkline === 'function') {
    const spark = service.getSparkline(state, capacity, costs);
    if (Array.isArray(spark)) {
      return spark;
    }
  }
  return [];
}

export function mountServiceCards(calcState, services, root = document) {
  const context = resolveRoot(root);
  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe.bind(store) : null;
  const getState = typeof store.get === 'function' ? store.get.bind(store) : null;
  const getDerived = typeof store.getDerived === 'function' ? store.getDerived.bind(store) : null;
  const cleanup = [];
  const registered = new Map();

  if (!Array.isArray(services)) {
    services = [];
  }

  services.forEach(service => {
    if (!service || typeof service !== 'object') {
      return;
    }
    const id = service.id;
    if (!id) {
      return;
    }

    const card = qs(`[data-service="${id}"]`, context) || qs(`#${id}-card`, context);
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const iconContainer = ensureIconContainer(card);
    if (iconContainer) {
      const icon = createTablerIcon(service);
      if (icon) {
        iconContainer.replaceChildren(icon);
      }
    }

    setupTabs(card, service, cleanup);
    registered.set(id, { card });
  });

  const render = (state, derived = {}) => {
    const capacity = derived ? derived.capacity : undefined;
    const costs = derived ? derived.costs : undefined;

    services.forEach(service => {
      if (!service || typeof service !== 'object') {
        return;
      }
      const id = service.id;
      if (!id) {
        return;
      }
      const registration = registered.get(id);
      const card = registration ? registration.card : qs(`[data-service="${id}"]`, context) || qs(`#${id}-card`, context);
      if (!(card instanceof HTMLElement)) {
        return;
      }

      let result = null;
      if (typeof service.compute === 'function') {
        try {
          result = service.compute(state, capacity, costs);
        } catch (error) {
          result = null;
        }
      }
      if (!result || typeof result !== 'object') {
        return;
      }

      updateMetric(card, id, 'units', result.units, fmt.number);
      updateMetric(card, id, 'price', result.price, fmt.currency);
      updateMetric(card, id, 'rev', result.revenue, fmt.currency);
      updateMetric(card, id, 'cost', result.directCost, fmt.currency);
      updateMetric(card, id, 'tax', result.tax, fmt.currency);
      updateMetric(card, id, 'net', result.net, fmt.currency);

      const sparkTarget = qs(`#${id}-spark`, card) || qs(`#${id}-spark`, context);
      if (sparkTarget instanceof HTMLElement) {
        const sparkData = getSparkData(service, result, state, capacity, costs);
        renderSparkline(sparkTarget, sparkData);
      }
    });
  };

  if (getState) {
    const initialState = getState();
    const initialDerived = getDerived ? getDerived() : undefined;
    render(initialState, initialDerived);
  }

  const unsubscribe = subscribe ? subscribe(render) : () => {};

  return () => {
    unsubscribe();
    while (cleanup.length) {
      const dispose = cleanup.pop();
      if (typeof dispose === 'function') {
        dispose();
      }
    }
  };
}
