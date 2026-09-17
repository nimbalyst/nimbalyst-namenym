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
  preparing: string[];
  notice: (text: string, undo?: () => void) => void;
  addThemes: (labels: string[]) => void;
  aiAvailable: boolean;
}
export function WordsPanel({
  project: p,
  apply,
  prepare,
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
        ? `Already in words: ${duplicates.join(", ")}`
        : `Added ${new Set(labels.map(normalize)).size} word(s).`
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
  const missing = p.concepts.filter(
    (c) => c.included !== false && c.preparedRevision !== preparationRevision(p)
  );
  return (
    <aside className="nn-words">
      <div className="nn-panel-heading">
        Words{" "}
        {missing.length > 0 && (
          <button
            disabled={readOnly || !aiAvailable}
            onClick={() => prepare(missing.map((c) => c.id))}
          >
            Prepare words
          </button>
        )}
      </div>
      {p.concepts.map((c) => (
        <section
          className={`nn-theme ${c.included === false ? "nn-excluded" : ""}`}
          key={c.id}
          id={`theme-${c.id}`}
          tabIndex={-1}
        >
          <div className="nn-theme-heading">
            <input
              type="checkbox"
              disabled={readOnly}
              aria-label={`Include ${c.label}`}
              checked={c.included !== false}
              onChange={() => apply({ type: "VOTE_CONCEPT", id: c.id })}
            />
            <strong>{c.label}</strong>
            {preparing.includes(c.id) && <span role="status">preparing…</span>}
            <details className="nn-menu">
              <summary aria-label={`Theme actions for ${c.label}`}>⋯</summary>
              <div>
                <button
                  disabled={readOnly}
                  onClick={() =>
                    setEditing({ kind: "concepts", id: c.id, label: c.label })
                  }
                >
                  Edit theme
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
                title={`Remove theme ${c.label}`}
                aria-label={`Remove theme ${c.label}`}
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
                aria-label="Edit theme"
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
                  aria-label="Edit word"
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
              label={`Add word to ${c.label}`}
              onAdd={(labels) => addWords(c.id, labels)}
            />
            <button
              disabled={
                readOnly ||
                !aiAvailable ||
                preparing.includes(c.id) ||
                c.included === false
              }
              onClick={() => prepare([c.id], true)}
            >
              + more words
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
      <InlineAdd label="Add a theme" onAdd={addThemes} />
      {p.unassignedWords.length > 0 && (
        <details>
          <summary>Unassigned words ({p.unassignedWords.length})</summary>
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
                <option value="">Choose theme…</option>
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
