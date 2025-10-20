import {
  DEFAULT_LOCALE,
  detectLocaleFromNavigator,
  getAvailableLocales,
  getLocale,
  normalizeLocaleCode,
  onLocaleChange,
  setLocale,
  translate
} from './i18n.js';

const STORAGE_KEY = 'zzp-calc-locale';
const LOCALE_DATASET_KEY = 'languageOption';

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return typeof stored === 'string' && stored ? stored : null;
  } catch (error) {
    return null;
  }
}

function persistLocale(locale) {
  try {
    if (locale) {
      localStorage.setItem(STORAGE_KEY, locale);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage failures (e.g. Safari private browsing)
  }
}

function parseArgs(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const entries = raw
      .split(';')
      .map(segment => segment.trim())
      .filter(Boolean)
      .map(segment => segment.split(':'))
      .filter(pair => pair.length === 2);

    if (!entries.length) {
      return undefined;
    }

    return entries.reduce((acc, [key, value]) => {
      acc[key.trim()] = value.trim();
      return acc;
    }, {});
  }
}

function updateHtmlLangAttribute(locale) {
  const root = document.documentElement;
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const normalized = normalizeLocaleCode(locale);
  root.lang = normalized;
  root.dataset.locale = normalized;
}

function updateToggleCopy(container) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const label = translate('language.groupLabel') || 'Language selection';
  container.setAttribute('aria-label', label);

  container.querySelectorAll(`[data-${LOCALE_DATASET_KEY}]`).forEach(button => {
    const value = button.getAttribute(`data-${LOCALE_DATASET_KEY}`);
    const normalized = normalizeLocaleCode(value);
    const optionLabel = translate(`language.options.${normalized}`) || normalized.toUpperCase();
    button.setAttribute('aria-label', optionLabel);
    button.setAttribute('title', optionLabel);
    button.textContent = optionLabel;
  });
}

export function applyTranslationsToDom(root = document) {
  const context = root instanceof Document || root instanceof HTMLElement ? root : document;
  const elements = context.querySelectorAll('[data-i18n-key]');

  elements.forEach(element => {
    const key = element.getAttribute('data-i18n-key');
    if (!key) {
      return;
    }

    const args = parseArgs(element.getAttribute('data-i18n-args'));
    const translation = translate(key, args);

    if (typeof translation !== 'string' || !translation) {
      const fallback = element.getAttribute('data-i18n-fallback');
      if (!fallback) {
        return;
      }
      if (element.hasAttribute('data-i18n-attr')) {
        const attrs = element
          .getAttribute('data-i18n-attr')
          .split(',')
          .map(attr => attr.trim())
          .filter(Boolean);
        attrs.forEach(attr => {
          element.setAttribute(attr, fallback);
        });
      } else {
        element.textContent = fallback;
      }
      return;
    }

    const attrList = element
      .getAttribute('data-i18n-attr')
      ?.split(',')
      .map(attr => attr.trim())
      .filter(Boolean);

    if (attrList && attrList.length) {
      attrList.forEach(attr => {
        element.setAttribute(attr, translation);
      });
      if (attrList.includes('aria-label') && !attrList.includes('title')) {
        element.setAttribute('title', translation);
      }
      return;
    }

    if (element.hasAttribute('data-i18n-html')) {
      element.innerHTML = translation;
      return;
    }

    element.textContent = translation;
  });
}

function setActiveLocale(locale, { persist = true } = {}) {
  const normalized = normalizeLocaleCode(locale);
  const nextLocale = setLocale(normalized);
  if (persist) {
    persistLocale(nextLocale);
  }
  updateHtmlLangAttribute(nextLocale);
  return nextLocale;
}

function refreshToggleState(container, activeLocale) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const buttons = container.querySelectorAll(`[data-${LOCALE_DATASET_KEY}]`);
  buttons.forEach(button => {
    const value = button.getAttribute(`data-${LOCALE_DATASET_KEY}`);
    const isActive = normalizeLocaleCode(value) === normalizeLocaleCode(activeLocale);
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

export function initializeLanguageControls({ root = document } = {}) {
  const context = root instanceof Document || root instanceof HTMLElement ? root : document;
  const toggleGroup = context.querySelector('[data-language-toggle]');
  const available = getAvailableLocales();

  const storedLocale = readStoredLocale();

  let initialLocale = storedLocale;
  if (!initialLocale || !available.includes(normalizeLocaleCode(initialLocale))) {
    initialLocale = detectLocaleFromNavigator({ fallback: DEFAULT_LOCALE });
  }

  const appliedLocale = setActiveLocale(initialLocale, { persist: Boolean(storedLocale) });
  applyTranslationsToDom(context);
  refreshToggleState(toggleGroup, appliedLocale);

  if (toggleGroup instanceof HTMLElement) {
    updateToggleCopy(toggleGroup);

    toggleGroup.querySelectorAll(`[data-${LOCALE_DATASET_KEY}]`).forEach(button => {
      const value = button.getAttribute(`data-${LOCALE_DATASET_KEY}`);
      const normalized = normalizeLocaleCode(value);

      button.addEventListener('click', () => {
        setActiveLocale(normalized, { persist: true });
      });
    });
  }

  const unsubscribe = onLocaleChange(locale => {
    applyTranslationsToDom(context);
    updateHtmlLangAttribute(locale);
    updateToggleCopy(toggleGroup);
    refreshToggleState(toggleGroup, locale);
  });

  return {
    getLocale,
    destroy: () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
  };
}
