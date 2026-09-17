import { useEffect, useRef, useState } from "react";
import { TaskCoordinator } from "./coordinator";
import { domainQuery, freshDomainCheck, searchDomains } from "./domains";
import type { Mashup } from "./types";
import type { Action } from "./state";

const identity = (m: Mashup) =>
  JSON.stringify([m.id, m.label, m.revision ?? 0, m.inputRevision]);

export function useDomains(
  names: Mashup[],
  apply: (action: Action) => void,
  options: { automatic?: boolean; readOnly?: boolean } = {}
) {
  const allowed = useRef(!options.readOnly);
  allowed.current = !options.readOnly;
  const [, render] = useState(0);
  const current = useRef(names);
  current.current = names;
  const attempted = useRef(new Set<string>());
  const transports = useRef(new Set<AbortController>());
  const paused = useRef(false);
  const coordinator = useRef<TaskCoordinator>();
  if (!coordinator.current)
    coordinator.current = new TaskCoordinator(() => render((n) => n + 1));
  const q = coordinator.current;

  function enqueue(name: Mashup) {
    if (!allowed.current) return;
    const query = domainQuery(name.label);
    if (!query) return;
    const key = identity(name);
    attempted.current.add(key);
    q.enqueue({
      key,
      project: "domains",
      revision: key,
      type: "domains",
      valid: () =>
        allowed.current &&
        current.current.some((m) => identity(m) === key && !m.hidden),
      run: async () => {
        const controller = new AbortController();
        transports.current.add(controller);
        const timer = setTimeout(() => controller.abort(), 35_000);
        try {
          return await searchDomains(query, controller.signal);
        } catch (error) {
          if (controller.signal.aborted)
            throw new Error("Domain check timed out. Retry the check.");
          throw error;
        } finally {
          clearTimeout(timer);
          transports.current.delete(controller);
        }
      },
      apply: (check) =>
        apply({
          type: "DOMAIN_RESULT",
          id: name.id,
          label: name.label,
          revision: name.revision ?? 0,
          inputRevision: name.inputRevision,
          check,
        }),
    });
  }

  useEffect(() => {
    if (paused.current || options.automatic === false || options.readOnly)
      return;
    for (const name of names) {
      if (
        !name.hidden &&
        !freshDomainCheck(name) &&
        (!attempted.current.has(identity(name)) ||
          jobFor(name)?.status === "canceled")
      )
        enqueue(name);
    }
  }, [names, options.automatic, options.readOnly]);

  useEffect(() => {
    if (options.readOnly) stop();
  }, [options.readOnly]);

  useEffect(
    () => () => {
      q.dispose();
      for (const controller of transports.current) controller.abort();
    },
    [q]
  );

  function recheck(selected: Mashup[]) {
    paused.current = false;
    for (const name of selected) enqueue(name);
  }
  function stop() {
    paused.current = true;
    q.cancel();
    for (const controller of transports.current) controller.abort();
  }
  function jobFor(name: Mashup) {
    return [...q.jobs].reverse().find((job) => job.key === identity(name));
  }
  const pending = q.jobs.filter((job) =>
    ["queued", "running"].includes(job.status)
  ).length;
  return { recheck, stop, jobFor, pending, paused: paused.current };
}
