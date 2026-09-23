# Namenym

A [Nimbalyst](https://nimbalyst.com) extension for AI-assisted brand naming. Open a `.namenym` project, describe what you are naming, and build a shortlist in a compact workspace.

## Get started

Namenym is a Nimbalyst extension, not a standalone app. It requires Nimbalyst 0.78.0 or later. To build and install from source:

```sh
npm ci
npm run build
```

Use Node.js 24 for development. In Nimbalyst, enable Extension Dev Tools in Settings > Advanced, then invoke `extension_install` with this checkout's absolute path. Open [samples/demo.namenym](samples/demo.namenym), or create a Namenym Project from the new-file menu. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development and test workflow.

**Network behavior:** opening a local project automatically checks candidate names with the hosted domain service. AI generation uses your host's configured provider; shared editing uses Nimbalyst's collaboration service. These services and the Nimbalyst host are outside this repository. Read [PRIVACY.md](PRIVACY.md) before using confidential names or briefs.

## Naming workspace

The pipeline is brief, then words, then synonyms, then names. Each step takes its cue from what you liked in the step before.

- Find words reads the brief and lists root words: single dictionary words, each standing for one idea the product could be named around. It also writes an editable naming summary the first time. More words asks for further root words that avoid the ones already listed.
- Click a word to like it. Liking a word prepares its synonyms; nothing prepares until a word is liked. Click a synonym to mark it preferred, and use the x that appears on hover to exclude it. More synonyms asks for further synonyms of a liked word.
- Generate names builds on the liked words and their synonyms. Until a word is liked, every included word is in play. Names cite the words and synonyms they draw on. Refine the next round with More literal, More evocative, Shorter, Avoid compounds, or a custom direction.
- Add words, synonyms, and finished names directly, including without an AI connection. Enter submits; newline-separated paste adds a batch. Commas and semicolons offer a preview before splitting. A word's menu can exclude it from generation; the hover x removes it, with Undo.
- Click a name to shortlist it. The x that appears on hover hides it, with Undo. Open the details chevron for rationale, source words, editable notes, and its actions. Compare the shortlist from the overflow menu.
- Stop cancels queued work and discards late responses, keeping completed results. Provider failures offer an explicit Retry; reviewing, scrolling, and shortlisting never start AI requests.

The five styles are Real words, Evocative, Phrases, Compounds, and Coined. In local files, names automatically check against the original Namenym domain service (Domainr via RapidAPI), with two concurrent requests per editor. Each tile shows its .com result; “Available .com only” filters the current list. Details and shortlist comparison show available .com, .ai, .net, and .org matches, public registrar-search links, and the last result time. Stop domain checks pauses automatic work; Recheck/Resume and per-name Retry are explicit. Renaming clears the old result, and late responses cannot attach to a changed name or reloaded file.

Only candidate names are sent to `https://api.namenym.com/domains/search`; briefs and notes are not sent. The existing server holds its RapidAPI credential; no key configuration is needed in the extension. Spaces are joined (Open Book → openbook.com); unsupported punctuation and accented names ask for an edit instead of silently changing their spelling. Saved results are reused for 15 minutes when reopening a project. The backend also caches results for 15 minutes, so an immediate recheck may return its cached answer. The endpoint returns available matches only: “not listed” means the API did not report that domain as available, not proof of registration. Confirm current availability and price with the registrar. Network errors remain retryable and are never presented as availability results.

Trademark checks are not provided. Saved historical evaluations remain in the document, but the workspace does not present model guesses as verified availability or clearance.

## Collaborative projects

Share a local project through Nimbalyst's Share to Team flow. Shared brief, summary, constraints and notes merge text edits; themes, words and names update by stable identity. Each participant has My favorites, with attributed totals in Team favorites. The imported shortlist retains its unknown attribution and does not invent votes. Archiving a name keeps its notes and favorites. Duplicate names created offline remain separate, and deleting a theme leaves its words unassigned.

The web console pins the same editor for manual editing and review. AI generation and word preparation require the desktop app; only the initiating editor runs a job. Shared documents check domains only on explicit request. Presence reports selection and local job activity. Read-only viewers cannot mutate content or start jobs. Source mode and browser creation/export/history are not enabled in this release.

Shared exports use portable format v3; the reader still accepts v1 and v2. Favorites use authenticated host member IDs scoped to a document, since both hosts expose document identity. Imports into another document preserve the earlier preferences as historical records, excluded from current totals. Display names are snapshots, not an authoritative current-member roster. Preferences are collaborative document content, not tamper-proof ballots or approval records.

## Keyboard

Tab into the names grid. Arrow keys move between names, Enter or S toggles the shortlist, D opens details, E edits, Delete or H hides/restores, M opens actions, and Escape closes actions and details. A focused word toggles its like with Enter. A focused synonym toggles its upvote with Enter, excludes with Delete, and can be edited or removed using its context menu (right-click or Shift+F10).

## Project files

Version 1 projects migrate to version 2 on load and are written only when saved after a change. Names, IDs, notes, shortlist, and legacy evaluations are preserved. Exact duplicate words are merged with reference redirection, and their original records remain in `migrationArchive`. Orphaned words appear under Unassigned words and stay out of generation until assigned. Invalid files display a recoverable error and are never replaced with empty projects.

The original source brief stays in the document. Requests reuse the compact naming summary; editing the source marks it stale. A complete request exceeding the explicit 64,000-character input budget is rejected without truncation. The host does not currently expose model context-window limits, so a provider may impose a smaller limit. The first enabled host model is resolved before each request; Namenym does not infer model quality from names such as “nano.”

## AI tools

- `namenym.get_project`: read the project, including unsaved editor changes. Root words are stored as `concepts` (a vote marks a liked word) and synonyms as `synonyms`.
- `namenym.add_themes`: add root words.
- `namenym.add_words`: add synonyms to a root word using its ID.
- `namenym.add_names`: add finished names.
- `namenym.shortlist`: set shortlist membership.

Mutations use the open editor API when available and the same reducer as manual edits. Closed local-file fallback mutations are serialized per path. Shared documents require a live or headlessly mounted collaborative editor and never fall back to the filesystem. Mutating shared tools await host persistence acknowledgement, including idempotent retries.

## Development

Use Node.js 24 (see `.nvmrc`); Node.js 22.12+ is also accepted by the package. Live extension testing requires Nimbalyst 0.78.0 or later.

```sh
npm ci
npx playwright install chrome
npm run check
npm audit
```

`test:editor` runs the real React editor against a controlled host/provider in headless Google Chrome; Chrome must be installed. It covers generation races, manual contribution, save concurrency, and invalid/external file handling. Use Nimbalyst's `extension_reload` tool to build and install changes in the desktop app, and the extension testing tools for live checks.

`test:collab-editor` exercises two independent browser clients, permissions, text composition, reconnect-style merging and reopen from serialized CRDT state. Real DocumentRoom transport and the pinned bundle/real browser-host integration have separate tests in the collab repository. Production console builds require committed, clean extension sources; local fixture results do not certify deployment.

Generation emits structured `[Namenym timing]`, `[Namenym words]`, `[Namenym preparation]`, and `[Namenym round]` console records for queue delay, duration, completion, actual model, and request status. Timings are measurements, not performance guarantees.

## Contributing and releases

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture and pull-request guidance, [SECURITY.md](SECURITY.md) for vulnerability reporting, [CHANGELOG.md](CHANGELOG.md) for release notes, and [RELEASING.md](RELEASING.md) for the release checklist. `npm pack` builds and checks an explicit allowlist of extension files, excluding local workspaces and test artifacts.

## License

MIT. See [LICENSE](LICENSE).
