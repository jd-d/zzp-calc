# TODO

## Roadmap Overview
The following increments can be triggered individually to deliver the full pricing strategy lab.

### Sprint 1 – Core State and Capacity Engine
- [ ] Establish a unified `calcState` store and migrate existing inputs to use it.
- [ ] Rebuild the time-off and day-off logic (including UI adjustments) on top of the new capacity pipeline.
- [ ] Implement shared cost aggregation (fixed, per-hour, per-travel-day) and update the revenue summary to use it.

### Sprint 2 – Service Modules and Cards
- [ ] Model each service type (representation, ops, QC, training, intel) with rate and volume calculators.
- [ ] Render mobile-friendly service cards with rate vs. volume tabs and two-column mini-tables for key metrics.
- [ ] Add safety/comfort margin controls that feed into net contribution and buffer displays on each card.

### Sprint 3 – Scenario Sandbox Controls
- [ ] Add preset buttons for time off, weekly hours, and travel intensity that sync across the calculator.
- [ ] Introduce sliders for sandbox variables (months off, utilization, tax reserve) with live visual feedback.
- [ ] Append hourly equivalents to gross revenue figures based on a configurable session length input.

### Sprint 4 – Portfolio Optimizer
- [ ] Implement a brute-force or heuristic portfolio solver that respects hours, travel, and hands-on constraints.
- [ ] Display portfolio summaries (revenue, costs, tax, net) and a compact weekly schedule preview.
- [ ] Enforce pricing fences (minimum/target/stretch) and comfort buffers within the optimizer output.

### Sprint 5 – Advanced Tax and Experience Enhancers
- [ ] Build the advanced Dutch 2025 tax module (Zelfstandigenaftrek, MKB-vrijstelling, Zvw, starter deduction toggle) with overrides.
- [ ] Integrate comfort meter, seasonality sliders, travel friction, and hands-on quota constraints.
- [ ] Add one-click plan presets and an English/Spanish language toggle.

## Legacy Backlog
- [ ] Pre-fill the form with a 50k preset and add a target gross/net radio button with corresponding calculation adjustments.
- [ ] Auto-select light or dark mode by time of day while allowing manual overrides with a lock control.

## DONE
- [x] Sprint 0 – Produce feasibility assessment and roadmap documentation. (2025-10-18)
- [x] Ensure on mobile that the preset buttons appear above the form and reduce the large space that appears on mobile between the blog title and the form (see pic). (2025-09-30)
- [x] Swap the prominence of prices with and without VAT so the price including VAT is shown as the primary figure, with the VAT-exclusive amount secondary. (2025-09-30)
- [x] Consolidate the pricing table to display only the buffered price, omitting separate breakeven and buffered values. (2025-09-30)
