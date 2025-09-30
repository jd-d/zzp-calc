# zzp
Something for working out costs and income.

## Deployment options
This repository publishes the static site defined in `index.html` to
GitHub Pages using the workflows in `.github/workflows/`.

### Production deployment (`main`)
The **Deploy to GitHub Pages** workflow runs automatically when commits
are pushed to the `main` branch. It uploads the repository contents as a
Pages artifact and deploys them to the `github-pages` environment. The
resulting public URL is exposed on the workflow run summary page.

### Pull request preview deployments
The same **Deploy to GitHub Pages** workflow also runs for
`pull_request` events. When you open or update a pull request, GitHub
creates a preview deployment with its own URL. You can access it from the
pull request page under **Deployments → github-pages**. Each PR gets a
unique preview, so you can validate changes before merging to `main`.

### Manual branch previews
To preview any branch (even without a pull request), use the
**Preview GitHub Pages Build** workflow:

1. Open the **Actions** tab and select **Preview GitHub Pages Build**.
2. Click **Run workflow**, choose the branch or tag to preview, and start
the run.
3. After the workflow finishes, open the run summary. Under
   **Artifacts** you can download the generated site ZIP. Under
   **Deployments → preview** you will also find a temporary URL that
   serves the same files directly from GitHub Pages.

Both preview approaches use the same artifact that production receives,
so what you see in the preview is exactly what will be published when the
changes reach `main`.
