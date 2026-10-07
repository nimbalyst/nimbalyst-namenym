# Releasing Namenym

## Validate the candidate

1. Use Node.js 24 and a clean checkout. Run `pnpm install --frozen-lockfile`, `pnpm exec playwright install chrome`, `pnpm run check`, and `pnpm audit`. On Linux, install Chrome with `--with-deps`.
2. Keep `package.json` and `manifest.json` versions identical, regenerate the lockfile if needed, and finalize the changelog entry. Confirm the minimum Nimbalyst version still matches the APIs used.
3. Review `git status --short` and `git ls-files` for private material. Local agent configuration, transcripts, validation artifacts, `.env` files, and credentials must stay excluded. Scan the candidate source and built package with a secret scanner such as Gitleaks; a clean scan is not a substitute for reviewing samples and documentation.
4. Install the built extension in a supported Nimbalyst desktop app. Open the demo, add and edit names, save/reopen, run generation, stop a job, and check a domain. If collaboration changed, verify two real clients and persistence through the hosted transport. Browser fixtures do not prove live host/provider or deployment behavior.
5. Run `pnpm pack`. Its prepack hook rebuilds the extension and validates the package contents. Inspect the resulting `nimbalyst-namenym-<version>.tgz`; it contains the manifest, built JS/CSS/source map, demo, license, notices, and documentation. This is an extension payload, not a standalone web app. It can be extracted and installed with the extension development tools.

## First public release

The intended repository URL is recorded in `package.json`. Before pushing, confirm that repository's ownership, create the initial commit from reviewed files, and configure the remote. Creating a repository, changing visibility, pushing, publishing to npm, and publishing a GitHub release are separate maintainer actions; the validation scripts do none of them.

Enable GitHub private vulnerability reporting, dependency alerts, and secret scanning where available. Require the `validate` CI check and pull-request review for the default branch; prevent force pushes and deletion. Restrict release/tag management to maintainers. Confirm these settings in GitHub before announcing the release.

Push the reviewed candidate and inspect the actual GitHub Actions logs. Once CI and the live smoke test pass, tag the matching version and create a release with its changelog and inspected package attached. Keep the first release marked as a prerelease until its host compatibility has been verified. Do not claim GitHub CI passed based only on local tests.

## Automation

The CI workflow installs public dependencies, checks types, runs unit and browser suites, builds, verifies package contents, and audits dependencies. It has read-only repository permissions and does not publish. Dependabot checks npm dependencies and pinned GitHub Actions weekly.

The workflow follows [Playwright's CI setup](https://playwright.dev/docs/ci-intro) and pins actions to full commit hashes as described in [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
