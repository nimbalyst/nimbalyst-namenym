import React, { useState, useContext } from "react";
import { ProjectEditingContext } from "../collab/ProjectText";
import { InlineAdd } from "./InlineAdd";
import {
  normalize,
  type Concept,
  type NamenymProject,
  type Synonym,
} from "../types";
import { preparationRevision, validLabel, type Action } from "../state";
interface Props {
  project: NamenymProject;
  apply: (a: Action) => void;
  prepare: (ids: string[], more?: boolean) => void;
  findWords: (more?: boolean) => void;
  finding: boolean;
  preparing: string[];
  notice: (text: string, undo?: () => void) => void;
  addThemes: (labels: string[]) => void;
  aiAvailable: boolean;
}
export function WordsPanel({
  project: p,
  apply,
  prepare,
  findWords,
  finding,
  preparing,
  notice,
  addThemes,
  aiAvailable,
}: Props) {
  const { readOnly } = useContext(ProjectEditingContext);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [editing, setEditing] = useState<{
    kind: "concepts" | "synonyms";
    id: string;
    label: string;
  } | null>(null);
  function edit() {
    if (!editing || readOnly) return;
    if (!validLabel(editing.label)) {
      notice("Use 1–120 characters.");
      return;
    }
    const same = p[editing.kind].find(
      (x) =>
        x.id !== editing.id &&
        normalize(x.label) === normalize(editing.label) &&
        (editing.kind === "concepts" ||
          (x as Synonym).conceptId ===
            p.synonyms.find((w) => w.id === editing.id)?.conceptId)
    );
    if (same) {
      notice(`“${same.label}” already exists.`);
      return;
    }
    apply({ type: "EDIT_ITEM", ...editing });
    setEditing(null);
  }
  function addWords(id: string, labels: string[]) {
    const old = new Set(
      p.synonyms
        .filter((w) => w.conceptId === id)
        .map((w) => normalize(w.label))
    );
    const duplicates = labels.filter((x) => old.has(normalize(x)));
    apply({
      type: "ADD_SYNONYMS",
      synonyms: labels.map((label) => ({
        label,
        conceptId: id,
        source: "manual",
      })),
    });
    notice(
      duplicates.length
        ? `Already listed: ${duplicates.join(", ")}`
        : `Added ${new Set(labels.map(normalize)).size} synonym(s).`
    );
    if (duplicates.length) {
      const word = p.synonyms.find(
        (w) =>
          w.conceptId === id && normalize(w.label) === normalize(duplicates[0])
      );
      if (word?.dismissed) setExcluded([...excluded, id]);
      setTimeout(() => document.getElementById(`word-${word?.id}`)?.focus(), 0);
    }
  }
  function removeTheme(c: Concept) {
    if (readOnly) return;
    const words = p.synonyms.filter((w) => w.conceptId === c.id);
    apply({ type: "REMOVE_CONCEPT", id: c.id });
    notice(`Removed ${c.label}`, () =>
      apply({
        type: "RESTORE_THEME",
        theme: c,
        words,
        nameSources: p.mashups.map((m) => ({
          id: m.id,
          sources: m.sources.filter(
            (s) => s.id === c.id || words.some((w) => w.id === s.id)
          ),
        })),
      })
    );
  }
  function excludeWord(w: Synonym) {
    if (readOnly) return;
    apply({ type: "DISMISS_SYNONYM", id: w.id });
    notice(`${w.dismissed ? "Included" : "Excluded"} ${w.label}`, () =>
      apply({ type: "DISMISS_SYNONYM", id: w.id })
    );
  }
  const startEditing = (w: Synonym) =>
    setEditing({ kind: "synonyms", id: w.id, label: w.label });
  const liked = (c: Concept) => c.included !== false && c.votes > 0;
  const stale = (c: Concept) =>
    c.preparedRevision !== preparationRevision(p);
  // Liking a word is what moves it to the synonym step.
  function likeWord(c: Concept) {
    if (readOnly) return;
    apply({ type: "LIKE_CONCEPT", id: c.id });
    if (!liked(c) && c.included !== false && stale(c) && aiAvailable)
      prepare([c.id]);
  }
  const missing = p.concepts.filter((c) => liked(c) && stale(c));
  return (
    <aside className="nn-words">
      <div className="nn-panel-heading">
        Words{" "}
        <span>
          {missing.length > 0 && (
            <button
              disabled={readOnly || !aiAvailable}
              onClick={() => prepare(missing.map((c) => c.id))}
            >
              Prepare synonyms
            </button>
          )}
          {p.concepts.length > 0 && (
            <button
              disabled={readOnly || !aiAvailable || finding}
              title="Find more root words from the brief"
              onClick={() => findWords(true)}
            >
              More words
            </button>
          )}
        </span>
      </div>
      {p.concepts.length === 0 && (
        <p className="nn-words-hint">
          Find words from the brief, or add your own. Like a word to prepare
          its synonyms; liked words and synonyms guide name generation.
        </p>
      )}
      {p.concepts.map((c) => (
        <section
          className={`nn-theme ${c.included === false ? "nn-excluded" : ""} ${
            liked(c) ? "nn-liked" : ""
          }`}
          key={c.id}
          id={`theme-${c.id}`}
          tabIndex={-1}
        >
          <div className="nn-theme-heading">
            <button
              disabled={readOnly || c.included === false}
              className="nn-theme-label"
              aria-pressed={c.included === false ? undefined : liked(c)}
              title={
                c.included === false
                  ? `${c.label} is excluded`
                  : liked(c)
                  ? `Remove like from ${c.label}`
                  : `Like ${c.label} to prepare synonyms and guide names`
              }
              onClick={() => likeWord(c)}
            >
              {c.label}
            </button>
            {preparing.includes(c.id) && <span role="status">preparing…</span>}
            <details className="nn-menu">
              <summary aria-label={`Word actions for ${c.label}`}>⋯</summary>
              <div>
                <button
                  disabled={readOnly}
                  onClick={() =>
                    setEditing({ kind: "concepts", id: c.id, label: c.label })
                  }
                >
                  Edit word
                </button>
                <button
                  disabled={readOnly}
                  onClick={() => apply({ type: "VOTE_CONCEPT", id: c.id })}
                >
                  {c.included === false ? "Include word" : "Exclude word"}
                </button>
                {normalize(c.label) === "knowlege" && (
                  <button
                    disabled={readOnly}
                    onClick={() =>
                      apply({
                        type: "EDIT_ITEM",
                        kind: "concepts",
                        id: c.id,
                        label: "Knowledge",
                      })
                    }
                  >
                    Correct to Knowledge
                  </button>
                )}
              </div>
            </details>
            {!readOnly && (
              <button
                className="nn-x"
                title={`Remove word ${c.label}`}
                aria-label={`Remove word ${c.label}`}
                onClick={() => removeTheme(c)}
              >
                ×
              </button>
            )}
          </div>
          {editing?.kind === "concepts" && editing.id === c.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                edit();
              }}
            >
              <input
                readOnly={readOnly}
                autoFocus
                aria-label="Edit word"
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
              />
              <button disabled={readOnly}>Save</button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </form>
          )}
          <div className="nn-word-list">
            {p.synonyms
              .filter(
                (w) =>
                  w.conceptId === c.id &&
                  (!w.dismissed || excluded.includes(c.id))
              )
              .map((w) => (
                <span
                  key={w.id}
                  className={`nn-word ${w.dismissed ? "nn-struck" : ""} ${
                    w.votes > 0 && !w.dismissed ? "nn-voted" : ""
                  }`}
                >
                  <button
                    disabled={readOnly}
                    id={`word-${w.id}`}
                    className="nn-word-label"
                    aria-pressed={w.dismissed ? undefined : w.votes > 0}
                    title={
                      w.dismissed
                        ? `Include ${w.label} again`
                        : `${w.votes > 0 ? "Remove upvote from" : "Upvote"} ${
                            w.label
                          }. Right-click or press Shift+F10 to edit.`
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      startEditing(w);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "F10" && e.shiftKey) {
                        e.preventDefault();
                        startEditing(w);
                      }
                      if (e.key === "Delete" || e.key === "Backspace") {
                        e.preventDefault();
                        excludeWord(w);
                      }
                    }}
                    onClick={() =>
                      w.dismissed
                        ? excludeWord(w)
                        : apply({ type: "VOTE_SYNONYM", id: w.id })
                    }
                  >
                    {w.label}
                  </button>
                  {!readOnly && (
                    <button
                      className={w.dismissed ? "nn-restore" : "nn-x"}
                      tabIndex={-1}
                      title={`${w.dismissed ? "Include" : "Exclude"} ${
                        w.label
                      }`}
                      aria-label={`${w.dismissed ? "Include" : "Exclude"} ${
                        w.label
                      }`}
                      onClick={() => excludeWord(w)}
                    >
                      {w.dismissed ? "↺" : "×"}
                    </button>
                  )}
                </span>
              ))}
          </div>
          {editing?.kind === "synonyms" &&
            p.synonyms.some(
              (w) => w.id === editing.id && w.conceptId === c.id
            ) && (
              <form
                className="nn-word-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  edit();
                }}
              >
                <input
                  readOnly={readOnly}
                  autoFocus
                  aria-label="Edit synonym"
                  value={editing.label}
                  onChange={(e) =>
                    setEditing({ ...editing, label: e.target.value })
                  }
                />
                <button disabled={readOnly}>Save</button>
                <button
                  type="button"
                  onClick={() => {
                    const word = p.synonyms.find((w) => w.id === editing.id)!;
                    apply({ type: "REMOVE_SYNONYM", id: word.id });
                    setEditing(null);
                    notice(`Removed ${word.label}`, () =>
                      apply({
                        type: "RESTORE_WORD",
                        word,
                        nameSources: p.mashups.map((m) => ({
                          id: m.id,
                          sources: m.sources.filter((s) => s.id === word.id),
                        })),
                      })
                    );
                  }}
                >
                  Remove
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            )}
          <div className="nn-word-add">
            <InlineAdd
              label={`Add synonym to ${c.label}`}
              onAdd={(labels) => addWords(c.id, labels)}
            />
            <button
              disabled={
                readOnly ||
                !aiAvailable ||
                preparing.includes(c.id) ||
                !liked(c)
              }
              title={
                liked(c)
                  ? `Find more synonyms for ${c.label}`
                  : `Like ${c.label} to find synonyms`
              }
              onClick={() => prepare([c.id], true)}
            >
              + more synonyms
            </button>
          </div>
          {p.synonyms.some((w) => w.conceptId === c.id && w.dismissed) && (
            <button
              className="nn-text-button"
              onClick={() =>
                setExcluded(
                  excluded.includes(c.id)
                    ? excluded.filter((id) => id !== c.id)
                    : [...excluded, c.id]
                )
              }
            >
              {
                p.synonyms.filter((w) => w.conceptId === c.id && w.dismissed)
                  .length
              }{" "}
              excluded · {excluded.includes(c.id) ? "Hide" : "Show"}
            </button>
          )}
        </section>
      ))}
      <InlineAdd label="Add a word" onAdd={addThemes} />
      {p.unassignedWords.length > 0 && (
        <details>
          <summary>Unassigned synonyms ({p.unassignedWords.length})</summary>
          {p.unassignedWords.map((w) => (
            <label key={w.id}>
              {w.label}
              <select
                disabled={readOnly}
                aria-label={`Assign ${w.label}`}
                value=""
                onChange={(e) =>
                  apply({
                    type: "ASSIGN_WORD",
                    id: w.id,
                    conceptId: e.target.value,
                  })
                }
              >
                <option value="">Choose word…</option>
                {p.concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </details>
      )}
    </aside>
  );
}
