import type { Favorite, NamenymProject } from "./types";

export interface PreferenceActor {
  scope: string;
  id: string;
  name: string;
}

// The two hosts use different display paths for the same document. Document
// identity is available on both; organization identity is not in EditorHost.
export function preferenceScope(path: string): string {
  const desktop = /^collab:\/\/org:.+:doc:([^/?#]+)/.exec(path);
  const browser = /^collab:\/\/([^/?#]+)/.exec(path);
  if (desktop) return `document:${desktop[1]}`;
  if (browser) return `document:${browser[1]}`;
  return "local";
}

export const favoriteKey = (
  favorite: Pick<Favorite, "scope" | "memberId" | "nameId">
) => JSON.stringify([favorite.scope, favorite.memberId, favorite.nameId]);

export function favoriteMembers(
  project: NamenymProject,
  nameId: string,
  scope?: string
): Favorite[] {
  return (project.favorites ?? []).filter(
    (f) => f.nameId === nameId && (!scope || f.scope === scope)
  );
}

export function forActor(
  project: NamenymProject,
  actor: PreferenceActor
): NamenymProject {
  return {
    ...project,
    shortlisted: (project.favorites ?? [])
      .filter((f) => f.scope === actor.scope && f.memberId === actor.id)
      .map((f) => f.nameId),
  };
}

export function collaborativeProject(project: NamenymProject): NamenymProject {
  return {
    ...project,
    version: 3,
    favorites: project.favorites ?? [],
    importedShortlist: [
      ...new Set([
        ...(project.importedShortlist ?? []),
        ...project.shortlisted,
      ]),
    ],
    shortlisted: [],
    ...(project.summary &&
    project.summarySourceFingerprint === undefined &&
    project.summarySourceRevision === project.briefRevision
      ? { summarySourceFingerprint: project.brief }
      : {}),
  };
}

export function safeMemberName(name: string): string {
  return name.includes("@") ? "Member" : name.slice(0, 100) || "Member";
}
