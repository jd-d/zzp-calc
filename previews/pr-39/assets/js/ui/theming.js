import { translate, onLocaleChange } from './i18n.js';

const THEME_STORAGE_KEY = 'zzp-calc-theme';
const THEME_LOCK_KEY = 'zzp-calc-theme-lock';

function getThemeRoot() {
  return document.documentElement;
}

function getMediaQueryList(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  try {
    return window.matchMedia(query);
  } catch (error) {
    return null;
  }
}

const prefersDarkScheme = getMediaQueryList('(prefers-color-scheme: dark)');
const prefersLightScheme = getMediaQueryList('(prefers-color-scheme: light)');

function detectAutomaticTheme() {
  const hour = new Date().getHours();
  const isNight = hour >= 19 || hour < 7;

  if (prefersDarkScheme && prefersDarkScheme.matches) {
    return 'dark';
  }

  if (prefersLightScheme && prefersLightScheme.matches) {
    return 'light';
  }

  return isNight ? 'dark' : 'light';
}

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function storeThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Ignore storage access errors (e.g. Safari private browsing)
  }
}

function clearThemePreference() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (error) {
    // Ignore storage access errors
  }
}

function getStoredLockState() {
  try {
    return localStorage.getItem(THEME_LOCK_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

function persistLockState(locked) {
  try {
    if (locked) {
      localStorage.setItem(THEME_LOCK_KEY, 'true');
    } else {
      localStorage.removeItem(THEME_LOCK_KEY);
    }
  } catch (error) {
    // Ignore storage access errors
  }
}

function setThemeOnDocument(theme) {
  const root = getThemeRoot();
  if (!root) {
    return 'dark';
  }

  const normalized = theme === 'light' ? 'light' : 'dark';
  root.classList.remove('theme-light', 'theme-dark', 'light', 'dark');
  root.classList.add(`theme-${normalized}`, normalized);
  root.dataset.theme = normalized;
  return normalized;
}

function getCurrentTheme() {
  const root = getThemeRoot();
  if (!root) {
    return 'dark';
  }
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

function setThemeLockDataAttribute(locked) {
  const root = getThemeRoot();
  if (!root) {
    return;
  }
  root.dataset.themeLock = locked ? 'true' : 'false';
}

export function initializeThemeControls({ toggleId = 'theme-toggle', lockId = 'theme-lock' } = {}) {
  const themeToggleButton = toggleId ? document.getElementById(toggleId) : null;
  const themeToggleLabel = themeToggleButton ? themeToggleButton.querySelector('.toggle-label') : null;
  const themeLockCheckbox = lockId ? document.getElementById(lockId) : null;
  const themeLockLabel = document.querySelector('.theme-lock__label');

  function updateThemeToggleCopy(theme) {
    if (!themeToggleButton || !themeToggleLabel) {
      return;
    }

    const normalized = theme === 'light' ? 'light' : 'dark';
    const isDark = normalized === 'dark';
    const labelKey = isDark ? 'theme.toggleLabel.dark' : 'theme.toggleLabel.light';
    const actionKey = isDark ? 'theme.action.switchToLight' : 'theme.action.switchToDark';
    const fallbackAction = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    const fallbackLabel = isDark ? 'Dark mode' : 'Light mode';
    const actionLabel = translate(actionKey) || fallbackAction;
    const toggleLabel = translate(labelKey) || fallbackLabel;

    themeToggleLabel.textContent = toggleLabel;
    themeToggleButton.setAttribute('aria-pressed', String(isDark));
    themeToggleButton.setAttribute('aria-label', actionLabel);
    themeToggleButton.setAttribute('title', actionLabel);
  }

  function updateThemeLockCopy() {
    if (!themeLockLabel) {
      return;
    }
    const label = translate('theme.lockLabel') || 'Lock theme';
    themeLockLabel.textContent = label;
  }

  let themeLocked = getStoredLockState();
  let manualOverride = false;
  let respectSystemPreference = !themeLocked;

  let storedTheme = themeLocked ? getStoredTheme() : null;
  if (themeLocked && !storedTheme) {
    themeLocked = false;
    respectSystemPreference = true;
  }

  function applyThemePreference(theme, { persist } = {}) {
    const normalized = setThemeOnDocument(theme);
    const shouldPersist = typeof persist === 'boolean' ? persist : themeLocked;

    if (shouldPersist) {
      storeThemePreference(normalized);
    } else {
      clearThemePreference();
    }

    updateThemeToggleCopy(normalized);
    updateThemeLockCopy();
    return normalized;
  }

  function handleSystemPreferenceChange() {
    if (!respectSystemPreference) {
      return;
    }
    manualOverride = false;
    applyThemePreference(detectAutomaticTheme(), { persist: false });
  }

  function setThemeLockState(locked) {
    themeLocked = Boolean(locked);
    setThemeLockDataAttribute(themeLocked);
    persistLockState(themeLocked);

    if (themeLockCheckbox) {
      themeLockCheckbox.checked = themeLocked;
    }

    if (themeLocked) {
      manualOverride = false;
      respectSystemPreference = false;
      applyThemePreference(getCurrentTheme(), { persist: true });
      return;
    }

    respectSystemPreference = !manualOverride;
    clearThemePreference();

    if (!manualOverride) {
      applyThemePreference(detectAutomaticTheme(), { persist: false });
    }
  }

  const initialTheme = storedTheme || detectAutomaticTheme();
  applyThemePreference(initialTheme, { persist: themeLocked });
  setThemeLockDataAttribute(themeLocked);

  if (themeLockCheckbox) {
    themeLockCheckbox.checked = themeLocked;
  }

  const mediaListeners = [prefersDarkScheme, prefersLightScheme];
  mediaListeners.forEach(media => {
    if (!media) {
      return;
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleSystemPreferenceChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleSystemPreferenceChange);
    }
  });

  if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => {
      const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      if (!themeLocked) {
        manualOverride = true;
        respectSystemPreference = false;
      }
      applyThemePreference(nextTheme, { persist: themeLocked });
    });
  }

  if (themeLockCheckbox) {
    themeLockCheckbox.addEventListener('change', event => {
      setThemeLockState(event.target.checked);
    });
  }

  onLocaleChange(() => {
    updateThemeToggleCopy(getCurrentTheme());
    updateThemeLockCopy();
  });

  return {
    applyThemePreference,
    getCurrentTheme,
    isLocked: () => themeLocked,
    setThemeLockState
  };
}

export function getTheme() {
  return getCurrentTheme();
}

export function setTheme(theme, { persist } = {}) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  setThemeOnDocument(normalized);
  if (persist) {
    storeThemePreference(normalized);
  }
  return normalized;
}
