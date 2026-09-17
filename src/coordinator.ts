import { generateId } from "./types";
export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "canceled";
export interface Job {
  id: string;
  key: string;
  project: string;
  revision: string;
  type: "names" | "words" | "summary" | "domains";
  themeIds: string[];
  status: JobStatus;
  error?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  model?: string;
  priority: number;
}
interface Work<T> {
  job: Job;
  run: () => Promise<T>;
  apply: (result: T) => void;
  valid: () => boolean;
  cache: boolean;
}
export interface Metric {
  id: string;
  type: string;
  project: string;
  model?: string;
  queueMs: number;
  durationMs: number;
  status: JobStatus;
}
/** Canceled transports retain their slot until settled: Stop cannot exceed the cap. */
export class TaskCoordinator {
  jobs: Job[] = [];
  metrics: Metric[] = [];
  private active = 0;
  private queue: Work<any>[] = [];
  private work = new Map<string, Work<any>>();
  private cache = new Map<string, unknown>();
  constructor(private changed: () => void) {}
  enqueue<T>(options: {
    key: string;
    project: string;
    revision: string;
    type: Job["type"];
    themeIds?: string[];
    priority?: number;
    run: () => Promise<T>;
    apply: (result: T) => void;
    valid: () => boolean;
    cache?: boolean;
  }): string {
    const duplicate = this.jobs.find(
      (j) => j.key === options.key && ["queued", "running"].includes(j.status),
    );
    if (duplicate) return duplicate.id;
    const job: Job = {
      ...options,
      id: generateId("job"),
      themeIds: options.themeIds ?? [],
      status: "queued",
      queuedAt: Date.now(),
      priority: options.priority ?? 0,
    };
    const work: Work<T> = {
      job,
      run: options.run,
      apply: options.apply,
      valid: options.valid,
      cache: !!options.cache,
    };
    this.jobs.push(job);
    this.work.set(job.id, work);
    this.queue.push(work);
    this.changed();
    this.pump();
    return job.id;
  }
  retry(id: string) {
    const work = this.work.get(id);
    if (!work || work.job.status !== "failed") return;
    if (!work.valid()) {
      work.job.status = "canceled";
      work.job.error = "Inputs changed; start a new request.";
      this.changed();
      return;
    }
    work.job.status = "queued";
    work.job.error = undefined;
    work.job.queuedAt = Date.now();
    this.queue.push(work);
    this.changed();
    this.pump();
  }
  dismiss(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (job?.status === "failed") {
      job.status = "canceled";
      this.changed();
    }
  }
  cancel() {
    for (const j of this.jobs)
      if (["queued", "running", "failed"].includes(j.status))
        j.status = "canceled";
    this.queue = [];
    this.changed();
  }
  dispose() {
    this.cancel();
    this.changed = () => {};
    this.cache.clear();
  }
  private pump() {
    this.queue.sort((a, b) => b.job.priority - a.job.priority);
    while (this.active < 2 && this.queue.length) {
      const w = this.queue.shift()!;
      if (!w.valid()) {
        w.job.status = "canceled";
        this.changed();
        continue;
      }
      this.active++;
      w.job.status = "running";
      w.job.startedAt = Date.now();
      this.changed();
      void this.execute(w);
    }
  }
  private async execute(w: Work<any>) {
    try {
      const result =
        w.cache && this.cache.has(w.job.key)
          ? this.cache.get(w.job.key)
          : await w.run();
      if (w.job.status !== "canceled" && w.valid()) {
        w.apply(result);
        w.job.model = result?.model;
        w.job.status = "completed";
        if (w.cache) {
          this.cache.set(w.job.key, result);
          if (this.cache.size > 100)
            this.cache.delete(this.cache.keys().next().value!);
        }
      } else w.job.status = "canceled";
    } catch (error) {
      if (w.job.status !== "canceled") {
        w.job.status = "failed";
        w.job.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      w.job.finishedAt = Date.now();
      this.active--;
      const metric = {
        id: w.job.id,
        type: w.job.type,
        project: w.job.project,
        model: w.job.model,
        queueMs: w.job.startedAt! - w.job.queuedAt,
        durationMs: w.job.finishedAt - w.job.startedAt!,
        status: w.job.status,
      };
      this.metrics.push(metric);
      if (this.metrics.length > 200) this.metrics.shift();
      console.info("[Namenym timing]", JSON.stringify(metric));
      this.changed();
      this.pump();
    }
  }
}
