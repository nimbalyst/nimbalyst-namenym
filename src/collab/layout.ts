import * as Y from "yjs";
import { replaceYText } from "@nimbalyst/extension-sdk/collab";
import {
  createEmptyProject,
  type NamenymProject,
  type Favorite,
  type DomainCheck,
} from "../types";
import { collaborativeProject, favoriteKey } from "../preferences";

export const META = "namenym:meta";
export const ENTITIES = {
  concepts: "namenym:themes",
  synonyms: "namenym:words",
  mashups: "namenym:names",
} as const;
export const DOMAIN_RESULTS = "namenym:domainResults";
export interface SharedDomainResult {
  nameId: string;
  label: string;
  inputRevision?: string;
  revision: number;
  check: DomainCheck;
}
export const FAVORITES = "namenym:favorites";
export const TEXT_FIELDS = new Set([
  "brief",
  "summary",
  "constraints",
  "notes",
]);
const OMIT = new Set([
  "concepts",
  "synonyms",
  "mashups",
  "unassignedWords",
  "favorites",
  "shortlisted",
  "selectedStyles",
  "selectedTlds",
  "appliedRequests",
]);
export const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function checkLayout(doc: Y.Doc): void {
  const version = doc.getMap(META).get("layoutVersion");
  if (version !== undefined && version !== 1)
    throw new Error(
      "Unsupported Namenym collaboration layout. Update the editor before editing."
    );
}

export function setField(
  map: Y.Map<unknown>,
  key: string,
  value: unknown
): void {
  if (TEXT_FIELDS.has(key)) {
    let text = map.get(key) as Y.Text | undefined;
    if (!(text instanceof Y.Text)) {
      text = new Y.Text();
      map.set(key, text);
    }
    replaceYText(text, typeof value === "string" ? value : "");
  } else if (value === undefined) map.delete(key);
  else if (!equal(map.get(key), value)) map.set(key, value);
}

function patchRecord(
  map: Y.Map<unknown>,
  before: Record<string, unknown>,
  next: Record<string, unknown>
) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (!equal(before[key], next[key])) setField(map, key, next[key]);
  }
}

function patchSet(doc: Y.Doc, field: string, before: string[], next: string[]) {
  const map = doc.getMap<boolean>(`namenym:${field}`);
  for (const key of before) if (!next.includes(key)) map.delete(key);
  for (const key of next) if (!before.includes(key)) map.set(key, true);
}

export function writeProject(
  doc: Y.Doc,
  before: NamenymProject | null,
  next: NamenymProject
): void {
  const meta = doc.getMap(META);
  meta.set("layoutVersion", 1);
  const oldMeta = Object.fromEntries(
    Object.entries(before ?? {}).filter(([key]) => !OMIT.has(key))
  );
  const nextMeta = Object.fromEntries(
    Object.entries(next).filter(
      ([key]) => !OMIT.has(key) && key !== "layoutVersion"
    )
  );
  patchRecord(meta, oldMeta, nextMeta);
  for (const field of [
    "selectedStyles",
    "selectedTlds",
    "appliedRequests",
  ] as const)
    patchSet(doc, field, before?.[field] ?? [], next[field] ?? []);
  for (const kind of Object.keys(ENTITIES) as Array<keyof typeof ENTITIES>) {
    const map = doc.getMap<Y.Map<unknown>>(ENTITIES[kind]);
    const oldItems =
      kind === "synonyms"
        ? [...(before?.synonyms ?? []), ...(before?.unassignedWords ?? [])]
        : before?.[kind] ?? [];
    const nextItems =
      kind === "synonyms"
        ? [...next.synonyms, ...next.unassignedWords]
        : next[kind];
    const oldById = new Map(oldItems.map((item) => [item.id, item]));
    const nextIds = new Set(nextItems.map((item) => item.id));
    for (const id of oldById.keys()) if (!nextIds.has(id)) map.delete(id);
    const ordering = doc.getMap<number>(`${ENTITIES[kind]}:order`);
    let order = Math.max(-1, ...ordering.values()) + 1;
    for (const item of nextItems) {
      let record = map.get(item.id);
      if (!record) {
        record = new Y.Map();
        map.set(item.id, record);
        if (!ordering.has(item.id)) ordering.set(item.id, order++);
      }
      patchRecord(
        record,
        (oldById.get(item.id) ?? {}) as unknown as Record<string, unknown>,
        item as unknown as Record<string, unknown>
      );
    }
  }
  const favorites = doc.getMap(FAVORITES);
  const oldFavorites = new Map(
    (before?.favorites ?? []).map((f) => [favoriteKey(f), f])
  );
  const nextFavorites = new Map(
    (next.favorites ?? []).map((f) => [favoriteKey(f), f])
  );
  for (const key of oldFavorites.keys())
    if (!nextFavorites.has(key)) favorites.delete(key);
  for (const [key, favorite] of nextFavorites)
    if (!equal(oldFavorites.get(key), favorite)) favorites.set(key, favorite);
}

function records(doc: Y.Doc, name: string) {
  const ordering = doc.getMap<number>(`${name}:order`);
  return [...doc.getMap<Y.Map<unknown>>(name).entries()]
    .sort(
      ([a], [b]) =>
        (ordering.get(a) ?? 0) - (ordering.get(b) ?? 0) || a.localeCompare(b)
    )
    .map(([, map]) => map.toJSON());
}

export function readProject(doc: Y.Doc): NamenymProject {
  checkLayout(doc);
  const { layoutVersion, ...meta } = doc.getMap(META).toJSON();
  const p = {
    ...collaborativeProject(createEmptyProject()),
    ...meta,
    concepts: records(doc, ENTITIES.concepts),
    synonyms: records(doc, ENTITIES.synonyms),
    mashups: records(doc, ENTITIES.mashups),
    selectedStyles: [
      ...doc.getMap<boolean>("namenym:selectedStyles").keys(),
    ].sort(),
    selectedTlds: [
      ...doc.getMap<boolean>("namenym:selectedTlds").keys(),
    ].sort(),
    favorites: [...doc.getMap<Favorite>(FAVORITES).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value),
    appliedRequests: [
      ...doc.getMap<boolean>("namenym:appliedRequests").keys(),
    ].sort(),
    shortlisted: [],
    unassignedWords: [],
  } as unknown as NamenymProject;
  const checks = [...doc.getMap<SharedDomainResult>(DOMAIN_RESULTS).values()];
  p.mashups = p.mashups.map((name) => {
    const candidates = checks
      .filter(
        (result) =>
          result.nameId === name.id &&
          result.label === name.label &&
          result.inputRevision === name.inputRevision &&
          result.revision === name.revision
      )
      .map((result) => result.check);
    if (name.domainCheck) candidates.push(name.domainCheck);
    candidates.sort(
      (a, b) =>
        Date.parse(b.checkedAt) - Date.parse(a.checkedAt) ||
        JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
    return candidates.length ? { ...name, domainCheck: candidates[0] } : name;
  });
  const themes = new Set(p.concepts.map((c) => c.id));
  p.unassignedWords = p.synonyms.filter((w) => !themes.has(w.conceptId));
  p.synonyms = p.synonyms.filter((w) => themes.has(w.conceptId));
  return p;
}

export function projectText(doc: Y.Doc, field: string): Y.Text {
  const kind = field.split(":", 1)[0];
  const id = field.slice(kind.length + 1);
  const map =
    kind === "notes"
      ? doc.getMap<Y.Map<unknown>>(ENTITIES.mashups).get(id)
      : doc.getMap(META);
  if (!map || !TEXT_FIELDS.has(kind))
    throw new Error("Unknown shared text field.");
  const value = map.get(kind);
  if (!(value instanceof Y.Text))
    throw new Error("Shared text has not been initialized.");
  return value;
}
