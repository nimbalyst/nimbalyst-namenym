import test from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createEmptyProject } from "../src/types";
import { projectReducer } from "../src/state";
import { parseProject } from "../src/persistence";
import { namenymCodec, readProject } from "../src/collab/codec";
import { NamenymBinding } from "../src/collab/binding";
import { aiTools } from "../src/aiTools";
import { preferenceScope } from "../src/preferences";

const alice = { scope: "document:one", id: "alice", name: "Alice" };
const bob = { ...alice, id: "bob", name: "Bob" };
function source() {
  let p = projectReducer(createEmptyProject(), {
    type: "ADD_CONCEPTS",
    concepts: [{ label: "Trust", source: "manual" }],
  });
  p = projectReducer(p, {
    type: "ADD_MASHUPS",
    mashups: [{ label: "Gatherly" }],
  });
  p.brief = "Hello";
  p.shortlisted = [p.mashups[0].id];
  return p;
}
function pair() {
  const p = source(),
    a = new Y.Doc(),
    b = new Y.Doc();
  namenymCodec.seedFromFile(a, JSON.stringify(p));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const ba = new NamenymBinding(a, alice),
    bb = new NamenymBinding(b, bob);
  return {
    p,
    a,
    b,
    ba,
    bb,
    close() {
      ba.destroy();
      bb.destroy();
      a.destroy();
      b.destroy();
    },
  };
}
function merge(a: Y.Doc, b: Y.Doc) {
  const ua = Y.encodeStateAsUpdate(a),
    ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
}

test("codec migrates legacy shortlist without invented attribution, round-trips metadata and refuses invalid replacement", () => {
  const p = { ...source(), extensionMetadata: { keep: true } };
  const doc = new Y.Doc();
  namenymCodec.seedFromFile(doc, JSON.stringify(p));
  const exported = parseProject(namenymCodec.exportToFile(doc) as string);
  assert.equal(exported.version, 3);
  assert.deepEqual(exported.importedShortlist, p.shortlisted);
  assert.deepEqual(exported.favorites, []);
  assert.deepEqual((exported as any).extensionMetadata, { keep: true });
  const before = namenymCodec.exportToFile(doc);
  namenymCodec.applyFromFile(doc, before);
  assert.equal(namenymCodec.exportToFile(doc), before);
  assert.throws(() => namenymCodec.applyFromFile(doc, '{"version":999}'));
  assert.equal(namenymCodec.exportToFile(doc), before);
  doc.destroy();
});

test("two independent seeds of the same file converge without duplicate text or entities", () => {
  const a = new Y.Doc(),
    b = new Y.Doc(),
    text = JSON.stringify(source());
  namenymCodec.seedFromFile(a, text);
  namenymCodec.seedFromFile(b, text);
  merge(a, b);
  assert.equal(readProject(a).brief, "Hello");
  assert.equal(readProject(a).mashups.length, 1);
  assert.deepEqual(readProject(a), readProject(b));
  a.destroy();
  b.destroy();
});

test("concurrent favorites and note edits survive, removing one preference never removes a teammate's", () => {
  const f = pair(),
    id = f.p.mashups[0].id;
  f.ba.apply({ type: "SET_NOTES", id, notes: "Keep this idea" });
  f.ba.setFavorite(id, true);
  f.bb.setFavorite(id, true);
  merge(f.a, f.b);
  assert.equal(readProject(f.a).mashups[0].notes, "Keep this idea");
  assert.equal(readProject(f.a).favorites?.length, 2);
  f.ba.setFavorite(id, false);
  merge(f.a, f.b);
  assert.deepEqual(
    readProject(f.a).favorites?.map((x) => x.memberId),
    ["bob"]
  );
  assert.deepEqual(f.ba.getSnapshot().shortlisted, []);
  assert.deepEqual(f.bb.getSnapshot().shortlisted, [id]);
  assert.deepEqual(readProject(f.a), readProject(f.b));
  f.close();
});

test("concurrent text insertion and local undo preserve the remote insertion", () => {
  const f = pair();
  f.ba.editText("brief", 5, 5, " Alice");
  f.bb.editText("brief", 0, 0, "Bob ");
  merge(f.a, f.b);
  assert.equal(readProject(f.a).brief, "Bob Hello Alice");
  f.ba.undo();
  merge(f.a, f.b);
  assert.equal(readProject(f.a).brief, "Bob Hello");
  f.close();
});

test("theme deletion does not lose concurrently added words; offline duplicate names retain identities", () => {
  const f = pair(),
    themeId = f.p.concepts[0].id;
  f.ba.apply({ type: "REMOVE_CONCEPT", id: themeId });
  f.bb.apply({
    type: "ADD_SYNONYMS",
    synonyms: [{ label: "Reliable", conceptId: themeId, source: "manual" }],
  });
  f.ba.apply({ type: "ADD_MASHUPS", mashups: [{ label: "Together" }] });
  f.bb.apply({ type: "ADD_MASHUPS", mashups: [{ label: "Together" }] });
  merge(f.a, f.b);
  assert.equal(readProject(f.a).unassignedWords[0].label, "Reliable");
  assert.equal(
    readProject(f.a).mashups.filter((n) => n.label === "Together").length,
    2
  );
  assert.deepEqual(readProject(f.a), readProject(f.b));
  f.close();
});

test("shared mutations honor live read-only state and imported favorites stay historical in another document", () => {
  const f = pair(),
    id = f.p.mashups[0].id;
  f.ba.setFavorite(id, true);
  const other = new NamenymBinding(f.a, { ...alice, scope: "document:other" });
  assert.deepEqual(other.getSnapshot().shortlisted, []);
  assert.equal(other.getSnapshot().favorites?.length, 1);
  f.ba.setReadOnly(true);
  assert.throws(() => f.ba.setFavorite(id, false), /read.only/i);
  assert.throws(
    () => f.ba.apply({ type: "SET_NOTES", id, notes: "not allowed" }),
    /read.only/i
  );
  assert.throws(
    () => f.ba.editText("brief", 0, 0, "not allowed"),
    /read.only/i
  );
  other.destroy();
  f.close();
  assert.equal(
    preferenceScope("collab://org:org-1:doc:one"),
    preferenceScope("collab://one/project.namenym")
  );
});

test("structured patch validates the whole batch before writing and cannot impersonate a favorite owner", () => {
  const f = pair(),
    before = namenymCodec.exportToFile(f.a);
  assert.throws(() =>
    namenymCodec.applyStructuredPatch!(f.a, {
      actions: [{ type: "SET_NAME", name: "bad" }, { type: "NOT_AN_ACTION" }],
    })
  );
  assert.equal(namenymCodec.exportToFile(f.a), before);
  assert.throws(() =>
    namenymCodec.applyStructuredPatch!(f.a, {
      actions: [{ type: "TOGGLE_SHORTLIST", id: f.p.mashups[0].id }],
      memberId: "bob",
    })
  );
  assert.equal(namenymCodec.exportToFile(f.a), before);
  f.close();
});

test("composition branch preserves peer insertions inside a locally replaced range", () => {
  const f = pair(),
    branch = new Y.Doc();
  Y.applyUpdate(branch, Y.encodeStateAsUpdate(f.a));
  const vector = Y.encodeStateVector(branch);
  const composing = new NamenymBinding(branch, alice);
  f.bb.editText("brief", 2, 2, " PEER ");
  merge(f.a, f.b);
  composing.editText("brief", 1, 4, "漢字");
  f.ba.applyTextUpdate(Y.encodeStateAsUpdate(branch, vector), "brief");
  merge(f.a, f.b);
  assert.ok(readProject(f.a).brief.includes(" PEER "));
  assert.ok(readProject(f.a).brief.includes("漢字"));
  f.ba.undo();
  merge(f.a, f.b);
  assert.equal(readProject(f.a).brief, "He PEER llo");
  composing.destroy();
  branch.destroy();
  f.close();
});

test("generation batches apply once, preserve concurrent additions and retain both request markers", () => {
  const f = pair();
  const batch = {
    type: "APPLY_GENERATION" as const,
    requestId: "request-a",
    actions: [
      { type: "ADD_MASHUPS" as const, mashups: [{ label: "AliceName" }] },
    ],
  };
  f.ba.apply(batch);
  f.bb.apply({
    type: "APPLY_GENERATION",
    requestId: "request-b",
    actions: [{ type: "ADD_MASHUPS", mashups: [{ label: "BobName" }] }],
  });
  merge(f.a, f.b);
  const count = readProject(f.a).mashups.length;
  f.ba.apply(batch);
  assert.equal(readProject(f.a).mashups.length, count);
  assert.deepEqual(readProject(f.a).appliedRequests, [
    "request-a",
    "request-b",
  ]);
  assert.ok(readProject(f.a).mashups.some((n) => n.label === "BobName"));
  f.close();
});

test("toast undo cannot accidentally undo an intervening local edit", () => {
  const f = pair();
  f.ba.apply({ type: "REMOVE_MASHUP", id: f.p.mashups[0].id });
  const undoArchive = f.ba.captureUndo();
  f.ba.editText("brief", 5, 5, " later");
  assert.equal(undoArchive.canUndo(), false);
  undoArchive.undo();
  assert.equal(readProject(f.a).brief, "Hello later");
  f.close();
});

test("offline domain results select the newest timestamp and cannot attach to a renamed candidate", () => {
  const f = pair(),
    name = f.ba.getSnapshot().mashups[0];
  const result = (checkedAt: string) => ({
    type: "DOMAIN_RESULT" as const,
    id: name.id,
    label: name.label,
    revision: name.revision,
    inputRevision: name.inputRevision,
    check: { query: "gatherly", checkedAt, availableDomains: [] },
  });
  f.ba.apply(result("2026-09-16T12:00:00Z"));
  f.bb.apply(result("2026-09-16T11:00:00Z"));
  merge(f.a, f.b);
  assert.equal(
    readProject(f.a).mashups[0].domainCheck?.checkedAt,
    "2026-09-16T12:00:00Z"
  );
  assert.equal(
    readProject(f.b).mashups[0].domainCheck?.checkedAt,
    "2026-09-16T12:00:00Z"
  );
  const exported = namenymCodec.exportToFile(f.a);
  namenymCodec.applyFromFile(f.a, exported);
  assert.equal(namenymCodec.exportToFile(f.a), exported);
  f.ba.apply({
    type: "EDIT_ITEM",
    kind: "mashups",
    id: name.id,
    label: "NewName",
  });
  f.ba.apply(result("2026-09-16T13:00:00Z"));
  assert.equal(readProject(f.a).mashups[0].domainCheck, undefined);
  f.close();
});

test("seed canonicalization tolerates JSON property order and preserves extension fields and colon IDs", () => {
  const p = source();
  p.mashups[0].id = "legacy:name";
  (p.mashups[0] as any)._order = "portable metadata";
  const reorder = (value: any): any =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, value]) => [key, reorder(value)])
        )
      : value;
  const a = new Y.Doc(),
    b = new Y.Doc();
  namenymCodec.seedFromFile(a, JSON.stringify(p));
  namenymCodec.seedFromFile(b, JSON.stringify(reorder(p)));
  merge(a, b);
  const binding = new NamenymBinding(a, alice);
  binding.editText("notes:legacy:name", 0, 0, "Preserved");
  assert.equal(readProject(a).mashups[0].notes, "Preserved");
  assert.equal((readProject(a).mashups[0] as any)._order, "portable metadata");
  merge(a, b);
  assert.deepEqual(readProject(a), readProject(b));
  assert.equal(readProject(a).brief, "Hello");
  binding.destroy();
  a.destroy();
  b.destroy();
});

test("shared tools use the authenticated binding and await acknowledgement without filesystem fallback", async () => {
  const f = pair();
  let diskCalls = 0,
    flushes = 0;
  const tool = aiTools.find((t) => t.name === "namenym.shortlist")!;
  const context: any = {
    activeFilePath: "collab://org:test:doc:one",
    extensionContext: {
      services: {
        filesystem: {
          readFile() {
            diskCalls++;
            throw new Error("disk read");
          },
          writeFile() {
            diskCalls++;
            throw new Error("disk write");
          },
        },
      },
    },
    editorAPI: {
      collaborative: true,
      get: f.ba.getSnapshot,
      apply: (action: any) => f.ba.apply(action),
      flush: async () => {
        flushes++;
        throw new Error("acknowledgement pending");
      },
    },
  };
  const result = await tool.handler(
    { names: ["Gatherly"], shortlisted: true, memberId: "bob" },
    context
  );
  assert.equal(result.success, false);
  assert.equal(flushes, 1);
  assert.equal(diskCalls, 0);
  assert.deepEqual(
    readProject(f.a).favorites?.map((f) => f.memberId),
    ["alice"]
  );
  context.editorAPI.flush = async () => {
    flushes++;
  };
  assert.equal(
    (await tool.handler({ names: ["Gatherly"], shortlisted: true }, context))
      .success,
    true
  );
  assert.equal(flushes, 2);
  delete context.editorAPI;
  assert.equal(
    (await tool.handler({ names: ["Gatherly"], shortlisted: false }, context))
      .success,
    false
  );
  assert.equal(diskCalls, 0);
  f.close();
});

test("an empty binding cannot publish a default document before the shared seed arrives", () => {
  const doc = new Y.Doc(),
    binding = new NamenymBinding(doc, alice);
  assert.throws(
    () => binding.apply({ type: "SET_NAME", name: "Premature" }),
    /not loaded/
  );
  assert.equal(namenymCodec.isEmpty(doc), true);
  namenymCodec.seedFromFile(doc, JSON.stringify(source()));
  binding.apply({ type: "SET_NAME", name: "Ready" });
  assert.equal(readProject(doc).name, "Ready");
  binding.destroy();
  doc.destroy();
});
