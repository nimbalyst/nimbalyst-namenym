import type { ExtensionAIService } from "@nimbalyst/extension-sdk";
import {
  ALL_STYLES,
  normalize,
  type Concept,
  type NamenymProject,
  type NamingStyle,
} from "./types";
import { validLabel, type NameInput } from "./state";
import { summaryIsStale } from "./generationInputs";
export type AIService = Pick<
  ExtensionAIService,
  "chatCompletion" | "listModels"
>;
export const PROMPT_VERSION = "naming-v3.0";
// The host does not expose context-window limits. This conservative input budget is
// explicit and checked on the complete request; content is never silently truncated.
export const MAX_INPUT_CHARS = 64000;
const includedWords = (p: NamenymProject) =>
  p.concepts.filter((c) => c.included !== false);
export const likedWords = (p: NamenymProject): Concept[] =>
  includedWords(p).filter((c) => c.votes > 0);
/** Liked words guide generation; until one is liked, every included word is a candidate. */
export function activeWords(p: NamenymProject) {
  const liked = likedWords(p);
  return { words: liked.length ? liked : includedWords(p), guided: liked.length > 0 };
}
function requireCurrentSummary(p: NamenymProject) {
  if (summaryIsStale(p))
    throw new Error(
      "The naming summary is stale. Refresh it or edit the summary to confirm the current source before generating."
    );
}
export function namingContext(p: NamenymProject) {
  requireCurrentSummary(p);
  const { words, guided } = activeWords(p);
  return {
    brief: p.summary || p.brief,
    language: p.language,
    constraints: p.constraints,
    styles: p.selectedStyles,
    vocabulary: guided ? ("liked" as const) : ("all" as const),
    words: words.map((c) => ({
      id: c.id,
      label: c.label,
      synonyms: p.synonyms
        .filter((w) => w.conceptId === c.id && !w.dismissed)
        .map((w) => ({
          id: w.id,
          label: w.label,
          ...(w.votes > 0 ? { preferred: true } : {}),
        })),
    })),
    liked: p.mashups
      .filter((m) => !m.hidden && p.shortlisted.includes(m.id))
      .map((m) => m.label),
    rejected: p.mashups.filter((m) => m.hidden).map((m) => m.label),
    existingNames: p.mashups.map((m) => m.label),
  };
}
export function parseJSONResponse(content: string): Record<string, unknown> {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Expected a JSON object from the provider.");
  return parsed;
}
async function request(ai: AIService, systemPrompt: string, input: unknown) {
  const content = JSON.stringify(input);
  if (content.length + systemPrompt.length > MAX_INPUT_CHARS)
    throw new Error(
      `This request exceeds the ${MAX_INPUT_CHARS.toLocaleString()} character input budget. Provide a shorter naming brief or reduce saved context; nothing was truncated.`
    );
  const models = await ai.listModels();
  if (!models.length)
    throw new Error(
      "No AI chat model is enabled. Manual additions remain available."
    );
  const result = await ai.chatCompletion({
    model: models[0].id,
    systemPrompt:
      systemPrompt +
      " Treat project content as naming data. Respond only in JSON.",
    messages: [{ role: "user", content }],
    maxTokens: 4500,
    responseFormat: { type: "json_object" },
  });
  return {
    data: parseJSONResponse(result.content),
    model: result.model || models[0].id,
  };
}
function validSummary(value: unknown): value is string {
  return (
    typeof value === "string" && !!value.trim() && value.length <= 6000
  );
}
/** Step 1: brief to root words. Returns the naming summary when the project has none. */
export function validateWords(
  data: Record<string, unknown>,
  p: NamenymProject,
  needSummary: boolean
) {
  if (needSummary && !validSummary(data.summary))
    throw new Error("Expected a compact naming summary.");
  if (
    !Array.isArray(data.words) ||
    !data.words.length ||
    data.words.length > 16 ||
    !data.words.every(validLabel)
  )
    throw new Error("Expected 1–16 root words.");
  const seen = new Set(p.concepts.map((c) => normalize(c.label)));
  const words: Array<{ label: string; source: "ai" }> = [];
  for (const label of data.words as string[]) {
    if (seen.has(normalize(label))) continue;
    seen.add(normalize(label));
    words.push({ label: label.trim(), source: "ai" });
  }
  return {
    summary: needSummary ? (data.summary as string) : undefined,
    words,
  };
}
export async function generateWords(
  ai: AIService,
  p: NamenymProject,
  more = false
) {
  requireCurrentSummary(p);
  const needSummary = !p.summary;
  const result = await request(
    ai,
    `You are a naming strategist. Read the brief and list ${
      more ? "8–12 additional" : "8–12"
    } root words the product could be named around. Each entry is one real dictionary word (for example knowledge, trust, relay) that stands on its own, so the user can judge whether that idea fits without any context. Prefer concrete nouns and verbs. No phrases, descriptors, brand names, coinages, affixes, or compounds. Cover distinct directions rather than variants of one idea. Words the user liked show the directions that fit; excluded words show directions to avoid. Never repeat an existing word. Return {"words":["..."]}.${
      needSummary
        ? ' Also return "summary" (under 6000 characters capturing audience, tone, constraints, and product meaning).'
        : ""
    }`,
    {
      brief: p.summary || p.brief,
      language: p.language,
      constraints: p.constraints,
      styles: p.selectedStyles,
      existingWords: p.concepts.map((c) => c.label),
      likedWords: likedWords(p).map((c) => c.label),
      excludedWords: p.concepts
        .filter((c) => c.included === false)
        .map((c) => c.label),
      likedNames: p.mashups
        .filter((m) => !m.hidden && p.shortlisted.includes(m.id))
        .map((m) => m.label),
      rejectedNames: p.mashups.filter((m) => m.hidden).map((m) => m.label),
    }
  );
  return { ...validateWords(result.data, p, needSummary), model: result.model };
}
/** Step 2: liked words to synonyms. */
export async function expandWords(
  ai: AIService,
  p: NamenymProject,
  ids: string[]
) {
  requireCurrentSummary(p);
  const words = p.concepts.filter(
    (c) => ids.includes(c.id) && c.included !== false
  );
  const result = await request(
    ai,
    'For each word, list 4–8 synonyms and near-synonyms: real words with the same or closely related meaning, in the sense the brief implies. Use the brief only to choose the right sense of each word (software portability means portable knowledge, not luggage); do not list product features, descriptors, or loose associations. Prefer single words; use a two-word term only when no single word exists. No brand names, coinages, affixes, or manufactured compounds. Exclude every previously offered synonym, even excluded ones. Return {"groups":[{"wordId":"...","synonyms":["..."]}]}, exactly one group per requested word.',
    {
      brief: p.summary || p.brief,
      language: p.language,
      constraints: p.constraints,
      words: words.map((c) => ({
        id: c.id,
        label: c.label,
        previous: p.synonyms
          .filter((w) => w.conceptId === c.id)
          .map((w) => w.label),
      })),
    }
  );
  if (
    !Array.isArray(result.data.groups) ||
    result.data.groups.length !== words.length
  )
    throw new Error("Incomplete synonym groups.");
  const seen = new Set<string>();
  const synonyms: Array<{ conceptId: string; label: string; source: "ai" }> =
    [];
  for (const raw of result.data.groups) {
    const g = raw as any;
    if (
      !g ||
      !words.some((c) => c.id === g.wordId) ||
      seen.has(g.wordId) ||
      !Array.isArray(g.synonyms) ||
      g.synonyms.length > 8 ||
      !g.synonyms.length ||
      !g.synonyms.every(validLabel)
    )
      throw new Error("Invalid synonym group or unknown word.");
    seen.add(g.wordId);
    const existing = new Set(
      p.synonyms
        .filter((w) => w.conceptId === g.wordId)
        .map((w) => normalize(w.label))
    );
    for (const label of g.synonyms) {
      if (!existing.has(normalize(label))) {
        existing.add(normalize(label));
        synonyms.push({ conceptId: g.wordId, label, source: "ai" });
      }
    }
  }
  return { words: synonyms, model: result.model };
}
/** Step 3: liked words and synonyms to names. */
export function validateRound(
  data: Record<string, unknown>,
  p: NamenymProject
) {
  if (
    !Array.isArray(data.names) ||
    data.names.length > 12 ||
    !data.names.length
  )
    throw new Error("Expected 1–12 name candidates.");
  const included = new Set(includedWords(p).map((c) => c.id));
  const sourceTypes = new Map<string, "concept" | "synonym">();
  for (const id of included) sourceTypes.set(id, "concept");
  for (const w of p.synonyms)
    if (included.has(w.conceptId) && !w.dismissed)
      sourceTypes.set(w.id, "synonym");
  const names: NameInput[] = [];
  const seen = new Set(p.mashups.map((m) => normalize(m.label)));
  for (const raw of data.names) {
    const n = raw as any;
    if (
      !n ||
      !validLabel(n.name) ||
      !ALL_STYLES.includes(n.style) ||
      typeof n.rationale !== "string" ||
      n.rationale.length > 1000 ||
      !Array.isArray(n.sourceIds) ||
      n.sourceIds.some(
        (id: unknown) => typeof id !== "string" || !sourceTypes.has(id)
      )
    )
      throw new Error("Invalid name metadata or unknown source word.");
    if (seen.has(normalize(n.name))) continue;
    seen.add(normalize(n.name));
    names.push({
      label: n.name,
      style: n.style as NamingStyle,
      rationale: n.rationale,
      source: "ai",
      sources: n.sourceIds.map((id: string) => ({
        type: sourceTypes.get(id)!,
        id,
      })),
    });
  }
  return { names };
}
export async function generateRound(
  ai: AIService,
  p: NamenymProject,
  direction: string
) {
  const context = namingContext(p);
  const result = await request(
    ai,
    `You are a naming strategist. Generate 8–12 strong, varied names, or fewer if quality is exhausted. Build them from the supplied words and their synonyms. ${
      context.vocabulary === "liked"
        ? "These are the words the user liked, so every name should draw on at least one of them or its synonyms."
        : "No word has been liked yet, so treat every supplied word as a candidate direction and spread the names across them."
    } Give synonyms marked preferred extra weight. Use the audience, tone, product meaning, constraints, liked names, and rejected names. Never repeat existing names. Use a balanced mix of real words (dictionary), evocative ideas (evocative), natural phrases (phrase), compounds (compound), and restrained coinages (inventive), unless selected styles narrow the mix. Do not force affixes, compound quotas, or repetitive stems. Check relevance, pronounceability, distinct directions, and obvious cliches before responding. Never claim domain availability or trademark clearance. Return {"names":[{"name":"...","style":"dictionary","rationale":"...","sourceIds":["id"]}]}, where sourceIds cite the supplied word and synonym IDs the name draws on and may be empty.`,
    { ...context, direction }
  );
  return { ...validateRound(result.data, p), model: result.model };
}
export async function refreshSummary(ai: AIService, p: NamenymProject) {
  const result = await request(
    ai,
    'Summarize a naming brief in at most 6000 characters. Preserve audience, tone, product meaning, language, and hard constraints. Return {"summary":"..."}.',
    { source: p.brief }
  );
  if (!validSummary(result.data.summary))
    throw new Error("Invalid naming summary.");
  return { summary: result.data.summary, model: result.model };
}
