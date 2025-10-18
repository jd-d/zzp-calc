import { onLocaleChange, translate } from './i18n.js';

export function initializePageUi() {
  const howToLink = document.getElementById('how-to-link');
  const readmeDialog = document.getElementById('readme-dialog');
  const readmeBody = document.getElementById('readme-body');
  const readmeClose = document.getElementById('readme-close');
  const readmeBackdrop = document.getElementById('readme-backdrop');
  let readmeLoaded = false;
  let readmeLoading = false;
  let previouslyFocusedElement = null;

  const COLLAPSIBLE_SECTION_SELECTOR = '.control-section[data-collapsible]';
  const collapsibleSections = new Map();

  function getSectionLabel(section, index = 0) {
    if (!section) {
      return `Section ${index + 1}`;
    }

    const title = section.querySelector('.section-title');
    const labelText = title && title.textContent ? title.textContent.trim() : '';

    if (labelText) {
      section.dataset.sectionLabel = labelText;
      return labelText;
    }

    if (section.dataset.sectionLabel) {
      return section.dataset.sectionLabel;
    }

    const fallback = `Section ${index + 1}`;
    section.dataset.sectionLabel = fallback;
    return fallback;
  }

  function updateToggleButtonState(toggle, collapsed, sectionLabel) {
    if (!toggle) {
      return;
    }

    const expandedText = toggle.getAttribute('data-expanded-text') || 'Collapse section';
    const collapsedText = toggle.getAttribute('data-collapsed-text') || 'Expand section';
    const labelElement = toggle.querySelector('.toggle-label');
    const nextText = collapsed ? collapsedText : expandedText;

    if (labelElement) {
      labelElement.textContent = nextText;
    } else {
      toggle.textContent = nextText;
    }

    const actionText = collapsed ? collapsedText : expandedText;
    const normalizedAction = actionText.replace(/\s+section$/i, '');
    const normalizedLabel = sectionLabel || 'section';

    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', `${normalizedAction} ${normalizedLabel} section`);
    toggle.setAttribute('title', `${normalizedAction} ${normalizedLabel} section`);
  }

  function registerCollapsibleSection(section) {
    if (!(section instanceof HTMLElement)) {
      return;
    }

    const body = section.querySelector('.section-body');
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const existing = collapsibleSections.get(section);
    const listeners = existing ? existing.listeners : new Map();
    const collapsed = section.classList.contains('collapsed');
    const fallbackIndex = collapsibleSections.size;
    const sectionLabel = getSectionLabel(section, fallbackIndex);
    section.dataset.sectionLabel = sectionLabel;

    if (!body.id) {
      const baseId = sectionLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `section-${fallbackIndex + 1}`;

      let uniqueId = baseId;
      let attempt = 1;
      while (document.getElementById(uniqueId)) {
        attempt += 1;
        uniqueId = `${baseId}-${attempt}`;
      }

      body.id = uniqueId;
    }

    const seenToggles = new Set();
    section.querySelectorAll('.section-toggle').forEach(toggle => {
      if (!(toggle instanceof HTMLElement)) {
        return;
      }

      if (seenToggles.has(toggle)) {
        return;
      }

      seenToggles.add(toggle);

      const handler = event => {
        event.preventDefault();
        setSectionExpanded(section, !section.classList.contains('collapsed'), toggle);
      };

      toggle.addEventListener('click', handler);
      listeners.set(toggle, handler);

      updateToggleButtonState(toggle, collapsed, sectionLabel);
      toggle.setAttribute('aria-controls', body.id);
    });

    collapsibleSections.set(section, {
      body,
      listeners
    });
  }

  function unregisterCollapsibleSection(section) {
    const data = collapsibleSections.get(section);
    if (!data) {
      return;
    }

    for (const [toggle, handler] of data.listeners.entries()) {
      if (toggle instanceof HTMLElement && typeof handler === 'function') {
        toggle.removeEventListener('click', handler);
      }
    }

    collapsibleSections.delete(section);
  }

  function setSectionExpanded(section, expanded, trigger) {
    if (!(section instanceof HTMLElement)) {
      return;
    }

    if (!collapsibleSections.has(section)) {
      registerCollapsibleSection(section);
    }

    const data = collapsibleSections.get(section);
    if (!data) {
      return;
    }

    const isCollapsed = section.classList.contains('collapsed');
    const nextCollapsed = typeof expanded === 'boolean' ? !expanded : !isCollapsed;

    if (nextCollapsed === isCollapsed) {
      const scroll = () => {
        if (typeof section.scrollIntoView === 'function') {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(scroll);
      } else {
        scroll();
      }
      return;
    }

    section.classList.toggle('collapsed', nextCollapsed);
    const sectionLabel = getSectionLabel(section, 0);
    section.dataset.sectionLabel = sectionLabel;

    for (const toggle of data.listeners.keys()) {
      updateToggleButtonState(toggle, nextCollapsed, sectionLabel);
    }

    if (nextCollapsed && trigger && trigger.classList.contains('section-toggle--bottom')) {
      const topToggle = section.querySelector('.section-toggle--top');
      if (topToggle && typeof topToggle.focus === 'function') {
        try {
          topToggle.focus({ preventScroll: true });
        } catch (error) {
          topToggle.focus();
        }
      }
    }

    const scroll = () => {
      if (typeof section.scrollIntoView === 'function') {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scroll);
    } else {
      scroll();
    }
  }

  function refreshCollapsibleSections(root = document) {
    Array.from(root.querySelectorAll(COLLAPSIBLE_SECTION_SELECTOR)).forEach(section => {
      registerCollapsibleSection(section);
    });
  }

  refreshCollapsibleSections(document);

  if (typeof MutationObserver === 'function') {
    const observerTarget = document.body || document.documentElement;
    if (observerTarget) {
      const collapsibleObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          mutation.addedNodes?.forEach(node => {
            if (!(node instanceof HTMLElement)) {
              return;
            }

            if (node.matches && node.matches(COLLAPSIBLE_SECTION_SELECTOR)) {
              registerCollapsibleSection(node);
            }

            if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll(COLLAPSIBLE_SECTION_SELECTOR).forEach(childSection => {
                registerCollapsibleSection(childSection);
              });
            }
          });

          mutation.removedNodes?.forEach(node => {
            if (!(node instanceof HTMLElement)) {
              return;
            }

            if (collapsibleSections.has(node)) {
              unregisterCollapsibleSection(node);
            }

            if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll(COLLAPSIBLE_SECTION_SELECTOR).forEach(childSection => {
                unregisterCollapsibleSection(childSection);
              });
            }
          });
        }
      });

      collapsibleObserver.observe(observerTarget, { childList: true, subtree: true });
    }
  }

  const scrollLocks = new Map();

  function getFocusableElements(container) {
    if (!container) {
      return [];
    }

    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.from(container.querySelectorAll(selectors)).filter(element => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function setBodyScrollLock(source, locked) {
    if (!locked) {
      scrollLocks.delete(source);
    } else {
      scrollLocks.set(source, true);
    }

    document.documentElement.classList.toggle('scroll-locked', scrollLocks.size > 0);
  }

  function parseMarkdown(text) {
    try {
      if (window.marked && typeof window.marked.parse === 'function') {
        return window.marked.parse(text);
      }
    } catch (error) {
      // Ignore parser errors
    }
    return `<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  }

  async function loadReadme() {
    if (readmeLoaded || readmeLoading || !readmeBody) {
      return;
    }

    readmeLoading = true;

    try {
      const response = await fetch('./README.md');
      if (!response.ok) {
        throw new Error(`Failed to load README: ${response.status}`);
      }
      const text = await response.text();
      readmeBody.innerHTML = parseMarkdown(text);
      readmeLoaded = true;
    } catch (error) {
      console.error(error);
      readmeBody.innerHTML = '<p class="readme-status readme-status--error">Unable to load instructions. Please check the README file directly.</p>';
    } finally {
      readmeLoading = false;
    }
  }

  function openReadme(event) {
    if (event) {
      event.preventDefault();
    }

    if (!readmeDialog || !readmeBody) {
      return;
    }

    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    readmeDialog.hidden = false;
    setBodyScrollLock('readme', true);

    if (!readmeLoaded) {
      readmeBody.innerHTML = '<p class="readme-status">Loading instructions…</p>';
      loadReadme();
    }

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        if (readmeClose) {
          readmeClose.focus();
        }
      });
    } else if (readmeClose) {
      readmeClose.focus();
    }

    document.addEventListener('keydown', handleReadmeKeydown);
  }

  function closeReadme() {
    if (!readmeDialog) {
      return;
    }

    readmeDialog.hidden = true;
    setBodyScrollLock('readme', false);
    document.removeEventListener('keydown', handleReadmeKeydown);

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      previouslyFocusedElement.focus();
    }
  }

  function handleReadmeKeydown(event) {
    if (event.key === 'Escape') {
      closeReadme();
      return;
    }

    if (event.key === 'Tab' && readmeDialog && !readmeDialog.hidden) {
      const focusable = getFocusableElements(readmeDialog);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
  }

  if (howToLink) {
    howToLink.addEventListener('click', openReadme);
  }

  if (readmeClose) {
    readmeClose.addEventListener('click', closeReadme);
  }

  if (readmeBackdrop) {
    readmeBackdrop.addEventListener('click', closeReadme);
  }

  if (readmeDialog) {
    readmeDialog.addEventListener('click', event => {
      if (event.target === readmeDialog) {
        closeReadme();
      }
    });
  }

  const themeRoot = document.documentElement;
  const themeToggleButton = document.getElementById('theme-toggle');
  const themeToggleLabel = themeToggleButton ? themeToggleButton.querySelector('.toggle-label') : null;
  const themeLockCheckbox = document.getElementById('theme-lock');
  const themeLockLabel = document.querySelector('.theme-lock__label');
  const THEME_STORAGE_KEY = 'zzp-calc-theme';
  const THEME_LOCK_KEY = 'zzp-calc-theme-lock';
  const prefersDarkScheme = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const prefersLightScheme = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

  function detectAutomaticTheme() {
    const hour = new Date().getHours();
    const isNight = hour >= 19 || hour < 7;

    const prefersDark = prefersDarkScheme ? prefersDarkScheme.matches : false;
    const prefersLight = prefersLightScheme ? prefersLightScheme.matches : false;

    if (prefersDark) {
      return 'dark';
    }

    if (prefersLight) {
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
      // Ignore storage access errors (e.g. private browsing restrictions)
    }
    return null;
  }

  function storeThemePreference(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Ignore storage access errors
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
    const normalized = theme === 'light' ? 'light' : 'dark';
    themeRoot.classList.remove('theme-light', 'theme-dark');
    themeRoot.classList.add(`theme-${normalized}`);
    themeRoot.dataset.theme = normalized;
    return normalized;
  }

  function getCurrentTheme() {
    return themeRoot.dataset.theme === 'light' ? 'light' : 'dark';
  }

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
  }

  function handleSystemPreferenceChange() {
    if (!respectSystemPreference) {
      return;
    }
    manualOverride = false;
    applyThemePreference(detectAutomaticTheme(), { persist: false });
  }

  function setThemeLockState(locked) {
    themeLocked = locked;
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

  let themeLocked = getStoredLockState();
  let manualOverride = false;
  let respectSystemPreference = !themeLocked;

  let storedTheme = themeLocked ? getStoredTheme() : null;
  if (themeLocked && !storedTheme) {
    themeLocked = false;
    respectSystemPreference = true;
  }

  const initialTheme = storedTheme || detectAutomaticTheme();
  applyThemePreference(initialTheme, { persist: themeLocked });

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
    setSectionExpanded
  };
}
