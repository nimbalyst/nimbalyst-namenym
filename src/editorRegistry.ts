import type { NamenymProject } from "./types";
import type { Action } from "./state";
export interface ProjectSession {
  get: () => NamenymProject;
  apply: (action: Action) => void;
  collaborative?: boolean;
  flush?: () => Promise<void>;
}
const sessions = new Map<string, ProjectSession>();
export function registerProject(path: string, session: ProjectSession) {
  sessions.set(path, session);
  return () => {
    if (sessions.get(path) === session) sessions.delete(path);
  };
}
export const getOpenProject = (path: string) => sessions.get(path);
