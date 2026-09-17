import React, { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHostProps } from "@nimbalyst/extension-sdk";
import { ALL_STYLES, STYLE_LABELS, normalize } from "./types";
import { useProjectState } from "./useProjectState";
import { ProjectText, ProjectEditingContext } from "./collab/ProjectText";
import { usePresence } from "./collab/usePresence";
import { summaryIsStale } from "./generationInputs";
import { getAIService } from "./extensionContext";
import { type Action } from "./state";
import { registerProject } from "./editorRegistry";
import { useGeneration } from "./useGeneration";
import { WordsPanel } from "./panels/WordsPanel";
import { NamesPanel } from "./panels/NamesPanel";

export function NimbalystNamenymEditor({ host }: EditorHostProps) {
  return <ProjectEditor key={host.filePath} host={host} />;
}
function ProjectEditor({ host }: EditorHostProps) {
  const state = useProjectState(host);
  const {
    project,
    get,
    apply,
    loading,
    loadRevision,
    ready,
    error,
    external,
    load,
    readOnly,
    binding,
  } = state;
  const aiAvailable =
    host.capabilities?.environment !== "browser" && !!getAIService();
  const canGenerate = () => !host.readOnly && aiAvailable && state.ready;
  const [wordsOpen, setWordsOpen] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => void;
    canUndo?: () => boolean;
  } | null>(null);
  const [direction, setDirection] = useState("");
  const notice = useCallback(
    (text: string, undo?: () => void) =>
      setToast({
        text,
        ...(binding && undo ? binding.captureUndo() : { undo }),
      }),
    [binding]
  );
  const generation = useGeneration(
    host.filePath,
    get,
    apply,
    notice,
    canGenerate
  );
  const presence = usePresence(host, generation.progress);
  const preparationCallback = useRef(generation.prepare);
  preparationCallback.current = generation.prepare;
  useEffect(() => {
    generation.stop();
  }, [loadRevision, readOnly]);
  useEffect(() => {
    const api = {
      get,
      collaborative: !!binding,
      flush: binding
        ? async () => {
            if (!(await host.collaboration!.flushWithAck()))
              throw new Error(
                "The shared edit is pending server acknowledgement."
              );
          }
        : undefined,
      apply: (action: Action) => {
        const old = get().concepts;
        apply(action);
        if (action.type === "ADD_CONCEPTS" && canGenerate())
          preparationCallback.current(
            get()
              .concepts.filter((c) => !old.some((o) => o.id === c.id))
              .map((c) => c.id)
          );
      },
    };
    const unregister =
      !loading && ready ? registerProject(host.filePath, api) : () => {};
    // Current hosts expose this API; the published SDK still predates it.
    const bridge = host as typeof host & {
      registerEditorAPI?: (api: unknown | null) => void;
    };
    if (!loading && ready) bridge.registerEditorAPI?.(api);
    return () => {
      unregister();
      bridge.registerEditorAPI?.(null);
    };
  }, [host, get, apply, loading, loadRevision, binding, ready, aiAvailable]);
  function addThemes(labels: string[]) {
    const old = get().concepts;
    apply({
      type: "ADD_CONCEPTS",
      concepts: labels.map((label) => ({ label, source: "manual" })),
    });
    const added = get().concepts.filter((c) => !old.some((o) => o.id === c.id));
    const duplicate = old.find((c) =>
      labels.some((label) => normalize(label) === normalize(c.label))
    );
    notice(
      `${added.length} theme(s) added${
        duplicate ? `; “${duplicate.label}” already exists` : ""
      }.`
    );
    if (duplicate)
      requestAnimationFrame(() =>
        document.getElementById(`theme-${duplicate.id}`)?.focus()
      );
    if (added.length && canGenerate())
      generation.prepare(added.map((c) => c.id));
  }
  const stale = summaryIsStale(project);
  const brief = (
    <div className="nn-brief-editor">
      {project.summary && (
        <>
          <label>
            Naming summary
            <ProjectText
              field="summary"
              aria-label="Naming summary"
              value={project.summary}
              onChange={(value) =>
                apply({
                  type: "SET_SUMMARY",
                  summary: value,
                  sourceRevision: project.briefRevision,
                })
              }
            />
          </label>
          <p>Every request uses this summary.</p>
        </>
      )}
      {stale && (
        <p role="status">
          Source changed · Summary is stale{" "}
          <button
            disabled={readOnly || !aiAvailable}
            onClick={generation.refresh}
          >
            Refresh summary
          </button>
        </p>
      )}
      <details open={!project.summary || undefined}>
        <summary>
          Source ·{" "}
          {project.brief.trim() ? project.brief.trim().split(/\s+/).length : 0}{" "}
          words
        </summary>
        <ProjectText
          field="brief"
          aria-label="Project brief"
          value={project.brief}
          placeholder="Describe the product, audience, and feeling the name should convey…"
          onChange={(value) => apply({ type: "SET_BRIEF", brief: value })}
        />
      </details>
      {!project.summary && project.brief && (
        <button
          disabled={readOnly || !aiAvailable}
          onClick={generation.refresh}
        >
          Create naming summary
        </button>
      )}
    </div>
  );
  if (loading)
    return <div className="nn-editor nn-loading">Loading naming project…</div>;
  if (!ready)
    return (
      <div className="nn-editor nn-load-error" role="alert">
        <h2>Could not load this project</h2>
        <p>{error}</p>
        <p>The source has not been changed.</p>
        {!host.collaboration && (
          <>
            <button onClick={() => host.toggleSourceMode?.()}>
              Open source
            </button>
            <button
              onClick={() => {
                void host
                  .loadContent()
                  .then(load)
                  .catch((e) => notice(String(e)));
              }}
            >
              Retry load
            </button>
          </>
        )}
        {host.collaboration && (
          <p>
            Close and reopen this document after checking the connection and
            editor version.
          </p>
        )}
      </div>
    );
  return (
    <ProjectEditingContext.Provider value={{ binding, readOnly }}>
      <div
        className="nn-editor"
        onKeyDown={(e) => {
          if (
            binding &&
            !readOnly &&
            (e.metaKey || e.ctrlKey) &&
            e.key.toLowerCase() === "z"
          ) {
            e.preventDefault();
            e.shiftKey ? binding.redo() : binding.undo();
            return;
          }
          if (e.key === "Escape") {
            setBriefOpen(false);
            setStylesOpen(false);
            const open = e.currentTarget.querySelectorAll<HTMLDetailsElement>(
              "details.nn-menu[open]"
            );
            open.forEach((d) => (d.open = false));
          }
        }}
      >
        <header className="nn-header">
          <input
            readOnly={readOnly}
            className="nn-project-title"
            aria-label="Project title"
            value={project.name}
            onChange={(e) => apply({ type: "SET_NAME", name: e.target.value })}
          />
          <button
            aria-expanded={briefOpen}
            onClick={() => {
              setBriefOpen(!briefOpen);
              setStylesOpen(false);
            }}
          >
            Brief{stale ? " •" : ""}
          </button>
          <button
            aria-expanded={stylesOpen}
            onClick={() => {
              setStylesOpen(!stylesOpen);
              setBriefOpen(false);
            }}
          >
            Style
          </button>
          <button
            className="nn-words-toggle"
            aria-expanded={wordsOpen}
            onClick={() => setWordsOpen(!wordsOpen)}
          >
            Words
          </button>
          <div className="nn-header-actions">
            {generation.busy ? (
              <button onClick={generation.stop}>Stop</button>
            ) : (
              <button
                disabled={readOnly || !aiAvailable}
                title={
                  !aiAvailable
                    ? "Generate names in the desktop app; results appear here live."
                    : undefined
                }
                className="nn-primary"
                onClick={() => generation.generate()}
              >
                Generate names
              </button>
            )}
            <details className="nn-menu">
              <summary>Refine ▾</summary>
              <div>
                {[
                  "More literal",
                  "More evocative",
                  "Shorter",
                  "Avoid compounds",
                ].map((text) => (
                  <button
                    key={text}
                    disabled={readOnly || !aiAvailable || generation.naming}
                    onClick={(e) => {
                      generation.generate(text);
                      e.currentTarget.closest("details")!.open = false;
                    }}
                  >
                    {text}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (direction.trim()) {
                      generation.generate(direction.trim());
                      setDirection("");
                      e.currentTarget.closest("details")!.open = false;
                    }
                  }}
                >
                  <input
                    aria-label="Custom refinement"
                    placeholder="Custom direction…"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                  />
                  <button
                    disabled={readOnly || !aiAvailable || generation.naming}
                  >
                    Go
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {(!aiAvailable || readOnly) && (
          <div className="nn-capability-note">
            {readOnly
              ? "Read-only · You can browse and compare names."
              : "Generate names in the desktop app. You can edit and favorite names here; generated results appear live."}
          </div>
        )}
        {briefOpen && (
          <section className="nn-header-disclosure">{brief}</section>
        )}
        {stylesOpen && (
          <section className="nn-header-disclosure nn-style-options">
            {ALL_STYLES.map((style) => (
              <label key={style}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={project.selectedStyles.includes(style)}
                  onChange={() => apply({ type: "TOGGLE_STYLE", style })}
                />
                {STYLE_LABELS[style]}
              </label>
            ))}
            <label>
              Language
              <input
                readOnly={readOnly}
                value={project.language}
                onChange={(e) =>
                  apply({ type: "SET_LANGUAGE", language: e.target.value })
                }
              />
            </label>
            <label>
              Constraints
              <ProjectText
                field="constraints"
                placeholder="Must use / avoid, length, audience, tone…"
                value={project.constraints}
                onChange={(value) =>
                  apply({ type: "SET_CONSTRAINTS", constraints: value })
                }
              />
            </label>
          </section>
        )}
        {error && (
          <div role="alert" className="nn-error">
            <span>{error}</span>
            {external && (
              <>
                <button onClick={() => load(external)}>
                  Use external version
                </button>
                <button
                  onClick={() => {
                    state.keepLocal();
                    notice(
                      "Kept your edits. Save to replace the external version."
                    );
                  }}
                >
                  Keep my edits
                </button>
              </>
            )}
            {!state.conflict && (
              <button onClick={state.dismissError}>Dismiss</button>
            )}
          </div>
        )}
        {generation.jobs
          .filter((j) => j.status === "failed")
          .map((j) => (
            <div className="nn-error" role="alert" key={j.id}>
              <span>
                {j.type === "words" ? "Word preparation" : "Generation"} failed:{" "}
                {j.error}
              </span>
              <button onClick={() => generation.retry(j.id)}>Retry</button>
              <button onClick={() => generation.dismiss(j.id)}>Dismiss</button>
            </div>
          ))}
        {presence.peers.length > 0 && (
          <div className="nn-presence" role="status">
            {presence.peers.map((peer) => {
              const selected = project.mashups.find(
                (n) => n.id === peer.selection
              );
              return (
                <span key={peer.id}>
                  {peer.name}
                  {peer.job
                    ? ` · ${peer.job}`
                    : selected
                    ? ` · reviewing ${selected.label}`
                    : " · here"}
                </span>
              );
            })}
          </div>
        )}
        <div className={`nn-workspace ${wordsOpen ? "" : "nn-words-hidden"}`}>
          {wordsOpen && (
            <WordsPanel
              project={project}
              apply={apply}
              prepare={generation.prepare}
              preparing={generation.preparingIds}
              notice={notice}
              addThemes={addThemes}
              aiAvailable={aiAvailable}
            />
          )}
          <NamesPanel
            key={loadRevision}
            project={project}
            apply={apply}
            generate={generation.generate}
            aiAvailable={aiAvailable}
            shared={!!binding}
            favoriteScope={binding?.actor.scope}
            onSelection={presence.select}
            naming={generation.naming}
            progress={generation.progress}
            notice={notice}
            firstRun={
              <section className="nn-first-run">
                <h2>What are you naming?</h2>
                {!briefOpen && brief}
                <p>
                  Describe your idea, then Generate names — or add themes and
                  names by hand.
                </p>
              </section>
            }
          />
        </div>
        {toast && (
          <div className="nn-toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && !readOnly && (toast.canUndo?.() ?? true) && (
              <button
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ProjectEditingContext.Provider>
  );
}
