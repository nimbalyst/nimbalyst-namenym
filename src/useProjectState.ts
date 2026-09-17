import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useCollaborativeEditor,
  type EditorHost,
} from "@nimbalyst/extension-sdk";
import { NamenymBinding } from "./collab/binding";
import { namenymCodec } from "./collab/codec";
import { preferenceScope } from "./preferences";
import { createEmptyProject } from "./types";
import type { Action } from "./state";
import { useLocalProject } from "./useLocalProject";

export function useProjectState(host: EditorHost) {
  const local = useLocalProject(host, !host.collaboration);
  const [bindingError, setBindingError] = useState<unknown>(null);
  const [readOnly, setReadOnly] = useState(!!host.readOnly);
  const collab = useCollaborativeEditor(host, {
    codec: {
      ...namenymCodec,
      isEmpty(doc) {
        try {
          return namenymCodec.isEmpty(doc);
        } catch (error) {
          setBindingError(error);
          return false;
        }
      },
    },
    bind: ({ yDoc, user }) => {
      try {
        const binding = new NamenymBinding(
          yDoc,
          {
            scope: preferenceScope(host.filePath),
            id: user.id,
            name: user.name,
          },
          () => !!host.readOnly
        );
        return binding;
      } catch (error) {
        setBindingError(error);
        return { destroy() {} };
      }
    },
  });
  const binding =
    collab.binding instanceof NamenymBinding ? collab.binding : null;
  useEffect(() => {
    const user = host.collaboration?.user;
    if (binding && user)
      binding.updateActor({
        scope: preferenceScope(host.filePath),
        id: user.id,
        name: user.name,
      });
  }, [
    binding,
    host.filePath,
    host.collaboration?.user.id,
    host.collaboration?.user.name,
  ]);
  useEffect(
    () =>
      host.onReadOnlyChanged?.((value) => {
        binding?.setReadOnly(value);
        setReadOnly(value);
      }),
    [host, binding]
  );
  const empty = useRef(createEmptyProject());
  const subscribe = useCallback(
    (cb: () => void) => binding?.subscribe(cb) ?? (() => {}),
    [binding]
  );
  const getSnapshot = useCallback(
    () => binding?.getSnapshot() ?? empty.current,
    [binding]
  );
  const project = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const apply = useCallback(
    (action: Action) => {
      if (!binding) throw new Error("The shared project has not loaded.");
      binding.apply(action);
    },
    [binding]
  );
  const get = useCallback(() => {
    if (!binding) throw new Error("The shared project has not loaded.");
    return binding.getSnapshot();
  }, [binding]);
  if (!host.collaboration) return { ...local, readOnly, binding: null };
  const failure = bindingError ?? collab.seedError;
  const initialized =
    binding?.doc.getMap("namenym:meta").get("layoutVersion") === 1;
  return {
    project,
    get,
    apply,
    readOnly,
    binding,
    loading: !initialized && !failure,
    ready: !!initialized && !failure,
    loadRevision: 0,
    error: failure ? String(failure) : "",
    external: null,
    conflict: false,
    load: (_content: string) => {},
    keepLocal: () => {},
    dismissError: () => {},
  };
}
