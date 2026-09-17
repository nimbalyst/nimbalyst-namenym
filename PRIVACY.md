# Data and network behavior

Namenym stores project briefs, generated names, notes, preferences, and cached domain results in `.namenym` files or Nimbalyst collaborative documents. Use synthetic data in public issues and test fixtures.

- **AI generation:** requested generation sends the naming brief or summary, selected themes and words, constraints, and name feedback through Nimbalyst's configured AI provider. Word preparation can continue automatically after generation. Stop cancels queued work and ignores late responses; it cannot retract requests already sent. Provider billing and retention are controlled by the host/provider, not this repository.
- **Domain lookup:** local projects automatically send candidate names to `https://api.namenym.com/domains/search`. Opening a project with unchecked names can trigger these requests. Briefs and notes are not included. The server uses an external domain provider; its source and retention policy are not included here. Stop domain checks pauses further automatic work in the current editor. Shared projects require explicit domain checks. Do not open confidential candidate names in a connected local editor if you cannot share them with this service.
- **Registrar links:** opening a domain link visits Domainr with that candidate domain in the URL.
- **Collaboration:** sharing a project uses Nimbalyst's collaboration service. Shared content includes notes, favorites, member IDs, display-name snapshots, and presence. Favorites are editable document content, not an approval or voting security boundary.
- **Diagnostics:** the extension emits console timing and job-status records, including project identifiers and model names. Review host logs before sharing them.

Manual naming does not require AI access. AI generation, domain lookup, and collaborative hosting depend on services outside this repository. The MIT license covers this repository's code; it does not grant access to those services or change their terms.
