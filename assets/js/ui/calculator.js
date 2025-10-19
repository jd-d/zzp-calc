import {
  get,
  getDerived,
  patch,
  subscribe,
  parseNumber,
  getBillableHours,
  getNonBillableShare,
  getTravelDaysPerYear,
  setTargetNetBasis,
  setIncomeTargetValue,
  setMonthsOff,
  setWeeksOffCycle,
  setDaysOffWeek,
  setUtilizationPercent,
  setSessionLength,
  setTaxRatePercent,
  setVariableCostPerClass,
  setVatRatePercent,
  setBufferPercent,
  setCurrencySymbol,
  setComfortMarginPercent,
  setSeasonalityPercent,
  setTravelFrictionPercent,
  setHandsOnQuotaPercent,
  setTaxMode,
  setIncomeTargetMode,
  TARGET_NET_BASIS_VALUES,
  TARGET_INCOME_MODES,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
  BASE_WORK_DAYS_PER_WEEK,
  TAX_MODE_VALUES
} from '../state.js';
import { deriveCapacity } from '../capacity.js';
import { deriveTargetNetDefaults, deriveIncomeTargets } from '../income.js';
import { calculateTaxReserve, calculateTaxFromProfit, resolveTaxMode } from '../tax2025.js';
import { computeCosts } from '../costs.js';
import { normalizeScenarioModifiers } from '../modifiers.js';
import { announce, bindStateInput } from './components.js';

export function initializeCalculatorUI() {
  const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  const controls = {
    targetNet: document.getElementById('target-net'),
    targetNetWeek: document.getElementById('target-net-week'),
    targetNetMonth: document.getElementById('target-net-month'),
    targetNetAverageWeek: document.getElementById('target-net-average-week'),
    targetNetAverageMonth: document.getElementById('target-net-average-month'),
    taxRate: document.getElementById('tax-rate'),
    taxModeSimple: document.getElementById('tax-mode-simple'),
    taxModeDutch: document.getElementById('tax-mode-dutch'),
    targetModeNet: document.getElementById('target-mode-net'),
    targetModeGross: document.getElementById('target-mode-gross'),
    fixedCosts: document.getElementById('fixed-costs'),
    variableCostPerClass: document.getElementById('variable-cost-class'),
    vatRate: document.getElementById('vat-rate'),
    monthsOff: document.getElementById('months-off'),
    utilization: document.getElementById('utilization'),
    weeksOffCycle: document.getElementById('weeks-off-cycle'),
    daysOffWeek: document.getElementById('days-off-week'),
    sessionLength: document.getElementById('session-length'),
    buffer: document.getElementById('buffer'),
    comfortMargin: document.getElementById('comfort-margin'),
    seasonality: document.getElementById('seasonality'),
    travelFriction: document.getElementById('travel-friction'),
    handsOnQuota: document.getElementById('hands-on-quota'),
    currencySymbol: document.getElementById('currency-symbol'),
    recalcButton: document.getElementById('recalculate'),
    downloadCsv: document.getElementById('download-csv'),
    statusMessage: document.getElementById('status-message'),
    workingWeeksDisplay: document.getElementById('working-weeks-display'),
    workingDaysDisplay: document.getElementById('working-days-display'),
    rememberInputs: document.getElementById('remember-inputs'),
    resetSavedInputs: document.getElementById('reset-saved-inputs'),
    incomePresetContainer: document.getElementById('income-target-presets')
  };

  const tablesContainer = document.getElementById('tables-container');
  const assumptionsList = document.getElementById('assumptions-list');

  const incomeLabelElements = {
    year: document.querySelector('[data-target-label="year"]'),
    week: document.querySelector('[data-target-label="week"]'),
    month: document.querySelector('[data-target-label="month"]'),
    avgWeek: document.querySelector('[data-target-label="avgWeek"]'),
    avgMonth: document.querySelector('[data-target-label="avgMonth"]')
  };

  const incomeTooltipElements = {
    year: document.querySelector('[data-target-tooltip="year"]'),
    week: document.querySelector('[data-target-tooltip="week"]'),
    month: document.querySelector('[data-target-tooltip="month"]'),
    avgWeek: document.querySelector('[data-target-tooltip="avgWeek"]'),
    avgMonth: document.querySelector('[data-target-tooltip="avgMonth"]')
  };

  const incomeTargetCopy = {
    net: {
      labels: {
        year: 'Net income per year',
        week: 'Net income per active week',
        month: 'Net income per active month',
        avgWeek: 'Average weekly net income',
        avgMonth: 'Average monthly net income'
      },
      tooltips: {
        year: 'Amount you want to take home after income taxes.',
        week: 'Weeks you are actively teaching after factoring in planned time off.',
        month: 'Active months exclude the time off set below.',
        avgWeek: 'Average over every week in the year, including planned time off.',
        avgMonth: 'Average over every month in the year, including planned time off.'
      }
    },
    gross: {
      labels: {
        year: 'Gross revenue per year',
        week: 'Gross revenue per active week',
        month: 'Gross revenue per active month',
        avgWeek: 'Average weekly gross revenue',
        avgMonth: 'Average monthly gross revenue'
      },
      tooltips: {
        year: 'Total revenue before costs and income taxes.',
        week: 'Revenue per active teaching week before costs and taxes.',
        month: 'Revenue per active month before costs and taxes.',
        avgWeek: 'Average weekly revenue across the full year before costs and taxes.',
        avgMonth: 'Average monthly revenue across the full year before costs and taxes.'
      }
    }
  };

  const TARGET_NET_BASIS_BY_INPUT_ID = {
    'target-net': 'year',
    'target-net-week': 'week',
    'target-net-month': 'month',
    'target-net-average-week': 'avgWeek',
    'target-net-average-month': 'avgMonth'
  };

  const incomePresetButtons = controls.incomePresetContainer instanceof HTMLElement
    ? Array.from(controls.incomePresetContainer.querySelectorAll('button[data-target-value]'))
    : [];
  let activeIncomePresetButton = null;

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

  const fixedCostFieldIndex = new Map();
  Object.entries(fixedCostFields).forEach(([key, fieldSet]) => {
    if (fieldSet.monthly instanceof HTMLInputElement && fieldSet.monthly.id) {
      fixedCostFieldIndex.set(fieldSet.monthly.id, { key, type: 'monthly' });
    }
    if (fieldSet.annual instanceof HTMLInputElement && fieldSet.annual.id) {
      fixedCostFieldIndex.set(fieldSet.annual.id, { key, type: 'annual' });
    }
  });

  const bindingCleanups = [];
  const controlWriters = new Map();
  const fixedCostValues = initializeFixedCostValues();
  const scheduleWarningAnchors = createScheduleWarningAnchors();
  const activeScheduleWarnings = new Map();

  const rememberInputsToggle = controls.rememberInputs instanceof HTMLInputElement ? controls.rememberInputs : null;
  const resetSavedInputsButton = controls.resetSavedInputs instanceof HTMLButtonElement ? controls.resetSavedInputs : null;

  const PERSISTENCE_ENABLED_KEY = 'zzp-calc-save-enabled';
  const PERSISTENCE_VALUES_KEY = 'zzp-calc-saved-inputs';
  const PERSISTED_TARGET_NET_BASIS_KEY = '__targetNetBasis';

  let calcState = get();
  let calcDerived = getDerived();
  let latestResults = [];
  let latestSummary = null;
  let persistenceEnabled = false;
  let persistableInputsCache = null;
  let tablesLayoutUpdateScheduled = false;
  let defaultInputValues = null;

  const unsubscribe = subscribe((nextState, derived) => {
    calcState = nextState;
    calcDerived = derived || calcDerived;
    const views = deriveCalcViews(calcState, calcDerived);
    applyCalcStateToControls(calcState, views);
    renderDerivedViews(calcState, views);
  });

  const initialViews = deriveCalcViews(calcState, calcDerived);
  applyCalcStateToControls(calcState, initialViews);
  renderDerivedViews(calcState, initialViews);
  defaultInputValues = captureInputValues();

  setupStateBindings();
  setupPersistence();
  setupControlListeners();

  return () => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    bindingCleanups.forEach(cleanup => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
  };

  function deriveCalcViews(state, derived) {
    const modifiers = normalizeScenarioModifiers(state.modifiers);
    const sessionLength = Number.isFinite(state.sessionLength)
      ? state.sessionLength
      : 1.5;
    const capacity = derived && derived.capacity
      ? derived.capacity
      : deriveCapacity(state.capacity, state.modifiers, { sessionLength });
    const costs = derived && derived.costs ? derived.costs : computeCosts(state, capacity);
    const defaults = deriveTargetNetDefaults(capacity);
    const incomeBase = deriveIncomeTargets(state, capacity);
    const income = { ...incomeBase };
    const targetMode = TARGET_INCOME_MODES.includes(income.mode) ? income.mode : 'net';

    let tax;

    if (targetMode === 'gross') {
      const fixedCosts = Number.isFinite(costs.fixedCosts) ? costs.fixedCosts : 0;
      const annualVariableCosts = Number.isFinite(costs.annualVariableCosts) ? costs.annualVariableCosts : 0;
      const targetGross = Number.isFinite(income.targetGross)
        ? Math.max(income.targetGross, 0)
        : Math.max(income.targetAnnual || 0, 0);
      const profitBeforeTax = Math.max(targetGross - fixedCosts - annualVariableCosts, 0);
      const grossTax = calculateTaxFromProfit(state, costs, profitBeforeTax);
      const netIncome = Number.isFinite(grossTax?.netIncome)
        ? Math.max(grossTax.netIncome, 0)
        : Math.max(profitBeforeTax - Math.max(grossTax?.taxReserve || 0, 0), 0);

      income.targetGross = targetGross;
      income.targetNet = netIncome;
      income.resultingNet = netIncome;

      tax = grossTax && typeof grossTax === 'object'
        ? {
          ...grossTax,
          targetNet: netIncome,
          netIncome
        }
        : grossTax;
    } else {
      tax = calculateTaxReserve(state, capacity, costs, income);
      const netIncome = Number.isFinite(income.targetNet) ? Math.max(income.targetNet, 0) : 0;
      income.resultingNet = netIncome;
      if (tax && typeof tax === 'object') {
        tax = {
          ...tax,
          netIncome: Number.isFinite(tax.netIncome) ? tax.netIncome : netIncome
        };
      }
    }

    return { capacity, defaults, income, costs, modifiers, tax };
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

  function applyTargetModeCopy(mode) {
    const copy = incomeTargetCopy[mode] || incomeTargetCopy.net;
    Object.entries(copy.labels).forEach(([key, text]) => {
      const element = incomeLabelElements[key];
      if (element) {
        element.textContent = text;
      }
    });
    Object.entries(copy.tooltips).forEach(([key, text]) => {
      const tooltip = incomeTooltipElements[key];
      if (tooltip) {
        tooltip.setAttribute('aria-label', text);
        tooltip.setAttribute('data-tooltip', text);
      }
    });
  }

  function setActiveIncomePreset(button) {
    if (activeIncomePresetButton === button) {
      return;
    }
    if (activeIncomePresetButton) {
      activeIncomePresetButton.classList.remove('is-active');
      activeIncomePresetButton.setAttribute('aria-pressed', 'false');
    }
    if (button) {
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
    }
    activeIncomePresetButton = button || null;
  }

  function syncIncomePresetHighlight(targetAnnualValue) {
    if (!incomePresetButtons.length) {
      return;
    }
    const matched = incomePresetButtons.find(button => {
      const value = Number(button.dataset.targetValue);
      return Number.isFinite(value) && Math.abs(value - targetAnnualValue) < 1;
    });
    setActiveIncomePreset(matched || null);
  }

  function ensureFixedCostStore(key) {
    if (!fixedCostValues[key]) {
      fixedCostValues[key] = { monthly: 0, annual: 0 };
    }
    return fixedCostValues[key];
  }

  function getFixedCostTotal() {
    return Object.values(fixedCostValues).reduce((sum, pair) => {
      const annual = Number.isFinite(pair?.annual) ? pair.annual : 0;
      return sum + Math.max(annual, 0);
    }, 0);
  }

  function updateFixedCostTotalDisplay() {
    const normalized = Math.max(getFixedCostTotal(), 0);
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

    if (!(source instanceof HTMLInputElement)) {
      return;
    }

    const store = ensureFixedCostStore(key);

    if (source.value === '') {
      store[sourceType] = 0;
      if (sourceType === 'monthly') {
        store.annual = 0;
      } else {
        store.monthly = 0;
      }
      if (target instanceof HTMLInputElement) {
        target.value = '';
      }
      if (persistenceEnabled) {
        savePersistedInputs();
      }
      updateFixedCostTotalDisplay();
      return;
    }

    const parsed = Math.max(parseNumber(source.value, 0), 0);
    store[sourceType] = parsed;

    const derived = sourceType === 'monthly' ? parsed * 12 : parsed / 12;
    const normalizedDerived = Number.isFinite(derived) ? derived : 0;

    if (target instanceof HTMLInputElement) {
      target.value = formatFixed(normalizedDerived, 2);
    }

    if (sourceType === 'monthly') {
      store.annual = normalizedDerived;
    } else {
      store.monthly = normalizedDerived;
    }

    if (persistenceEnabled) {
      savePersistedInputs();
    }

    updateFixedCostTotalDisplay();
  }

  function initializeFixedCostValues() {
    const initial = {};
    Object.entries(fixedCostFields).forEach(([key, fieldSet]) => {
      const monthly = fieldSet.monthly instanceof HTMLInputElement
        ? Math.max(parseNumber(fieldSet.monthly.value, 0), 0)
        : 0;
      const annual = fieldSet.annual instanceof HTMLInputElement
        ? Math.max(parseNumber(fieldSet.annual.value, monthly * 12), 0)
        : Math.max(monthly * 12, 0);
      initial[key] = {
        monthly,
        annual
      };
    });
    return initial;
  }

  function registerControlBinding(control, options = {}) {
    if (!(control instanceof HTMLInputElement)) {
      return;
    }

    const { commit, onAfterCommit, ...rest } = options;
    const cleanup = bindStateInput(control, {
      ...rest,
      commit,
      onAfterCommit
    });

    if (typeof cleanup === 'function') {
      bindingCleanups.push(cleanup);
    }

    if (typeof commit === 'function' && control.id) {
      controlWriters.set(control.id, value => {
        let payload;
        if (control.type === 'checkbox' || control.type === 'radio') {
          let normalized;
          if (typeof value === 'string') {
            normalized = value === 'true' || value === '1';
          } else {
            normalized = Boolean(value);
          }
          payload = { value: normalized, raw: normalized };
        } else {
          const raw = value == null ? '' : String(value);
          payload = { value: raw, raw };
        }
        commit(payload, { source: 'persistence', input: control });
        if (typeof onAfterCommit === 'function') {
          onAfterCommit(payload, { source: 'persistence', input: control });
        }
      });
    }
  }

  function setupStateBindings() {
    registerControlBinding(controls.targetNet, {
      commit: ({ raw }) => setIncomeTargetValue('year', raw),
      onAfterCommit: () => setTargetNetBasis('year')
    });

    registerControlBinding(controls.targetNetWeek, {
      commit: ({ raw }) => setIncomeTargetValue('week', raw),
      onAfterCommit: () => setTargetNetBasis('week')
    });

    registerControlBinding(controls.targetNetMonth, {
      commit: ({ raw }) => setIncomeTargetValue('month', raw),
      onAfterCommit: () => setTargetNetBasis('month')
    });

    registerControlBinding(controls.targetNetAverageWeek, {
      commit: ({ raw }) => setIncomeTargetValue('averageWeek', raw),
      onAfterCommit: () => setTargetNetBasis('avgWeek')
    });

    registerControlBinding(controls.targetNetAverageMonth, {
      commit: ({ raw }) => setIncomeTargetValue('averageMonth', raw),
      onAfterCommit: () => setTargetNetBasis('avgMonth')
    });

    registerControlBinding(controls.taxRate, {
      commit: ({ raw }) => setTaxRatePercent(raw)
    });

    registerControlBinding(controls.variableCostPerClass, {
      commit: ({ raw }) => setVariableCostPerClass(raw)
    });

    registerControlBinding(controls.vatRate, {
      commit: ({ raw }) => setVatRatePercent(raw)
    });

    registerControlBinding(controls.buffer, {
      commit: ({ raw }) => setBufferPercent(raw)
    });

    registerControlBinding(controls.monthsOff, {
      commit: ({ raw }) => setMonthsOff(raw)
    });

    registerControlBinding(controls.utilization, {
      commit: ({ raw }) => setUtilizationPercent(raw)
    });

    registerControlBinding(controls.weeksOffCycle, {
      commit: ({ raw }) => setWeeksOffCycle(raw)
    });

    registerControlBinding(controls.daysOffWeek, {
      commit: ({ raw }) => setDaysOffWeek(raw)
    });

    registerControlBinding(controls.sessionLength, {
      commit: ({ raw }) => setSessionLength(raw)
    });

    registerControlBinding(controls.comfortMargin, {
      commit: ({ raw }) => setComfortMarginPercent(raw)
    });

    registerControlBinding(controls.seasonality, {
      commit: ({ raw }) => setSeasonalityPercent(raw)
    });

    registerControlBinding(controls.travelFriction, {
      commit: ({ raw }) => setTravelFrictionPercent(raw)
    });

    registerControlBinding(controls.handsOnQuota, {
      commit: ({ raw }) => setHandsOnQuotaPercent(raw)
    });

    registerControlBinding(controls.currencySymbol, {
      commit: ({ raw }) => setCurrencySymbol(raw)
    });

    registerControlBinding(controls.taxModeSimple, {
      parse: (raw, { input }) => ({ value: Boolean(input && input.checked) }),
      commit: ({ value }, meta = {}) => {
        if (value) {
          setTaxMode('simple');
          if (meta?.source !== 'persistence') {
            announce('Tax strategy updated');
          }
        }
      }
    });

    registerControlBinding(controls.taxModeDutch, {
      parse: (raw, { input }) => ({ value: Boolean(input && input.checked) }),
      commit: ({ value }, meta = {}) => {
        if (value) {
          setTaxMode('dutch2025');
          if (meta?.source !== 'persistence') {
            announce('Tax strategy updated');
          }
        }
      }
    });

    registerControlBinding(controls.targetModeNet, {
      parse: (raw, { input }) => ({ value: Boolean(input && input.checked) }),
      commit: ({ value }, meta = {}) => {
        if (value) {
          setIncomeTargetMode('net');
          if (meta?.source !== 'persistence') {
            announce('Target amounts now use net take-home.');
          }
        }
      }
    });

    registerControlBinding(controls.targetModeGross, {
      parse: (raw, { input }) => ({ value: Boolean(input && input.checked) }),
      commit: ({ value }, meta = {}) => {
        if (value) {
          setIncomeTargetMode('gross');
          if (meta?.source !== 'persistence') {
            announce('Target amounts now use gross revenue.');
          }
        }
      }
    });
  }

  function createScheduleWarningAnchors() {
    return {
      monthsOff: ensureWarningElement(controls.monthsOff),
      weeksOffCycle: ensureWarningElement(controls.weeksOffCycle),
      daysOffWeek: ensureWarningElement(controls.daysOffWeek),
      sessionLength: ensureWarningElement(controls.sessionLength),
      travelFriction: ensureWarningElement(controls.travelFriction)
    };
  }

  function ensureWarningElement(control) {
    if (!(control instanceof HTMLElement)) {
      return null;
    }

    const container = control.closest('.control');
    if (!(container instanceof HTMLElement)) {
      return null;
    }

    let slot = container.querySelector('.field-warning');
    if (!(slot instanceof HTMLElement)) {
      slot = document.createElement('p');
      slot.className = 'field-warning';
      slot.hidden = true;
      slot.setAttribute('aria-live', 'polite');
      container.appendChild(slot);
    }

    return slot;
  }

  function updateScheduleWarnings(stateSnapshot, views = {}) {
    const capacity = views && typeof views === 'object' ? views.capacity || {} : {};

    const workingWeeks = Number.isFinite(capacity.workingWeeks) ? capacity.workingWeeks : 0;
    const workingDaysPerWeek = Number.isFinite(capacity.workingDaysPerWeek) ? capacity.workingDaysPerWeek : 0;
    const workingDaysPerYear = Number.isFinite(capacity.workingDaysPerYear) ? capacity.workingDaysPerYear : 0;
    const workingHoursPerWeek = Number.isFinite(capacity.workingHoursPerWeek) ? capacity.workingHoursPerWeek : null;
    const travelAllowanceDays = Number.isFinite(capacity.travelAllowanceDays) ? capacity.travelAllowanceDays : 0;
    const travelDaysPerYear = Number.isFinite(capacity.travelDaysPerYear) ? capacity.travelDaysPerYear : 0;

    const warnings = {
      monthsOff: '',
      weeksOffCycle: '',
      daysOffWeek: '',
      sessionLength: '',
      travelFriction: ''
    };

    if (workingWeeks <= 0 || workingDaysPerWeek <= 0 || workingDaysPerYear <= 0) {
      warnings.monthsOff = 'Time off removes every working week. Reduce months off to restore availability.';
      warnings.weeksOffCycle = 'Weeks off per cycle eliminate all active weeks. Ease this input to keep the schedule feasible.';
      warnings.daysOffWeek = 'Days off per week leave no working days. Lower the value to retain billable time.';
    } else if (workingDaysPerWeek <= 0.25) {
      warnings.daysOffWeek = 'Schedule leaves less than a quarter day per week. Ease the time off inputs to reclaim time.';
    }

    if (Number.isFinite(workingHoursPerWeek) && workingHoursPerWeek > 60) {
      warnings.sessionLength = 'Weekly workload exceeds 60 hours. Shorten sessions or introduce more time off.';
    }

    if (workingDaysPerYear > 0) {
      const travelShare = travelAllowanceDays / workingDaysPerYear;
      if (travelAllowanceDays >= workingDaysPerYear - 0.5) {
        warnings.travelFriction = 'Travel days consume the full schedule. Lower travel friction or reserve more working days.';
      } else if ((travelDaysPerYear - travelAllowanceDays) > 0.5 || travelShare > 0.6) {
        warnings.travelFriction = 'Travel overhead is crowding out delivery days. Lighten travel assumptions or friction.';
      }
    }

    applyScheduleWarnings(warnings);
  }

  function applyScheduleWarnings(warnings) {
    const previous = new Map(activeScheduleWarnings);
    let hasWarnings = false;

    Object.entries(scheduleWarningAnchors).forEach(([key, element]) => {
      const message = warnings[key] || '';
      if (element instanceof HTMLElement) {
        if (message) {
          element.textContent = message;
          element.hidden = false;
        } else {
          element.textContent = '';
          element.hidden = true;
        }
      }
      activeScheduleWarnings.set(key, message);
      if (message) {
        hasWarnings = true;
      }
    });

    const previouslyActive = Array.from(previous.values()).some(Boolean);

    if (!previouslyActive && hasWarnings) {
      announce('Schedule inputs need attention.');
    } else if (previouslyActive && !hasWarnings) {
      announce('Schedule warnings cleared.');
    }
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
    const { capacity = {}, income = {}, modifiers = {} } = views;
    const basis = income.basis || state.incomeTargets.basis;
    const modeFromState = TARGET_INCOME_MODES.includes(state.incomeTargets.mode)
      ? state.incomeTargets.mode
      : 'net';
    const targetMode = TARGET_INCOME_MODES.includes(income.mode)
      ? income.mode
      : modeFromState;

    applyTargetModeCopy(targetMode);

    if (controls.targetModeNet instanceof HTMLInputElement) {
      controls.targetModeNet.checked = targetMode === 'net';
    }

    if (controls.targetModeGross instanceof HTMLInputElement) {
      controls.targetModeGross.checked = targetMode === 'gross';
    }

    const targetAnnual = Number.isFinite(income.targetAnnual)
      ? income.targetAnnual
      : Number.isFinite(state.incomeTargets.year)
        ? state.incomeTargets.year
        : 0;

    if (controls.targetNet instanceof HTMLInputElement) {
      controls.targetNet.value = targetAnnual == null || !Number.isFinite(targetAnnual)
        ? ''
        : formatFixed(Math.max(targetAnnual || 0, 0), 2);
    }

    if (controls.targetNetWeek instanceof HTMLInputElement) {
      const displayValue = basis === 'week' ? state.incomeTargets.week : income.targetPerWeek;
      controls.targetNetWeek.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetMonth instanceof HTMLInputElement) {
      const displayValue = basis === 'month' ? state.incomeTargets.month : income.targetPerMonth;
      controls.targetNetMonth.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetAverageWeek instanceof HTMLInputElement) {
      const displayValue = basis === 'avgWeek'
        ? state.incomeTargets.averageWeek
        : income.targetAveragePerWeek;
      controls.targetNetAverageWeek.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    if (controls.targetNetAverageMonth instanceof HTMLInputElement) {
      const displayValue = basis === 'avgMonth'
        ? state.incomeTargets.averageMonth
        : income.targetAveragePerMonth;
      controls.targetNetAverageMonth.value = displayValue == null || !Number.isFinite(displayValue)
        ? ''
        : formatFixed(displayValue, 2);
    }

    syncIncomePresetHighlight(targetAnnual);

    if (controls.taxRate instanceof HTMLInputElement) {
      controls.taxRate.value = formatFixed(state.costs.taxRatePercent ?? 40, 1);
    }

    const taxMode = views.tax && typeof views.tax.mode === 'string'
      ? views.tax.mode
      : resolveTaxMode(state);

    if (controls.taxModeSimple instanceof HTMLInputElement) {
      controls.taxModeSimple.checked = taxMode === 'simple';
    }

    if (controls.taxModeDutch instanceof HTMLInputElement) {
      controls.taxModeDutch.checked = taxMode === 'dutch2025';
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

    if (controls.utilization instanceof HTMLInputElement) {
      const value = Number.isFinite(state.capacity.utilizationPercent)
        ? state.capacity.utilizationPercent
        : 0;
      controls.utilization.value = formatFixed(value, 1);
    }

    if (controls.weeksOffCycle instanceof HTMLInputElement) {
      controls.weeksOffCycle.value = formatFixed(state.capacity.weeksOffCycle ?? 0, 2);
    }

    if (controls.daysOffWeek instanceof HTMLInputElement) {
      controls.daysOffWeek.value = formatFixed(state.capacity.daysOffWeek ?? 0, 2);
    }

    if (controls.sessionLength instanceof HTMLInputElement) {
      const value = Number.isFinite(state.sessionLength) ? state.sessionLength : 1.5;
      controls.sessionLength.value = formatFixed(Math.max(value, 0), 2);
    }

    if (controls.buffer instanceof HTMLInputElement) {
      controls.buffer.value = formatFixed(state.costs.bufferPercent ?? 15, 1);
    }

    if (controls.comfortMargin instanceof HTMLInputElement) {
      const value = Number.isFinite(modifiers.comfortMarginPercent)
        ? modifiers.comfortMarginPercent
        : state.modifiers?.comfortMarginPercent;
      controls.comfortMargin.value = formatFixed(value ?? 0, 1);
    }

    if (controls.seasonality instanceof HTMLInputElement) {
      const value = Number.isFinite(modifiers.seasonalityPercent)
        ? modifiers.seasonalityPercent
        : state.modifiers?.seasonalityPercent;
      controls.seasonality.value = formatFixed(value ?? 0, 1);
    }

    if (controls.travelFriction instanceof HTMLInputElement) {
      const value = Number.isFinite(modifiers.travelFrictionPercent)
        ? modifiers.travelFrictionPercent
        : state.modifiers?.travelFrictionPercent;
      controls.travelFriction.value = formatFixed(value ?? 0, 1);
    }

    if (controls.handsOnQuota instanceof HTMLInputElement) {
      const value = Number.isFinite(modifiers.handsOnQuotaPercent)
        ? modifiers.handsOnQuotaPercent
        : state.modifiers?.handsOnQuotaPercent;
      controls.handsOnQuota.value = formatFixed(value ?? 0, 1);
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
      targetMode,
      targetLabel,
      targetAnnual,
      targetGross,
      targetNet,
      netIncome,
      profitBeforeTax,
      taxReserve,
      effectiveTaxRate,
      incomeTax,
      zvwContribution,
      taxMode,
      fixedCosts,
      annualVariableCosts,
      buffer,
      bufferPercent,
      workingWeeks,
      activeMonths,
      workingDaysPerYear,
      billableHours
    } = inputs;

    const normalizedMode = TARGET_INCOME_MODES.includes(targetMode) ? targetMode : 'net';
    const normalizedTargetAnnual = Number.isFinite(targetAnnual) ? Math.max(targetAnnual, 0) : 0;
    const normalizedTargetNet = Number.isFinite(targetNet)
      ? Math.max(targetNet, 0)
      : normalizedMode === 'net'
        ? normalizedTargetAnnual
        : 0;
    const normalizedNetIncome = Number.isFinite(netIncome)
      ? Math.max(netIncome, 0)
      : normalizedTargetNet;
    const grossTargetValue = Number.isFinite(targetGross)
      ? Math.max(targetGross, 0)
      : normalizedMode === 'gross'
        ? normalizedTargetAnnual
        : normalizedTargetNet + fixedCosts + annualVariableCosts;

    const fallbackProfit = normalizedMode === 'gross'
      ? Math.max(grossTargetValue - fixedCosts - annualVariableCosts, 0)
      : normalizedTargetNet;

    const normalizedProfitBeforeTax = Number.isFinite(profitBeforeTax) && profitBeforeTax >= 0
      ? profitBeforeTax
      : fallbackProfit;
    const normalizedTaxReserve = Number.isFinite(taxReserve)
      ? Math.max(taxReserve, 0)
      : Math.max(normalizedProfitBeforeTax - normalizedNetIncome, 0);
    const derivedProfitBeforeTax = normalizedProfitBeforeTax > 0
      ? normalizedProfitBeforeTax
      : normalizedNetIncome + normalizedTaxReserve;
    const totalTaxReserve = normalizedTaxReserve;
    const baseRevenue = derivedProfitBeforeTax + fixedCosts + annualVariableCosts;
    const bufferedRevenue = baseRevenue * (1 + buffer);
    const normalizedEffectiveTaxRate = derivedProfitBeforeTax > 0
      ? Math.min(
        Math.max(
          Number.isFinite(effectiveTaxRate) ? effectiveTaxRate : totalTaxReserve / derivedProfitBeforeTax,
          0
        ),
        0.99
      )
      : 0;

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

    const hourlyBase = Number.isFinite(billableHours) && billableHours > 0
      ? baseRevenue / billableHours
      : null;
    const hourlyBuffered = Number.isFinite(billableHours) && billableHours > 0
      ? bufferedRevenue / billableHours
      : null;

    const netMonthly = Number.isFinite(activeMonths) && activeMonths > 0
      ? normalizedNetIncome / activeMonths
      : null;
    const netWeekly = Number.isFinite(workingWeeks) && workingWeeks > 0
      ? normalizedNetIncome / workingWeeks
      : null;
    const netDaily = Number.isFinite(workingDaysPerYear) && workingDaysPerYear > 0
      ? normalizedNetIncome / workingDaysPerYear
      : null;
    const netAverageWeek = normalizedNetIncome / WEEKS_PER_YEAR;
    const netAverageMonth = normalizedNetIncome / MONTHS_PER_YEAR;

    return {
      baseRevenue,
      bufferedRevenue,
      bufferPercent,
      monthlyBase,
      monthlyBuffered,
      weeklyBase,
      weeklyBuffered,
      dailyBase,
      dailyBuffered,
      hourlyBase,
      hourlyBuffered,
      billableHours,
      profitBeforeTax: derivedProfitBeforeTax,
      taxReserve: totalTaxReserve,
      incomeTax: Number.isFinite(incomeTax) ? incomeTax : null,
      zvwContribution: Number.isFinite(zvwContribution) ? zvwContribution : null,
      effectiveTaxRate: normalizedEffectiveTaxRate,
      taxMode,
      targetMode: normalizedMode,
      targetLabel: targetLabel || (normalizedMode === 'gross' ? 'Gross revenue' : 'Net income'),
      targetAnnual: normalizedTargetAnnual,
      targetGross: grossTargetValue,
      targetNet: normalizedNetIncome,
      netIncome: normalizedNetIncome,
      netMonthly,
      netWeekly,
      netDaily,
      netAverageWeek,
      netAverageMonth
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

    const modeLabel = summary.targetMode === 'gross'
      ? 'Gross revenue target'
      : 'Gross revenue needed';
    const baseBasis = summary.targetMode === 'gross'
      ? 'Before safety margin. Subtracts fixed and estimated variable costs to show expected profit before tax.'
      : 'Includes fixed costs and estimated variable costs before applying the safety margin.';

    const rows = [
      {
        label: 'Annual total',
        base: summary.baseRevenue,
        buffered: summary.bufferedRevenue,
        basis: baseBasis
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
      },
      {
        label: 'Billable hour',
        base: summary.hourlyBase,
        buffered: summary.hourlyBuffered,
        basis: Number.isFinite(summary.billableHours) && summary.billableHours > 0
          ? `Based on ≈ ${formatFixed(summary.billableHours, 2)} billable hours / year`
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
              ${modeLabel} (base vs. safety margin +${bufferLabel}%)
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

  function extractInputsFromViews(views, stateSnapshot = calcState) {
    const { capacity = {}, income = {}, costs = {}, tax = {} } = views || {};
    const currentState = stateSnapshot && typeof stateSnapshot === 'object' ? stateSnapshot : {};
    const sessionLength = Number.isFinite(currentState.sessionLength) ? currentState.sessionLength : 1.5;
    const modifiersView = views && views.modifiers
      ? views.modifiers
      : normalizeScenarioModifiers(currentState.modifiers);
    const bufferPercentBase = Number.isFinite(costs.bufferPercentBase)
      ? costs.bufferPercentBase
      : Number.isFinite(currentState.costs?.bufferPercent)
        ? currentState.costs.bufferPercent
        : 15;
    const comfortMarginPercent = Number.isFinite(costs.comfortMarginPercent)
      ? costs.comfortMarginPercent
      : modifiersView.comfortMarginPercent;
    const bufferPercentEffective = bufferPercentBase + comfortMarginPercent;
    const bufferEffective = bufferPercentEffective / 100;
    const billableHours = Number.isFinite(capacity.billableHoursPerYear)
      ? capacity.billableHoursPerYear
      : getBillableHours(currentState);
    const nonBillableShare = Number.isFinite(capacity.nonBillableShare)
      ? capacity.nonBillableShare
      : getNonBillableShare(currentState);
    const travelAllowanceDaysValue = Number.isFinite(capacity.travelAllowanceDays)
      ? capacity.travelAllowanceDays
      : getTravelDaysPerYear(currentState);
    const travelDaysPerYearValue = Number.isFinite(capacity.travelDaysPerYear)
      ? capacity.travelDaysPerYear
      : travelAllowanceDaysValue;
    const taxInfo = tax && typeof tax === 'object' ? tax : {};
    const taxMode = typeof taxInfo.mode === 'string'
      ? taxInfo.mode
      : resolveTaxMode(currentState);
    const targetMode = TARGET_INCOME_MODES.includes(income.mode)
      ? income.mode
      : (TARGET_INCOME_MODES.includes(currentState?.incomeTargets?.mode)
        ? currentState.incomeTargets.mode
        : 'net');
    const targetLabel = typeof income.label === 'string'
      ? income.label
      : targetMode === 'gross'
        ? 'Gross revenue'
        : 'Net income';
    const targetAnnual = Number.isFinite(income.targetAnnual)
      ? income.targetAnnual
      : Number.isFinite(currentState.incomeTargets?.year)
        ? currentState.incomeTargets.year
        : 0;
    const targetPerWeek = income.targetPerWeek;
    const targetPerMonth = income.targetPerMonth;
    const targetAveragePerWeek = income.targetAveragePerWeek;
    const targetAveragePerMonth = income.targetAveragePerMonth;
    const targetGross = Number.isFinite(income.targetGross)
      ? income.targetGross
      : targetMode === 'gross'
        ? targetAnnual
        : null;
    const targetNet = Number.isFinite(income.targetNet)
      ? income.targetNet
      : targetMode === 'net'
        ? targetAnnual
        : Number.isFinite(taxInfo.netIncome)
          ? taxInfo.netIncome
          : Number.isFinite(income.resultingNet)
            ? income.resultingNet
            : null;
    const netIncomeValue = Number.isFinite(taxInfo.netIncome)
      ? taxInfo.netIncome
      : Number.isFinite(income.resultingNet)
        ? income.resultingNet
        : targetNet;
    const normalizedNet = Number.isFinite(netIncomeValue) ? Math.max(netIncomeValue, 0) : 0;
    const manualTaxRate = Number.isFinite(costs.taxRate) ? costs.taxRate : 0;
    const effectiveTaxRate = Number.isFinite(taxInfo.effectiveTaxRate)
      ? taxInfo.effectiveTaxRate
      : manualTaxRate;
    const boundedRate = Math.min(Math.max(effectiveTaxRate, 0), 0.99);

    let profitBeforeTax;
    if (Number.isFinite(taxInfo.profitBeforeTax) && taxInfo.profitBeforeTax >= 0) {
      profitBeforeTax = taxInfo.profitBeforeTax;
    } else if (targetMode === 'gross') {
      const fixed = Number.isFinite(costs.fixedCosts) ? costs.fixedCosts : 0;
      const variable = Number.isFinite(costs.annualVariableCosts) ? costs.annualVariableCosts : 0;
      const grossValue = Number.isFinite(targetGross) ? Math.max(targetGross, 0) : Math.max(targetAnnual, 0);
      profitBeforeTax = Math.max(grossValue - fixed - variable, 0);
    } else {
      const normalizedTargetNet = Number.isFinite(targetNet) ? Math.max(targetNet, 0) : Math.max(targetAnnual, 0);
      profitBeforeTax = boundedRate < 0.999
        ? normalizedTargetNet / Math.max(1 - boundedRate, 0.0001)
        : normalizedTargetNet;
    }

    const taxReserve = Number.isFinite(taxInfo.taxReserve)
      ? taxInfo.taxReserve
      : Math.max(profitBeforeTax - normalizedNet, 0);
    const incomeTax = Number.isFinite(taxInfo.incomeTax) ? taxInfo.incomeTax : null;
    const zvwContribution = Number.isFinite(taxInfo.zvwContribution) ? taxInfo.zvwContribution : null;
    const zelfstandigenaftrek = Number.isFinite(taxInfo.zelfstandigenaftrek) ? taxInfo.zelfstandigenaftrek : null;
    const startersaftrek = Number.isFinite(taxInfo.startersaftrek) ? taxInfo.startersaftrek : null;
    const mkbVrijstellingRate = Number.isFinite(taxInfo.mkbVrijstellingRate) ? taxInfo.mkbVrijstellingRate : 0;
    const mkbVrijstelling = Number.isFinite(taxInfo.mkbVrijstelling) ? taxInfo.mkbVrijstelling : null;
    const taxableProfitBeforeMkb = Number.isFinite(taxInfo.taxableProfitBeforeMkb) ? taxInfo.taxableProfitBeforeMkb : null;
    const taxableProfitAfterMkb = Number.isFinite(taxInfo.taxableProfitAfterMkb) ? taxInfo.taxableProfitAfterMkb : null;
    const zvwBase = Number.isFinite(taxInfo.zvwBase) ? taxInfo.zvwBase : null;
    return {
      targetMode,
      targetLabel,
      targetAnnual,
      targetPerWeek,
      targetPerMonth,
      targetAveragePerWeek,
      targetAveragePerMonth,
      targetNet,
      targetGross,
      netIncome: normalizedNet,
      effectiveTaxRate,
      taxReserve,
      incomeTax,
      zvwContribution,
      profitBeforeTax,
      zelfstandigenaftrek,
      startersaftrek,
      mkbVrijstelling,
      mkbVrijstellingRate,
      taxableProfitBeforeMkb,
      taxableProfitAfterMkb,
      zvwBase,
      fixedCosts: costs.fixedCosts,
      variableCostPerClass: costs.variableCostPerClass,
      vatRate: costs.vatRate,
      annualVariableCosts: costs.annualVariableCosts,
      workingWeeks: capacity.workingWeeks,
      buffer: bufferEffective,
      bufferPercent: bufferPercentEffective,
      bufferPercentBase,
      comfortMarginPercent,
      currencySymbol: costs.currencySymbol,
      monthsOff: capacity.monthsOff,
      weeksOffPerCycle: capacity.weeksOffPerCycle,
      daysOffPerWeek: capacity.daysOffPerWeek,
      workingDaysPerWeek: capacity.workingDaysPerWeek,
      workingDaysPerYear: capacity.workingDaysPerYear,
      activeMonths: capacity.activeMonths,
      activeMonthShare: capacity.activeMonthShare,
      weeksShare: capacity.weeksShare,
      utilizationPercent: capacity.utilizationPercent,
      utilizationRate: capacity.utilizationRate,
      billableWeeks: capacity.billableWeeks,
      billableDaysPerYear: capacity.billableDaysPerYear,
      billableDaysAfterTravel: capacity.billableDaysAfterTravel,
      travelDaysPerMonth: capacity.travelDaysPerMonth,
      travelDaysPerYear: travelDaysPerYearValue,
      travelWeeksPerYear: capacity.travelWeeksPerYear,
      travelAllowanceDays: travelAllowanceDaysValue,
      travelAllowanceShare: capacity.travelAllowanceShare,
      travelAllowanceBillableShare: capacity.travelAllowanceBillableShare,
      seasonalityPercent: modifiersView.seasonalityPercent,
      travelFrictionPercent: modifiersView.travelFrictionPercent,
      handsOnQuotaPercent: modifiersView.handsOnQuotaPercent,
      sessionLength,
      billableHours,
      nonBillableShare
    };
  }

  function renderAssumptions(inputs, summary) {
    if (!assumptionsList) {
      return;
    }

    const {
      currencySymbol,
      targetMode,
      targetLabel,
      targetAnnual,
      targetNet,
      targetPerWeek,
      targetPerMonth,
      targetAveragePerWeek,
      targetAveragePerMonth,
      targetGross,
      netIncome,
      effectiveTaxRate,
      taxReserve,
      incomeTax,
      zvwContribution,
      profitBeforeTax,
      taxMode,
      zelfstandigenaftrek,
      startersaftrek,
      mkbVrijstelling,
      mkbVrijstellingRate,
      taxableProfitBeforeMkb,
      taxableProfitAfterMkb,
      zvwBase,
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
      bufferPercentBase,
      comfortMarginPercent,
      vatRate,
      utilizationPercent,
      billableDaysPerYear,
      billableDaysAfterTravel,
      travelDaysPerMonth,
      travelDaysPerYear,
      travelWeeksPerYear,
      travelAllowanceDays,
      travelAllowanceShare,
      travelAllowanceBillableShare,
      seasonalityPercent,
      travelFrictionPercent,
      handsOnQuotaPercent,
      sessionLength,
      billableHours,
      nonBillableShare
    } = inputs;

    const activeMonthPercentage = activeMonthShare * 100;
    const workingWeeksPerCycle = 4 - weeksOffPerCycle;
    const activeWeeksPercentage = weeksShare * 100;
    const utilizationDisplay = formatFixed(utilizationPercent, 1);
    const billableDaysPerYearDisplay = formatFixed(billableDaysPerYear, 2);
    const billableDaysAfterTravelDisplay = formatFixed(billableDaysAfterTravel, 2);
    const travelDaysPerMonthDisplay = formatFixed(travelDaysPerMonth, 2);
    const travelDaysPerYearDisplay = formatFixed(travelDaysPerYear, 2);
    const travelWeeksPerYearDisplay = formatFixed(travelWeeksPerYear, 2);
    const travelAllowanceDaysDisplay = formatFixed(travelAllowanceDays, 2);
    const travelAllowanceSharePercent = formatFixed((travelAllowanceShare || 0) * 100, 1);
    const travelAllowanceBillablePercent = formatFixed((travelAllowanceBillableShare || 0) * 100, 1);
    const sessionLengthDisplay = formatFixed(sessionLength, 2);
    const billableHoursDisplay = Number.isFinite(billableHours)
      ? formatFixed(billableHours, 2)
      : '—';
    const nonBillableShareDisplay = Number.isFinite(nonBillableShare)
      ? formatFixed(nonBillableShare * 100, 1)
      : '—';
    const bufferBaseDisplay = formatFixed(bufferPercentBase ?? 0, 1);
    const comfortMarginDisplay = formatFixed(comfortMarginPercent ?? 0, 1);
    const bufferEffectiveDisplay = formatFixed(bufferPercent ?? 0, 1);
    const seasonalityDisplay = formatFixed(seasonalityPercent ?? 0, 1);
    const travelFrictionDisplay = formatFixed(travelFrictionPercent ?? 0, 1);
    const handsOnQuotaDisplay = formatFixed(handsOnQuotaPercent ?? 0, 1);

    const targetPerWeekDisplay = Number.isFinite(targetPerWeek)
      ? formatCurrency(currencySymbol, targetPerWeek)
      : '—';
    const targetPerMonthDisplay = Number.isFinite(targetPerMonth)
      ? formatCurrency(currencySymbol, targetPerMonth)
      : '—';
    const targetAveragePerWeekDisplay = Number.isFinite(targetAveragePerWeek)
      ? formatCurrency(currencySymbol, targetAveragePerWeek)
      : '—';
    const targetAveragePerMonthDisplay = Number.isFinite(targetAveragePerMonth)
      ? formatCurrency(currencySymbol, targetAveragePerMonth)
      : '—';
    const profitBeforeTaxValue = summary && Number.isFinite(summary.profitBeforeTax)
      ? summary.profitBeforeTax
      : profitBeforeTax;
    const profitBeforeTaxDisplay = Number.isFinite(profitBeforeTaxValue)
      ? formatCurrency(currencySymbol, profitBeforeTaxValue)
      : '—';
    const taxReserveValue = summary && Number.isFinite(summary.taxReserve)
      ? summary.taxReserve
      : taxReserve;
    const taxReserveDisplay = Number.isFinite(taxReserveValue)
      ? formatCurrency(currencySymbol, taxReserveValue)
      : '—';
    const incomeTaxValue = summary && Number.isFinite(summary.incomeTax)
      ? summary.incomeTax
      : incomeTax;
    const incomeTaxDisplay = Number.isFinite(incomeTaxValue)
      ? formatCurrency(currencySymbol, incomeTaxValue)
      : '—';
    const zvwContributionValue = summary && Number.isFinite(summary.zvwContribution)
      ? summary.zvwContribution
      : zvwContribution;
    const zvwContributionDisplay = Number.isFinite(zvwContributionValue)
      ? formatCurrency(currencySymbol, zvwContributionValue)
      : '—';
    const effectiveRateValue = summary && Number.isFinite(summary.effectiveTaxRate)
      ? summary.effectiveTaxRate
      : effectiveTaxRate;
    const effectiveRateDisplay = formatFixed((effectiveRateValue || 0) * 100, 1);
    const zelfstandigenaftrekDisplay = Number.isFinite(zelfstandigenaftrek)
      ? formatCurrency(currencySymbol, zelfstandigenaftrek)
      : '—';
    const startersaftrekDisplay = Number.isFinite(startersaftrek)
      ? formatCurrency(currencySymbol, startersaftrek)
      : '—';
    const mkbVrijstellingDisplay = Number.isFinite(mkbVrijstelling)
      ? formatCurrency(currencySymbol, mkbVrijstelling)
      : '—';
    const mkbVrijstellingRateDisplay = formatFixed((mkbVrijstellingRate || 0) * 100, 2);
    const taxableBeforeMkbDisplay = Number.isFinite(taxableProfitBeforeMkb)
      ? formatCurrency(currencySymbol, taxableProfitBeforeMkb)
      : '—';
    const taxableAfterMkbDisplay = Number.isFinite(taxableProfitAfterMkb)
      ? formatCurrency(currencySymbol, taxableProfitAfterMkb)
      : '—';
    const zvwBaseDisplay = Number.isFinite(zvwBase)
      ? formatCurrency(currencySymbol, zvwBase)
      : '—';

    const normalizedTargetLabel = targetLabel || (targetMode === 'gross' ? 'Gross revenue' : 'Net income');
    const summaryNetIncome = summary && Number.isFinite(summary.netIncome)
      ? summary.netIncome
      : Number.isFinite(netIncome)
        ? netIncome
        : Number.isFinite(targetNet)
          ? targetNet
          : 0;
    const summaryNetWeekly = summary && Number.isFinite(summary.netWeekly) ? summary.netWeekly : null;
    const summaryNetMonthly = summary && Number.isFinite(summary.netMonthly) ? summary.netMonthly : null;
    const summaryNetDaily = summary && Number.isFinite(summary.netDaily) ? summary.netDaily : null;
    const summaryNetAverageWeek = summary && Number.isFinite(summary.netAverageWeek)
      ? summary.netAverageWeek
      : (summaryNetIncome / WEEKS_PER_YEAR);
    const summaryNetAverageMonth = summary && Number.isFinite(summary.netAverageMonth)
      ? summary.netAverageMonth
      : (summaryNetIncome / MONTHS_PER_YEAR);

    const listItems = [];

    const strategyMode = summary && typeof summary.taxMode === 'string'
      ? summary.taxMode
      : taxMode;
    const normalizedMode = TAX_MODE_VALUES.includes(strategyMode) ? strategyMode : TAX_MODE_VALUES[0];
    const isDutchStrategy = normalizedMode === 'dutch2025';
    const taxStrategyDescription = isDutchStrategy
      ? 'Dutch 2025 (entrepreneur deductions + Zvw)'
      : 'Simple reserve (manual effective rate)';
    const taxReserveLine = isDutchStrategy
      ? `Estimated Dutch tax reserve (income + Zvw): ${taxReserveDisplay}`
      : `Estimated tax reserve (manual rate): ${taxReserveDisplay}`;

    if (summary && Number.isFinite(summary.baseRevenue)) {
      const baseDisplay = formatCurrency(currencySymbol, summary.baseRevenue);
      const bufferedDisplay = Number.isFinite(summary.bufferedRevenue)
        ? formatCurrency(currencySymbol, summary.bufferedRevenue)
        : '—';
      const revenueLabel = summary.targetMode === 'gross'
        ? 'Gross revenue target'
        : 'Gross revenue needed';
      listItems.push(`${revenueLabel}: ${baseDisplay} (with margin: ${bufferedDisplay})`);
    }

    const annualTargetDisplay = formatCurrency(currencySymbol, Number.isFinite(targetAnnual) ? targetAnnual : targetNet);
    listItems.push(`${normalizedTargetLabel} per year: ${annualTargetDisplay}`);
    listItems.push(`${normalizedTargetLabel} per active week: ${targetPerWeekDisplay}`);
    listItems.push(`${normalizedTargetLabel} per active month: ${targetPerMonthDisplay}`);
    listItems.push(`Average weekly ${normalizedTargetLabel.toLowerCase()}: ${targetAveragePerWeekDisplay}`);
    listItems.push(`Average monthly ${normalizedTargetLabel.toLowerCase()}: ${targetAveragePerMonthDisplay}`);

    if (targetMode === 'gross') {
      const netAnnualDisplay = formatCurrency(currencySymbol, summaryNetIncome);
      const netWeeklyDisplay = Number.isFinite(summaryNetWeekly)
        ? formatCurrency(currencySymbol, summaryNetWeekly)
        : '—';
      const netMonthlyDisplay = Number.isFinite(summaryNetMonthly)
        ? formatCurrency(currencySymbol, summaryNetMonthly)
        : '—';
      const netDailyDisplay = Number.isFinite(summaryNetDaily)
        ? formatCurrency(currencySymbol, summaryNetDaily)
        : '—';
      const netAvgWeekDisplay = Number.isFinite(summaryNetAverageWeek)
        ? formatCurrency(currencySymbol, summaryNetAverageWeek)
        : '—';
      const netAvgMonthDisplay = Number.isFinite(summaryNetAverageMonth)
        ? formatCurrency(currencySymbol, summaryNetAverageMonth)
        : '—';
      listItems.push(`Estimated net after taxes per year: ${netAnnualDisplay}`);
      listItems.push(`Estimated net per active week: ${netWeeklyDisplay}`);
      listItems.push(`Estimated net per active month: ${netMonthlyDisplay}`);
      listItems.push(`Estimated net per active day: ${netDailyDisplay}`);
      listItems.push(`Average weekly net after taxes: ${netAvgWeekDisplay}`);
      listItems.push(`Average monthly net after taxes: ${netAvgMonthDisplay}`);
    }

    listItems.push(`Estimated profit before income tax: ${profitBeforeTaxDisplay}`);
    listItems.push(`Tax strategy: ${taxStrategyDescription}`);
    listItems.push(taxReserveLine);
    listItems.push(`Income tax portion: ${incomeTaxDisplay}`);
    if (isDutchStrategy) {
      listItems.push(`Zvw health contribution: ${zvwContributionDisplay}`);
    }
    listItems.push(`Effective income tax rate: ${effectiveRateDisplay}%`);
    if (isDutchStrategy) {
      listItems.push(`Entrepreneur deduction (zelfstandigenaftrek): ${zelfstandigenaftrekDisplay}`);
      listItems.push(`Starter deduction (startersaftrek): ${startersaftrekDisplay}`);
      listItems.push(`MKB-vrijstelling (${mkbVrijstellingRateDisplay}%): ${mkbVrijstellingDisplay}`);
      listItems.push(`Taxable profit before MKB-vrijstelling: ${taxableBeforeMkbDisplay}`);
      listItems.push(`Taxable profit after MKB-vrijstelling: ${taxableAfterMkbDisplay}`);
      listItems.push(`Zvw contribution base: ${zvwBaseDisplay}`);
    } else {
      listItems.push('Dutch entrepreneur deductions are not applied in simple mode.');
    }
    listItems.push(`Fixed annual costs: ${formatCurrency(currencySymbol, fixedCosts)}`);
    listItems.push(`Variable cost per working day: ${formatCurrency(currencySymbol, variableCostPerClass)}`);
    listItems.push(`Estimated annual variable costs: ${formatCurrency(currencySymbol, annualVariableCosts)}`);
    listItems.push(`Months off per year: ${formatFixed(monthsOff, 2)} (≈ ${formatFixed(activeMonths, 2)} active months; ${formatFixed(activeMonthPercentage, 1)}% of the year)`);
    listItems.push(`Weeks off per 4-week cycle: ${formatFixed(weeksOffPerCycle, 2)} (≈ ${formatFixed(workingWeeksPerCycle, 2)} working weeks each cycle; ${formatFixed(activeWeeksPercentage, 1)}% active weeks)`);
    listItems.push(`Days off per week: ${formatFixed(daysOffPerWeek, 2)} (≈ ${formatFixed(workingDaysPerWeek, 2)} working days when active)`);
    listItems.push(`Estimated working weeks per year: ${formatFixed(workingWeeks, 2)}`);
    listItems.push(`Estimated working days per year: ${formatFixed(workingDaysPerYear, 2)}`);
    listItems.push(`Target utilization during active weeks: ${utilizationDisplay}%`);
    listItems.push(`Billable days before travel allowances: ${billableDaysPerYearDisplay} (after travel: ${billableDaysAfterTravelDisplay})`);
    listItems.push(`Non-billable share of active days: ${nonBillableShareDisplay === '—' ? '—' : `${nonBillableShareDisplay}%`}`);
    listItems.push(`Session length assumption: ${sessionLengthDisplay} hours`);
    listItems.push(`Estimated billable hours per year: ${billableHoursDisplay}`);
    listItems.push(`Travel days planned per active month: ${travelDaysPerMonthDisplay}; ≈ ${travelDaysPerYearDisplay} days (${travelWeeksPerYearDisplay} weeks) per year`);
    listItems.push(`Travel allowance impact on availability: ${travelAllowanceDaysDisplay} days (${travelAllowanceSharePercent}% of active days; ${travelAllowanceBillablePercent}% of billable plan)`);
    listItems.push(`Safety margin applied to revenue: ${bufferEffectiveDisplay}% (base ${bufferBaseDisplay}% + comfort uplift ${comfortMarginDisplay}%)`);
    listItems.push(`Seasonality drag on availability: ${seasonalityDisplay}%`);
    listItems.push(`Travel friction overhead applied to travel days: ${travelFrictionDisplay}%`);
    listItems.push(`Hands-on delivery quota target: ${handsOnQuotaDisplay}% of delivery days`);
    listItems.push(`VAT rate: ${formatFixed(vatRate * 100, 1)}%`);
    listItems.push(`Currency symbol: ${currencySymbol}`);
    listItems.push('Values are rounded to whole currency units for display and CSV export.');

    assumptionsList.innerHTML = listItems.map(item => `<li>${item}</li>`).join('');
  }

  function renderDerivedViews(state, views) {
    const inputs = extractInputsFromViews(views, state);
    const summary = computeRevenueSummary(inputs);

    updateScheduleWarnings(state, views);

    latestSummary = summary && Number.isFinite(summary.baseRevenue) ? summary : null;

    if (summary && Number.isFinite(summary.baseRevenue)) {
      const baseBasis = summary.targetMode === 'gross'
        ? 'Before safety margin. Subtracts fixed and estimated variable costs to show expected profit before tax.'
        : 'Includes fixed and estimated variable costs.';
      latestResults = [
        {
          label: 'Annual total',
          base: summary.baseRevenue,
          buffered: summary.bufferedRevenue,
          basis: baseBasis
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
        },
        {
          label: 'Billable hour',
          base: summary.hourlyBase,
          buffered: summary.hourlyBuffered,
          basis: Number.isFinite(summary.billableHours) && summary.billableHours > 0
            ? `≈ ${formatFixed(summary.billableHours, 2)} billable hours`
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

    const focusDescription = latestSummary && latestSummary.targetMode === 'gross'
      ? 'Gross revenue target'
      : 'Gross revenue needed for net take-home';
    const header = 'Period,Base gross revenue,Buffered gross revenue,Basis,Target focus';
    const rows = latestResults.map(entry => {
      const base = Number.isFinite(entry.base) ? Math.round(entry.base) : '';
      const buffered = Number.isFinite(entry.buffered) ? Math.round(entry.buffered) : '';
      const basis = entry.basis ? entry.basis.replace(/,/g, ';') : '';
      return [entry.label, base, buffered, basis, focusDescription].join(',');
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
      controls.statusMessage.textContent = `CSV download started. File lists base and buffered gross revenue (${focusDescription.toLowerCase()}).`;
      setTimeout(() => {
        if (controls.statusMessage) {
          controls.statusMessage.textContent = '';
        }
      }, 2500);
    }
  }

  function handleIncomePresetClick(event) {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    const button = event.target.closest('button[data-target-value]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    event.preventDefault();
    const value = Number(button.dataset.targetValue);
    if (!Number.isFinite(value)) {
      return;
    }

    setTargetNetBasis('year');
    setIncomeTargetValue('year', value);
    setActiveIncomePreset(button);

    const symbol = typeof calcState.config?.currencySymbol === 'string' && calcState.config.currencySymbol
      ? calcState.config.currencySymbol
      : '€';
    announce(`Annual target set to ${formatCurrency(symbol, value)}.`);

    if (persistenceEnabled) {
      setTimeout(() => {
        savePersistedInputs({ [PERSISTED_TARGET_NET_BASIS_KEY]: 'year' });
      }, 0);
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

  function applyInputValues(values) {
    if (!values || typeof values !== 'object') {
      return;
    }

    const storedBasis = values[PERSISTED_TARGET_NET_BASIS_KEY];
    if (typeof storedBasis === 'string' && TARGET_NET_BASIS_VALUES.includes(storedBasis)) {
      setTargetNetBasis(storedBasis);
    }

    Object.entries(values).forEach(([id, storedValue]) => {
      if (id === PERSISTED_TARGET_NET_BASIS_KEY) {
        return;
      }

      const writer = controlWriters.get(id);
      if (typeof writer === 'function') {
        writer(storedValue);
        return;
      }

      const fixedCostMeta = fixedCostFieldIndex.get(id);
      if (fixedCostMeta) {
        const fieldSet = fixedCostFields[fixedCostMeta.key];
        const input = fixedCostMeta.type === 'monthly' ? fieldSet.monthly : fieldSet.annual;
        const raw = storedValue == null ? '' : String(storedValue);
        if (input instanceof HTMLInputElement) {
          input.value = raw;
        }
        const numeric = raw === '' ? 0 : Math.max(parseNumber(raw, 0), 0);
        const store = ensureFixedCostStore(fixedCostMeta.key);
        store[fixedCostMeta.type] = numeric;
        return;
      }

      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = Boolean(storedValue);
        if (input.id === 'tax-mode-simple' && input.checked) {
          setTaxMode('simple');
        } else if (input.id === 'tax-mode-dutch' && input.checked) {
          setTaxMode('dutch2025');
        } else if (input.id === 'target-mode-net' && input.checked) {
          setIncomeTargetMode('net');
        } else if (input.id === 'target-mode-gross' && input.checked) {
          setIncomeTargetMode('gross');
        }
        return;
      }

      input.value = storedValue == null ? '' : String(storedValue);
    });

    updateFixedCostTotalDisplay();
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

        applyInputValues(defaults);
      });
    }
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

    if (controls.incomePresetContainer instanceof HTMLElement) {
      controls.incomePresetContainer.addEventListener('click', handleIncomePresetClick);
    }

    window.addEventListener('resize', scheduleTablesLayoutUpdate);
  }
}
