import {
  get,
  patch,
  subscribe,
  parseNumber,
  setTargetNetBasis,
  setIncomeTargetValue,
  setMonthsOff,
  setWeeksOffCycle,
  setDaysOffWeek,
  setTaxRatePercent,
  setVariableCostPerClass,
  setVatRatePercent,
  setBufferPercent,
  setCurrencySymbol,
  TARGET_NET_BASIS_VALUES,
  BASE_WORK_DAYS_PER_WEEK
} from '../state.js';
import { deriveCapacity } from '../capacity.js';
import { deriveTargetNetDefaults, deriveIncomeTargets } from '../income.js';
import { computeCosts } from '../costs.js';

export function initializeCalculatorUI() {
  const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const controls = {
    targetNet: document.getElementById('target-net'),
    targetNetWeek: document.getElementById('target-net-week'),
    targetNetMonth: document.getElementById('target-net-month'),
    targetNetAverageWeek: document.getElementById('target-net-average-week'),
    targetNetAverageMonth: document.getElementById('target-net-average-month'),
    taxRate: document.getElementById('tax-rate'),
    fixedCosts: document.getElementById('fixed-costs'),
    variableCostPerClass: document.getElementById('variable-cost-class'),
    vatRate: document.getElementById('vat-rate'),
    monthsOff: document.getElementById('months-off'),
    weeksOffCycle: document.getElementById('weeks-off-cycle'),
    daysOffWeek: document.getElementById('days-off-week'),
    buffer: document.getElementById('buffer'),
    currencySymbol: document.getElementById('currency-symbol'),
    recalcButton: document.getElementById('recalculate'),
    downloadCsv: document.getElementById('download-csv'),
    statusMessage: document.getElementById('status-message'),
    workingWeeksDisplay: document.getElementById('working-weeks-display'),
    workingDaysDisplay: document.getElementById('working-days-display'),
    rememberInputs: document.getElementById('remember-inputs'),
    resetSavedInputs: document.getElementById('reset-saved-inputs')
  };

  const tablesContainer = document.getElementById('tables-container');
  const assumptionsList = document.getElementById('assumptions-list');

  const TARGET_NET_BASIS_BY_INPUT_ID = {
    'target-net': 'year',
    'target-net-week': 'week',
    'target-net-month': 'month',
    'target-net-average-week': 'avgWeek',
    'target-net-average-month': 'avgMonth'
  };

  const fixedCostFields = {
    location: {
      monthly: document.getElementById('fixed-cost-location-monthly'),
      annual: document.getElementById('fixed-cost-location-annual')
    },
    insurance: {
      monthly: document.getElementById('fixed-cost-insurance-monthly'),
      annual: document.getElementById('fixed-cost-insurance-annual')
    },
    disability: {
      monthly: document.getElementById('fixed-cost-disability-monthly'),
      annual: document.getElementById('fixed-cost-disability-annual')
    },
    health: {
      monthly: document.getElementById('fixed-cost-health-monthly'),
      annual: document.getElementById('fixed-cost-health-annual')
    },
    pension: {
      monthly: document.getElementById('fixed-cost-pension-monthly'),
      annual: document.getElementById('fixed-cost-pension-annual')
    },
    marketing: {
      monthly: document.getElementById('fixed-cost-marketing-monthly'),
      annual: document.getElementById('fixed-cost-marketing-annual')
    },
    materials: {
      monthly: document.getElementById('fixed-cost-materials-monthly'),
      annual: document.getElementById('fixed-cost-materials-annual')
    },
    admin: {
      monthly: document.getElementById('fixed-cost-admin-monthly'),
      annual: document.getElementById('fixed-cost-admin-annual')
    },
    development: {
      monthly: document.getElementById('fixed-cost-development-monthly'),
      annual: document.getElementById('fixed-cost-development-annual')
    }
  };

  const rememberInputsToggle = controls.rememberInputs instanceof HTMLInputElement ? controls.rememberInputs : null;
  const resetSavedInputsButton = controls.resetSavedInputs instanceof HTMLButtonElement ? controls.resetSavedInputs : null;

  const PERSISTENCE_ENABLED_KEY = 'zzp-calc-save-enabled';
  const PERSISTENCE_VALUES_KEY = 'zzp-calc-saved-inputs';
  const PERSISTED_TARGET_NET_BASIS_KEY = '__targetNetBasis';

  let calcState = get();
  let latestResults = [];
  let persistenceEnabled = false;
  let persistableInputsCache = null;
  let tablesLayoutUpdateScheduled = false;
  let defaultInputValues = null;

  const unsubscribe = subscribe(nextState => {
    calcState = nextState;
    const views = deriveCalcViews(calcState);
    applyCalcStateToControls(calcState, views);
    renderDerivedViews(calcState, views);
  });

  const initialViews = deriveCalcViews(calcState);
  applyCalcStateToControls(calcState, initialViews);
  renderDerivedViews(calcState, initialViews);
  defaultInputValues = captureInputValues();

  setupPersistence();
  setupControlListeners();
  initializeCalcStateFromControls();

  return unsubscribe;

  function deriveCalcViews(state) {
    const capacity = deriveCapacity(state.capacity);
    const defaults = deriveTargetNetDefaults(capacity);
    const income = deriveIncomeTargets(state, capacity);
    const costs = computeCosts(state, capacity);
    return { capacity, defaults, income, costs };
  }

  function formatFixed(value, fractionDigits = 1) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return Number(value).toFixed(fractionDigits);
  }

  function formatCurrency(symbol, value) {
    if (!Number.isFinite(value)) {
      return `${symbol}0`;
    }
    const rounded = Math.round(value);
    const formatted = numberFormatter.format(Math.abs(rounded));
    return rounded < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  }

  function getFixedCostTotal() {
    return Object.values(fixedCostFields).reduce((sum, fieldSet) => {
      if (!(fieldSet.annual instanceof HTMLInputElement)) {
        return sum;
      }
      const annualValue = Math.max(parseNumber(fieldSet.annual.value, 0), 0);
      return sum + annualValue;
    }, 0);
  }

  function updateFixedCostTotalDisplay() {
    const total = getFixedCostTotal();
    const normalized = Math.max(total, 0);
    patch({
      costs: { fixedCosts: normalized }
    });
    if (controls.fixedCosts instanceof HTMLInputElement) {
      controls.fixedCosts.value = formatFixed(normalized, 2);
    }
    return normalized;
  }

  function syncFixedCostPair(key, sourceType) {
    const fieldSet = fixedCostFields[key];
    if (!fieldSet) {
      return;
    }
    const source = sourceType === 'monthly' ? fieldSet.monthly : fieldSet.annual;
    const target = sourceType === 'monthly' ? fieldSet.annual : fieldSet.monthly;
    if (!(source instanceof HTMLInputElement) || !(target instanceof HTMLInputElement)) {
      return;
    }

    if (source.value === '') {
      target.value = '';
      updateFixedCostTotalDisplay();
      return;
    }

    const parsed = Math.max(parseNumber(source.value, 0), 0);
    const derived = sourceType === 'monthly' ? parsed * 12 : parsed / 12;

    if (Number.isFinite(derived)) {
      target.value = formatFixed(derived, 2);
    }

    if (persistenceEnabled) {
      savePersistedInputs();
    }

    updateFixedCostTotalDisplay();
  }

  function updateTablesLayout() {
    if (!tablesContainer) {
      return;
    }

    const cards = tablesContainer.querySelectorAll('.card');
    if (cards.length <= 1) {
      tablesContainer.classList.remove('table-grid--stacked');
      return;
    }

    const hasOverflow = tablesContainer.scrollWidth > tablesContainer.clientWidth + 1;
    tablesContainer.classList.toggle('table-grid--stacked', hasOverflow);
  }

  function scheduleTablesLayoutUpdate() {
    if (!tablesContainer || tablesLayoutUpdateScheduled) {
      return;
    }

    tablesLayoutUpdateScheduled = true;
    requestAnimationFrame(() => {
      tablesLayoutUpdateScheduled = false;
      updateTablesLayout();
    });
  }

  function applyCalcStateToControls(state, views = {}) {
    const { capacity = {}, income = {} } = views;
    const basis = income.basis || state.incomeTargets.basis;

    if (controls.targetNet instanceof HTMLInputElement) {
      const yearValue = Number.isFinite(income.targetNet) ? income.targetNet : state.incomeTargets.year;
      controls.targetNet.value = yearValue == null || !Number.isFinite(yearValue)
        ? ''
        : formatFixed(Math.max(yearValue || 0, 0), 2);
    }

    if (controls.targetNetWeek instanceof HTMLInputElement) {
      const displayValue = basis === 'week' ? state.incomeTargets.week : income.targetNetPerWeek;
      controls.targetNetWeek.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetMonth instanceof HTMLInputElement) {
      const displayValue = basis === 'month' ? state.incomeTargets.month : income.targetNetPerMonth;
      controls.targetNetMonth.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetAverageWeek instanceof HTMLInputElement) {
      const displayValue = basis === 'avgWeek'
        ? state.incomeTargets.averageWeek
        : income.targetNetAveragePerWeek;
      controls.targetNetAverageWeek.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetAverageMonth instanceof HTMLInputElement) {
      const displayValue = basis === 'avgMonth'
        ? state.incomeTargets.averageMonth
        : income.targetNetAveragePerMonth;
      controls.targetNetAverageMonth.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.taxRate instanceof HTMLInputElement) {
      controls.taxRate.value = formatFixed(state.costs.taxRatePercent ?? 40, 1);
    }

    if (controls.variableCostPerClass instanceof HTMLInputElement) {
      const value = state.costs.variableCostPerClass;
      controls.variableCostPerClass.value = Number.isFinite(value)
        ? formatFixed(value, 2)
        : formatFixed(0, 2);
    }

    if (controls.vatRate instanceof HTMLInputElement) {
      controls.vatRate.value = formatFixed(state.costs.vatRatePercent ?? 21, 1);
    }

    if (controls.monthsOff instanceof HTMLInputElement) {
      controls.monthsOff.value = formatFixed(state.capacity.monthsOff ?? 0, 2);
    }

    if (controls.weeksOffCycle instanceof HTMLInputElement) {
      controls.weeksOffCycle.value = formatFixed(state.capacity.weeksOffCycle ?? 0, 2);
    }

    if (controls.daysOffWeek instanceof HTMLInputElement) {
      controls.daysOffWeek.value = formatFixed(state.capacity.daysOffWeek ?? 0, 2);
    }

    if (controls.buffer instanceof HTMLInputElement) {
      controls.buffer.value = formatFixed(state.costs.bufferPercent ?? 15, 1);
    }

    if (controls.currencySymbol instanceof HTMLInputElement) {
      controls.currencySymbol.value = state.config.currencySymbol || '€';
    }

    if (controls.workingWeeksDisplay) {
      const value = Number.isFinite(capacity.workingWeeks) ? capacity.workingWeeks : 0;
      controls.workingWeeksDisplay.textContent = formatFixed(value, 2);
    }

    if (controls.workingDaysDisplay) {
      const value = Number.isFinite(capacity.workingDaysPerYear) ? capacity.workingDaysPerYear : 0;
      controls.workingDaysDisplay.textContent = formatFixed(value, 2);
    }
  }

  function computeRevenueSummary(inputs) {
    const {
      targetNet,
      taxRate,
      fixedCosts,
      annualVariableCosts,
      buffer,
      bufferPercent,
      workingWeeks,
      activeMonths,
      workingDaysPerYear
    } = inputs;

    const effectiveTaxRate = Math.min(Math.max(taxRate, 0), 0.99);
    const denominator = Math.max(1 - effectiveTaxRate, 0.0001);
    const profitBeforeTax = targetNet / denominator;
    const baseRevenue = profitBeforeTax + fixedCosts + annualVariableCosts;
    const bufferedRevenue = baseRevenue * (1 + buffer);

    const monthlyBase = Number.isFinite(activeMonths) && activeMonths > 0 ? baseRevenue / activeMonths : null;
    const monthlyBuffered = Number.isFinite(activeMonths) && activeMonths > 0 ? bufferedRevenue / activeMonths : null;
    const weeklyBase = Number.isFinite(workingWeeks) && workingWeeks > 0 ? baseRevenue / workingWeeks : null;
    const weeklyBuffered = Number.isFinite(workingWeeks) && workingWeeks > 0 ? bufferedRevenue / workingWeeks : null;
    const dailyBase = Number.isFinite(workingDaysPerYear) && workingDaysPerYear > 0
      ? baseRevenue / workingDaysPerYear
      : null;
    const dailyBuffered = Number.isFinite(workingDaysPerYear) && workingDaysPerYear > 0
      ? bufferedRevenue / workingDaysPerYear
      : null;

    return {
      baseRevenue,
      bufferedRevenue,
      bufferPercent,
      monthlyBase,
      monthlyBuffered,
      weeklyBase,
      weeklyBuffered,
      dailyBase,
      dailyBuffered
    };
  }

  function buildRevenueSummaryTable(summary, currencySymbol, inputs) {
    if (!summary || !Number.isFinite(summary.baseRevenue)) {
      return `
        <div class="card">
          <p class="status-message">Enter your income targets and costs to see the revenue summary.</p>
        </div>
      `;
    }

    const rows = [
      {
        label: 'Annual total',
        base: summary.baseRevenue,
        buffered: summary.bufferedRevenue,
        basis: 'Includes fixed costs and estimated variable costs before applying the safety margin.'
      },
      {
        label: 'Active month',
        base: summary.monthlyBase,
        buffered: summary.monthlyBuffered,
        basis: Number.isFinite(inputs.activeMonths) && inputs.activeMonths > 0
          ? `Based on ≈ ${formatFixed(inputs.activeMonths, 2)} active months / year`
          : '—'
      },
      {
        label: 'Active week',
        base: summary.weeklyBase,
        buffered: summary.weeklyBuffered,
        basis: Number.isFinite(inputs.workingWeeks) && inputs.workingWeeks > 0
          ? `Based on ≈ ${formatFixed(inputs.workingWeeks, 2)} active weeks / year`
          : '—'
      },
      {
        label: 'Active day',
        base: summary.dailyBase,
        buffered: summary.dailyBuffered,
        basis: Number.isFinite(inputs.workingDaysPerYear) && inputs.workingDaysPerYear > 0
          ? `Based on ≈ ${formatFixed(inputs.workingDaysPerYear, 2)} active days / year`
          : '—'
      }
    ];

    const rowsMarkup = rows
      .map(row => {
        const baseDisplay = Number.isFinite(row.base) ? formatCurrency(currencySymbol, row.base) : '—';
        const bufferedDisplay = Number.isFinite(row.buffered) ? formatCurrency(currencySymbol, row.buffered) : '—';
        return `
            <tr>
              <th scope="row">${row.label}</th>
              <td>${baseDisplay}</td>
              <td>${bufferedDisplay}</td>
              <td>${row.basis}</td>
            </tr>
          `;
      })
      .join('');

    const bufferLabel = Number.isFinite(summary.bufferPercent) ? formatFixed(summary.bufferPercent, 1) : '0';

    return `
        <div class="card">
          <table>
            <caption>
              Gross revenue needed (base vs. safety margin +${bufferLabel}%)
            </caption>
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Base revenue</th>
                <th scope="col">With margin</th>
                <th scope="col">Basis</th>
              </tr>
            </thead>
            <tbody>
              ${rowsMarkup}
            </tbody>
          </table>
        </div>
      `;
  }

  function extractInputsFromViews(views) {
    const { capacity, income, costs } = views;
    return {
      targetNet: income.targetNet,
      targetNetPerWeek: income.targetNetPerWeek,
      targetNetPerMonth: income.targetNetPerMonth,
      targetNetAveragePerWeek: income.targetNetAveragePerWeek,
      targetNetAveragePerMonth: income.targetNetAveragePerMonth,
      taxRate: costs.taxRate,
      fixedCosts: costs.fixedCosts,
      variableCostPerClass: costs.variableCostPerClass,
      vatRate: costs.vatRate,
      annualVariableCosts: costs.annualVariableCosts,
      workingWeeks: capacity.workingWeeks,
      buffer: costs.buffer,
      bufferPercent: costs.bufferPercent,
      currencySymbol: costs.currencySymbol,
      monthsOff: capacity.monthsOff,
      weeksOffPerCycle: capacity.weeksOffPerCycle,
      daysOffPerWeek: capacity.daysOffPerWeek,
      workingDaysPerWeek: capacity.workingDaysPerWeek,
      workingDaysPerYear: capacity.workingDaysPerYear,
      activeMonths: capacity.activeMonths,
      activeMonthShare: capacity.activeMonthShare,
      weeksShare: capacity.weeksShare
    };
  }

  function renderAssumptions(inputs, summary) {
    if (!assumptionsList) {
      return;
    }

    const {
      currencySymbol,
      targetNet,
      targetNetPerWeek,
      targetNetPerMonth,
      targetNetAveragePerWeek,
      targetNetAveragePerMonth,
      taxRate,
      fixedCosts,
      variableCostPerClass,
      annualVariableCosts,
      monthsOff,
      activeMonths,
      activeMonthShare,
      weeksOffPerCycle,
      weeksShare,
      daysOffPerWeek,
      workingDaysPerWeek,
      workingDaysPerYear,
      workingWeeks,
      bufferPercent,
      vatRate
    } = inputs;

    const activeMonthPercentage = activeMonthShare * 100;
    const workingWeeksPerCycle = 4 - weeksOffPerCycle;
    const activeWeeksPercentage = weeksShare * 100;

    const targetPerWeekDisplay = Number.isFinite(targetNetPerWeek)
      ? formatCurrency(currencySymbol, targetNetPerWeek)
      : '—';
    const targetPerMonthDisplay = Number.isFinite(targetNetPerMonth)
      ? formatCurrency(currencySymbol, targetNetPerMonth)
      : '—';
    const targetAveragePerWeekDisplay = Number.isFinite(targetNetAveragePerWeek)
      ? formatCurrency(currencySymbol, targetNetAveragePerWeek)
      : '—';
    const targetAveragePerMonthDisplay = Number.isFinite(targetNetAveragePerMonth)
      ? formatCurrency(currencySymbol, targetNetAveragePerMonth)
      : '—';

    const listItems = [];

    if (summary && Number.isFinite(summary.baseRevenue)) {
      const baseDisplay = formatCurrency(currencySymbol, summary.baseRevenue);
      const bufferedDisplay = Number.isFinite(summary.bufferedRevenue)
        ? formatCurrency(currencySymbol, summary.bufferedRevenue)
        : '—';
      listItems.push(`Gross revenue needed: ${baseDisplay} (with margin: ${bufferedDisplay})`);
    }

    listItems.push(
      `Net income per year: ${formatCurrency(currencySymbol, targetNet)}`,
      `Net income per active week: ${targetPerWeekDisplay}`,
      `Net income per active month: ${targetPerMonthDisplay}`,
      `Average weekly net income: ${targetAveragePerWeekDisplay}`,
      `Average monthly net income: ${targetAveragePerMonthDisplay}`,
      `Effective income tax rate: ${formatFixed(taxRate * 100, 1)}%`,
      `Fixed annual costs: ${formatCurrency(currencySymbol, fixedCosts)}`,
      `Variable cost per working day: ${formatCurrency(currencySymbol, variableCostPerClass)}`,
      `Estimated annual variable costs: ${formatCurrency(currencySymbol, annualVariableCosts)}`,
      `Months off per year: ${formatFixed(monthsOff, 2)} (≈ ${formatFixed(activeMonths, 2)} active months; ${formatFixed(activeMonthPercentage, 1)}% of the year)`,
      `Weeks off per 4-week cycle: ${formatFixed(weeksOffPerCycle, 2)} (≈ ${formatFixed(workingWeeksPerCycle, 2)} working weeks each cycle; ${formatFixed(activeWeeksPercentage, 1)}% active weeks)`,
      `Days off per week: ${formatFixed(daysOffPerWeek, 2)} (≈ ${formatFixed(workingDaysPerWeek, 2)} working days when active)`,
      `Estimated working weeks per year: ${formatFixed(workingWeeks, 2)}`,
      `Estimated working days per year: ${formatFixed(workingDaysPerYear, 2)}`,
      `Safety margin applied to revenue: ${formatFixed(bufferPercent, 1)}%`,
      `VAT rate: ${formatFixed(vatRate * 100, 1)}%`,
      `Currency symbol: ${currencySymbol}`,
      'Values are rounded to whole currency units for display and CSV export.'
    );

    assumptionsList.innerHTML = listItems.map(item => `<li>${item}</li>`).join('');
  }

  function renderDerivedViews(state, views) {
    const inputs = extractInputsFromViews(views);
    const summary = computeRevenueSummary(inputs);

    if (summary && Number.isFinite(summary.baseRevenue)) {
      latestResults = [
        {
          label: 'Annual total',
          base: summary.baseRevenue,
          buffered: summary.bufferedRevenue,
          basis: 'Includes fixed and estimated variable costs.'
        },
        {
          label: 'Active month',
          base: summary.monthlyBase,
          buffered: summary.monthlyBuffered,
          basis: Number.isFinite(inputs.activeMonths) && inputs.activeMonths > 0
            ? `≈ ${formatFixed(inputs.activeMonths, 2)} active months`
            : '—'
        },
        {
          label: 'Active week',
          base: summary.weeklyBase,
          buffered: summary.weeklyBuffered,
          basis: Number.isFinite(inputs.workingWeeks) && inputs.workingWeeks > 0
            ? `≈ ${formatFixed(inputs.workingWeeks, 2)} active weeks`
            : '—'
        },
        {
          label: 'Active day',
          base: summary.dailyBase,
          buffered: summary.dailyBuffered,
          basis: Number.isFinite(inputs.workingDaysPerYear) && inputs.workingDaysPerYear > 0
            ? `≈ ${formatFixed(inputs.workingDaysPerYear, 2)} active days`
            : '—'
        }
      ];
    } else {
      latestResults = [];
    }

    if (tablesContainer) {
      const tableMarkup = buildRevenueSummaryTable(summary, inputs.currencySymbol, inputs);
      tablesContainer.innerHTML = tableMarkup;
      scheduleTablesLayoutUpdate();
    }

    renderAssumptions(inputs, summary);
  }

  function handleDownloadCsv() {
    if (!latestResults.length) {
      if (controls.statusMessage) {
        controls.statusMessage.textContent = 'Calculate the revenue summary before exporting CSV.';
        setTimeout(() => {
          if (controls.statusMessage) {
            controls.statusMessage.textContent = '';
          }
        }, 2500);
      }
      return;
    }

    const header = 'Target,Base gross revenue,With margin,Basis';
    const rows = latestResults.map(entry => {
      const base = Number.isFinite(entry.base) ? Math.round(entry.base) : '';
      const buffered = Number.isFinite(entry.buffered) ? Math.round(entry.buffered) : '';
      const basis = entry.basis ? entry.basis.replace(/,/g, ';') : '';
      return [entry.label, base, buffered, basis].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `business-revenue-summary-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (controls.statusMessage) {
      controls.statusMessage.textContent = 'CSV download started. File lists base and buffered gross revenue targets.';
      setTimeout(() => {
        if (controls.statusMessage) {
          controls.statusMessage.textContent = '';
        }
      }, 2500);
    }
  }

  function getPersistableInputs() {
    if (persistableInputsCache) {
      return persistableInputsCache;
    }
    const container = document.querySelector('.card.controls');
    if (!(container instanceof HTMLElement)) {
      persistableInputsCache = [];
      return persistableInputsCache;
    }
    persistableInputsCache = Array.from(container.querySelectorAll('input')).filter(input => {
      return input instanceof HTMLInputElement && input.type !== 'button' && input.id !== 'remember-inputs';
    });
    return persistableInputsCache;
  }

  function captureInputValues(inputs = getPersistableInputs()) {
    const values = inputs.reduce((accumulator, input) => {
      if (!(input instanceof HTMLInputElement) || !input.id) {
        return accumulator;
      }
      if (input.type === 'checkbox' || input.type === 'radio') {
        accumulator[input.id] = input.checked;
      } else {
        accumulator[input.id] = input.value;
      }
      return accumulator;
    }, {});
    values[PERSISTED_TARGET_NET_BASIS_KEY] = calcState.incomeTargets.basis;
    return values;
  }

  function readPersistenceEnabled() {
    try {
      return localStorage.getItem(PERSISTENCE_ENABLED_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function readPersistedValues() {
    try {
      const raw = localStorage.getItem(PERSISTENCE_VALUES_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return null;
  }

  function savePersistedInputs(overrides = {}) {
    if (!persistenceEnabled) {
      return;
    }
    try {
      const values = captureInputValues();
      Object.assign(values, overrides);
      localStorage.setItem(PERSISTENCE_VALUES_KEY, JSON.stringify(values));
      localStorage.setItem(PERSISTENCE_ENABLED_KEY, 'true');
    } catch (error) {
      persistenceEnabled = false;
      if (rememberInputsToggle) {
        rememberInputsToggle.checked = false;
      }
    }
  }

  function clearPersistedInputs() {
    try {
      localStorage.removeItem(PERSISTENCE_VALUES_KEY);
      localStorage.removeItem(PERSISTENCE_ENABLED_KEY);
    } catch (error) {
      // Ignore storage errors
    }
  }

  function applyInputValues(values, options = {}) {
    const { skipStateUpdate = false } = options;
    if (!values || typeof values !== 'object') {
      return;
    }

    const storedBasis = values[PERSISTED_TARGET_NET_BASIS_KEY];
    if (typeof storedBasis === 'string' && TARGET_NET_BASIS_VALUES.includes(storedBasis)) {
      setTargetNetBasis(storedBasis);
    }

    const inputs = getPersistableInputs();
    inputs.forEach(input => {
      if (!(input instanceof HTMLInputElement) || !input.id) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(values, input.id)) {
        return;
      }
      const storedValue = values[input.id];
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = Boolean(storedValue);
      } else {
        input.value = storedValue === null || typeof storedValue === 'undefined'
          ? ''
          : String(storedValue);
      }
    });

    if (!skipStateUpdate) {
      initializeCalcStateFromControls();
    }
  }

  function handlePersistableInputMutation(event) {
    if (!(event && event.target instanceof HTMLInputElement)) {
      return;
    }

    const control = event.target;
    const basis = TARGET_NET_BASIS_BY_INPUT_ID[control.id];

    const persistenceOverrides = {};
    if (basis) {
      persistenceOverrides[PERSISTED_TARGET_NET_BASIS_KEY] = basis;
    }

    if (persistenceEnabled) {
      savePersistedInputs(persistenceOverrides);
    }

    if (basis) {
      setTargetNetBasis(basis);
    }

    commitControlValueToState(control);
  }

  function handlePersistToggleChange(event) {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    persistenceEnabled = event.target.checked;

    if (persistenceEnabled) {
      savePersistedInputs();
    } else {
      clearPersistedInputs();
    }
  }

  function initializePersistence() {
    if (rememberInputsToggle) {
      rememberInputsToggle.checked = readPersistenceEnabled();
      persistenceEnabled = rememberInputsToggle.checked;
    } else {
      persistenceEnabled = false;
    }

    const storedValues = persistenceEnabled ? readPersistedValues() : null;
    if (storedValues) {
      applyInputValues(storedValues);
    }

    if (rememberInputsToggle) {
      rememberInputsToggle.addEventListener('change', handlePersistToggleChange);
    }

    if (resetSavedInputsButton) {
      resetSavedInputsButton.addEventListener('click', () => {
        clearPersistedInputs();
        persistenceEnabled = false;
        if (rememberInputsToggle) {
          rememberInputsToggle.checked = false;
        }

        const defaults = defaultInputValues
          ? { ...defaultInputValues }
          : captureInputValues();

        applyInputValues(defaults, { skipStateUpdate: true });
        initializeCalcStateFromControls();
      });
    }
  }

  function commitControlValueToState(control) {
    if (!(control instanceof HTMLInputElement) || !control.id) {
      return;
    }

    if (TARGET_NET_BASIS_BY_INPUT_ID[control.id]) {
      const keyMap = {
        'target-net': 'year',
        'target-net-week': 'week',
        'target-net-month': 'month',
        'target-net-average-week': 'averageWeek',
        'target-net-average-month': 'averageMonth'
      };
      const key = keyMap[control.id];
      if (key) {
        setIncomeTargetValue(key, control.value);
      }
      return;
    }

    switch (control.id) {
      case 'months-off':
        setMonthsOff(control.value);
        break;
      case 'weeks-off-cycle':
        setWeeksOffCycle(control.value);
        break;
      case 'days-off-week':
        setDaysOffWeek(control.value);
        break;
      case 'tax-rate':
        setTaxRatePercent(control.value);
        break;
      case 'variable-cost-class':
        setVariableCostPerClass(control.value);
        break;
      case 'vat-rate':
        setVatRatePercent(control.value);
        break;
      case 'buffer':
        setBufferPercent(control.value);
        break;
      case 'currency-symbol':
        setCurrencySymbol(control.value);
        break;
      default:
        break;
    }
  }

  function initializeCalcStateFromControls() {
    const monthsOffRaw = controls.monthsOff instanceof HTMLInputElement
      ? controls.monthsOff.value
      : calcState.capacity.monthsOff;
    const weeksOffRaw = controls.weeksOffCycle instanceof HTMLInputElement
      ? controls.weeksOffCycle.value
      : calcState.capacity.weeksOffCycle;
    const daysOffRaw = controls.daysOffWeek instanceof HTMLInputElement
      ? controls.daysOffWeek.value
      : calcState.capacity.daysOffWeek;

    const capacityUpdates = {
      monthsOff: parseNumber(monthsOffRaw, calcState.capacity.monthsOff || 0, {
        min: 0,
        max: 12
      }),
      weeksOffCycle: parseNumber(weeksOffRaw, calcState.capacity.weeksOffCycle || 0, {
        min: 0,
        max: 4
      }),
      daysOffWeek: parseNumber(daysOffRaw, calcState.capacity.daysOffWeek || 0, {
        min: 0,
        max: BASE_WORK_DAYS_PER_WEEK
      })
    };

    const nextCapacity = {
      ...calcState.capacity,
      ...capacityUpdates
    };

    const capacityMetrics = deriveCapacity(nextCapacity);
    const defaults = deriveTargetNetDefaults(capacityMetrics);

    const yearRaw = controls.targetNet instanceof HTMLInputElement
      ? controls.targetNet.value
      : calcState.incomeTargets.year;
    const weekRaw = controls.targetNetWeek instanceof HTMLInputElement
      ? controls.targetNetWeek.value
      : calcState.incomeTargets.week;
    const monthRaw = controls.targetNetMonth instanceof HTMLInputElement
      ? controls.targetNetMonth.value
      : calcState.incomeTargets.month;
    const averageWeekRaw = controls.targetNetAverageWeek instanceof HTMLInputElement
      ? controls.targetNetAverageWeek.value
      : calcState.incomeTargets.averageWeek;
    const averageMonthRaw = controls.targetNetAverageMonth instanceof HTMLInputElement
      ? controls.targetNetAverageMonth.value
      : calcState.incomeTargets.averageMonth;

    const incomeUpdates = {
      year: Math.max(parseNumber(yearRaw, defaults.year), 0),
      week: Math.max(parseNumber(weekRaw, defaults.week), 0),
      month: Math.max(parseNumber(monthRaw, defaults.month), 0),
      averageWeek: Math.max(parseNumber(averageWeekRaw, defaults.averageWeek), 0),
      averageMonth: Math.max(parseNumber(averageMonthRaw, defaults.averageMonth), 0)
    };

    let basis = calcState.incomeTargets.basis;
    if (!TARGET_NET_BASIS_VALUES.includes(basis)) {
      basis = 'year';
    }

    const taxRateRaw = controls.taxRate instanceof HTMLInputElement
      ? controls.taxRate.value
      : calcState.costs.taxRatePercent;
    const variableCostRaw = controls.variableCostPerClass instanceof HTMLInputElement
      ? controls.variableCostPerClass.value
      : calcState.costs.variableCostPerClass;
    const vatRateRaw = controls.vatRate instanceof HTMLInputElement
      ? controls.vatRate.value
      : calcState.costs.vatRatePercent;
    const bufferRaw = controls.buffer instanceof HTMLInputElement
      ? controls.buffer.value
      : calcState.costs.bufferPercent;
    const currencySymbolRaw = controls.currencySymbol instanceof HTMLInputElement
      ? controls.currencySymbol.value
      : calcState.config.currencySymbol;

    const taxRatePercent = Math.min(
      Math.max(parseNumber(taxRateRaw, calcState.costs.taxRatePercent ?? 40), 0),
      99.9
    );
    const variableCostPerClass = Math.max(
      parseNumber(variableCostRaw, calcState.costs.variableCostPerClass ?? 0),
      0
    );
    const vatRatePercent = Math.max(
      parseNumber(vatRateRaw, calcState.costs.vatRatePercent ?? 21),
      0
    );
    const bufferPercent = Math.max(
      parseNumber(bufferRaw, calcState.costs.bufferPercent ?? 15),
      0
    );
    const currencySymbol = typeof currencySymbolRaw === 'string' && currencySymbolRaw.trim()
      ? currencySymbolRaw.trim()
      : '€';

    const fixedCosts = Math.max(getFixedCostTotal(), 0);

    patch({
      capacity: capacityUpdates,
      config: {
        defaults: {
          incomeTargets: defaults
        },
        currencySymbol
      },
      incomeTargets: {
        ...incomeUpdates,
        basis
      },
      costs: {
        taxRatePercent,
        variableCostPerClass,
        vatRatePercent,
        bufferPercent,
        fixedCosts
      }
    });
  }

  function setupPersistence() {
    initializePersistence();
  }

  function setupControlListeners() {
    Object.values(controls).forEach(control => {
      if (!(control instanceof HTMLInputElement)) {
        return;
      }
      control.addEventListener('change', handlePersistableInputMutation);
      control.addEventListener('input', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        if (event.target.type === 'text') {
          handlePersistableInputMutation(event);
          return;
        }
        handlePersistableInputMutation(event);
      });
    });

    Object.entries(fixedCostFields).forEach(([key, fieldSet]) => {
      const { monthly, annual } = fieldSet;
      if (monthly instanceof HTMLInputElement) {
        monthly.addEventListener('input', () => {
          syncFixedCostPair(key, 'monthly');
        });
        monthly.addEventListener('change', () => {
          syncFixedCostPair(key, 'monthly');
          if (monthly.value !== '') {
            const normalized = Math.max(parseNumber(monthly.value, 0), 0);
            monthly.value = formatFixed(normalized, 2);
          }
        });
      }
      if (annual instanceof HTMLInputElement) {
        annual.addEventListener('input', () => {
          syncFixedCostPair(key, 'annual');
        });
        annual.addEventListener('change', () => {
          syncFixedCostPair(key, 'annual');
          if (annual.value !== '') {
            const normalized = Math.max(parseNumber(annual.value, 0), 0);
            annual.value = formatFixed(normalized, 2);
          }
        });
      }
    });

    if (controls.recalcButton instanceof HTMLButtonElement) {
      controls.recalcButton.addEventListener('click', () => {
        patch({});
      });
    }

    if (controls.downloadCsv instanceof HTMLButtonElement) {
      controls.downloadCsv.addEventListener('click', handleDownloadCsv);
    }

    window.addEventListener('resize', scheduleTablesLayoutUpdate);
  }
}
