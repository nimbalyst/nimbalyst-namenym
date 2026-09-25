# Changelog

## Unreleased

## 0.1.2 — 2026-09-25

- Re-rendering a list of about 500 names takes about 13ms instead of about 650ms; those renders were delaying typing elsewhere in Nimbalyst while a shared project was open.
- Generation now runs as brief, then words, then synonyms, then names. Find words lists single root words from the brief instead of multi-word themes, liking a word is what prepares its synonyms, and Generate names builds on the liked words and their synonyms. Until a word is liked, every included word is used. Names now record the specific words and synonyms they drew on. Existing projects keep their themes and words; like a theme to prepare synonyms for it.
- The AI tools describe root words and synonyms so an agent adds single words rather than name concepts.
- Clicking a name now toggles the shortlist (or your favorite in shared projects) instead of opening details; the hover state previews the star, and a chevron or the D key opens details.
- Clicking a word now upvotes it instead of excluding it. Upvoted words are marked preferred in generation requests.
- Names, words, and themes remove through a small x that appears on hover, with Undo. Hidden names and excluded words show a restore control in its place.

## 0.1.1 — 2026-09-17

- Share naming projects with collaborative editing and per-member favorites in Nimbalyst desktop and the web console.

## 0.1.0

- Names-first workspace with themes, words, manual additions, notes, favorites, and shortlist comparison.
- AI name generation, word preparation, refinement, cancellation, and explicit retries.
- Domain availability results with caching and registrar links.
- Local project migration and collaborative editing with per-member favorites.
- MIT-licensed source, contributor documentation, automated checks, and a bounded extension package.
