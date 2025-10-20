import { announce, qs, setText } from './components.js';
import { solvePortfolio, serviceCopy } from '../services.js';

const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fractionalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function getCurrencySymbol(state) {
  const raw = state && state.config && state.config.currencySymbol;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '€';
}

function formatCurrency(symbol, value) {
  if (!Number.isFinite(value)) {
    return `${symbol}0`;
  }
  const rounded = Math.round(value);
  const formatted = numberFormatter.format(Math.abs(rounded));
  return rounded < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const formatter = Math.abs(value) >= 10 ? integerFormatter : fractionalFormatter;
  return formatter.format(value);
}

function formatPercentValue(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) {
    return signed ? '+0%' : '0%';
  }

  const formatted = fractionalFormatter.format(value);
  if (signed && value > 0) {
    return `+${formatted}%`;
  }
  return `${formatted}%`;
}

function readCapacity(derived) {
  if (derived && typeof derived === 'object' && derived.capacity) {
    return derived.capacity;
  }
  return null;
}

function buildPlanItems(mix, capacity) {
  const entries = mix && typeof mix === 'object'
    ? Object.entries(mix)
    : [];

  if (!entries.length) {
    return [];
  }

  const workingWeeks = Number.isFinite(capacity?.workingWeeks) && capacity.workingWeeks > 0
    ? capacity.workingWeeks
    : null;
  const activeMonths = Number.isFinite(capacity?.activeMonths) && capacity.activeMonths > 0
    ? capacity.activeMonths
    : null;

  return entries
    .map(([id, config]) => {
      const descriptor = config && typeof config === 'object' ? config : {};
      const title = serviceCopy[id]?.title
        || descriptor.descriptor?.copy?.title
        || id;

      const serviceDays = Number.isFinite(descriptor.serviceDays) ? descriptor.serviceDays : 0;
      const netAnnual = Number.isFinite(descriptor.net) ? descriptor.net : 0;
      const annualUnits = Number.isFinite(descriptor.annualUnits) ? descriptor.annualUnits : 0;
      const unitsPerMonth = Number.isFinite(descriptor.unitsPerMonth)
        ? descriptor.unitsPerMonth
        : activeMonths
          ? annualUnits / activeMonths
          : 0;
      const pricePerUnit = Number.isFinite(descriptor.pricePerUnit)
        ? descriptor.pricePerUnit
        : null;
      const fenceSource = descriptor.pricingFence && typeof descriptor.pricingFence === 'object'
        ? descriptor.pricingFence
        : null;
      const pricingFence = fenceSource
        ? {
            min: Number.isFinite(fenceSource.min) ? fenceSource.min : null,
            target: Number.isFinite(fenceSource.target) ? fenceSource.target : null,
            stretch: Number.isFinite(fenceSource.stretch) ? fenceSource.stretch : null,
            status: typeof fenceSource.status === 'string' ? fenceSource.status : 'unknown',
            delta: Number.isFinite(fenceSource.delta) ? fenceSource.delta : null
          }
        : null;

      const daysPerWeek = workingWeeks ? serviceDays / workingWeeks : 0;
      const netPerWeek = workingWeeks ? netAnnual / workingWeeks : 0;

      return {
        id,
        title,
        daysPerWeek,
        unitsPerMonth,
        netPerWeek,
        pricePerUnit,
        pricingFence
      };
    })
    .filter(item => item.daysPerWeek > 0 || item.unitsPerMonth > 0 || item.netPerWeek !== 0)
    .sort((a, b) => {
      if (b.daysPerWeek !== a.daysPerWeek) {
        return b.daysPerWeek - a.daysPerWeek;
      }
      if (b.netPerWeek !== a.netPerWeek) {
        return b.netPerWeek - a.netPerWeek;
      }
      return b.unitsPerMonth - a.unitsPerMonth;
    });
}

function createMetric(label, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'portfolio-week__metric';

  const dt = document.createElement('dt');
  dt.className = 'portfolio-week__metric-label';
  setText(dt, label);

  const dd = document.createElement('dd');
  dd.className = 'portfolio-week__metric-value';
  setText(dd, value);

  wrapper.append(dt, dd);
  return wrapper;
}

function renderWeeklyPlan(listElement, mix, capacity, symbol) {
  if (!(listElement instanceof HTMLElement)) {
    return;
  }

  const items = buildPlanItems(mix, capacity);
  listElement.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'portfolio-week__empty';
    setText(empty, 'Adjust your services to see a weekly mix.');
    listElement.append(empty);
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'portfolio-week__item';

    const number = document.createElement('span');
    number.className = 'portfolio-week__number';
    setText(number, String(index + 1));

    const body = document.createElement('div');
    body.className = 'portfolio-week__body';

    const header = document.createElement('div');
    header.className = 'portfolio-week__header';

    const name = document.createElement('span');
    name.className = 'portfolio-week__service';
    setText(name, item.title);

    const days = document.createElement('span');
    days.className = 'portfolio-week__days';
    setText(
      days,
      item.daysPerWeek > 0
        ? `${formatCount(item.daysPerWeek)} d/wk`
        : '0 d/wk'
    );

    header.append(name, days);

    const badges = document.createElement('div');
    badges.className = 'portfolio-week__badges';

    const fence = item.pricingFence && typeof item.pricingFence === 'object' ? item.pricingFence : null;
    const pricePerUnit = Number.isFinite(item.pricePerUnit) ? item.pricePerUnit : null;
    if (fence && (fence.status === 'belowMin' || fence.status === 'aboveStretch')) {
      const badge = document.createElement('span');
      badge.className = 'portfolio-week__badge portfolio-week__badge--alert';
      const delta = Number.isFinite(fence.delta) ? Math.abs(fence.delta) : null;
      const diffLabel = delta !== null ? formatCurrency(symbol, delta) : null;
      const badgeText = fence.status === 'belowMin'
        ? diffLabel
          ? `Below min fence by ${diffLabel}`
          : 'Below min fence'
        : diffLabel
          ? `Above stretch fence by +${diffLabel}`
          : 'Above stretch fence';
      setText(badge, badgeText);

      const fenceValue = fence.status === 'belowMin'
        ? (Number.isFinite(fence.min) ? fence.min : null)
        : (Number.isFinite(fence.stretch) ? fence.stretch : null);
      if (pricePerUnit !== null && fenceValue !== null) {
        const currentLabel = formatCurrency(symbol, pricePerUnit);
        const fenceLabel = formatCurrency(symbol, fenceValue);
        badge.dataset.tooltip = `Current ${currentLabel} vs fence ${fenceLabel}`;
        badge.setAttribute('aria-label', `${badgeText}. Current ${currentLabel} vs fence ${fenceLabel}.`);
      } else {
        badge.setAttribute('aria-label', badgeText);
      }

      badges.append(badge);
    }

    const metrics = document.createElement('dl');
    metrics.className = 'portfolio-week__metrics';

    const unitsDisplay = item.unitsPerMonth > 0
      ? `${formatCount(item.unitsPerMonth)} /mo`
      : '0 /mo';
    metrics.append(
      createMetric('Units', unitsDisplay),
      createMetric('Net/week', formatCurrency(symbol, item.netPerWeek))
    );

    body.append(header);
    if (badges.childElementCount > 0) {
      body.append(badges);
    }
    body.append(metrics);
    li.append(number, body);
    listElement.append(li);
  });
}

function renderViolations(block, list, violations) {
  if (!(block instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    return '';
  }

  list.replaceChildren();

  const items = Array.isArray(violations) ? violations : [];
  if (!items.length) {
    block.setAttribute('hidden', '');
    return '';
  }

  block.removeAttribute('hidden');

  const summaryParts = [];
  items.forEach(violation => {
    const message = violation && typeof violation.message === 'string'
      ? violation.message
      : 'Portfolio constraint needs attention';

    const li = document.createElement('li');
    setText(li, message);
    list.append(li);
    summaryParts.push(message);
  });

  return summaryParts.join('; ');
}

function updateTotals(elements, totals, symbol) {
  const data = totals && typeof totals === 'object'
    ? totals
    : {};

  const mappings = [
    ['revenue', data.revenue],
    ['cost', data.directCost],
    ['tax', data.tax],
    ['net', data.net]
  ];

  mappings.forEach(([key, value]) => {
    const el = elements[key];
    if (!(el instanceof HTMLElement)) {
      return;
    }
    if (Number.isFinite(value)) {
      setText(el, formatCurrency(symbol, value));
    } else {
      setText(el, '—');
    }
  });
}

function updateStatus(statusElement, totals, symbol) {
  if (!(statusElement instanceof HTMLElement)) {
    return;
  }

  statusElement.classList.remove('is-positive', 'is-negative', 'is-warning');

  if (!totals || typeof totals !== 'object') {
    setText(statusElement, 'Waiting for scenario…');
    return;
  }

  const net = Number.isFinite(totals.net) ? totals.net : null;
  const target = Number.isFinite(totals.targetNet) ? totals.targetNet : null;
  const gap = Number.isFinite(totals.netGap) ? totals.netGap : (net !== null && target !== null ? net - target : null);
  const bufferTarget = Number.isFinite(totals.targetNetBuffered) ? totals.targetNetBuffered : null;
  const bufferGap = Number.isFinite(totals.netBufferGap) ? totals.netBufferGap : null;
  const bufferRatio = Number.isFinite(totals.netBufferRatio) ? totals.netBufferRatio : 0;
  const bufferAbsolute = Number.isFinite(totals.netBufferAbsolute) ? totals.netBufferAbsolute : 0;
  const hasBufferRequirement = bufferTarget !== null
    && target !== null
    && (bufferTarget > target + 1 || bufferRatio > 1e-4 || bufferAbsolute > 0);

  if (gap === null || net === null || target === null) {
    setText(statusElement, 'Portfolio results will appear here.');
    return;
  }

  if (hasBufferRequirement && bufferGap !== null) {
    if (bufferGap >= 0) {
      statusElement.classList.add('is-positive');
      const overage = formatCurrency(symbol, bufferGap);
      setText(statusElement, `Comfort buffer met (+${overage}).`);
      return;
    }

    if (gap >= 0) {
      statusElement.classList.add('is-warning');
      const shortfall = formatCurrency(symbol, Math.abs(bufferGap));
      setText(statusElement, `Target met, add ${shortfall} to reach comfort buffer.`);
      return;
    }

    statusElement.classList.add('is-negative');
    const targetShortfall = formatCurrency(symbol, Math.abs(gap));
    const bufferShortfall = formatCurrency(symbol, Math.abs(bufferGap));
    setText(statusElement, `Shortfall of ${targetShortfall} versus target (${bufferShortfall} to hit comfort buffer).`);
    return;
  }

  if (gap >= 0) {
    statusElement.classList.add('is-positive');
    const overage = formatCurrency(symbol, gap);
    setText(statusElement, `Target met (+${overage}).`);
  } else {
    statusElement.classList.add('is-negative');
    const shortfall = formatCurrency(symbol, Math.abs(gap));
    setText(statusElement, `Shortfall of ${shortfall} versus target.`);
  }
}

function updateBufferSummary(elements, totals) {
  const effectiveEl = elements?.effective instanceof HTMLElement ? elements.effective : null;
  const breakdownEl = elements?.breakdown instanceof HTMLElement ? elements.breakdown : null;

  const base = Number.isFinite(totals?.bufferPercentBase) ? totals.bufferPercentBase : null;
  const uplift = Number.isFinite(totals?.comfortMarginPercent) ? totals.comfortMarginPercent : null;
  const effective = Number.isFinite(totals?.bufferPercentEffective)
    ? totals.bufferPercentEffective
    : base !== null && uplift !== null
      ? base + uplift
      : null;

  if (effectiveEl) {
    setText(effectiveEl, effective !== null ? formatPercentValue(effective) : '—');
  }

  if (breakdownEl) {
    if (base === null && uplift === null) {
      setText(breakdownEl, '');
    } else {
      const segments = [];
      if (base !== null) {
        segments.push(`Base ${formatPercentValue(base)}`);
      }
      if (uplift !== null && Math.abs(uplift) > 0.001) {
        segments.push(`Comfort ${formatPercentValue(uplift, { signed: true })}`);
      }
      setText(breakdownEl, segments.join(' · '));
    }
  }
}

function updateComfortIndicator(container, comfort) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const valueEl = container.querySelector('[data-comfort-value]');
  const summaryEl = container.querySelector('[data-comfort-summary]');
  const fillEl = container.querySelector('[data-comfort-fill]');

  container.classList.remove('is-high', 'is-medium', 'is-low', 'is-unknown');

  if (!comfort || !Number.isFinite(comfort.score)) {
    container.classList.add('is-unknown');
    container.setAttribute('aria-busy', 'true');
    if (valueEl) {
      setText(valueEl, 'N/A');
    }
    if (summaryEl) {
      setText(summaryEl, 'Comfort score will appear once the solver runs.');
    }
    if (fillEl instanceof HTMLElement) {
      fillEl.style.width = '0%';
    }
    return;
  }

  container.removeAttribute('aria-busy');

  const percent = Number.isFinite(comfort.scorePercent)
    ? Math.max(Math.min(comfort.scorePercent, 100), 0)
    : Math.max(Math.min(Math.round(comfort.score * 100), 100), 0);

  if (valueEl) {
    setText(valueEl, `${percent}%`);
  }

  if (fillEl instanceof HTMLElement) {
    fillEl.style.width = `${percent}%`;
  }

  const levelClass = typeof comfort.level === 'string' && comfort.level
    ? `is-${comfort.level}`
    : 'is-medium';
  container.classList.add(levelClass);

  if (summaryEl) {
    setText(summaryEl, comfort.summary || 'Comfort summary ready.');
  }
}

export function mountPortfolio(calcState, root = document) {
  const context = root instanceof Document || root instanceof HTMLElement ? root : document;
  const section = qs('#portfolio', context);
  if (!(section instanceof HTMLElement)) {
    return () => {};
  }

  const totalsElements = {
    revenue: qs('#p-rev', section),
    cost: qs('#p-cost', section),
    tax: qs('#p-tax', section),
    net: qs('#p-net', section)
  };
  const bufferElements = {
    effective: qs('#p-buffer-effective', section),
    breakdown: qs('#p-buffer-breakdown', section)
  };

  const weekList = qs('#p-week', section);
  const statusElement = qs('#portfolio-status', section);
  const comfortElement = qs('#portfolio-comfort', section);
  const violationsBlock = qs('#portfolio-violations', section);
  const violationsList = qs('#portfolio-violations-list', section);

  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe.bind(store) : null;
  const getState = typeof store.get === 'function' ? store.get.bind(store) : null;
  const getDerived = typeof store.getDerived === 'function' ? store.getDerived.bind(store) : null;

  let lastViolationSummary = '';

  const runUpdate = (stateSnapshot, derivedState) => {
    const snapshot = stateSnapshot || (typeof getState === 'function' ? getState() : null);
    const derived = derivedState || (typeof getDerived === 'function' ? getDerived() : null);
    const capacity = readCapacity(derived);
    const symbol = getCurrencySymbol(snapshot);

    let portfolio;
    try {
      portfolio = solvePortfolio(snapshot, capacity);
    } catch (error) {
      console.error('Portfolio solver failed', error);
      portfolio = null;
    }

    const totals = portfolio && typeof portfolio === 'object' ? portfolio.totals : null;
    updateTotals(totalsElements, totals, symbol);
    updateBufferSummary(bufferElements, totals);
    updateStatus(statusElement, totals, symbol);
    updateComfortIndicator(comfortElement, portfolio ? portfolio.comfort : null);
    renderWeeklyPlan(weekList, portfolio ? portfolio.mix : null, capacity, symbol);

    const summary = renderViolations(violationsBlock, violationsList, portfolio ? portfolio.violations : []);
    if (summary && summary !== lastViolationSummary) {
      announce(`Portfolio warnings: ${summary}`, { politeness: 'assertive' });
    }
    if (!summary && lastViolationSummary) {
      announce('Portfolio constraint warnings cleared.', { politeness: 'polite' });
    }
    lastViolationSummary = summary;
  };

  runUpdate(typeof getState === 'function' ? getState() : null, typeof getDerived === 'function' ? getDerived() : null);

  if (typeof subscribe === 'function') {
    const unsubscribe = subscribe((nextState, derivedState) => {
      runUpdate(nextState, derivedState);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }

  return () => {};
}
