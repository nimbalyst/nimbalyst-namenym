import * as Y from "yjs";
import type { CollabCodec } from "@nimbalyst/extension-sdk";
import { parseProject } from "../persistence";
import { collaborativeProject } from "../preferences";
import { projectReducer, type Action } from "../state";
import {
  checkLayout,
  DOMAIN_RESULTS,
  ENTITIES,
  META,
  readProject,
  writeProject,
} from "./layout";
export { readProject } from "./layout";

const decode = (source: string | Uint8Array) =>
  typeof source === "string" ? source : new TextDecoder().decode(source);
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((key) => [key, v[key]])
        )
      : v
  );

// Identical initial files generate identical Yjs structs, including text. Merely
// giving entities stable IDs would still duplicate concurrent Y.Text seeds.
// Use the high 53-bit range, outside Yjs's random 32-bit live-client IDs.
function seedClientId(source: string): number {
  let a = 0xdeadbeef,
    b = 0x41c6ce57;
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 2654435761);
    b = Math.imul(b ^ source.charCodeAt(i), 1597334677);
  }
  a =
    Math.imul(a ^ (a >>> 16), 2246822507) ^
    Math.imul(b ^ (b >>> 13), 3266489909);
  b =
    Math.imul(b ^ (b >>> 16), 2246822507) ^
    Math.imul(a ^ (a >>> 13), 3266489909);
  return 0x100000000 * (1 + (b & 0xfffff)) + (a >>> 0);
}

const patchActions = new Set([
  "SET_NAME",
  "SET_BRIEF",
  "SET_SUMMARY",
  "SET_CONSTRAINTS",
  "SET_LANGUAGE",
  "TOGGLE_STYLE",
  "ADD_CONCEPTS",
  "ADD_SYNONYMS",
  "ADD_MASHUPS",
  "EDIT_ITEM",
  "SET_NOTES",
  "REMOVE_MASHUP",
  "VOTE_CONCEPT",
  "LIKE_CONCEPT",
  "DISMISS_SYNONYM",
  "VOTE_SYNONYM",
  "PREPARED",
  "ASSIGN_WORD",
]);

export const namenymCodec: CollabCodec = {
  documentType: "namenym",
  fileExtensions: [".namenym"],
  mimeType: "application/json",
  layoutVersion: 1,
  isEmpty(doc) {
    checkLayout(doc);
    return doc.getMap(META).get("layoutVersion") === undefined;
  },
  seedFromFile(doc, source) {
    checkLayout(doc);
    if (doc.getMap(META).get("layoutVersion") !== undefined) return;
    const project = JSON.parse(
      canonical(collaborativeProject(parseProject(decode(source))))
    );
    const seed = new Y.Doc();
    try {
      seed.clientID = seedClientId(canonical(project));
      seed.transact(() => writeProject(seed, null, project));
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
    } finally {
      seed.destroy();
    }
  },
  applyFromFile(doc, source) {
    checkLayout(doc);
    const project = collaborativeProject(parseProject(decode(source)));
    const before = readProject(doc);
    doc.transact(() => {
      // Replacement imports materialize the exported winner, not old query history.
      doc.getMap(DOMAIN_RESULTS).clear();
      for (const record of doc
        .getMap<Y.Map<unknown>>(ENTITIES.mashups)
        .values())
        record.delete("domainCheck");
      writeProject(
        doc,
        {
          ...before,
          mashups: before.mashups.map((name) => ({
            ...name,
            domainCheck: undefined,
          })),
        },
        project
      );
    });
  },
  exportToFile: (doc) => JSON.stringify(readProject(doc), null, 2),
  toPlainText(doc) {
    const p = readProject(doc);
    return [
      p.name,
      p.brief,
      p.summary,
      p.constraints,
      ...p.concepts.map((c) => c.label),
      ...p.synonyms.map((w) => w.label),
      ...p.mashups.map(
        (n) => `${n.label}${n.hidden ? " (archived)" : ""}\n${n.notes ?? ""}`
      ),
    ].join("\n\n");
  },
  toStructured: readProject,
  applyStructuredPatch(doc, patch) {
    checkLayout(doc);
    const actions = (patch as { actions?: unknown[] })?.actions;
    if (!Array.isArray(actions) || actions.length > 100)
      throw new Error("Expected a bounded actions list.");
    const before = readProject(doc);
    let next = before;
    for (const action of actions) {
      if (
        !action ||
        typeof action !== "object" ||
        !patchActions.has((action as Action).type)
      )
        throw new Error(
          "Unsupported shared operation. Favorites require the authenticated editor tool."
        );
      next = projectReducer(next, action as Action);
    }
    // Validate every operation's combined result before the first live write.
    next = parseProject(JSON.stringify(next));
    doc.transact(() => writeProject(doc, before, next));
  },
};
