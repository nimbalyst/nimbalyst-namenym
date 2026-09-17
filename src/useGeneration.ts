import { useEffect, useRef, useState } from "react";
import { TaskCoordinator } from "./coordinator";
import {
  expandWords,
  generateRound,
  refreshSummary,
  PROMPT_VERSION,
} from "./ai";
import { getAIService } from "./extensionContext";
import { preparationRevision, type Action } from "./state";
import { generateId, normalize, type NamenymProject } from "./types";
import {
  generationSignature,
  generationInputsCurrent,
} from "./generationInputs";
export function useGeneration(
  path: string,
  get: () => NamenymProject,
  apply: (a: Action) => void,
  notice: (s: string) => void,
  canRun: () => boolean = () => true
) {
  const allowed = useRef(canRun);
  allowed.current = canRun;
  const [, render] = useState(0);
  const coordinator = useRef<TaskCoordinator>();
  if (!coordinator.current)
    coordinator.current = new TaskCoordinator(() => render((n) => n + 1));
  const q = coordinator.current;
  useEffect(() => () => q.dispose(), [q, path]);
  const requireAI = () => {
    if (!allowed.current())
      throw new Error("Generation is unavailable in this editor.");
    const ai = getAIService();
    if (!ai)
      throw new Error(
        "No AI chat provider available. Enable a provider in Settings → AI, or keep adding entries by hand."
      );
    return ai;
  };
  const preparation = useRef<{ ids: string[]; completed: Set<string> } | null>(
    null
  );
  function prepare(ids: string[], more = false, finished?: () => void) {
    if (!allowed.current()) return;
    const snapshot = get();
    if (!snapshot.summary && snapshot.brief.length > 6000) {
      const revision = JSON.stringify([snapshot.brief, snapshot.summary]);
      q.enqueue({
        key: JSON.stringify([path, "prepare-summary", revision, ids]),
        project: path,
        revision,
        type: "summary",
        priority: 2,
        valid: () =>
          allowed.current() &&
          get().brief === snapshot.brief &&
          get().summary === snapshot.summary,
        run: () => refreshSummary(requireAI(), snapshot),
        apply: (r) => {
          apply({
            type: "SET_SUMMARY",
            summary: r.summary,
            sourceRevision: snapshot.briefRevision,
            sourceFingerprint: snapshot.brief,
          });
          prepare(ids, more, finished);
        },
      });
      return;
    }
    const selected = snapshot.concepts.filter(
      (c) =>
        ids.includes(c.id) &&
        c.included !== false &&
        !q.jobs.some(
          (j) =>
            j.type === "words" &&
            ["running", "queued"].includes(j.status) &&
            j.themeIds.includes(c.id) &&
            j.revision === preparationRevision(snapshot)
        )
    );
    if (!selected.length) {
      finished?.();
      return;
    }
    const batch = {
      ids: selected.map((c) => c.id),
      completed: new Set<string>(),
    };
    preparation.current = batch;
    const started = Date.now();
    for (let index = 0; index < selected.length; index += 3) {
      const themes = selected.slice(index, index + 3);
      const themeIds = themes.map((c) => c.id);
      const revision = preparationRevision(snapshot);
      const key = JSON.stringify([
        path,
        "words",
        PROMPT_VERSION,
        revision,
        themes.map((c) => [
          normalize(c.label),
          c.id,
          more
            ? snapshot.synonyms
                .filter((w) => w.conceptId === c.id)
                .map((w) => normalize(w.label))
            : [],
        ]),
      ]);
      const requestId = generateId("words");
      q.enqueue({
        key,
        project: path,
        revision,
        type: "words",
        themeIds,
        cache: !more,
        priority: more ? 2 : 0,
        valid: () =>
          allowed.current() &&
          preparationRevision(get()) === revision &&
          themes.every((t) =>
            get().concepts.some(
              (c) =>
                c.id === t.id && c.label === t.label && c.included !== false
            )
          ),
        run: () => expandWords(requireAI(), snapshot, themeIds),
        apply: (result) => {
          apply({
            type: "APPLY_GENERATION",
            requestId,
            actions: [
              { type: "ADD_SYNONYMS", synonyms: result.words },
              { type: "PREPARED", ids: themeIds, revision },
            ],
          });
          themeIds.forEach((id) => batch.completed.add(id));
          if (batch.completed.size === batch.ids.length) {
            console.info(
              "[Namenym preparation]",
              JSON.stringify({
                project: path,
                themeCount: batch.ids.length,
                callCount: Math.ceil(batch.ids.length / 3),
                completionMs: Date.now() - started,
                model: result.model,
              })
            );
            finished?.();
          }
        },
      });
    }
  }
  function generate(direction = "") {
    if (!allowed.current()) return;
    if (
      q.jobs.some(
        (j) => j.type === "names" && ["queued", "running"].includes(j.status)
      )
    )
      return;
    const snapshot = get();
    const revision = generationSignature(snapshot);
    const initial = !snapshot.summary;
    if (
      !snapshot.brief.trim() &&
      !snapshot.concepts.length &&
      !snapshot.synonyms.length
    ) {
      notice("Add a brief or a theme before generating names.");
      return;
    }
    const started = Date.now();
    const round = {
      id: generateId("round"),
      direction,
      created: new Date().toISOString(),
    };
    if (direction) notice(`Refining: ${direction}`);
    q.enqueue({
      key: JSON.stringify([
        path,
        "names",
        revision,
        snapshot.mashups.map((m) => m.label),
        direction,
      ]),
      project: path,
      revision,
      type: "names",
      priority: 3,
      valid: () =>
        allowed.current() && generationInputsCurrent(snapshot, get()),
      run: () => generateRound(requireAI(), snapshot, direction, initial),
      apply: (result) => {
        const actions: Action[] = [];
        if (result.summary)
          actions.push({
            type: "SET_SUMMARY",
            summary: result.summary,
            sourceRevision: snapshot.briefRevision,
            sourceFingerprint: snapshot.brief,
          });
        actions.push({ type: "ADD_CONCEPTS", concepts: result.themes });
        actions.push({
          type: "ADD_MASHUPS",
          mashups: result.names.map((n) => ({ ...n, round })),
        });
        apply({ type: "APPLY_GENERATION", requestId: round.id, actions });
        console.info(
          "[Namenym round]",
          JSON.stringify({
            round: round.id,
            firstUsefulNamesMs: Date.now() - started,
            count: result.names.length,
            model: result.model,
          })
        );
        if (!result.names.length)
          notice(
            "No new distinct names in this round. Try a different refinement."
          );
        const current = get();
        prepare(
          current.concepts
            .filter(
              (c) =>
                c.included !== false &&
                c.preparedRevision !== preparationRevision(current)
            )
            .map((c) => c.id),
          false,
          () =>
            console.info(
              "[Namenym round complete]",
              JSON.stringify({
                round: round.id,
                fullRoundMs: Date.now() - started,
                model: result.model,
              })
            )
        );
      },
    });
  }
  function refresh() {
    if (!allowed.current()) return;
    const snapshot = get();
    const revision = JSON.stringify([snapshot.brief, snapshot.summary]);
    q.enqueue({
      key: JSON.stringify([path, "summary", revision]),
      project: path,
      revision,
      type: "summary",
      priority: 3,
      valid: () =>
        allowed.current() &&
        get().brief === snapshot.brief &&
        get().summary === snapshot.summary,
      run: () => refreshSummary(requireAI(), snapshot),
      apply: (r) =>
        apply({
          type: "SET_SUMMARY",
          summary: r.summary,
          sourceRevision: snapshot.briefRevision,
          sourceFingerprint: snapshot.brief,
        }),
    });
  }
  const active = q.jobs.filter((j) => ["queued", "running"].includes(j.status));
  const words = active.filter((j) => j.type === "words");
  return {
    generate,
    prepare,
    refresh,
    stop: () => q.cancel(),
    retry: (id: string) => q.retry(id),
    dismiss: (id: string) => q.dismiss(id),
    jobs: q.jobs,
    busy: active.length > 0,
    naming: active.some((j) => j.type === "names"),
    preparingIds: words.flatMap((j) => j.themeIds),
    progress: active
      .map((j) =>
        j.type === "names"
          ? "Generating names · batch 1 of 1"
          : j.type === "summary"
          ? "Refreshing summary"
          : `Preparing words · ${preparation.current?.completed.size ?? 0} of ${
              preparation.current?.ids.length ?? j.themeIds.length
            } themes`
      )
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · "),
  };
}
