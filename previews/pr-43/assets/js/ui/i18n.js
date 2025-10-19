const DEFAULT_LOCALE = 'en';
const localeStore = Object.create(null);

localeStore[DEFAULT_LOCALE] = {
  hero: {
    eyebrow: 'Fruit trade CFO sandbox',
    heading: 'ZZP Pricing Lab',
    intro:
      'Translate your net target into a resilient service mix with comfort buffer guardrails built in.',
    howToUse: 'How To Use This Tool',
    privacyLink: 'Your Info Is Safe'
  },
  theme: {
    toggleLabel: {
      dark: 'Dark mode',
      light: 'Light mode'
    },
    lockLabel: 'Lock theme',
    action: {
      switchToLight: 'Switch to light mode',
      switchToDark: 'Switch to dark mode'
    }
  },
  quickControls: {
    heading: 'Net target sandbox controls',
    description: 'Start with a net target preset, then explore service mix levers and comfort buffers.',
    presetsGroup: 'Net target sandbox presets',
    presets: {
      starter: '€40k net ramp · lean mix',
      steady: '€50k net steady · +15% buffer',
      growth: '€70k net growth · +20% buffer'
    },
    sliders: {
      targetNet: 'Annual net target',
      buffer: 'Comfort buffer uplift (%)',
      monthsOff: 'Planned months off'
    },
    status: {
      updated: 'Scenario updated'
    }
  },
  actions: {
    recalculate: 'Recompute net plan',
    downloadCsv: 'Export service mix CSV'
  },
  status: {
    ready: 'Ready to calculate',
    recalculating: 'Recalculating…',
    success: 'Updated successfully'
  }
};

let currentLocale = DEFAULT_LOCALE;
const listeners = new Set();

function normalizeLocale(locale) {
  if (typeof locale !== 'string') {
    return DEFAULT_LOCALE;
  }

  const trimmed = locale.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_LOCALE;
  }

  if (localeStore[trimmed]) {
    return trimmed;
  }

  const shortCode = trimmed.split('-')[0];
  if (shortCode && localeStore[shortCode]) {
    return shortCode;
  }

  return DEFAULT_LOCALE;
}

function getMessages(locale) {
  const normalized = normalizeLocale(locale);
  return localeStore[normalized] || localeStore[DEFAULT_LOCALE];
}

function formatTemplate(template, replacements) {
  if (typeof template !== 'string' || !template.includes('{')) {
    return template;
  }

  const data = typeof replacements === 'object' && replacements !== null ? replacements : {};

  return template.replace(/\{([^}]+)\}/g, (match, token) => {
    const key = String(token).trim();
    if (!key) {
      return match;
    }
    const value = key in data ? data[key] : undefined;
    return value == null ? match : String(value);
  });
}

function resolvePath(messages, pathSegments) {
  return pathSegments.reduce((accumulator, key) => {
    if (!accumulator || typeof accumulator !== 'object') {
      return undefined;
    }
    const next = accumulator[key];
    return next;
  }, messages);
}

function notifyLocaleChange() {
  listeners.forEach(listener => {
    try {
      listener(currentLocale);
    } catch (error) {
      console.error('Locale listener failed', error);
    }
  });
}

export function getLocale() {
  return currentLocale;
}

export function getAvailableLocales() {
  return Object.keys(localeStore);
}

export function getDictionary(locale = currentLocale) {
  return getMessages(locale);
}

export function registerLocale(locale, messages, { override = true } = {}) {
  if (typeof locale !== 'string' || !locale.trim()) {
    return;
  }

  const normalized = locale.trim().toLowerCase();
  if (!override && localeStore[normalized]) {
    return;
  }

  if (messages && typeof messages === 'object') {
    localeStore[normalized] = messages;
  }
}

export function setLocale(locale) {
  const nextLocale = normalizeLocale(locale);
  if (nextLocale === currentLocale) {
    return currentLocale;
  }

  currentLocale = nextLocale;
  notifyLocaleChange();
  return currentLocale;
}

export function translate(path, replacements, { locale } = {}) {
  if (typeof path !== 'string' || !path.trim()) {
    return '';
  }

  const activeLocale = locale ? normalizeLocale(locale) : currentLocale;
  const dictionary = getMessages(activeLocale);
  const fallbackDictionary = getMessages(DEFAULT_LOCALE);

  const segments = path.split('.').map(part => part.trim()).filter(Boolean);
  const primary = resolvePath(dictionary, segments);
  const fallback = primary === undefined ? resolvePath(fallbackDictionary, segments) : primary;

  if (fallback == null) {
    return '';
  }

  if (typeof fallback === 'string') {
    return formatTemplate(fallback, replacements);
  }

  return fallback;
}

export function onLocaleChange(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function offLocaleChange(listener) {
  if (typeof listener !== 'function') {
    return;
  }

  listeners.delete(listener);
}

export const defaultMessages = Object.freeze({ ...localeStore[DEFAULT_LOCALE] });
