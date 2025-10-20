import { initializeThemeControls } from './theming.js';
import { initializeLanguageControls } from './language.js';

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
  const TOOLTIP_SELECTOR = '[data-tooltip]';
  const collapsibleSections = new Map();
  const tooltipTriggers = new Map();
  let activeTooltip = null;
  let tooltipIdCounter = 0;

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
        setSectionExpanded(section, section.classList.contains('collapsed'), toggle);
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

  function positionTooltip(trigger, tooltip) {
    if (!(trigger instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const tooltipRect = tooltip.getBoundingClientRect();

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0;

    let top = rect.bottom + scrollY + 8;
    let left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;

    const minLeft = scrollX + 8;
    const maxLeft = scrollX + Math.max(viewportWidth - tooltipRect.width - 8, 0);
    if (left < minLeft) {
      left = minLeft;
    } else if (left > maxLeft) {
      left = maxLeft;
    }

    const maxBottom = scrollY + Math.max(viewportHeight - 8, 0);
    if (top + tooltipRect.height > maxBottom) {
      top = rect.top + scrollY - tooltipRect.height - 8;
    }

    const minTop = scrollY + 8;
    if (top < minTop) {
      top = minTop;
    }

    tooltip.style.position = 'absolute';
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function hideTooltip(trigger) {
    if (!activeTooltip) {
      return;
    }

    if (trigger && activeTooltip.trigger !== trigger) {
      return;
    }

    const { trigger: activeTrigger, tooltip, previousDescribedBy } = activeTooltip;

    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }

    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'false');

      if (previousDescribedBy) {
        activeTrigger.setAttribute('aria-describedby', previousDescribedBy);
      } else {
        activeTrigger.removeAttribute('aria-describedby');
      }
    }

    activeTooltip = null;
  }

  function showTooltip(trigger, { persistent = false } = {}) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const text = trigger.getAttribute('data-tooltip');
    if (!text) {
      return;
    }

    const message = text.trim();
    if (!message) {
      return;
    }

    if (activeTooltip && activeTooltip.trigger === trigger) {
      activeTooltip.persistent = persistent || activeTooltip.persistent;
      if (activeTooltip.tooltip) {
        positionTooltip(trigger, activeTooltip.tooltip);
      }
      return;
    }

    hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.setAttribute('role', 'tooltip');

    const tooltipId = trigger.getAttribute('data-tooltip-id') || `tooltip-${++tooltipIdCounter}`;
    tooltip.id = tooltipId;
    trigger.setAttribute('data-tooltip-id', tooltipId);

    tooltip.textContent = message;

    document.body.appendChild(tooltip);
    positionTooltip(trigger, tooltip);

    const previousDescribedBy = trigger.getAttribute('aria-describedby') || '';
    const tokens = previousDescribedBy.split(/\s+/).filter(Boolean);
    if (!tokens.includes(tooltipId)) {
      tokens.push(tooltipId);
    }

    if (tokens.length) {
      trigger.setAttribute('aria-describedby', tokens.join(' '));
    } else {
      trigger.removeAttribute('aria-describedby');
    }

    trigger.setAttribute('aria-expanded', 'true');

    activeTooltip = {
      trigger,
      tooltip,
      id: tooltipId,
      persistent,
      previousDescribedBy
    };
  }

  function toggleTooltip(trigger) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    if (activeTooltip && activeTooltip.trigger === trigger && activeTooltip.persistent) {
      hideTooltip(trigger);
    } else {
      showTooltip(trigger, { persistent: true });
    }
  }

  function handleDocumentPointerDown(event) {
    if (!activeTooltip) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      hideTooltip();
      return;
    }

    const { trigger, tooltip, persistent } = activeTooltip;
    if (!trigger) {
      hideTooltip();
      return;
    }

    if (trigger.contains(target) || (tooltip && tooltip.contains(target))) {
      if (!persistent) {
        hideTooltip();
      }
      return;
    }

    hideTooltip();
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'Escape' && activeTooltip) {
      const trigger = activeTooltip.trigger;
      hideTooltip();
      if (trigger && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    }
  }

  function handleViewportChange() {
    if (!activeTooltip) {
      return;
    }

    if (activeTooltip.persistent && activeTooltip.trigger && activeTooltip.tooltip) {
      positionTooltip(activeTooltip.trigger, activeTooltip.tooltip);
    } else {
      hideTooltip();
    }
  }

  function registerTooltipTrigger(trigger) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    if (tooltipTriggers.has(trigger)) {
      return;
    }

    const text = trigger.getAttribute('data-tooltip');
    if (!text) {
      return;
    }

    if (!trigger.hasAttribute('aria-expanded')) {
      trigger.setAttribute('aria-expanded', 'false');
    }

    const handleClick = event => {
      event.preventDefault();
      toggleTooltip(trigger);
    };

    const handleKeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleTooltip(trigger);
      } else if (event.key === 'Escape') {
        hideTooltip(trigger);
      }
    };

    const handleFocus = () => {
      showTooltip(trigger);
    };

    const handleBlur = () => {
      if (!activeTooltip || activeTooltip.trigger !== trigger || activeTooltip.persistent) {
        return;
      }
      hideTooltip(trigger);
    };

    const handlePointerEnter = event => {
      if (event.pointerType === 'mouse') {
        showTooltip(trigger);
      }
    };

    const handlePointerLeave = event => {
      if (event.pointerType === 'mouse' && activeTooltip && activeTooltip.trigger === trigger && !activeTooltip.persistent) {
        hideTooltip(trigger);
      }
    };

    trigger.addEventListener('click', handleClick);
    trigger.addEventListener('keydown', handleKeydown);
    trigger.addEventListener('focus', handleFocus);
    trigger.addEventListener('blur', handleBlur);
    trigger.addEventListener('pointerenter', handlePointerEnter);
    trigger.addEventListener('pointerleave', handlePointerLeave);

    tooltipTriggers.set(trigger, () => {
      trigger.removeEventListener('click', handleClick);
      trigger.removeEventListener('keydown', handleKeydown);
      trigger.removeEventListener('focus', handleFocus);
      trigger.removeEventListener('blur', handleBlur);
      trigger.removeEventListener('pointerenter', handlePointerEnter);
      trigger.removeEventListener('pointerleave', handlePointerLeave);
      if (activeTooltip && activeTooltip.trigger === trigger) {
        hideTooltip(trigger);
      }
    });
  }

  function unregisterTooltipTrigger(trigger) {
    const cleanup = tooltipTriggers.get(trigger);
    if (typeof cleanup === 'function') {
      cleanup();
    }
    tooltipTriggers.delete(trigger);
  }

  function refreshTooltips(root = document) {
    Array.from(root.querySelectorAll(TOOLTIP_SELECTOR)).forEach(trigger => {
      registerTooltipTrigger(trigger);
    });
  }

  refreshCollapsibleSections(document);
  refreshTooltips(document);

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
  }

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

            if (node.matches && node.matches(TOOLTIP_SELECTOR)) {
              registerTooltipTrigger(node);
            }

            if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll(TOOLTIP_SELECTOR).forEach(childTrigger => {
                registerTooltipTrigger(childTrigger);
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

            if (tooltipTriggers.has(node)) {
              unregisterTooltipTrigger(node);
            }

            if (typeof node.querySelectorAll === 'function') {
              node.querySelectorAll(TOOLTIP_SELECTOR).forEach(childTrigger => {
                unregisterTooltipTrigger(childTrigger);
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

  const languageControls = initializeLanguageControls({ root: document });
  const themeControls = initializeThemeControls();

  return {
    setSectionExpanded,
    themeControls,
    languageControls
  };
}
