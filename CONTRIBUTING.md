# Contributing to Namenym

Bug reports, documentation improvements, and focused pull requests are welcome. For substantial behavior changes, open an issue describing the problem and proposed approach first. Keep discussion respectful and focused on the work.

## Local setup

Use Node.js 24 (see `.nvmrc`) and npm. All build dependencies come from the public npm registry; no sibling checkout, private registry, API key, or Nimbalyst account is needed for the automated tests.

```sh
npm ci
npx playwright install chrome
npm run check
```

On Linux, use `npx playwright install --with-deps chrome` to install browser system dependencies as well. The browser suites run the real React editor with controlled host and service fixtures; they do not make paid AI requests or use the live domain service.

To exercise the installed extension, use Nimbalyst 0.78.0 or later, enable Extension Dev Tools in Settings > Advanced, then call `extension_build` and `extension_install` with this checkout's absolute path. For subsequent changes, call `extension_reload` with the path and `extensionId: "com.nimbalyst.namenym"`. Open `samples/demo.namenym` and check the editor and AI tools. Live AI generation uses the host's configured provider and may incur provider charges.

## Architecture

- `src/NimbalystNamenymEditor.tsx` and `src/panels/`: the full-width naming workspace.
- `src/state.ts`, `src/persistence.ts`, and `src/useLocalProject.ts`: reducer, file formats, migration, and local save handling.
- `src/ai.ts`, `src/generationInputs.ts`, and `src/coordinator.ts`: validated AI requests and job scheduling.
- `src/domains.ts` and `src/useDomains.ts`: domain-service transport, caching, and cancellation.
- `src/collab/`: collaborative codec, binding, text editing, and presence.
- `src/aiTools.ts`: host tools using the same editing semantics as the UI.
- `tests/`: unit tests and standalone browser fixtures for local and collaborative editors.

## Pull requests

Explain the concrete problem, resulting behavior, and verification. Add regression coverage for behavior changes, preserve older project formats, and update the README and changelog when user-facing behavior changes. Run `npm run check` and `npm audit` before submitting. Never include private briefs, customer documents, credentials, local transcripts, or generated test reports.

Report security vulnerabilities through the private route in [SECURITY.md](SECURITY.md). Contributions are provided under the repository's [MIT license](LICENSE).
