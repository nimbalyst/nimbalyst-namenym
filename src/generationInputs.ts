import type { NamenymProject } from "./types";
export const generationSignature = (p: NamenymProject): string =>
  JSON.stringify([
    p.brief,
    p.summary,
    p.language,
    p.constraints,
    p.selectedStyles,
    p.shortlisted,
    p.concepts.map((c) => [c.id, c.label, c.included]),
  ]);

export function summaryIsStale(p: NamenymProject): boolean {
  return (
    !!p.summary &&
    (p.summarySourceFingerprint !== undefined
      ? p.summarySourceFingerprint !== p.brief
      : p.summarySourceRevision !== p.briefRevision)
  );
}
/** New manual entries may coexist with a request; editing its inputs invalidates it. */
export function generationInputsCurrent(
  snapshot: NamenymProject,
  current: NamenymProject
): boolean {
  return (
    generationSignature(snapshot) === generationSignature(current) &&
    snapshot.synonyms.every((word) =>
      current.synonyms.some(
        (w) =>
          w.id === word.id &&
          w.label === word.label &&
          w.dismissed === word.dismissed
      )
    ) &&
    snapshot.mashups.every((name) =>
      current.mashups.some((n) => n.id === name.id && n.label === name.label)
    )
  );
}
