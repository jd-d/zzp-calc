import { announce, qs, setText, describePricingFenceStatus } from './components.js';
import { translate, getLocale } from './i18n.js';
import { solvePortfolio, serviceCopy } from '../services.js';

const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fractionalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const DAY_LABELS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const COMFORT_FLAG_FALLBACK = Object.freeze({
  margin: 'margin quality',
  service: 'service days',
  travel: 'travel days',
  handsOn: 'hands-on mix'
});

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

const listFormatterCache = new Map();

function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    const locale = getLocale();
    const key = locale || 'default';
    let formatter = listFormatterCache.get(key);

    if (!formatter) {
      try {
        formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
      } catch (error) {
        formatter = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' });
      }
      listFormatterCache.set(key, formatter);
    }

    try {
      return formatter.format(items);
    } catch (error) {
      // Fall back to manual formatting
    }
  }

  if (items.length === 1) {
    return items[0];
  }

  const head = items.slice(0, -1);
  const tail = items[items.length - 1];
  return `${head.join(', ')} and ${tail}`;
}

function formatFlagList(flagKeys) {
  if (!Array.isArray(flagKeys) || flagKeys.length === 0) {
    return '';
  }

  const labels = flagKeys
    .map(key => translate(`portfolio.comfort.flags.${key}`) || COMFORT_FLAG_FALLBACK[key] || key)
    .filter(Boolean);

  return formatList(labels);
}

function formatTravelDaysValue(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return formatCount(value);
}

function formatTravelMultiplier(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '—';
  }
  const rounded = Math.round(value * 100) / 100;
  return `×${rounded}`;
}

function formatTravelFrictionPercent(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return formatPercentValue(value * 100, { signed: true });
}

function evaluateTravelFatigue(components = {}) {
  const travel = components.travel && typeof components.travel === 'object' ? components.travel : {};
  const friction = components.travelFriction && typeof components.travelFriction === 'object'
    ? components.travelFriction
    : {};

  const used = Number.isFinite(travel.used) ? travel.used : null;
  const limit = Number.isFinite(travel.limit) ? travel.limit : null;
  const factor = Number.isFinite(friction.factor) ? friction.factor : null;
  const multiplier = Number.isFinite(friction.multiplier) ? friction.multiplier : null;

  let level = 'unknown';

  if (limit && used !== null) {
    const ratio = limit > 0 ? used / limit : null;
    if (ratio !== null) {
      if (ratio >= 0.9 || (factor !== null && factor > 0.35)) {
        level = 'high';
      } else if (ratio >= 0.7 || (factor !== null && factor > 0.2)) {
        level = 'medium';
      } else {
        level = 'low';
      }
    }
  } else if (used !== null) {
    if (factor !== null && factor > 0.3) {
      level = 'medium';
    }
  }

  if (level === 'unknown' && factor !== null) {
    if (factor > 0.35) {
      level = 'high';
    } else if (factor > 0.15) {
      level = 'medium';
    }
  }

  return {
    used,
    limit,
    factor,
    multiplier,
    level
  };
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

function formatDayShare(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  const rounded = Math.round(value * 10) / 10;
  const formatted = formatCount(rounded);
  const suffix = Math.abs(rounded - 1) < 0.05 ? 'day' : 'days';
  return `${formatted} ${suffix}`;
}

function formatSlotShare(value) {
  const label = formatDayShare(value);
  if (!label) {
    return '';
  }
  return `~${label}/wk`;
}

function clampWorkingDays(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 5;
  }
  return Math.min(Math.max(Math.round(numeric), 1), DAY_LABELS.length);
}

function computeUsageMetrics(totals, capacity) {
  const serviceDays = Number.isFinite(totals?.serviceDays) ? totals.serviceDays : null;
  const travelDays = Number.isFinite(totals?.travelDays) ? totals.travelDays : null;
  const workingWeeks = Number.isFinite(capacity?.workingWeeks) && capacity.workingWeeks > 0
    ? capacity.workingWeeks
    : null;
  const billableAfterTravel = Number.isFinite(capacity?.billableDaysAfterTravel) && capacity.billableDaysAfterTravel > 0
    ? capacity.billableDaysAfterTravel
    : null;
  const travelAllowanceDays = Number.isFinite(capacity?.travelAllowanceDays) && capacity.travelAllowanceDays > 0
    ? capacity.travelAllowanceDays
    : null;

  const serviceDaysPerWeek = workingWeeks && serviceDays !== null
    ? serviceDays / workingWeeks
    : null;
  const travelDaysPerWeek = workingWeeks && travelDays !== null
    ? travelDays / workingWeeks
    : null;
  const availableBillableDaysPerWeek = workingWeeks && billableAfterTravel
    ? billableAfterTravel / workingWeeks
    : null;

  const utilizationPercent = billableAfterTravel && serviceDays !== null
    ? (serviceDays / billableAfterTravel) * 100
    : null;
  const travelAllowancePercent = travelAllowanceDays && travelDays !== null
    ? (travelDays / travelAllowanceDays) * 100
    : null;

  return {
    serviceDays,
    travelDays,
    serviceDaysPerWeek,
    travelDaysPerWeek,
    utilizationPercent,
    travelAllowancePercent,
    workingWeeks,
    billableDaysAfterTravel,
    travelAllowanceDays,
    availableBillableDaysPerWeek
  };
}

function buildScheduleModel(mix, totals, capacity) {
  const workingDays = clampWorkingDays(capacity?.workingDaysPerWeek);
  const usage = computeUsageMetrics(totals, capacity);
  const items = buildPlanItems(mix, capacity)
    .map(item => ({
      id: item.id,
      title: item.title,
      kind: 'service',
      daysPerWeek: Math.max(item.daysPerWeek, 0)
    }));

  const travelPerWeek = Number.isFinite(usage.travelDaysPerWeek)
    ? usage.travelDaysPerWeek
    : 0;
  if (travelPerWeek > 0.05) {
    items.push({
      id: 'travel',
      title: 'Travel overhead',
      kind: 'travel',
      daysPerWeek: travelPerWeek
    });
  }

  const serviceDaysPerWeek = Number.isFinite(usage.serviceDaysPerWeek)
    ? usage.serviceDaysPerWeek
    : items
        .filter(entry => entry.kind === 'service')
        .reduce((sum, entry) => sum + entry.daysPerWeek, 0);

  const availableServicePerWeek = Number.isFinite(usage.availableBillableDaysPerWeek)
    ? usage.availableBillableDaysPerWeek
    : null;

  let openDaysPerWeek = 0;
  if (availableServicePerWeek !== null) {
    openDaysPerWeek = Math.max(availableServicePerWeek - serviceDaysPerWeek, 0);
  } else {
    openDaysPerWeek = Math.max(workingDays - serviceDaysPerWeek - travelPerWeek, 0);
  }

  if (openDaysPerWeek > 0.05) {
    items.push({
      id: 'open',
      title: 'Open capacity',
      kind: 'open',
      daysPerWeek: openDaysPerWeek
    });
  }

  const filtered = items.filter(item => item.daysPerWeek > 0);
  const totalSlots = Math.max(workingDays * 2, 0);

  if (!filtered.length || totalSlots <= 0) {
    return {
      hasData: false,
      days: Array.from({ length: workingDays }, (_, index) => ({
        label: DAY_LABELS[index] || `Day ${index + 1}`,
        slots: []
      }))
    };
  }

  const allocations = filtered.map(item => {
    const rawSlots = item.daysPerWeek * 2;
    let slotCount = Math.floor(rawSlots);
    const remainder = rawSlots - slotCount;
    if (slotCount === 0) {
      slotCount = 1;
    }
    return { item, rawSlots, slotCount, remainder };
  });

  let assigned = allocations.reduce((sum, entry) => sum + entry.slotCount, 0);
  let slotsRemaining = totalSlots - assigned;

  if (slotsRemaining > 0) {
    const sorted = allocations.slice().sort((a, b) => b.remainder - a.remainder);
    let index = 0;
    while (slotsRemaining > 0 && sorted.length > 0) {
      const target = sorted[index % sorted.length];
      if (target.remainder > 1e-3 || target.slotCount === 0) {
        target.slotCount += 1;
        slotsRemaining -= 1;
      } else {
        index += 1;
        if (index >= sorted.length) {
          break;
        }
        continue;
      }
      index += 1;
    }
  } else if (slotsRemaining < 0) {
    const sorted = allocations.slice().sort((a, b) => a.remainder - b.remainder);
    let index = 0;
    while (slotsRemaining < 0 && sorted.length > 0) {
      const target = sorted[index % sorted.length];
      if (target.slotCount > 1) {
        target.slotCount -= 1;
        slotsRemaining += 1;
      } else {
        index += 1;
        if (index >= sorted.length) {
          break;
        }
        continue;
      }
      index += 1;
    }
  }

  assigned = allocations.reduce((sum, entry) => sum + entry.slotCount, 0);

  const slots = [];
  allocations.forEach(entry => {
    const { item, slotCount } = entry;
    const sharePerSlot = slotCount > 0 ? item.daysPerWeek / slotCount : 0;
    for (let index = 0; index < slotCount; index += 1) {
      slots.push({
        id: item.id,
        title: item.title,
        kind: item.kind,
        portion: sharePerSlot
      });
    }
  });

  if (slots.length > totalSlots) {
    slots.length = totalSlots;
  } else if (slots.length < totalSlots) {
    let fillerPortion = 0;
    if (totalSlots - slots.length > 0) {
      const derivedPortion = Math.max(openDaysPerWeek, 0) / Math.max(totalSlots - slots.length, 1);
      fillerPortion = Number.isFinite(derivedPortion) && derivedPortion > 0 ? derivedPortion : 0.5;
    }
    while (slots.length < totalSlots) {
      slots.push({
        id: 'open',
        title: 'Open capacity',
        kind: 'open',
        portion: fillerPortion
      });
    }
  }

  const days = [];
  for (let dayIndex = 0; dayIndex < workingDays; dayIndex += 1) {
    const label = DAY_LABELS[dayIndex] || `Day ${dayIndex + 1}`;
    const slotsForDay = [];
    for (let column = 0; column < 2; column += 1) {
      const slotIndex = dayIndex * 2 + column;
      slotsForDay.push(slots[slotIndex] || null);
    }
    days.push({ label, slots: slotsForDay });
  }

  return {
    hasData: true,
    days
  };
}

function renderWeeklyPlan(listElement, schedule) {
  if (!(listElement instanceof HTMLElement)) {
    return;
  }

  const model = schedule && typeof schedule === 'object'
    ? schedule
    : { hasData: false, days: [] };

  listElement.replaceChildren();

  if (!model.hasData) {
    const empty = document.createElement('li');
    empty.className = 'week-grid__empty';
    setText(empty, 'Adjust your services to see a weekly mix.');
    listElement.append(empty);
    return;
  }

  model.days.forEach(day => {
    const li = document.createElement('li');
    li.className = 'week-grid__day';

    const label = document.createElement('div');
    label.className = 'week-grid__label';
    setText(label, day.label);

    const slots = document.createElement('div');
    slots.className = 'week-grid__slots';

    day.slots.forEach(slot => {
      const slotEl = document.createElement('div');
      slotEl.className = 'week-grid__slot';

      if (!slot || slot.kind === 'open') {
        slotEl.classList.add('week-grid__slot--open');
      } else if (slot.kind === 'travel') {
        slotEl.classList.add('week-grid__slot--travel');
      }

      const title = document.createElement('span');
      title.className = 'week-grid__slot-title';
      setText(title, slot && slot.title ? slot.title : 'Open capacity');
      slotEl.append(title);

      const shareLabel = slot ? formatSlotShare(slot.portion) : '';
      if (shareLabel) {
        const meta = document.createElement('span');
        meta.className = 'week-grid__slot-meta';
        setText(meta, shareLabel);
        slotEl.append(meta);
      }

      slots.append(slotEl);
    });

    li.append(label, slots);
    listElement.append(li);
  });
}

function computeMixFingerprint(mix) {
  if (!mix || typeof mix !== 'object') {
    return '';
  }

  const entries = Object.entries(mix).map(([id, config]) => {
    const descriptor = config && typeof config === 'object' ? config : {};
    const units = Number.isFinite(descriptor.unitsPerMonth)
      ? Number(descriptor.unitsPerMonth.toFixed(3))
      : 0;
    const price = Number.isFinite(descriptor.pricePerUnit)
      ? Number(descriptor.pricePerUnit.toFixed(2))
      : 0;
    const net = Number.isFinite(descriptor.net)
      ? Math.round(descriptor.net)
      : 0;
    return [id, units, price, net];
  });

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

function createPinnedSnapshot(portfolio, capacity, symbol) {
  if (!portfolio || typeof portfolio !== 'object') {
    return null;
  }

  const totals = portfolio.totals && typeof portfolio.totals === 'object'
    ? JSON.parse(JSON.stringify(portfolio.totals))
    : null;

  if (!totals) {
    return null;
  }

  const mix = portfolio.mix && typeof portfolio.mix === 'object'
    ? JSON.parse(JSON.stringify(portfolio.mix))
    : {};

  const capacitySnapshot = capacity && typeof capacity === 'object'
    ? {
        workingWeeks: capacity.workingWeeks,
        workingDaysPerWeek: capacity.workingDaysPerWeek,
        billableDaysAfterTravel: capacity.billableDaysAfterTravel,
        travelAllowanceDays: capacity.travelAllowanceDays
      }
    : {};

  return {
    totals,
    mix,
    capacity: capacitySnapshot,
    symbol,
    fingerprint: computeMixFingerprint(mix)
  };
}

function setComparisonColumn(elements, totals, usage, symbol) {
  if (!elements) {
    return;
  }

  const valueMappings = [
    ['revenue', totals?.revenue],
    ['cost', totals?.directCost],
    ['tax', totals?.tax],
    ['net', totals?.net]
  ];

  valueMappings.forEach(([key, value]) => {
    const target = elements[key];
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (Number.isFinite(value)) {
      setText(target, formatCurrency(symbol, value));
    } else {
      setText(target, '—');
    }
  });

  if (elements.utilization instanceof HTMLElement) {
    if (Number.isFinite(usage?.utilizationPercent)) {
      setText(elements.utilization, formatPercentValue(usage.utilizationPercent));
    } else {
      setText(elements.utilization, '—');
    }
  }

  if (elements.travel instanceof HTMLElement) {
    const travelParts = [];
    if (Number.isFinite(usage?.travelDaysPerWeek) && usage.travelDaysPerWeek > 0.01) {
      travelParts.push(`${formatCount(usage.travelDaysPerWeek)} d/wk`);
    }
    if (Number.isFinite(usage?.travelAllowancePercent)) {
      travelParts.push(`${formatPercentValue(usage.travelAllowancePercent)} of allowance`);
    }
    setText(elements.travel, travelParts.length ? travelParts.join(' · ') : '—');
  }
}

function updateComparison(compareElements, pinnedSnapshot, currentTotals, capacity, symbol) {
  if (!compareElements || !(compareElements.block instanceof HTMLElement)) {
    return;
  }

  if (!pinnedSnapshot || !pinnedSnapshot.totals) {
    compareElements.block.setAttribute('hidden', '');
    if (compareElements.note instanceof HTMLElement) {
      setText(compareElements.note, '');
    }
    if (compareElements.clearButton instanceof HTMLElement) {
      compareElements.clearButton.setAttribute('disabled', '');
    }
    return;
  }

  compareElements.block.removeAttribute('hidden');
  if (compareElements.clearButton instanceof HTMLElement) {
    compareElements.clearButton.removeAttribute('disabled');
  }

  const pinnedUsage = computeUsageMetrics(pinnedSnapshot.totals, pinnedSnapshot.capacity || {});
  const currentUsage = computeUsageMetrics(currentTotals, capacity);

  setComparisonColumn(compareElements.current, currentTotals, currentUsage, symbol);
  setComparisonColumn(compareElements.pinned, pinnedSnapshot.totals, pinnedUsage, pinnedSnapshot.symbol || symbol);

  if (compareElements.note instanceof HTMLElement) {
    if (!Number.isFinite(currentTotals?.net) || !Number.isFinite(pinnedSnapshot.totals?.net)) {
      setText(compareElements.note, '');
    } else if (pinnedSnapshot.symbol && pinnedSnapshot.symbol !== symbol) {
      setText(compareElements.note, 'Pinned mix uses a different currency. Compare amounts manually.');
    } else {
      const diff = currentTotals.net - pinnedSnapshot.totals.net;
      if (Math.abs(diff) < 1) {
        setText(compareElements.note, 'Current mix matches pinned net outcome.');
      } else if (diff > 0) {
        setText(compareElements.note, `Current mix is ${formatCurrency(symbol, diff)} ahead of pinned net.`);
      } else {
        setText(compareElements.note, `Current mix trails pinned net by ${formatCurrency(symbol, Math.abs(diff))}.`);
      }
    }
  }
}

function refreshPinControls(pinElements, pinnedSnapshot, currentFingerprint, hasActiveSchedule) {
  if (!pinElements || !(pinElements.pinButton instanceof HTMLElement)) {
    return;
  }

  const button = pinElements.pinButton;
  const clearButton = pinElements.clearButton instanceof HTMLElement ? pinElements.clearButton : null;

  if (!hasActiveSchedule) {
    button.setAttribute('disabled', '');
    button.setAttribute('aria-pressed', 'false');
    setText(button, 'Pin this mix');
  } else {
    button.removeAttribute('disabled');
    const isActive = Boolean(pinnedSnapshot && pinnedSnapshot.fingerprint && pinnedSnapshot.fingerprint === currentFingerprint);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (pinnedSnapshot) {
      setText(button, isActive ? 'Pinned mix active' : 'Update pin');
    } else {
      setText(button, 'Pin this mix');
    }
  }

  if (clearButton) {
    if (pinnedSnapshot) {
      clearButton.removeAttribute('disabled');
    } else {
      clearButton.setAttribute('disabled', '');
    }
  }
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

function updateTotals(elements, totals, symbol, capacity, mix) {
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

  const usage = computeUsageMetrics(data, capacity);

  const utilizationEl = elements.utilization;
  if (utilizationEl instanceof HTMLElement) {
    if (Number.isFinite(usage.utilizationPercent)) {
      setText(utilizationEl, formatPercentValue(usage.utilizationPercent));
    } else {
      setText(utilizationEl, '—');
    }
  }

  const utilizationViolationEl = elements.utilizationViolation instanceof HTMLElement
    ? elements.utilizationViolation
    : null;
  if (utilizationViolationEl) {
    const overDays = Number.isFinite(usage.serviceDays) && Number.isFinite(usage.billableDaysAfterTravel)
      ? usage.serviceDays - usage.billableDaysAfterTravel
      : null;
    if (Number.isFinite(overDays) && overDays > 0.5) {
      const overPerWeek = Number.isFinite(usage.workingWeeks) && usage.workingWeeks > 0
        ? overDays / usage.workingWeeks
        : null;
      if (Number.isFinite(overPerWeek) && overPerWeek > 0.05) {
        setText(utilizationViolationEl, `${formatCount(overPerWeek)} d/wk over plan`);
      } else {
        setText(utilizationViolationEl, `${formatCount(overDays)} days over plan`);
      }
    } else {
      setText(utilizationViolationEl, '');
    }
  }

  const travelEl = elements.travel;
  if (travelEl instanceof HTMLElement) {
    const parts = [];
    if (Number.isFinite(usage.travelDaysPerWeek) && usage.travelDaysPerWeek > 0.01) {
      parts.push(`${formatCount(usage.travelDaysPerWeek)} d/wk`);
    }
    if (Number.isFinite(usage.travelAllowancePercent)) {
      parts.push(`${formatPercentValue(usage.travelAllowancePercent)} of allowance`);
    }
    setText(travelEl, parts.length ? parts.join(' · ') : '—');
  }

  const travelViolationEl = elements.travelViolation instanceof HTMLElement
    ? elements.travelViolation
    : null;
  if (travelViolationEl) {
    const overTravel = Number.isFinite(usage.travelDays) && Number.isFinite(usage.travelAllowanceDays)
      ? usage.travelDays - usage.travelAllowanceDays
      : null;
    if (Number.isFinite(overTravel) && overTravel > 0.5) {
      const overPerWeek = Number.isFinite(usage.workingWeeks) && usage.workingWeeks > 0
        ? overTravel / usage.workingWeeks
        : null;
      if (Number.isFinite(overPerWeek) && overPerWeek > 0.05) {
        setText(travelViolationEl, `${formatCount(overPerWeek)} d/wk above allowance`);
      } else {
        setText(travelViolationEl, `${formatCount(overTravel)} days above allowance`);
      }
    } else {
      setText(travelViolationEl, '');
    }
  }

  renderPricingBadges(elements.pricingBadges, mix, symbol);
}

function renderPricingBadges(container, mix, symbol) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  container.textContent = '';
  container.dataset.empty = 'true';

  const entries = mix && typeof mix === 'object'
    ? Object.entries(mix)
    : [];

  if (!entries.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'pricing-badge__empty';
    setText(placeholder, '—');
    container.appendChild(placeholder);
    return;
  }

  const fragment = document.createDocumentFragment();
  let added = 0;

  entries.forEach(([id, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const fence = entry.pricingFence && typeof entry.pricingFence === 'object'
      ? entry.pricingFence
      : null;
    if (!fence) {
      return;
    }

    const summary = describePricingFenceStatus(
      {
        status: fence.status,
        delta: fence.delta,
        price: Number.isFinite(entry.pricePerUnit) ? entry.pricePerUnit : null,
        fences: {
          min: fence.min,
          target: fence.target,
          stretch: fence.stretch
        }
      },
      { symbol }
    );

    if (!summary || summary.status === 'unknown') {
      return;
    }

    const badge = document.createElement('span');
    badge.className = 'pricing-badge portfolio-pricing-badge';
    if (summary.tone) {
      badge.classList.add(`pricing-badge--${summary.tone}`);
    }

    const serviceName = serviceCopy[id]?.title || id;
    const detailText = summary.detail ? ` ${summary.detail}` : '';
    setText(badge, `${serviceName}: ${summary.label}${detailText}`);
    badge.dataset.service = id;

    if (summary.tooltip) {
      badge.dataset.tooltip = summary.tooltip;
    }

    if (summary.ariaLabel) {
      badge.setAttribute('aria-label', `${serviceName} pricing. ${summary.ariaLabel}`);
    } else {
      badge.setAttribute('aria-label', `${serviceName} pricing ${summary.label}`);
    }

    fragment.appendChild(badge);
    added += 1;
  });

  if (!added) {
    const placeholder = document.createElement('span');
    placeholder.className = 'pricing-badge__empty';
    setText(placeholder, '—');
    container.appendChild(placeholder);
    return;
  }

  container.appendChild(fragment);
  container.dataset.empty = 'false';
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
  const fatigueContainer = container.querySelector('[data-travel-fatigue]');
  const travelDaysEl = container.querySelector('[data-travel-days]');
  const travelLimitEl = container.querySelector('[data-travel-limit]');
  const travelFrictionEl = container.querySelector('[data-travel-friction]');
  const travelMultiplierEl = container.querySelector('[data-travel-multiplier]');
  const fatigueSummaryEl = container.querySelector('[data-travel-fatigue-summary]');

  container.classList.remove('is-high', 'is-medium', 'is-low', 'is-unknown');

  if (!comfort || !Number.isFinite(comfort.score)) {
    container.classList.add('is-unknown');
    container.setAttribute('aria-busy', 'true');
    if (valueEl) {
      setText(valueEl, translate('portfolio.comfort.valueUnavailable') || 'N/A');
    }
    if (summaryEl) {
      setText(summaryEl, translate('portfolio.comfort.loadingSummary') || 'Comfort score will appear once the solver runs.');
    }
    if (fillEl instanceof HTMLElement) {
      fillEl.style.width = '0%';
    }
    if (fatigueContainer instanceof HTMLElement) {
      fatigueContainer.classList.add('is-empty');
      if (travelDaysEl) {
        setText(travelDaysEl, '—');
      }
      if (travelLimitEl) {
        setText(travelLimitEl, '—');
      }
      if (travelFrictionEl) {
        setText(travelFrictionEl, '—');
      }
      if (travelMultiplierEl) {
        setText(travelMultiplierEl, '—');
      }
      if (fatigueSummaryEl) {
        setText(
          fatigueSummaryEl,
          translate('portfolio.comfort.travelUnavailable')
            || 'Travel fatigue indicators will appear once optimization data is ready.'
        );
      }
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
    let summaryText = comfort.summary || translate('portfolio.comfort.readyFallback') || 'Comfort summary ready.';

    if (typeof comfort.summaryKey === 'string') {
      const key = comfort.summaryKey;
      if (key === 'portfolio.comfort.summary.focusSingle') {
        const factor = comfort.summaryArgs?.factor;
        const label = formatFlagList([factor]);
        summaryText = translate(key, { factor: label }) || summaryText;
      } else if (key === 'portfolio.comfort.summary.focusMultiple') {
        const factors = Array.isArray(comfort.summaryArgs?.factors) ? comfort.summaryArgs.factors : [];
        const label = formatFlagList(factors);
        summaryText = translate(key, { factors: label }) || summaryText;
      } else {
        summaryText = translate(key) || summaryText;
      }
    }

    setText(summaryEl, summaryText);
  }

  if (fatigueContainer instanceof HTMLElement) {
    const fatigue = evaluateTravelFatigue(comfort.components || {});
    const hasData = fatigue.used !== null || fatigue.limit !== null || fatigue.factor !== null;

    fatigueContainer.classList.toggle('is-empty', !hasData);

    if (travelDaysEl) {
      const label = formatTravelDaysValue(fatigue.used);
      setText(travelDaysEl, label);
    }

    if (travelLimitEl) {
      const limitLabel = formatTravelDaysValue(fatigue.limit);
      setText(travelLimitEl, limitLabel);
    }

    if (travelFrictionEl) {
      setText(travelFrictionEl, formatTravelFrictionPercent(fatigue.factor));
    }

    if (travelMultiplierEl) {
      setText(travelMultiplierEl, formatTravelMultiplier(fatigue.multiplier));
    }

    if (fatigueSummaryEl) {
      const summaryKey = `portfolio.comfort.travelSummary.${fatigue.level || 'unknown'}`;
      const fatigueSummary = translate(summaryKey)
        || translate('portfolio.comfort.travelUnavailable')
        || 'Travel fatigue indicators will appear once optimization data is ready.';
      setText(fatigueSummaryEl, fatigueSummary);
    }
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
    net: qs('#p-net', section),
    utilization: qs('#p-utilization', section),
    utilizationViolation: qs('#p-utilization-violation', section),
    travel: qs('#p-travel', section),
    travelViolation: qs('#p-travel-violation', section),
    pricingBadges: qs('#p-pricing-badges', section)
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

  const pinButton = qs('#portfolio-pin', section);
  const clearPinButton = qs('#portfolio-clear-pin', section);
  const compareElements = {
    block: qs('#portfolio-compare', section),
    note: qs('#portfolio-compare-note', section),
    clearButton: clearPinButton,
    current: {
      revenue: qs('#compare-current-rev', section),
      cost: qs('#compare-current-cost', section),
      tax: qs('#compare-current-tax', section),
      net: qs('#compare-current-net', section),
      utilization: qs('#compare-current-utilization', section),
      travel: qs('#compare-current-travel', section)
    },
    pinned: {
      revenue: qs('#compare-pinned-rev', section),
      cost: qs('#compare-pinned-cost', section),
      tax: qs('#compare-pinned-tax', section),
      net: qs('#compare-pinned-net', section),
      utilization: qs('#compare-pinned-utilization', section),
      travel: qs('#compare-pinned-travel', section)
    }
  };
  const pinControls = { pinButton, clearButton: clearPinButton };

  const store = calcState && typeof calcState === 'object' ? calcState : {};
  const subscribe = typeof store.subscribe === 'function' ? store.subscribe.bind(store) : null;
  const getState = typeof store.get === 'function' ? store.get.bind(store) : null;
  const getDerived = typeof store.getDerived === 'function' ? store.getDerived.bind(store) : null;

  let lastViolationSummary = '';
  let pinnedSnapshot = null;
  let latestPortfolio = null;
  let latestTotals = null;
  let latestCapacity = null;
  let latestSymbol = getCurrencySymbol(typeof getState === 'function' ? getState() : null);
  let latestSchedule = { hasData: false, days: [] };
  let latestFingerprint = '';

  const cleanups = [];

  if (pinButton instanceof HTMLElement) {
    const handlePinClick = () => {
      if (!latestPortfolio || !latestSchedule?.hasData) {
        return;
      }
      const snapshot = createPinnedSnapshot(latestPortfolio, latestCapacity || {}, latestSymbol);
      if (!snapshot) {
        announce('Unable to pin the current mix.', { politeness: 'assertive' });
        return;
      }
      pinnedSnapshot = snapshot;
      updateComparison(compareElements, pinnedSnapshot, latestTotals || {}, latestCapacity || {}, latestSymbol);
      refreshPinControls(pinControls, pinnedSnapshot, latestFingerprint, latestSchedule?.hasData);
      announce('Pinned current mix for comparison.');
    };
    pinButton.addEventListener('click', handlePinClick);
    cleanups.push(() => pinButton.removeEventListener('click', handlePinClick));
  }

  if (clearPinButton instanceof HTMLElement) {
    const handleClear = () => {
      if (!pinnedSnapshot) {
        return;
      }
      pinnedSnapshot = null;
      updateComparison(compareElements, pinnedSnapshot, latestTotals || {}, latestCapacity || {}, latestSymbol);
      refreshPinControls(pinControls, pinnedSnapshot, latestFingerprint, latestSchedule?.hasData);
      announce('Cleared pinned mix.');
    };
    clearPinButton.addEventListener('click', handleClear);
    cleanups.push(() => clearPinButton.removeEventListener('click', handleClear));
  }

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
    latestPortfolio = portfolio;
    latestTotals = totals;
    latestCapacity = capacity;
    latestSymbol = symbol;

    updateTotals(totalsElements, totals, symbol, capacity, portfolio ? portfolio.mix : null);
    updateBufferSummary(bufferElements, totals);
    updateStatus(statusElement, totals, symbol);
    updateComfortIndicator(comfortElement, portfolio ? portfolio.comfort : null);
    const schedule = buildScheduleModel(portfolio ? portfolio.mix : null, totals, capacity);
    latestSchedule = schedule;
    renderWeeklyPlan(weekList, schedule);

    const fingerprint = computeMixFingerprint(portfolio ? portfolio.mix : null);
    latestFingerprint = fingerprint;

    updateComparison(compareElements, pinnedSnapshot, totals || {}, capacity || {}, symbol);
    refreshPinControls(pinControls, pinnedSnapshot, fingerprint, schedule?.hasData);

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

  let unsubscribe = null;
  if (typeof subscribe === 'function') {
    unsubscribe = subscribe((nextState, derivedState) => {
      runUpdate(nextState, derivedState);
    });
  }

  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    cleanups.forEach(fn => {
      if (typeof fn === 'function') {
        fn();
      }
    });
  };
}
