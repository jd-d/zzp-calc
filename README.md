# zzp
Something for working out costs and income.

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
before merging.

### Preview cleanup
Preview directories are removed automatically when a pull request
closes, courtesy of `.github/workflows/cleanup-preview.yml`.
