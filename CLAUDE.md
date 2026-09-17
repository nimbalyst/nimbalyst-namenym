# Namenym development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, architecture, and validation, and [RELEASING.md](RELEASING.md) for release preparation.

- Extension ID: `com.nimbalyst.namenym`; editor pattern: `*.namenym`.
- Use Node.js 24, `npm ci`, and `npm run check` (Google Chrome is required for browser tests).
- Keep the editor full-width and names-first. Preserve existing project formats, user edits, stable entity IDs, and collaboration permissions.
- AI tools are `namenym.get_project`, `namenym.add_themes`, `namenym.add_words`, `namenym.add_names`, and `namenym.shortlist`.
- Build before installing. Use `extension_reload` for desktop iteration; never restart the host unless requested.
- Keep local agent configuration, transcripts, credentials, and private validation artifacts out of Git and release archives.
- Automated fixtures do not prove live AI, domain-provider, or collaboration-service behavior.
