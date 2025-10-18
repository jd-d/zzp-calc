# Roadmap

## Release Strategy
We will deliver the ZZP Fruit Pro Pricing Strategy Lab across six sprints. Each increment leaves the site deployable, increasingly aligned with the fruit trade CFO sandbox vision, and battle tested on mobile. The sequence starts by reframing the narrative and layout, then layers in the computational engines, service-specific tooling, sandbox controls, portfolio optimization, and finally the advanced tax and experience extras required by the specification.

### Sprint Milestones
1. **Sprint 1 Foundation and Rebrand** - Reposition the interface and layout so the existing calculator still ships while hinting at the three core lab views.
2. **Sprint 2 Core Capacity and State Engine** - Establish a single source of truth for time, availability, and costs feeding every view.
3. **Sprint 3 Service Models and Cards** - Implement rate and volume solvers per service with mobile friendly cards.
4. **Sprint 4 Scenario Sandbox Controls** - Add presets, sliders, and sensitivity visuals that keep state synchronized.
5. **Sprint 5 Portfolio Optimizer** - Build the solver and presentation layer that respects all constraints.
6. **Sprint 6 Advanced Tax and Experience Enhancers** - Finalize tax accuracy, presets, language toggle, and release polish.

## Sprint 1 Foundation and Rebrand
**Goal:** Align the current experience with the fruit trade CFO lab concept while leaving core calculations untouched.

**Exit Criteria:** Updated copy and layout reflect the three key views, the page remains responsive, and existing calculations render correctly after rebrand.

### Task 1.1 Reposition UI and copy around the fruit trade CFO sandbox narrative
- Replace hero title, subtitle, and introductory copy with fruit trade consultant messaging lifted from DESIGN-SPECIFICATION.md.
- Update preset labels, help text, and CTA buttons so they describe net targets, service mix exploration, and comfort buffers.
- Audit meta tags and social preview text to ensure the new positioning carries across share cards.

### Task 1.2 Set up synchronized Target-to-Plan, Sandbox, and Portfolio layout shells with responsive cards
- Create three high level sections (Target-to-Plan, Sandbox, Portfolio) using semantic HTML and responsive utility classes already used in the project.
- Introduce placeholder cards for each view using two-column mini tables that match the desired layout without new calculations.
- Wire navigation or anchor links so that scenario buttons scroll to the correct section on mobile.

### Task 1.3 Stabilize existing calculator inputs and results under the new layout to keep the site shippable
- Map existing inputs into the new sections, adjusting CSS to prevent layout regressions on small screens.
- Confirm all form submissions, computed outputs, and summaries render without console errors after the structural changes.
- Update smoke tests or add a minimal integration test to guard against missing elements introduced by the rebrand.

## Sprint 2 Core Capacity and State Engine
**Goal:** Introduce a coherent state layer that handles capacity, time off, and cost aggregation across the app.

**Exit Criteria:** A centralized calcState drives the UI, capacity logic handles time off and utilization, and shared cost totals are computed once.

### Task 2.1 Build a unified calcState store with capacity pipeline covering time off, availability, and utilization
- Implement a dedicated module (e.g., `state/calcState.js`) that holds canonical values for target, calendar, and service settings.
- Encode time off in months, weeks, and days, translating them into weekly capacity numbers according to the spec formula.
- Expose derived getters for billable hours, non billable share, and available travel days to remove duplicated math.

### Task 2.2 Refactor UI inputs to drive the new state store and surface validation for impossible schedules
- Replace direct DOM reads with binding helpers that write into the calcState store and trigger recalculations.
- Validate combinations that exceed available hours or travel days, presenting inline warnings near the offending inputs.
- Ensure persisted defaults and presets hydrate the store on load so the form renders meaningful values without manual refreshes.

### Task 2.3 Centralize cost aggregation for fixed, hourly, and travel expenses in preparation for service cards
- Introduce a cost utility that consolidates fixed monthly costs, per hour costs, and per travel day costs into yearly and monthly totals.
- Refactor revenue summary computations to consume the shared cost utility instead of duplicating logic per service.
- Add unit tests covering edge cases like zero travel, zero hours, and high fixed costs to keep the engine reliable.

## Sprint 3 Service Models and Cards
**Goal:** Provide accurate rate and volume calculators per service with a cohesive card-based presentation.

**Exit Criteria:** Each service exposes rate needed and volume needed tabs, showing correct metrics derived from the calcState.

### Task 3.1 Model each service with rate and volume solvers that respect hours per unit and travel overhead
- Capture service metadata (representation retainers, ops advisory, QC inspections, training, market intel) in configuration files.
- Implement solvers that translate targets into either price per unit or units per month while respecting travel days and hours per unit.
- Support optional overrides such as locked rates or locked volumes to align with user-selected scenarios.

### Task 3.2 Render dual-tab service cards showing rate needed and volume needed with two-column metric tables
- Create card components with tab navigation to switch between rate focused and volume focused outputs for each service.
- Populate the cards with metrics: units per month, price or rate, revenue, cost shares, tax reserve, net contribution, and buffer vs target.
- Apply mobile-first styling to maintain readability in two-column mini tables using CSS grid or flex utilities already available.

### Task 3.3 Add comfort buffer controls feeding net contributions and highlight under-target services
- Add user controls for desired comfort margin and connect them to the solvers so buffers adjust required rates or volumes.
- Highlight services that fall short using color tokens from the design system and provide tooltips explaining gaps.
- Log buffer deltas in the portfolio summary so the net target impact is visible at the aggregate level.

## Sprint 4 Scenario Sandbox Controls
**Goal:** Offer fast preset adjustments and interactive sliders that immediately recompute results and visuals.

**Exit Criteria:** Scenario strips, sandbox sliders, and sensitivity visuals are live and synchronized with the calcState.

### Task 4.1 Deliver quick scenario strips for time off, weekly hours, and travel intensity presets
- Implement preset buttons for months off (0, 1, 2), weekly hours (32, 36, 40), and travel intensity (low, base, high).
- Ensure each preset updates relevant calcState values and triggers dependent calculations without page reloads.
- Provide active state styling and accessibility attributes so keyboard and screen reader users can operate the presets.

### Task 4.2 Expose sandbox sliders for months off, utilization, tax reserve, and travel friction with instant recompute
- Add slider inputs for the key sandbox variables and bind them to the calcState store with debounced updates.
- Display live numeric feedback beside each slider, including derived metrics like billable hours and travel days.
- Guarantee that slider adjustments and preset buttons remain in sync, resolving conflicts by prioritizing the most recent interaction.

### Task 4.3 Add sparkline sensitivity visuals for net vs months off and net vs utilization
- Implement lightweight chart rendering (e.g., inline SVG) to display net income sensitivity curves.
- Compute data points using recent state history or forecasted values across the slider ranges.
- Annotate the sparklines with break-even markers or tooltips to highlight key thresholds requested in the spec.

## Sprint 5 Portfolio Optimizer
**Goal:** Build the optimizer that combines services under capacity constraints and presents actionable output.

**Exit Criteria:** A solver produces feasible service mixes respecting caps, displays schedule previews, and surfaces pricing fences.

### Task 5.1 Implement portfolio solver honoring weekly hour caps, travel day limits, and hands-on quotas
- Choose a search strategy (grid search or heuristic) to evaluate service combinations against capacity constraints.
- Include max travel days per month, hands-on fruit day minimums, and weekly hour caps as hard constraints in the solver.
- Return top candidate mixes with metadata describing utilization, travel load, and remaining buffer.

### Task 5.2 Integrate pricing fences and comfort buffers into optimization scoring and outputs
- Add min, target, and stretch pricing fences per service and incorporate them into solver scoring weights.
- Expose comfort buffer requirements so the optimizer favors mixes that exceed net targets by the desired margin.
- Display clear indicators when a mix falls outside pricing fences to guide manual adjustments.

### Task 5.3 Present weekly schedule grid and summary metrics fed by solver selections
- Render a compact two-column weekly schedule grid showing billable focus areas per day.
- Summarize total revenue, costs, tax reserve, net income, utilization, and travel load based on the chosen mix.
- Provide controls to pin a candidate mix and compare it with alternative options without losing context.

## Sprint 6 Advanced Tax and Experience Enhancers
**Goal:** Finalize tax realism, add premium experience touches, and prepare for release.

**Exit Criteria:** Accurate 2025 Dutch tax handling, language toggle, comfort meter refinements, and final QA sign-off.

### Task 6.1 Implement advanced Dutch 2025 tax calculators with toggles for Zelfstandigenaftrek, starters deduction, MKB, and Zvw
- Expand the tax module to include Zelfstandigenaftrek, starter deduction, MKB vrijstelling at 12.7 percent, and Zvw at 5.26 percent with override options.
- Provide UI toggles that let users enable or disable each deduction, persisting selections across sessions.
- Validate computations against sample scenarios documented in DESIGN-SPECIFICATION.md or Dutch tax references.

### Task 6.2 Ship one-click plan presets plus pricing fences badges for Min, Target, Stretch
- Add preset buttons such as Retainer led, Ops heavy, and QC first that adjust service mix shares and constraints.
- Display pricing fence badges on service cards and in the portfolio summary, indicating where current rates sit relative to fences.
- Ensure selecting a plan preset replays the optimizer and updates service cards without stale data.

### Task 6.3 Add EN-ES language toggle, travel comfort meter, and wrap up QA for deployment
- Implement language toggle infrastructure that swaps copy and key labels between English and Spanish, defaulting to browser locale.
- Enhance the comfort meter with travel fatigue indicators, integrating data from scenario sliders and optimizer outputs.
- Conduct cross browser smoke tests (Chrome, Firefox, Safari) and document the release checklist for future deployments.
