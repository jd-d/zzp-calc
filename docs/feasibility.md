# Feasibility Assessment and Incremental Plan

## Overview
This document captures the results of Sprint 0 for expanding the ZZP calculator into a pricing strategy lab tailored for fruit-trade consultants. It assesses feasibility, highlights key risks, and proposes a sequenced roadmap of increments that can be triggered individually.

## Product Goals
- Support target-driven planning, scenario experimentation, and portfolio optimization for a mixed-service consulting practice.
- Maintain a mobile-friendly, static web experience using vanilla HTML, CSS, and JavaScript that can be deployed to GitHub Pages.
- Provide both quick, approximate calculations and a path to more realistic Dutch 2025 tax handling.

## Constraints and Assumptions
- No external JavaScript frameworks or heavy dependencies will be introduced; calculations must run fully client-side.
- Performance must remain acceptable on mobile browsers; portfolio searches should finish within hundreds of milliseconds.
- Users expect transparent math with the ability to inspect intermediate values.
- Existing calculator functionality should remain accessible during incremental rollout.

## Architecture Direction
1. **State Management**: Centralize all inputs in a `calcState` object (building on the existing calculator pattern). Derive computed views via pure functions so that scenario presets and sliders can reuse the same pipeline.
2. **Computation Pipeline**:
   - Capacity calculator (weeks, days, billable hours).
   - Service normalizer to convert each service into revenue, cost, hours, and travel metrics per period.
   - Cost aggregation (fixed, variable by hour, variable by travel day, per-unit extras).
   - Tax module with pluggable strategies (simple reserve vs. advanced 2025 rules).
   - Target solver modes (rate, volume, portfolio fit) built on shared math utilities.
3. **UI Composition**:
   - Responsive card grid (single column on narrow viewports, two columns on larger screens).
   - Scenario preset bar using semantic buttons with data attributes for quick state swaps.
   - Portfolio optimizer view with constraint badges and a compact schedule preview.
   - Lightweight SVG or CSS-based sparklines for sensitivity readouts.
4. **Data Persistence**: Store presets and last-used inputs in `localStorage` for continuity without server dependencies.

## Risk and Mitigation Highlights
- **Complexity of Tax Calculations**: Advanced Dutch tax logic introduces edge cases (e.g., starter's deduction, Zvw thresholds). Mitigate by encapsulating tax formulas with clear assumptions, providing override inputs, and surfacing disclaimers.
- **Portfolio Search Performance**: Brute-force grid search might explode if volume bounds are too wide. Mitigate by constraining ranges, using heuristics (e.g., step sizes tied to service granularity), and short-circuiting once a satisfactory plan is found.
- **Mobile Layout Density**: Presenting rich data on mobile screens can overwhelm users. Use collapsible sections, two-column mini-tables, and progressive disclosure (tabs) to preserve readability.
- **User Trust in Calculations**: Ensure every derived output references its source assumptions through tooltips and inline explanations. Provide a transparent math inspector panel if needed in later sprints.

## Increment Breakdown
Each increment below is scoped to be deliverable independently and builds toward the complete pricing lab.

### Sprint 0 — Discovery and Systems Plan (COMPLETE)
- Produce feasibility assessment (this document) and align on architecture.
- Draft incremental roadmap and backlog updates.

### Sprint 1 — Core State and Capacity Engine
- Implement unified `calcState`, capacity calculations, and shared cost pipeline.
- Expose base inputs (targets, time off, capacity, cost assumptions) with responsive layout foundations.
- Deliver updated net target summary using the new pipeline while keeping existing UI functional.

### Sprint 2 — Service Modules and Cards
- Model each service type with configurable knobs and compute rate/volume requirements per service.
- Render mobile-friendly service cards with rate vs. volume tabs and mini-tables for key metrics.
- Introduce comfort buffer and tax reserve visuals per card.

### Sprint 3 — Scenario Presets and Sandbox Controls
- Add scenario buttons for time off, weekly hours, and travel intensity that mutate `calcState`.
- Build slider controls for sandbox variables (months off, utilization, tax reserve) with live recomputation feedback.
- Highlight under/over target states and introduce simple sensitivity sparklines.

### Sprint 4 — Portfolio Optimizer
- Implement constraint-aware portfolio solver (initial brute-force grid with guardrails).
- Provide portfolio summary panel (revenue, costs, tax, net) and weekly schedule preview grid.
- Add enforcement of travel, hands-on, and hours-per-week constraints.

### Sprint 5 — Advanced Tax and Enhancers
- Ship advanced Dutch 2025 tax module with Zelfstandigenaftrek, MKB-vrijstelling, Zvw, and overrides.
- Integrate comfort meter, pricing fences, and seasonality/travel friction controls.
- Add one-click plan presets and language toggle support.

## Dependencies and Sequencing Notes
- Sprint 1 establishes shared math utilities required for all later sprints.
- Sprint 2 depends on Sprint 1’s capacity and cost outputs to compute service-level insights.
- Sprint 3 builds on Sprint 2’s cards to ensure scenario toggles update all service views consistently.
- Sprint 4 relies on accurate service definitions (Sprint 2) and sandbox inputs (Sprint 3) to search feasible portfolios.
- Sprint 5 enhances calculations (tax) and UI (comfort meter, presets), benefiting from the stability of earlier sprints.

## Acceptance Criteria for Each Increment
- **Sprint 1**: All existing calculations use the new pipeline without regressions; users can change capacity inputs and see consistent results.
- **Sprint 2**: Each service card displays rate and volume requirements with tax reserve, net contribution, and buffer metrics updating live.
- **Sprint 3**: Scenario buttons and sliders instantly update service cards and summaries, with visual cues for target attainment.
- **Sprint 4**: Portfolio optimizer finds at least one feasible mix respecting constraints and displays schedule preview coherently.
- **Sprint 5**: Advanced tax results align within 5% of reference calculations for typical ZZP cases, and enhancers respond to user inputs without noticeable lag.

## Tooling and Testing Strategy
- Unit-test calculation utilities using a lightweight browser-based test harness (e.g., QUnit or plain assertions) to avoid build complexity.
- Provide JSON fixtures for representative consultant profiles to regression-test solver outputs.
- Use Playwright (if available) or manual smoke tests for mobile layouts; ensure GitHub Pages compatibility by validating the static build locally.

## Open Questions for Future Discussion
- Should the optimizer support saving multiple portfolios as named scenarios?
- Is offline persistence (e.g., PWA) desirable, or is localStorage sufficient?
- How granular should seasonality sliders be (monthly vs. biweekly)?

