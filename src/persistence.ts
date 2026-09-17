import {
  ALL_STYLES,
  createEmptyProject,
  normalize,
  type NamenymProject,
  type NamingStyle,
  type Synonym,
} from "./types";
import { domainQuery } from "./domains";

/** Validate before migration. Never substitute an empty document for damaged input. */
export function parseProject(content: string): NamenymProject {
  if (!content.trim()) return createEmptyProject();
  const raw = JSON.parse(content);
  if (
    !raw ||
    typeof raw !== "object" ||
    ![1, 2, 3].includes(raw.version) ||
    typeof raw.name !== "string" ||
    typeof raw.brief !== "string"
  )
    throw new Error(
      "Unsupported or invalid Namenym project. Open the source to recover it."
    );
  for (const key of [
    "concepts",
    "synonyms",
    "mashups",
    "shortlisted",
    "selectedStyles",
  ]) {
    if (!Array.isArray(raw[key]))
      throw new Error(`Invalid project: ${key} must be a list.`);
  }
  if (
    raw.appliedRequests !== undefined &&
    (!Array.isArray(raw.appliedRequests) ||
      raw.appliedRequests.some((id: unknown) => typeof id !== "string"))
  )
    throw new Error("Invalid generation request markers.");
  if (
    raw.selectedTlds !== undefined &&
    (!Array.isArray(raw.selectedTlds) ||
      raw.selectedTlds.some((tld: unknown) => typeof tld !== "string"))
  )
    throw new Error("Invalid domain selections.");
  const ids = new Set<string>();
  for (const item of [
    ...raw.concepts,
    ...raw.synonyms,
    ...raw.mashups,
    ...(raw.unassignedWords ?? []),
  ]) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.label !== "string" ||
      !normalize(item.label) ||
      ids.has(item.id)
    )
      throw new Error(
        "Invalid or duplicate item identity. Source was not changed."
      );
    ids.add(item.id);
  }
  if (raw.synonyms.some((s: Synonym) => typeof s.conceptId !== "string"))
    throw new Error("Invalid word theme reference.");
  if (
    raw.shortlisted.some((id: unknown) => typeof id !== "string") ||
    raw.selectedStyles.some(
      (s: unknown) =>
        typeof s !== "string" ||
        ![...ALL_STYLES, "global", "alternate"].includes(s as NamingStyle)
    )
  )
    throw new Error("Invalid shortlist or style.");
  if (raw.version >= 2) {
    for (const key of ["summary", "language", "constraints"])
      if (typeof raw[key] !== "string") throw new Error(`Invalid ${key}.`);
    for (const key of [
      "briefRevision",
      "summaryRevision",
      "summarySourceRevision",
    ])
      if (!Number.isInteger(raw[key])) throw new Error(`Invalid ${key}.`);
    for (const key of ["unassignedWords", "migrationArchive"])
      if (!Array.isArray(raw[key])) throw new Error(`Invalid ${key}.`);
  }
  if (raw.version === 3) {
    if (
      !Array.isArray(raw.favorites) ||
      !Array.isArray(raw.importedShortlist) ||
      raw.importedShortlist.some((id: unknown) => typeof id !== "string")
    )
      throw new Error("Invalid saved preferences.");
    const keys = new Set<string>();
    for (const f of raw.favorites) {
      if (
        !f ||
        ["scope", "memberId", "nameId", "memberName"].some(
          (key) => typeof f[key] !== "string" || !f[key]
        )
      )
        throw new Error("Invalid favorite identity.");
      const key = JSON.stringify([f.scope, f.memberId, f.nameId]);
      if (keys.has(key)) throw new Error("Duplicate favorite identity.");
      keys.add(key);
      if (f.memberName.includes("@")) f.memberName = "Member";
    }
  }
  for (const theme of raw.concepts) {
    if (theme.included !== undefined && typeof theme.included !== "boolean")
      throw new Error("Invalid theme inclusion state.");
  }
  for (const word of [...raw.synonyms, ...(raw.unassignedWords ?? [])]) {
    if (
      typeof word.conceptId !== "string" ||
      (word.dismissed !== undefined && typeof word.dismissed !== "boolean")
    )
      throw new Error("Invalid saved word.");
  }
  for (const name of raw.mashups) {
    const check = name.domainCheck;
    if (
      check !== undefined &&
      (!check ||
        typeof check.query !== "string" ||
        domainQuery(check.query) !== check.query ||
        typeof check.checkedAt !== "string" ||
        !Number.isFinite(Date.parse(check.checkedAt)) ||
        !Array.isArray(check.availableDomains) ||
        check.availableDomains.some(
          (d: any) =>
            !d ||
            !["com", "ai", "net", "org"].includes(d.tld) ||
            d.domain !== `${check.query}.${d.tld}`
        ))
    )
      throw new Error("Invalid saved domain check.");
    for (const field of ["notes", "rationale"])
      if (name[field] !== undefined && typeof name[field] !== "string")
        throw new Error("Invalid name details.");
    if (name.hidden !== undefined && typeof name.hidden !== "boolean")
      throw new Error("Invalid hidden state.");
    if (
      name.sources !== undefined &&
      (!Array.isArray(name.sources) ||
        name.sources.some(
          (s: any) =>
            !s ||
            typeof s.id !== "string" ||
            !["concept", "synonym"].includes(s.type)
        ))
    )
      throw new Error("Invalid name sources.");
    if (
      name.round !== undefined &&
      (!name.round ||
        typeof name.round.id !== "string" ||
        typeof name.round.direction !== "string" ||
        typeof name.round.created !== "string")
    )
      throw new Error("Invalid generation round.");
  }
  const p: NamenymProject = {
    ...createEmptyProject(),
    ...raw,
    version: raw.version === 3 ? 3 : 2,
  };
  p.selectedStyles = [
    ...new Set(
      raw.selectedStyles.map((s: string) =>
        s === "global" ? "dictionary" : s === "alternate" ? "inventive" : s
      )
    ),
  ] as NamingStyle[];
  p.concepts = raw.concepts.map((c: any) => ({
    ...c,
    source: c.source ?? "manual",
    included: c.included ?? true,
    legacy: c.legacy ?? raw.version === 1,
  }));
  p.unassignedWords = [...(raw.unassignedWords ?? [])];
  p.migrationArchive = [...(raw.migrationArchive ?? [])];
  const themes = new Set(p.concepts.map((c) => c.id));
  const words = new Map<string, Synonym>();
  const redirect = new Map<string, string>();
  p.synonyms = [];
  for (const old of raw.synonyms as Synonym[]) {
    const word = {
      ...old,
      dismissed: old.dismissed ?? false,
      source: old.source ?? ("manual" as const),
    };
    if (!themes.has(word.conceptId)) {
      p.unassignedWords.push(word);
      continue;
    }
    const key = `${word.conceptId}:${normalize(word.label)}`;
    const existing = words.get(key);
    if (existing && raw.version !== 3) {
      redirect.set(word.id, existing.id);
      p.migrationArchive.push(old);
      // Keep user intent if either copy was excluded, and preserve the original record in the archive.
      existing.dismissed = existing.dismissed || word.dismissed;
    } else {
      words.set(key, word);
      p.synonyms.push(word);
    }
  }
  p.mashups = raw.mashups.map((m: any) => ({
    ...m,
    domainCheck: m.domainCheck
      ? {
          ...m.domainCheck,
          availableDomains: m.domainCheck.availableDomains.map((d: any) => ({
            domain: d.domain,
            tld: d.tld,
            registerURL: `https://domainr.com/${encodeURIComponent(d.domain)}`,
          })),
        }
      : undefined,
    source: m.source ?? "ai",
    notes: m.notes ?? "",
    hidden: m.hidden ?? false,
    revision: m.revision ?? 0,
    style:
      m.style === "global"
        ? "dictionary"
        : m.style === "alternate"
        ? "inventive"
        : m.style,
    sources: (m.sources ?? []).map((s: any) => ({
      ...s,
      id: redirect.get(s.id) ?? s.id,
    })),
  }));
  return p;
}
