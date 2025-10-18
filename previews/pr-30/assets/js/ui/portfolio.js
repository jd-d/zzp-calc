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

      const daysPerWeek = workingWeeks ? serviceDays / workingWeeks : 0;
      const netPerWeek = workingWeeks ? netAnnual / workingWeeks : 0;

      return {
        id,
        title,
        daysPerWeek,
        unitsPerMonth,
        netPerWeek
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

    const metrics = document.createElement('dl');
    metrics.className = 'portfolio-week__metrics';

    const unitsDisplay = item.unitsPerMonth > 0
      ? `${formatCount(item.unitsPerMonth)} /mo`
      : '0 /mo';
    metrics.append(
      createMetric('Units', unitsDisplay),
      createMetric('Net/week', formatCurrency(symbol, item.netPerWeek))
    );

    body.append(header, metrics);
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

  statusElement.classList.remove('is-positive', 'is-negative');

  if (!totals || typeof totals !== 'object') {
    setText(statusElement, 'Waiting for scenario…');
    return;
  }

  const net = Number.isFinite(totals.net) ? totals.net : null;
  const target = Number.isFinite(totals.targetNet) ? totals.targetNet : null;
  const gap = Number.isFinite(totals.netGap) ? totals.netGap : (net !== null && target !== null ? net - target : null);

  if (gap === null || net === null || target === null) {
    setText(statusElement, 'Portfolio results will appear here.');
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

  const weekList = qs('#p-week', section);
  const statusElement = qs('#portfolio-status', section);
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
    updateStatus(statusElement, totals, symbol);
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
