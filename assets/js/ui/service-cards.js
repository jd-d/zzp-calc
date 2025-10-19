import { qs, qsa, on, setText, fmt, renderSparkline } from './components.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_ICON_KEY = 'briefcase';
const SHORTFALL_THRESHOLD = 0.005;

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

function ensureStatusBadge(card) {
  if (!(card instanceof HTMLElement)) {
    return { badge: null, label: null };
  }

  const header = qs('.service-card__header', card) || card;
  let badge = qs('[data-service-flag]', header);
  let label = badge instanceof HTMLElement ? badge.querySelector('.service-card__flag-label') : null;

  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement('span');
    badge.className = 'service-card__flag';
    badge.setAttribute('data-service-flag', '');
    badge.hidden = true;

    const dot = document.createElement('span');
    dot.className = 'service-card__flag-dot';
    dot.setAttribute('aria-hidden', 'true');

    label = document.createElement('span');
    label.className = 'service-card__flag-label';
    label.textContent = 'Needs attention';

    badge.append(dot, label);
    header.appendChild(badge);
  } else {
    if (!(label instanceof HTMLElement)) {
      label = document.createElement('span');
      label.className = 'service-card__flag-label';
      label.textContent = 'Needs attention';
      badge.appendChild(label);
    }

    if (!badge.querySelector('.service-card__flag-dot')) {
      const dot = document.createElement('span');
      dot.className = 'service-card__flag-dot';
      dot.setAttribute('aria-hidden', 'true');
      badge.prepend(dot);
    }
  }

  return { badge, label };
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

  const hasValue = Number.isFinite(value);
  if (hasValue) {
    const format = typeof formatter === 'function' ? formatter : val => val;
    setText(target, format(value));
  } else {
    setText(target, '--');
  }
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

function formatCostShares(shares) {
  if (!shares || typeof shares !== 'object') {
    return '--';
  }

  const parts = [];
  if (Number.isFinite(shares.direct)) {
    parts.push(`Direct ${fmt.percent(shares.direct, 'nl-NL', { maximumFractionDigits: 0 })}`);
  }
  if (Number.isFinite(shares.fixed)) {
    parts.push(`Fixed ${fmt.percent(shares.fixed, 'nl-NL', { maximumFractionDigits: 0 })}`);
  }
  if (Number.isFinite(shares.variable)) {
    parts.push(`Variable ${fmt.percent(shares.variable, 'nl-NL', { maximumFractionDigits: 0 })}`);
  }

  return parts.length ? parts.join(' · ') : '--';
}

function formatBufferStatus(viewKey, metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return '--';
  }

  const parts = [];
  if (metrics.locked) {
    const label = viewKey === 'rate' ? 'Rate locked' : 'Volume locked';
    parts.push(label);
  }

  const bufferValue = Number.isFinite(metrics.buffer) ? metrics.buffer : null;
  const comfortShortfall = Number.isFinite(metrics.comfortShortfall) ? metrics.comfortShortfall : null;
  const comfortFloor = Number.isFinite(metrics.comfortFloor) ? metrics.comfortFloor : null;

  if (comfortShortfall !== null && comfortShortfall > SHORTFALL_THRESHOLD && comfortFloor !== null) {
    const shortfallLabel = fmt.percent(comfortShortfall, 'nl-NL', { maximumFractionDigits: 0 });
    const targetLabel = fmt.percent(comfortFloor, 'nl-NL', { maximumFractionDigits: 0 });
    parts.push(`Short ${shortfallLabel} vs ${targetLabel}`);
  } else if (bufferValue !== null && bufferValue > 0) {
    parts.push(`Buffer +${fmt.percent(bufferValue, 'nl-NL', { maximumFractionDigits: 0 })}`);
  } else if (!metrics.locked) {
    parts.push('No buffer applied');
  }

  return parts.length ? parts.join(' · ') : '--';
}

function updateViewMetrics(card, id, viewKey, metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return;
  }

  updateMetric(card, `${id}-${viewKey}`, 'units', metrics.units, fmt.number);
  updateMetric(card, `${id}-${viewKey}`, 'price', metrics.price, fmt.currency);
  updateMetric(card, `${id}-${viewKey}`, 'revenue', metrics.revenue, fmt.currency);
  updateMetric(card, `${id}-${viewKey}`, 'tax', metrics.tax, fmt.currency);
  updateMetric(card, `${id}-${viewKey}`, 'net', metrics.net, fmt.currency);

  const costTarget = qs(`#${id}-${viewKey}-cost-share`, card) || qs(`#${id}-${viewKey}-cost-share`);
  if (costTarget) {
    setText(costTarget, formatCostShares(metrics.costShares));
  }

  const bufferTarget = qs(`#${id}-${viewKey}-buffer`, card) || qs(`#${id}-${viewKey}-buffer`);
  if (bufferTarget) {
    setText(bufferTarget, formatBufferStatus(viewKey, metrics));
    if (bufferTarget instanceof HTMLElement) {
      const shortfall = Number.isFinite(metrics.comfortShortfall) ? metrics.comfortShortfall : 0;
      if (shortfall > SHORTFALL_THRESHOLD) {
        bufferTarget.classList.add('is-alert');
        const shortfallLabel = fmt.percent(shortfall, 'nl-NL', { maximumFractionDigits: 0 });
        const targetLabel = fmt.percent(metrics.comfortFloor ?? 0, 'nl-NL', { maximumFractionDigits: 0 });
        bufferTarget.setAttribute('data-tooltip', `Needs +${shortfallLabel} to hit ${targetLabel} comfort.`);
      } else {
        bufferTarget.classList.remove('is-alert');
        bufferTarget.removeAttribute('data-tooltip');
      }
    }
  }
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
    const status = ensureStatusBadge(card);
    registered.set(id, { card, status });
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

      const views = result.views || {};
      if (views.rate) {
        updateViewMetrics(card, id, 'rate', views.rate);
      }
      if (views.volume) {
        updateViewMetrics(card, id, 'volume', views.volume);
      }

      let worstShortfall = null;
      for (const key of ['rate', 'volume']) {
        const metrics = views[key];
        if (!metrics) {
          continue;
        }
        const shortfall = Number.isFinite(metrics.comfortShortfall) ? metrics.comfortShortfall : 0;
        if (shortfall > SHORTFALL_THRESHOLD) {
          if (!worstShortfall || shortfall > worstShortfall.shortfall) {
            worstShortfall = {
              shortfall,
              floor: Number.isFinite(metrics.comfortFloor) ? metrics.comfortFloor : null
            };
          }
        }
      }

      const status = registration ? registration.status : ensureStatusBadge(card);
      const badge = status?.badge instanceof HTMLElement ? status.badge : null;
      const labelEl = status?.label instanceof HTMLElement ? status.label : null;
      const hasShortfall = Boolean(worstShortfall);

      card.classList.toggle('is-underperforming', hasShortfall);

      if (badge) {
        if (hasShortfall) {
          const shortfallLabel = fmt.percent(worstShortfall.shortfall, 'nl-NL', { maximumFractionDigits: 0 });
          const targetLabel = fmt.percent(worstShortfall.floor ?? 0, 'nl-NL', { maximumFractionDigits: 0 });
          badge.hidden = false;
          badge.dataset.tooltip = `Gross margin is ${shortfallLabel} below the ${targetLabel} comfort target.`;
          badge.setAttribute('aria-label', `Gross margin shortfall of ${shortfallLabel} versus a ${targetLabel} comfort floor.`);
          if (labelEl) {
            setText(labelEl, `Needs +${shortfallLabel}`);
          }
        } else {
          badge.hidden = true;
          delete badge.dataset.tooltip;
          badge.removeAttribute('aria-label');
          if (labelEl) {
            setText(labelEl, 'On track');
          }
        }
      }

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
