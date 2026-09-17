import { useCallback, useEffect, useState } from "react";
import type { EditorHost } from "@nimbalyst/extension-sdk";
import { safeMemberName } from "../preferences";

/** Selection and activity are ephemeral presence, never durable document data. */
export function usePresence(host: EditorHost, job: string) {
  const awareness = host.collaboration?.awareness;
  const [peers, setPeers] = useState<
    Array<{ id: string; name: string; selection: string | null; job: string }>
  >([]);
  useEffect(() => {
    if (!awareness) return;
    const changed = () =>
      setPeers(
        [...awareness.getStates().entries()]
          .filter(
            ([id, state]) =>
              id !== awareness.clientID && typeof state.user?.id === "string"
          )
          .map(([id, state]) => ({
            id: String(id),
            name: safeMemberName(String(state.user.name ?? "Member")),
            selection:
              typeof state.namenymSelection === "string"
                ? state.namenymSelection
                : null,
            job:
              typeof state.namenymJob === "string"
                ? state.namenymJob.slice(0, 160)
                : "",
          }))
      );
    changed();
    awareness.on("change", changed);
    return () => {
      awareness.off("change", changed);
      awareness.setLocalStateField("namenymSelection", null);
      awareness.setLocalStateField("namenymJob", null);
    };
  }, [awareness]);
  useEffect(() => {
    awareness?.setLocalStateField("namenymJob", job || null);
  }, [awareness, job]);
  const select = useCallback(
    (id: string | null) =>
      awareness?.setLocalStateField("namenymSelection", id),
    [awareness]
  );
  return { peers, select };
}
