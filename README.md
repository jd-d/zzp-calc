# zzp-calc
Something for working out costs and income.

## Design reference
This project follows the guidance in `DESIGN-SPECIFICATION.md` for UI and
experience decisions. Treat that document as the authoritative reference for
design-related tasks unless a request explicitly overrides it. Future changes
may implement the specification incrementally, so use it as context rather than
an immediate to-do list.

## Deployment options
This repository publishes the static site defined in `index.html` to
GitHub Pages using the **Pages (prod + previews)** workflow in
`.github/workflows/pages.yml`. The workflow runs for pushes to `main`,
pull requests targeting `main`, and any manual `workflow_dispatch`
invocations. Each run builds the site once and uploads it as a shared
`site-dist` artifact that every deployment job reuses.

### Production deployment (`main`)
When commits land on `main`, the workflow deploys the contents of the
`site-dist` artifact to the root of the `gh-pages` branch. This publishes
the production site at the repository's standard GitHub Pages URL.

### Pull request preview deployments
Pull requests against `main` trigger the same workflow. Their builds are
published to `gh-pages` under `previews/pr-<number>/`, and the workflow
comments the preview URL on the pull request so you can verify changes
before merging. The comment step writes back to the pull request thread,
so the workflow file must grant it `issues: write` permissions (and
optionally `pull-requests: write`) to keep that automation functioning.

### Preview cleanup
Preview directories are removed automatically when a pull request
closes, courtesy of `.github/workflows/cleanup-preview.yml`.
