
# Design Integration Spec - Open source 2025 UI layer for `zzp-calc`

**Audience:** the LLM that authored the Sprint plan.  
**Objective:** fold a cohesive, modern 2025 design system into the existing sprints without blocking the core calculator engine. Everything below is open source friendly.

---

## 1) Principles and non-functional requirements

- Mobile first. No tables wider than 2 columns on narrow viewports. Favor cards over wide tables.
- Pure static stack. No bundlers required. Vanilla HTML + CSS + JS modules.
- Performance budget. First contentful paint under 1.5 s on mid range mobile. Font files at or under 300 KB combined.
- Accessibility. WCAG AA contrast, focus states, screen reader announcements for recalculations, reduced motion support.
- No DOM reads during render. All UI reads state from the central store and derived calculators.
- Theming. Auto light or dark on first visit, manual toggle persists.

---

## 2) Tech choices - open source only

- Fonts: Google Fonts variable families
  - Display: Fraunces VF (opsz axis for elegant headings)
  - UI and data: Inter VF (tabular numerals enabled)
- Icons: Tabler Icons SVG set (MIT), embedded inline per component
- No external JS dependencies

---

## 3) File layout and new assets

Create these files and import them from `index.html`.

```
assets/
  css/
    design.css            # tokens, typography, layout, components
    theme.css             # light/dark rules and auto theme init helpers
  js/
    state.js              # Sprint 1 store (from spec)
    capacity.js           # Sprint 1 derived capacity helpers
    costs.js              # Sprint 1 cost aggregators
    services.js           # Sprint 2 service metadata + calculators
    ui/
      components.js       # minimal DOM utilities, templating
      service-cards.js    # Sprint 2 card rendering + updates
      scenario-toolbar.js # Sprint 3 preset chips + sliders wiring
      portfolio.js        # Sprint 4 portfolio summary + weekly grid
      theming.js          # Sprint 6 theme toggle + persistence
    tax2025.js            # Sprint 5 advanced tax strategy
tests/
  pipeline.test.html      # Sprint 1 regression harness (browser)
```

In `index.html`, change the calculator script to `type="module"` and import the UI modules after the engine modules.

---

## 4) Design tokens, typography, and theming

Add to `assets/css/design.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Inter:wght@100..900&display=swap");

/* Core tokens */
:root {
  /* Neutrals */
  --bg: #0e1111;        /* dark background */
  --bg-elev: #15191a;   /* elevated surface */
  --text: #e7ecef;      /* primary text */
  --muted: #a7b0b5;     /* secondary text */
  --border: #293033;    /* hairline */

  /* Accents inspired by fruit categories */
  --citrus: #ffd166;
  --nectarine: #ff7a59;
  --grape: #7b66ff;
  --apple: #28c76f;
  --berry: #f5317f;

  /* Semantics */
  --ok: var(--apple);
  --warn: #ffb000;
  --danger: #ff4d4f;

  /* Effects */
  --glass: rgba(255,255,255,0.06);
  --shadow: 0 10px 30px rgba(0,0,0,0.35);
  --ease: cubic-bezier(.2,.8,.2,1);

  /* Radius + spacing */
  --r-2: 6px; --r-3: 10px; --r-4: 16px;
  --space-1: clamp(8px, 1.2vw, 14px);
  --space-2: clamp(12px, 1.8vw, 20px);
  --space-3: clamp(18px, 2.4vw, 28px);
  --space-4: clamp(24px, 3.6vw, 40px);

  /* Fluid type scale */
  --step--1: clamp(12px, 0.8vw, 14px);
  --step-0: clamp(14px, 1.0vw, 16px);
  --step-1: clamp(18px, 1.6vw, 22px);
  --step-2: clamp(22px, 2.2vw, 28px);
  --step-3: clamp(28px, 3.2vw, 38px);
  --step-4: clamp(36px, 4.4vw, 54px);
}

/* Light theme overrides */
:root.light {
  --bg: #f6f8f9;
  --bg-elev: #ffffff;
  --text: #15191a;
  --muted: #5b666b;
  --border: #dbe2e6;
  --glass: rgba(0,0,0,0.04);
}

/* Typography */
html { color-scheme: dark light; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-feature-settings: "tnum" 1, "cv05" 1;
  line-height: 1.45;
}
h1,h2 { font-family: "Fraunces", ui-serif, Georgia, serif; letter-spacing: -0.01em; }
h1 { font-size: var(--step-4); }
h2 { font-size: var(--step-3); }
p,li,dd,dt { font-size: var(--step-0); }

/* Layout primitives */
.wrapper { max-width: 1200px; margin: 0 auto; padding-inline: var(--space-3); }
.grid { display: grid; gap: var(--space-3); container-type: inline-size; }
.grid.two { grid-template-columns: 1fr; }
@container (min-width: 840px) { .grid.two { grid-template-columns: 1fr 1fr; } }

/* Card */
.card {
  background: linear-gradient(180deg, var(--glass), transparent);
  border: 1px solid var(--border);
  border-radius: var(--r-4);
  box-shadow: var(--shadow);
  backdrop-filter: saturate(130%) blur(8px);
}

/* Chips and buttons */
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip, .btn {
  padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border);
  background: color-mix(in oklab, var(--bg-elev), var(--citrus) 6%);
  font-size: var(--step--1);
  cursor: pointer;
  transition: transform .2s var(--ease), background .2s var(--ease);
}
.chip:is(:hover, :focus-visible), .btn:is(:hover, :focus-visible) {
  background: color-mix(in oklab, var(--bg-elev), var(--citrus) 12%);
}
.btn-primary { background: var(--grape); color: #fff; border-color: transparent; }

/* Key-value mini-table (2 columns max) */
.kv { display: grid; gap: 8px; }
.kv.two-col { grid-template-columns: 1fr 1fr; }
.kv dt { color: var(--muted); font-size: var(--step--1); }
.kv dd { font-size: var(--step-0); }

/* Service card */
.service-h { display:flex; align-items:center; justify-content:space-between; gap: var(--space-2); padding: var(--space-2); }
.tabs button { padding: 6px 10px; border-radius: var(--r-2); background: transparent; border:1px solid var(--border); }
.tabs .is-active { background: var(--bg-elev); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--grape), #000 60%); }

/* Accessibility and motion */
:focus-visible { outline: 2px solid var(--grape); outline-offset: 2px; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

Add to `assets/css/theme.css`:

```css
/* Page enter polish */
.card { opacity: 0; translate: 0 6px; transition: opacity .35s var(--ease), translate .35s var(--ease); }
@starting-style { .card { opacity: 0; translate: 0 8px; } }
body.loaded .card { opacity: 1; translate: 0 0; }

/* Meta theme colors for mobile bars set in <head> */
```

In `<head>` add:

```html
<link rel="preload" href="https://fonts.gstatic.com/s/inter/v..../inter.woff2" as="font" type="font/woff2" crossorigin>
<meta name="theme-color" content="#0e1111" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f8f9" media="(prefers-color-scheme: light)">
```

---

## 5) HTML component skeletons

Hero and scenario toolbar:

```html
<header class="hero card wrapper" id="hero">
  <h1>ZZP Pricing Lab</h1>
  <p class="lede">Set a target. Tune time off. Find the mix that fits your life.</p>
  <div class="chips" id="scenario-presets">
    <button class="chip" data-preset="timeoff:0">0 months off</button>
    <button class="chip" data-preset="timeoff:1">1 month off</button>
    <button class="chip" data-preset="timeoff:2">2 months off</button>
    <button class="chip" data-preset="hours:40">40 h/week</button>
    <button class="chip" data-preset="travel:low">Low travel</button>
  </div>
</header>

<section class="card wrapper controls" id="controls">
  <div class="grid two">
    <div>
      <h2>Time off</h2>
      <input type="range" id="monthsOff" min="0" max="3" step="1" value="1" />
      <div class="hint"><strong id="monthsOffVal">1</strong> month</div>
    </div>
    <div>
      <h2>Weekly hours</h2>
      <input type="range" id="hoursPerWeek" min="24" max="48" step="1" value="40" />
      <div class="hint"><strong id="hoursPerWeekVal">40</strong> h/week</div>
    </div>
  </div>
</section>
```

Service card template:

```html
<article class="card service wrapper" data-service="qc">
  <header class="service-h">
    <h2>Quality control - arrivals</h2>
    <nav class="tabs" role="tablist" aria-label="QC views">
      <button role="tab" data-tab="rate" aria-selected="true" class="is-active">Rate needed</button>
      <button role="tab" data-tab="volume">Volume needed</button>
    </nav>
  </header>
  <div class="body">
    <dl class="kv two-col">
      <div><dt>Units per month</dt><dd id="qc-units">—</dd></div>
      <div><dt>Price per unit</dt><dd id="qc-price">—</dd></div>
      <div><dt>Revenue</dt><dd id="qc-rev">—</dd></div>
      <div><dt>Direct cost</dt><dd id="qc-cost">—</dd></div>
      <div><dt>Tax reserve</dt><dd id="qc-tax">—</dd></div>
      <div><dt>Net contribution</dt><dd id="qc-net">—</dd></div>
    </dl>
    <div class="spark" id="qc-spark" aria-hidden="true"></div>
  </div>
</article>
```

Portfolio summary and weekly grid:

```html
<section class="card wrapper" id="portfolio">
  <div class="grid two">
    <div>
      <h2>Portfolio totals</h2>
      <dl class="kv two-col">
        <div><dt>Revenue</dt><dd id="p-rev">—</dd></div>
        <div><dt>Costs</dt><dd id="p-cost">—</dd></div>
        <div><dt>Tax reserve</dt><dd id="p-tax">—</dd></div>
        <div><dt>Net</dt><dd id="p-net">—</dd></div>
      </dl>
    </div>
    <div>
      <h2>Weekly plan</h2>
      <ol class="week" id="p-week"></ol>
    </div>
  </div>
</section>
```

---

## 6) JS wiring pattern and integration points

In `index.html`:

```html
<script type="module">
  import { calcState } from './assets/js/state.js';
  import { deriveCapacity } from './assets/js/capacity.js';
  import { computeCosts } from './assets/js/costs.js';
  import { services } from './assets/js/services.js';
  import { mountServiceCards } from './assets/js/ui/service-cards.js';
  import { mountScenarioToolbar } from './assets/js/ui/scenario-toolbar.js';
  import { mountPortfolio } from './assets/js/ui/portfolio.js';
  import './assets/js/ui/theming.js';

  window.addEventListener('load', () => document.body.classList.add('loaded'), { once: true });

  mountScenarioToolbar(calcState);
  mountServiceCards(calcState, services);
  mountPortfolio(calcState);

  calcState.subscribe(state => {
    const cap = deriveCapacity(state);
    const costs = computeCosts(state, cap);
    // UI modules read cap and costs through passed closures or from calcState if stored there
  });
</script>
```

UI helpers `assets/js/ui/components.js` should expose minimal utilities for:
- `qs`, `qsa`, `on` for event binding
- `setText(el, value)` and `fmtCurrency(number)` with locale aware formatting
- `renderSparkline(el, values)` for tiny inline SVG trends

---

## 7) Sprint by sprint design tasks and acceptance criteria

### Sprint 1 - Core state and capacity engine
**Tasks**
- Add `assets/css/design.css` and `assets/css/theme.css`.
- Convert inline script to module, import store and derived calculators.
- Replace direct `render()` calls with `calcState.set()` and `calcState.subscribe()` updates to UI.

**Acceptance**
- Page loads with hero and controls styled by `design.css`.
- Changing sliders updates state via `calcState.set()`. No DOM reads during render.
- `tests/pipeline.test.html` passes baseline assertions for capacity and costs.
- Lighthouse core web vitals: CLS under 0.02, LCP under 2.5 s on emulated mid range.

### Sprint 2 - Service modules and cards
**Tasks**
- Implement `assets/js/services.js` with calculators for representation, ops, QC, training, intel.
- Render responsive service cards using the template above.
- Two tabs per card: Rate needed vs Volume needed.

**Acceptance**
- Cards reflow to single column under 840 px.
- Each card shows a 2 column kv grid. No table wider than 2 columns on mobile.
- Updating inputs recomputes card metrics and net contribution correctly.

### Sprint 3 - Scenario sandbox controls
**Tasks**
- `assets/js/ui/scenario-toolbar.js` parses data attributes like `data-preset="timeoff:2"` and applies batch mutations to the store.
- Sliders mirror numeric inputs and vice versa. Screen reader updates via `aria-live="polite"` on a hidden status element.

**Acceptance**
- Preset chips instantly update all dependent values and visuals.
- Revenue tables append hourly equivalents where applicable.
- Assumptions list includes active scenario and slider positions.

### Sprint 4 - Portfolio optimizer
**Tasks**
- `assets/js/optimizer.js` brute force or heuristic search with guardrails.
- `assets/js/ui/portfolio.js` shows totals and a weekly grid summary.

**Acceptance**
- Solver respects capacity, travel days, hands on quota, and pricing fences.
- Portfolio UI updates in under 50 ms for typical parameter ranges.
- Violations surface inline messages on the portfolio card.

### Sprint 5 - Advanced tax and experience enhancers
**Tasks**
- Plug in strategy for taxes: simple percentage vs `tax2025.js` with Zelfstandigenaftrek, MKB vrijstelling, Zvw, starter deduction hooks.
- Comfort meter, seasonality sliders, travel friction, hands on quota controls styled as chips and minimal sliders.

**Acceptance**
- Switching tax modes adjusts net across cards and portfolio consistently.
- Seasonality and travel friction modify feasible volumes and costs as expected.
- Tests include fixtures for advanced tax scenarios.

### Sprint 6 - Legacy backlog polish
**Tasks**
- Preset targets including a 50k option near net controls. Radio group for target basis gross vs net.
- Adaptive theming: auto light or dark by time on first visit, manual toggle persists.

**Acceptance**
- Theme respects persisted preference. Auto only on first visit.
- `TODO.md` updated with DONE entries and dates.

---

## 8) Accessibility and i18n

- All interactive elements reachable by keyboard. `:focus-visible` styled.
- Live region `#sr-status` announces recalculation events.
- Use `lang="en"` initially. Add language toggle later that swaps copy and formats via a dictionary object. No reload required.

---

## 9) Formatting helpers

Add to `assets/js/ui/components.js`:

```js
export const fmt = {
  currency: (n, locale = 'nl-NL', currency = 'EUR') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0),
  number: (n, locale = 'nl-NL') =>
    new Intl.NumberFormat(locale).format(n || 0),
};
```

Use `fmt.currency` in UI modules. Avoid hard coded symbols.

---

## 10) Performance checklist

- Preload first Inter subset if you self host later. For now rely on Google Fonts delivery.
- Inline critical CSS for hero and controls to reduce FOUC. Defer the rest.
- Use `content-visibility: auto` on off screen sections.
- No large background images. If used, lazy load and compress to AVIF.

---

## 11) Example component glue code

`assets/js/ui/service-cards.js`:

```js
import { qs, setText } from './components.js';
import { fmt } from './components.js';
import { deriveCapacity } from '../capacity.js';
import { computeCosts } from '../costs.js';

export function mountServiceCards(calcState, services) {
  const root = document;

  function render(state) {
    const cap = deriveCapacity(state);
    const costs = computeCosts(state, cap);

    for (const svc of services) {
      const out = svc.compute(state, cap, costs); // { units, price, revenue, directCost, tax, net }
      const id = svc.id;
      setText(qs(`#${id}-units`, root), fmt.number(out.units));
      setText(qs(`#${id}-price`, root), fmt.currency(out.price));
      setText(qs(`#${id}-rev`, root), fmt.currency(out.revenue));
      setText(qs(`#${id}-cost`, root), fmt.currency(out.directCost));
      setText(qs(`#${id}-tax`, root), fmt.currency(out.tax));
      setText(qs(`#${id}-net`, root), fmt.currency(out.net));
    }
  }

  calcState.subscribe(render);
}
```

---

## 12) Definition of done for the design layer

- Visual coherence across hero, controls, cards, portfolio.
- Responsiveness validated at 360 px, 768 px, 1280 px breakpoints.
- No layout shift on slider or tab interactions.
- Keyboard and screen reader flows verified.
- CI page `tests/pipeline.test.html` green for math, and a manual visual review checklist checked in `docs/ui-checklist.md`.
