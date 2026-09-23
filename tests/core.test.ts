import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEmptyProject } from "../src/types";
import { parseProject } from "../src/persistence";
import { projectReducer } from "../src/state";
import {
  namingContext,
  validateRound,
  validateWords,
  expandWords,
  generateRound,
  generateWords,
  MAX_INPUT_CHARS,
} from "../src/ai";
import { TaskCoordinator } from "../src/coordinator";
import { registerProject } from "../src/editorRegistry";
import { aiTools } from "../src/aiTools";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const seed = () =>
  projectReducer(createEmptyProject(), {
    type: "ADD_CONCEPTS",
    concepts: [
      { label: "Knowledge", source: "manual" },
      { label: "Portability", source: "manual" },
    ],
  });

test("legacy migration preserves names, notes, shortlist and metadata; redirects duplicate words and recovers orphans", () => {
  const raw = JSON.parse(readFileSync("samples/demo.namenym", "utf8"));
  raw.selectedStyles = ["global", "alternate", "dictionary"];
  raw.mashups[0].notes = "Keep this note";
  raw.mashups[0].sources = [{ type: "synonym", id: "duplicate" }];
  raw.synonyms.push({
    ...raw.synonyms[0],
    id: "duplicate",
    label: " SWIFTNESS ",
    source: "manual",
    dismissed: true,
  });
  raw.synonyms.push({ ...raw.synonyms[0], id: "orphan", conceptId: "missing" });
  const migrated = parseProject(JSON.stringify(raw));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.mashups.length, 3);
  assert.equal(migrated.mashups[0].notes, "Keep this note");
  assert.deepEqual(migrated.shortlisted, ["m1"]);
  assert.deepEqual(migrated.selectedStyles, ["dictionary", "inventive"]);
  assert.equal(migrated.mashups[0].sources[0].id, "s1");
  assert.equal(migrated.synonyms[0].dismissed, true);
  assert.equal(migrated.unassignedWords.length, 1);
  assert.equal(migrated.migrationArchive.length, 1);
  assert.deepEqual(parseProject(JSON.stringify(migrated)), migrated);
  assert.equal(raw.synonyms.length, 6);
});
test("invalid, unknown-version and duplicate-identity files fail closed", () => {
  const duplicate = seed().concepts[0];
  for (const content of [
    "{",
    "{}",
    "null",
    '{"version":99}',
    JSON.stringify({ ...seed(), concepts: [duplicate, duplicate] }),
  ])
    assert.throws(() => parseProject(content));
});
test("all insertion paths normalize exact duplicates in and across batches, reject orphan words and name sources", () => {
  let p = seed();
  const id = p.concepts[0].id;
  p = projectReducer(p, {
    type: "ADD_CONCEPTS",
    concepts: [
      { label: " knowledge ", source: "manual" },
      { label: "Trust", source: "manual" },
      { label: "TRUST", source: "ai" },
    ],
  });
  assert.equal(p.concepts.length, 3);
  p = projectReducer(p, {
    type: "ADD_SYNONYMS",
    synonyms: [
      { label: "know how", conceptId: id, source: "manual" },
      { label: " Know   How ", conceptId: id, source: "ai" },
      { label: "ghost", conceptId: "nope", source: "ai" },
    ],
  });
  assert.equal(p.synonyms.length, 1);
  p = projectReducer(p, {
    type: "ADD_MASHUPS",
    mashups: [
      { label: "Open Book" },
      { label: " open   book " },
      { label: "Bookly", sources: [{ type: "concept", id: "nope" }] },
    ],
  });
  assert.equal(p.mashups.length, 1);
  assert.equal(p.mashups[0].label, "Open Book");
});
test("context uses every included word until one is liked, then only liked words; excludes dismissed synonyms and carries feedback and summary", () => {
  let p = seed();
  p = projectReducer(p, {
    type: "ADD_CONCEPTS",
    concepts: [{ label: "Trust", source: "manual" }],
  });
  p = projectReducer(p, {
    type: "ADD_SYNONYMS",
    synonyms: [
      { label: "wisdom", conceptId: p.concepts[0].id, source: "manual" },
    ],
  });
  p = projectReducer(p, { type: "DISMISS_SYNONYM", id: p.synonyms[0].id });
  p = projectReducer(p, { type: "VOTE_CONCEPT", id: p.concepts[1].id });
  p = projectReducer(p, {
    type: "ADD_MASHUPS",
    mashups: [{ label: "Liked" }, { label: "Hidden" }],
  });
  p = projectReducer(p, { type: "TOGGLE_SHORTLIST", id: p.mashups[0].id });
  p = projectReducer(p, { type: "REMOVE_MASHUP", id: p.mashups[1].id });
  p = projectReducer(p, {
    type: "SET_SUMMARY",
    summary: "Portable software knowledge",
    sourceRevision: p.briefRevision,
  });
  let context = namingContext(p);
  assert.equal(context.brief, "Portable software knowledge");
  assert.equal(context.vocabulary, "all");
  assert.deepEqual(
    context.words.map((w) => w.label),
    ["Knowledge", "Trust"],
  );
  assert.equal(context.words[0].synonyms.length, 0);
  assert.deepEqual(context.liked, ["Liked"]);
  assert.deepEqual(context.rejected, ["Hidden"]);
  p = projectReducer(p, { type: "LIKE_CONCEPT", id: p.concepts[2].id });
  context = namingContext(p);
  assert.equal(context.vocabulary, "liked");
  assert.deepEqual(
    context.words.map((w) => w.label),
    ["Trust"],
  );
  assert.throws(
    () =>
      namingContext(projectReducer(p, { type: "SET_BRIEF", brief: "Changed" })),
    /stale/,
  );
});
test("root word validation requires a summary for new projects and skips words that already exist", () => {
  const p = seed();
  assert.throws(() => validateWords({ words: ["Trust"] }, p, true), /summary/);
  assert.throws(() => validateWords({ summary: "s", words: [] }, p, true));
  const result = validateWords(
    { summary: "Portable knowledge", words: [" knowledge ", "Trust", "trust"] },
    p,
    true,
  );
  assert.equal(result.summary, "Portable knowledge");
  assert.deepEqual(
    result.words.map((w) => w.label),
    ["Trust"],
  );
});
test("generation response validation rejects malformed metadata and unknown source IDs, and records word and synonym sources", () => {
  let p = seed();
  p = projectReducer(p, {
    type: "ADD_SYNONYMS",
    synonyms: [
      { label: "wisdom", conceptId: p.concepts[0].id, source: "manual" },
    ],
  });
  assert.throws(() =>
    validateRound(
      {
        names: [
          {
            name: "Test",
            style: "inventive",
            rationale: "",
            sourceIds: ["missing"],
          },
        ],
      },
      p,
    ),
  );
  assert.throws(() => validateRound({ names: ["x"] }, p));
  const result = validateRound(
    {
      names: [
        {
          name: "Test",
          style: "inventive",
          rationale: "Relevant",
          sourceIds: [p.concepts[0].id, p.synonyms[0].id],
        },
        { name: " test ", style: "inventive", rationale: "", sourceIds: [] },
      ],
    },
    p,
  );
  assert.equal(result.names.length, 1);
  assert.deepEqual(result.names[0].sources, [
    { type: "concept", id: p.concepts[0].id },
    { type: "synonym", id: p.synonyms[0].id },
  ]);
});
test("root word prompt asks for single words, carries liked and excluded words, and asks for a summary only when missing", async () => {
  let p = seed();
  p.brief = "Portable software knowledge";
  p = projectReducer(p, { type: "LIKE_CONCEPT", id: p.concepts[0].id });
  p = projectReducer(p, { type: "VOTE_CONCEPT", id: p.concepts[1].id });
  let request: any;
  const ai: any = {
    listModels: async () => [{ id: "chosen-model" }],
    chatCompletion: async (options: any) => {
      request = options;
      return {
        model: "actual-model",
        content: JSON.stringify({
          summary: "Portable knowledge for teams",
          words: ["Knowledge", "Trust", "Relay"],
        }),
      };
    },
  };
  const result = await generateWords(ai, p);
  assert.match(request.systemPrompt, /one real dictionary word/);
  assert.match(request.systemPrompt, /Also return "summary"/);
  const input = JSON.parse(request.messages[0].content);
  assert.deepEqual(input.likedWords, ["Knowledge"]);
  assert.deepEqual(input.excludedWords, ["Portability"]);
  assert.equal(result.summary, "Portable knowledge for teams");
  assert.deepEqual(
    result.words.map((w) => w.label),
    ["Trust", "Relay"],
  );
  p = projectReducer(p, {
    type: "SET_SUMMARY",
    summary: "Existing summary",
    sourceRevision: p.briefRevision,
  });
  await generateWords(ai, p, true);
  assert.doesNotMatch(request.systemPrompt, /Also return "summary"/);
  assert.match(request.systemPrompt, /additional/);
});
test("synonym prompt asks for synonyms in the brief's sense and excludes all previously offered synonyms", async () => {
  let p = seed();
  p.brief = "Portable software knowledge";
  p = projectReducer(p, {
    type: "ADD_SYNONYMS",
    synonyms: [
      { label: "transfer", conceptId: p.concepts[1].id, source: "manual" },
    ],
  });
  p = projectReducer(p, { type: "DISMISS_SYNONYM", id: p.synonyms[0].id });
  let request: any;
  const ai: any = {
    listModels: async () => [{ id: "chosen-model" }],
    chatCompletion: async (options: any) => {
      request = options;
      return {
        model: "actual-model",
        content: JSON.stringify({
          groups: [
            {
              wordId: p.concepts[1].id,
              synonyms: ["transfer", "mobility", "mobility"],
            },
          ],
        }),
      };
    },
  };
  const result = await expandWords(ai, p, [p.concepts[1].id]);
  assert.match(request.systemPrompt, /synonyms and near-synonyms/);
  assert.doesNotMatch(request.systemPrompt, /associations are welcome/);
  assert.match(request.messages[0].content, /Portable software knowledge/);
  assert.match(request.messages[0].content, /transfer/);
  assert.deepEqual(
    result.words.map((w) => w.label),
    ["mobility"],
  );
  assert.equal(result.model, "actual-model");
});
test("name prompt states whether liked words guide the round", async () => {
  let p = seed();
  p.brief = "Portable software knowledge";
  let request: any;
  const ai: any = {
    listModels: async () => [{ id: "chosen-model" }],
    chatCompletion: async (options: any) => {
      request = options;
      return {
        model: "actual-model",
        content: JSON.stringify({
          names: [
            {
              name: "Relay",
              style: "dictionary",
              rationale: "Knowledge that travels",
              sourceIds: [p.concepts[0].id],
            },
          ],
        }),
      };
    },
  };
  await generateRound(ai, p, "");
  assert.match(request.systemPrompt, /No word has been liked yet/);
  p = projectReducer(p, { type: "LIKE_CONCEPT", id: p.concepts[0].id });
  const result = await generateRound(ai, p, "Shorter");
  assert.match(request.systemPrompt, /words the user liked/);
  assert.equal(JSON.parse(request.messages[0].content).direction, "Shorter");
  assert.equal(result.names[0].sources[0].id, p.concepts[0].id);
});
test("oversized input is rejected before calling a provider; model is explicitly resolved before generation", async () => {
  const p = seed();
  p.brief = "x".repeat(MAX_INPUT_CHARS);
  let calls = 0;
  const ai: any = {
    listModels: async () => {
      calls++;
      return [];
    },
    chatCompletion: async () => {
      calls++;
    },
  };
  await assert.rejects(generateRound(ai, p, ""), /input budget/);
  await assert.rejects(generateWords(ai, p), /input budget/);
  assert.equal(calls, 0);
});
test("coordinator caps active requests at two, dedupes jobs, drops queued and late results on Stop", async () => {
  const q = new TaskCoordinator(() => {});
  const pending: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  let applied = 0;
  const enqueue = (key: string) =>
    q.enqueue({
      key,
      project: "a",
      revision: "1",
      type: "names",
      valid: () => true,
      run: () =>
        new Promise((resolve) => {
          active++;
          peak = Math.max(peak, active);
          pending.push(() => {
            active--;
            resolve({ model: "mock" });
          });
        }),
      apply: () => {
        applied++;
      },
    });
  enqueue("a");
  enqueue("a");
  enqueue("b");
  enqueue("c");
  assert.equal(q.jobs.length, 3);
  assert.equal(active, 2);
  q.cancel();
  enqueue("d");
  assert.equal(active, 2);
  pending.shift()!();
  await tick();
  assert.equal(active, 2);
  pending.shift()!();
  await tick();
  pending.shift()!();
  await tick();
  assert.equal(applied, 1);
  assert.equal(peak, 2);
  assert.equal(q.jobs.find((j) => j.key === "c")?.status, "canceled");
});
test("stale inputs and failures never apply or retry automatically, explicit retry can recover", async () => {
  const q = new TaskCoordinator(() => {});
  let valid = true,
    resolve: any,
    applied = 0,
    calls = 0;
  q.enqueue({
    key: "stale",
    project: "a",
    revision: "1",
    type: "words",
    valid: () => valid,
    run: () => new Promise((r) => (resolve = r)),
    apply: () => applied++,
  });
  valid = false;
  resolve({});
  await tick();
  assert.equal(applied, 0);
  const id = q.enqueue({
    key: "fail",
    project: "a",
    revision: "1",
    type: "words",
    valid: () => true,
    run: async () => {
      if (++calls === 1) throw new Error("offline");
      return {};
    },
    apply: () => applied++,
  });
  await tick();
  assert.equal(calls, 1);
  assert.equal(q.jobs.at(-1)?.status, "failed");
  q.retry(id);
  await tick();
  assert.equal(applied, 1);
  assert.equal(calls, 2);
});
test("tool mutation reads unsaved editor state and never writes over it; closed-file writes serialize", async () => {
  let p = seed();
  p.name = "Unsaved title";
  const path = "/test.namenym";
  let disk = JSON.stringify(createEmptyProject()),
    writes = 0;
  const context: any = {
    activeFilePath: path,
    extensionContext: {
      services: {
        filesystem: {
          readFile: async () => disk,
          writeFile: async (_p: string, value: string) => {
            writes++;
            disk = value;
          },
        },
      },
    },
  };
  const remove = registerProject(path, {
    get: () => p,
    apply: (a) => {
      p = projectReducer(p, a);
    },
  });
  const tool = aiTools.find((t) => t.name === "namenym.add_names")!;
  const result = await tool.handler(
    { names: ["Hand Made", " hand   made "] },
    context,
  );
  assert.equal(result.success, true);
  assert.equal(p.name, "Unsaved title");
  assert.equal(p.mashups.length, 1);
  assert.equal(writes, 0);
  remove();
  await Promise.all([
    tool.handler({ names: ["First"] }, context),
    tool.handler({ names: ["Second"] }, context),
  ]);
  assert.equal(parseProject(disk).mashups.length, 2);
  assert.equal(writes, 2);
});

test("editing request inputs invalidates completion but adding names and reviewing shortlist do not", async () => {
  const { generationInputsCurrent } = await import("../src/generationInputs");
  let p = seed();
  p = projectReducer(p, {
    type: "ADD_SYNONYMS",
    synonyms: [
      { label: "wisdom", conceptId: p.concepts[0].id, source: "manual" },
    ],
  });
  assert.equal(
    generationInputsCurrent(
      p,
      projectReducer(p, {
        type: "EDIT_ITEM",
        kind: "synonyms",
        id: p.synonyms[0].id,
        label: "learning",
      }),
    ),
    false,
  );
  assert.equal(
    generationInputsCurrent(
      p,
      projectReducer(p, {
        type: "ADD_MASHUPS",
        mashups: [{ label: "Manual Name" }],
      }),
    ),
    true,
  );
});
test("removal undo restores name source references, and assigning an orphan preserves its identity and exclusion", () => {
  let p = seed();
  p = projectReducer(p, {
    type: "ADD_MASHUPS",
    mashups: [
      {
        label: "Reference",
        sources: [{ type: "concept", id: p.concepts[0].id }],
      },
    ],
  });
  const theme = p.concepts[0];
  const nameSources = p.mashups.map((m) => ({ id: m.id, sources: m.sources }));
  let removed = projectReducer(p, { type: "REMOVE_CONCEPT", id: theme.id });
  removed = projectReducer(removed, {
    type: "RESTORE_THEME",
    theme,
    words: [],
    nameSources,
  });
  assert.deepEqual(removed.mashups[0].sources, p.mashups[0].sources);
  p.unassignedWords = [
    {
      id: "orphan",
      label: "understanding",
      conceptId: "missing",
      votes: 0,
      source: "manual",
      dismissed: true,
    },
  ];
  p = projectReducer(p, {
    type: "ASSIGN_WORD",
    id: "orphan",
    conceptId: theme.id,
  });
  assert.equal(p.synonyms[0].id, "orphan");
  assert.equal(p.synonyms[0].dismissed, true);
});

import {
  domainQuery,
  parseDomainResponse,
  currentDomainCheck,
  freshDomainCheck,
  hasAvailableCom,
  searchDomains,
} from "../src/domains";

test("domain checks normalize joined names, validate labels, match exact TLDs, and sanitize provider links", () => {
  assert.equal(domainQuery(" Open Book.COM "), "openbook");
  assert.equal(domainQuery("x"), "x");
  for (const label of [
    "café",
    "a/b",
    "https://foo.com",
    "a_b",
    "-name",
    "name-",
    "x".repeat(64),
  ])
    assert.equal(domainQuery(label), null);
  assert.deepEqual(
    parseDomainResponse(
      {
        domains: [
          {
            domain: "OPENBOOK.com",
            available: true,
            registerURL: "javascript:alert(1)",
          },
          { domain: "openbook.ai", available: true },
          { domain: "openbook.net", available: false },
          { domain: "openbooks.com", available: true },
        ],
      },
      "openbook",
    ),
    [
      {
        domain: "openbook.com",
        tld: "com",
        registerURL: "https://domainr.com/openbook.com",
      },
      {
        domain: "openbook.ai",
        tld: "ai",
        registerURL: "https://domainr.com/openbook.ai",
      },
    ],
  );
  for (const data of [
    {},
    { domains: null },
    { domains: [null] },
    { domains: [{ domain: "openbook.com" }] },
  ])
    assert.throws(() => parseDomainResponse(data, "openbook"));
});

test("checked domains round-trip with a timestamp; legacy, expired, and renamed results are not reused", () => {
  let p = projectReducer(createEmptyProject(), {
    type: "ADD_MASHUPS",
    mashups: [{ label: "Open Book" }],
  });
  const name = p.mashups[0];
  assert.equal(
    currentDomainCheck({ ...name, domainStatus: "available" }),
    undefined,
  );
  const action = {
    type: "DOMAIN_RESULT" as const,
    id: name.id,
    label: name.label,
    revision: 0,
    check: {
      query: "openbook",
      checkedAt: new Date().toISOString(),
      availableDomains: [
        {
          domain: "openbook.com",
          tld: "com",
          registerURL: "https://domainr.com/openbook.com",
        },
      ],
    },
  };
  p = projectReducer(p, action);
  assert.equal(hasAvailableCom(p.mashups[0]), true);
  assert.equal(freshDomainCheck(p.mashups[0]), true);
  assert.equal(freshDomainCheck(p.mashups[0], Date.now() + 16 * 60_000), false);
  assert.deepEqual(
    parseProject(JSON.stringify(p)).mashups[0].domainCheck,
    action.check,
  );
  assert.equal(
    hasAvailableCom({
      ...p.mashups[0],
      domainCheck: {
        ...action.check,
        availableDomains: [
          { domain: "openbook.ai", tld: "ai", registerURL: "" },
        ],
      },
    }),
    false,
  );
  p = projectReducer(p, {
    type: "EDIT_ITEM",
    kind: "mashups",
    id: name.id,
    label: "New Name",
  });
  assert.equal(p.mashups[0].domainCheck, undefined);
  assert.deepEqual(p.mashups[0].availableDomains, []);
  p = projectReducer(p, {
    type: "EDIT_ITEM",
    kind: "mashups",
    id: name.id,
    label: "Open Book",
  });
  assert.equal(
    projectReducer(p, action),
    p,
    "late result from before rename cannot attach to a renamed-back candidate",
  );
  assert.throws(() =>
    parseProject(
      JSON.stringify({
        ...p,
        mashups: [
          {
            ...p.mashups[0],
            domainCheck: {
              query: "openbook",
              checkedAt: "bad date",
              availableDomains: [],
            },
          },
        ],
      }),
    ),
  );
});

test("domain transport uses the existing API, omits credentials, and exposes actionable failures", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.namenym.com/domains/search");
      assert.equal(options?.credentials, "omit");
      assert.deepEqual(JSON.parse(options?.body as string), { name: "x.com" });
      return new Response(JSON.stringify({ domains: [] }));
    };
    assert.deepEqual((await searchDomains("x")).availableDomains, []);
    globalThis.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(searchDomains("name"), /rate limit/);
    globalThis.fetch = async () => new Response("", { status: 500 });
    await assert.rejects(searchDomains("name"), /HTTP 500/);
    globalThis.fetch = async () => {
      throw new Error("Network failure");
    };
    await assert.rejects(searchDomains("name"), /connection/);
  } finally {
    globalThis.fetch = original;
  }
});
