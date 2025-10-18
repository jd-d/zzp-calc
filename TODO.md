# TODO

## Roadmap Overview
This roadmap keeps the calculator deployable at the end of every sprint while layering in the ZZP Fruit Pro lab capabilities.

### Sprint 1 Foundation and Rebrand
- [ ] [Reposition UI and copy around the fruit trade CFO sandbox narrative.](ROADMAP.md#task-11-reposition-ui-and-copy-around-the-fruit-trade-cfo-sandbox-narrative)
- [ ] [Set up synchronized Target-to-Plan, Sandbox, and Portfolio layout shells with responsive cards.](ROADMAP.md#task-12-set-up-synchronized-target-to-plan-sandbox-and-portfolio-layout-shells-with-responsive-cards)
- [ ] [Stabilize existing calculator inputs and results under the new layout to keep the site shippable.](ROADMAP.md#task-13-stabilize-existing-calculator-inputs-and-results-under-the-new-layout-to-keep-the-site-shippable)

### Sprint 2 Core Capacity and State Engine
- [ ] [Build a unified calcState store with capacity pipeline covering time off, availability, and utilization.](ROADMAP.md#task-21-build-a-unified-calcstate-store-with-capacity-pipeline-covering-time-off-availability-and-utilization)
- [ ] [Refactor UI inputs to drive the new state store and surface validation for impossible schedules.](ROADMAP.md#task-22-refactor-ui-inputs-to-drive-the-new-state-store-and-surface-validation-for-impossible-schedules)
- [ ] [Centralize cost aggregation for fixed, hourly, and travel expenses in preparation for service cards.](ROADMAP.md#task-23-centralize-cost-aggregation-for-fixed-hourly-and-travel-expenses-in-preparation-for-service-cards)

### Sprint 3 Service Models and Cards
- [ ] [Model each service with rate and volume solvers that respect hours per unit and travel overhead.](ROADMAP.md#task-31-model-each-service-with-rate-and-volume-solvers-that-respect-hours-per-unit-and-travel-overhead)
- [ ] [Render dual-tab service cards showing rate needed and volume needed with two-column metric tables.](ROADMAP.md#task-32-render-dual-tab-service-cards-showing-rate-needed-and-volume-needed-with-two-column-metric-tables)
- [ ] [Add comfort buffer controls feeding net contributions and highlight under-target services.](ROADMAP.md#task-33-add-comfort-buffer-controls-feeding-net-contributions-and-highlight-under-target-services)

### Sprint 4 Scenario Sandbox Controls
- [ ] [Deliver quick scenario strips for time off, weekly hours, and travel intensity presets.](ROADMAP.md#task-41-deliver-quick-scenario-strips-for-time-off-weekly-hours-and-travel-intensity-presets)
- [ ] [Expose sandbox sliders for months off, utilization, tax reserve, and travel friction with instant recompute.](ROADMAP.md#task-42-expose-sandbox-sliders-for-months-off-utilization-tax-reserve-and-travel-friction-with-instant-recompute)
- [ ] [Add sparkline sensitivity visuals for net vs months off and net vs utilization.](ROADMAP.md#task-43-add-sparkline-sensitivity-visuals-for-net-vs-months-off-and-net-vs-utilization)

### Sprint 5 Portfolio Optimizer
- [ ] [Implement portfolio solver honoring weekly hour caps, travel day limits, and hands-on quotas.](ROADMAP.md#task-51-implement-portfolio-solver-honoring-weekly-hour-caps-travel-day-limits-and-hands-on-quotas)
- [ ] [Integrate pricing fences and comfort buffers into optimization scoring and outputs.](ROADMAP.md#task-52-integrate-pricing-fences-and-comfort-buffers-into-optimization-scoring-and-outputs)
- [ ] [Present weekly schedule grid and summary metrics fed by solver selections.](ROADMAP.md#task-53-present-weekly-schedule-grid-and-summary-metrics-fed-by-solver-selections)

### Sprint 6 Advanced Tax and Experience Enhancers
- [ ] [Implement advanced Dutch 2025 tax calculators with toggles for Zelfstandigenaftrek, starters deduction, MKB, and Zvw.](ROADMAP.md#task-61-implement-advanced-dutch-2025-tax-calculators-with-toggles-for-zelfstandigenaftrek-starters-deduction-mkb-and-zvw)
- [ ] [Ship one-click plan presets plus pricing fences badges for Min, Target, Stretch.](ROADMAP.md#task-62-ship-one-click-plan-presets-plus-pricing-fences-badges-for-min-target-stretch)
- [ ] [Add EN-ES language toggle, travel comfort meter, and wrap-up QA for deployment.](ROADMAP.md#task-63-add-en-es-language-toggle-travel-comfort-meter-and-wrap-up-qa-for-deployment)

## Legacy Backlog
- [ ] Auto-select light or dark mode by time of day while allowing manual overrides with a lock control.

## DONE
- [x] Sprint 0 Produce feasibility assessment and roadmap documentation. (2025-10-18)
- [x] Ensure on mobile that the preset buttons appear above the form and reduce the large space that appears on mobile between the blog title and the form (see pic). (2025-09-30)
- [x] Swap the prominence of prices with and without VAT so the price including VAT is shown as the primary figure, with the VAT-exclusive amount secondary. (2025-09-30)
- [x] Consolidate the pricing table to display only the buffered price, omitting separate breakeven and buffered values. (2025-09-30)
- [x] Append hourly equivalents to gross revenue figures based on a configurable session length input. (2025-10-18)
- [x] Display portfolio summaries (revenue, costs, tax, net) and a compact weekly schedule preview. (2025-10-19)
- [x] Integrate comfort meter, seasonality sliders, travel friction, and hands-on quota constraints. (2025-10-18)
- [x] Pre-fill the form with a 50k preset and add a target gross/net radio button with corresponding calculation adjustments. (2025-10-20)
