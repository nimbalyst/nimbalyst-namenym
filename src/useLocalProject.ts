import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorHost } from "@nimbalyst/extension-sdk";
import { createEmptyProject } from "./types";
import { parseProject } from "./persistence";
import { projectReducer, type Action } from "./state";

export function useLocalProject(host: EditorHost, enabled: boolean) {
  const [project, setProject] = useState(createEmptyProject);
  const current = useRef(project);
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const ready = useRef(false);
  const dirty = useRef(false);
  const disk = useRef("");
  const saving = useRef<string | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);
  const [error, setError] = useState("");
  const [external, setExternal] = useState<string | null>(null);
  const conflict = useRef(false);
  const get = useCallback(() => {
    if (!ready.current) throw new Error("Project has not loaded successfully.");
    return current.current;
  }, []);
  const apply = useCallback(
    (action: Action) => {
      if (!ready.current || !enabled || host.readOnly)
        throw new Error("This naming project is read-only or not loaded.");
      const next = projectReducer(current.current, action);
      if (next === current.current) return;
      current.current = next;
      setProject(next);
      dirty.current = true;
      host.setDirty(true);
    },
    [host, enabled]
  );
  const load = useCallback(
    (content: string) => {
      const parsed = parseProject(content);
      current.current = parsed;
      setProject(parsed);
      setLoadRevision((n) => n + 1);
      disk.current = content;
      ready.current = true;
      dirty.current = false;
      conflict.current = false;
      setExternal(null);
      setError("");
      host.setDirty(false);
    },
    [host]
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    host
      .loadContent()
      .then((content) => {
        if (active) {
          try {
            load(content);
          } catch (e) {
            setError(String(e));
          }
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      ready.current = false;
    };
  }, [host, load, enabled]);
  useEffect(
    () =>
      enabled
        ? host.onSaveRequested(async () => {
            while (pendingSave.current) await pendingSave.current;
            if (host.readOnly || !ready.current || conflict.current)
              throw new Error(
                "Save paused: resolve the project load or external file conflict first."
              );
            if (!dirty.current) return;
            const snapshot = current.current;
            const content = JSON.stringify(snapshot, null, 2);
            saving.current = content;
            pendingSave.current = host
              .saveContent(content)
              .then(() => {
                disk.current = content;
                if (current.current === snapshot && !conflict.current) {
                  dirty.current = false;
                  host.setDirty(false);
                }
              })
              .catch((e) => {
                setError(`Could not save: ${String(e)}`);
                throw e;
              })
              .finally(() => {
                saving.current = null;
                pendingSave.current = null;
              });
            await pendingSave.current;
          })
        : undefined,
    [host, enabled]
  );
  useEffect(
    () =>
      enabled
        ? host.onFileChanged((content) => {
            if (content === disk.current || content === saving.current) return;
            try {
              parseProject(content);
              if (dirty.current) {
                conflict.current = true;
                setExternal(content);
                setError(
                  "The file changed outside this editor. Your unsaved work is preserved. Save is paused until the conflict is resolved."
                );
                return;
              }
              load(content);
            } catch (e) {
              conflict.current = true;
              setError(
                `External file is invalid. Current work is preserved; save is paused. ${String(
                  e
                )}`
              );
            }
          })
        : undefined,
    [host, load, enabled]
  );

  return {
    project,
    get,
    apply,
    loading,
    loadRevision,
    ready: ready.current,
    error,
    external,
    load,
    conflict: conflict.current,
    dismissError: () => setError(""),
    keepLocal() {
      disk.current = external ?? disk.current;
      conflict.current = false;
      setExternal(null);
      setError("");
    },
  };
}
