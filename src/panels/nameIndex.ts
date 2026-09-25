import { normalize, type Favorite, type NamenymProject } from "../types";

export interface NameIndex {
  duplicates: Set<string>;
  shortlisted: Set<string>;
  supporters: (id: string) => Favorite[];
}

const none: Favorite[] = [];

// One pass over the project per render; per-tile scans made a 500-name list
// cost ~650ms to render.
export function indexNames(p: NamenymProject, scope?: string): NameIndex {
  const byLabel = new Map<string, string[]>();
  for (const m of p.mashups) {
    const key = normalize(m.label);
    const ids = byLabel.get(key);
    if (ids) ids.push(m.id);
    else byLabel.set(key, [m.id]);
  }
  const duplicates = new Set<string>();
  for (const ids of byLabel.values())
    if (ids.length > 1) for (const id of ids) duplicates.add(id);
  const supporters = new Map<string, Favorite[]>();
  for (const f of p.favorites ?? []) {
    if (scope && f.scope !== scope) continue;
    const list = supporters.get(f.nameId);
    if (list) list.push(f);
    else supporters.set(f.nameId, [f]);
  }
  return {
    duplicates,
    shortlisted: new Set(p.shortlisted),
    supporters: (id) => supporters.get(id) ?? none,
  };
}
