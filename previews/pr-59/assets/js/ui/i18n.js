export const DEFAULT_LOCALE = 'en';
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
    rows: {
      timeoff: 'Time off plan',
      weekly: 'Weekly hours target',
      travel: 'Travel intensity'
    },
    options: {
      timeoff: {
        zero: '0 months',
        one: '1 month',
        two: '2 months'
      },
      weekly: {
        h32: '32 hours',
        h36: '36 hours',
        h40: '40 hours'
      },
      travel: {
        light: 'Light travel',
        base: 'Base travel',
        heavy: 'Heavy travel'
      }
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
  },
  language: {
    groupLabel: 'Language selection',
    options: {
      en: 'English',
      es: 'Español'
    }
  },
  readme: {
    close: 'Close instructions'
  },
  portfolio: {
    comfort: {
      title: 'Comfort index',
      valueUnavailable: 'N/A',
      loadingSummary: 'Comfort score will appear once the solver runs.',
      readyFallback: 'Comfort summary ready.',
      travelHeading: 'Travel fatigue',
      travelDaysLabel: 'Travel days',
      travelLimitLabel: 'Annual allowance',
      travelFrictionLabel: 'Travel friction',
      travelMultiplierLabel: 'Effective multiplier',
      travelUnavailable: 'Travel fatigue indicators will appear once optimization data is ready.',
      travelSummary: {
        low: 'Travel load is within a comfortable range.',
        medium: 'Travel load is rising. Monitor fatigue over upcoming weeks.',
        high: 'Travel commitments are near the limit. Rebalance travel or delivery expectations.',
        unknown: 'Travel fatigue insights are unavailable for this scenario.'
      },
      flags: {
        margin: 'margin quality',
        service: 'service days',
        travel: 'travel days',
        handsOn: 'hands-on mix'
      },
      summary: {
        pending: 'Adjust your scenario to compute comfort.',
        high: 'Comfortable margin across workload, travel, and delivery targets.',
        medium: 'Mixed comfort. Review highlighted constraints to stay on track.',
        low: 'Comfort risk detected. Adjust capacity, travel, or pricing inputs.',
        focusSingle: 'Focus on {factor} to improve comfort.',
        focusMultiple: 'Focus on {factors} to improve comfort.'
      }
    }
  }
};

localeStore.es = {
  hero: {
    eyebrow: 'Sandbox para la CFO del comercio de fruta',
    heading: 'Laboratorio de precios ZZP',
    intro:
      'Convierte tu objetivo neto en una mezcla de servicios resiliente con márgenes de confort integrados.',
    howToUse: 'Cómo usar esta herramienta',
    privacyLink: 'Tu información está segura'
  },
  theme: {
    toggleLabel: {
      dark: 'Modo oscuro',
      light: 'Modo claro'
    },
    lockLabel: 'Bloquear tema',
    action: {
      switchToLight: 'Cambiar a modo claro',
      switchToDark: 'Cambiar a modo oscuro'
    }
  },
  quickControls: {
    heading: 'Controles del sandbox de objetivo neto',
    description: 'Empieza con un preset de objetivo neto y luego explora las palancas de servicios y márgenes de confort.',
    presetsGroup: 'Presets del sandbox de objetivo neto',
    presets: {
      starter: 'Rampa neta de 40k € · mezcla ajustada',
      steady: 'Neto estable de 50k € · +15% amortiguador',
      growth: 'Crecimiento neto de 70k € · +20% amortiguador'
    },
    rows: {
      timeoff: 'Plan de descansos',
      weekly: 'Objetivo de horas semanales',
      travel: 'Intensidad de viajes'
    },
    options: {
      timeoff: {
        zero: '0 meses',
        one: '1 mes',
        two: '2 meses'
      },
      weekly: {
        h32: '32 horas',
        h36: '36 horas',
        h40: '40 horas'
      },
      travel: {
        light: 'Viajes ligeros',
        base: 'Viajes base',
        heavy: 'Viajes intensos'
      }
    },
    sliders: {
      targetNet: 'Objetivo neto anual',
      buffer: 'Aumento del colchón de confort (%)',
      monthsOff: 'Meses libres planificados'
    },
    status: {
      updated: 'Escenario actualizado'
    }
  },
  actions: {
    recalculate: 'Recalcular plan neto',
    downloadCsv: 'Exportar mezcla de servicios (CSV)'
  },
  status: {
    ready: 'Listo para calcular',
    recalculating: 'Recalculando…',
    success: 'Actualizado correctamente'
  },
  language: {
    groupLabel: 'Selección de idioma',
    options: {
      en: 'Inglés',
      es: 'Español'
    }
  },
  readme: {
    close: 'Cerrar instrucciones'
  },
  portfolio: {
    comfort: {
      title: 'Índice de confort',
      valueUnavailable: 'N/D',
      loadingSummary: 'El puntaje de confort aparecerá después de ejecutar el optimizador.',
      readyFallback: 'Resumen de confort preparado.',
      travelHeading: 'Fatiga por viajes',
      travelDaysLabel: 'Días de viaje',
      travelLimitLabel: 'Límite anual',
      travelFrictionLabel: 'Fricción de viajes',
      travelMultiplierLabel: 'Multiplicador efectivo',
      travelUnavailable: 'Los indicadores de fatiga por viajes aparecerán cuando haya datos del optimizador.',
      travelSummary: {
        low: 'La carga de viajes está en un rango cómodo.',
        medium: 'La carga de viajes va en aumento. Vigila la fatiga en las próximas semanas.',
        high: 'Los compromisos de viaje están cerca del límite. Rebalancea viajes o entregas.',
        unknown: 'No hay información de fatiga por viajes para este escenario.'
      },
      flags: {
        margin: 'calidad del margen',
        service: 'días de servicio',
        travel: 'días de viaje',
        handsOn: 'mezcla práctica'
      },
      summary: {
        pending: 'Ajusta tu escenario para calcular el confort.',
        high: 'Confort sólido en carga de trabajo, viajes y entrega.',
        medium: 'Confort mixto. Revisa las restricciones resaltadas para mantener el rumbo.',
        low: 'Riesgo de confort detectado. Ajusta capacidad, viajes o precios.',
        focusSingle: 'Enfócate en {factor} para mejorar el confort.',
        focusMultiple: 'Enfócate en {factors} para mejorar el confort.'
      }
    }
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

export function normalizeLocaleCode(locale) {
  return normalizeLocale(locale);
}

export function detectLocaleFromNavigator({ fallback = DEFAULT_LOCALE } = {}) {
  const available = getAvailableLocales();
  const candidates = [];

  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      navigator.languages.forEach(lang => {
        if (typeof lang === 'string') {
          candidates.push(lang);
        }
      });
    }

    if (typeof navigator.language === 'string') {
      candidates.push(navigator.language);
    }
  }

  candidates.push(fallback, DEFAULT_LOCALE);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (available.includes(normalized)) {
      return normalized;
    }
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
