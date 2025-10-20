# Release Checklist

This checklist keeps the ZZP Pricing Lab deployable after language and comfort meter enhancements. Complete each item before publishing to production or GitHub Pages.

## Pre-flight
- [ ] Verify English and Spanish translations render correctly for hero copy, quick controls, theme, and comfort meter insights.
- [ ] Confirm the language toggle persists the selected locale and respects browser defaults in a private window.
- [ ] Validate comfort meter travel fatigue details respond to scenario sliders and optimizer recomputes.

## Cross-browser smoke tests
Record the result (`Pass`, `Fail`, or `Needs follow-up`) for each target browser. Include notes describing any deviations.

| Browser | Version tested | Status | Notes |
| --- | --- | --- | --- |
| Chrome (latest stable) | | Needs follow-up | Execute responsive smoke test covering presets, sliders, language toggle, and comfort meter updates. |
| Firefox (latest stable) | | Needs follow-up | Repeat smoke suite; confirm localStorage persistence is available. |
| Safari (latest stable) | | Needs follow-up | Pay special attention to reduced localStorage quotas in Private Browsing. |

> ℹ️ Update this table with actual results during the release rehearsal. Keep historical notes in `docs/manual-test-log.txt` once testing completes.

## Content and assets
- [ ] Regenerate the privacy summary if copy or legal statements change.
- [ ] Confirm favicon and meta tags remain language-agnostic.

## Deployment verification
- [ ] Run `npm run build` (if applicable) and ensure the output deploys without warnings.
- [ ] Publish to GitHub Pages and perform a live smoke test using the release checklist above.
- [ ] Capture before/after screenshots for the language toggle and comfort meter fatigue insights.
