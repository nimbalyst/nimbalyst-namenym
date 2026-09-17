import {
  generateId,
  normalize,
  type NamenymProject,
  type NamingStyle,
  type Mashup,
  type Concept,
  type Synonym,
  type DomainCheck,
} from "./types";
type NameSources = { id: string; sources: Mashup["sources"] };
function restoreSources(names: Mashup[], saved: NameSources[] = []): Mashup[] {
  return names.map((name) => ({
    ...name,
    sources: [
      ...name.sources,
      ...(saved.find((s) => s.id === name.id)?.sources ?? []).filter(
        (source) =>
          !name.sources.some(
            (s) => s.id === source.id && s.type === source.type
          )
      ),
    ],
  }));
}
export type NameInput = {
  label: string;
  source?: "ai" | "manual";
  rationale?: string;
  style?: NamingStyle;
  sources?: Mashup["sources"];
  round?: Mashup["round"];
};
export type Action =
  | { type: "APPLY_GENERATION"; requestId: string; actions: Action[] }
  | { type: "LOAD_PROJECT"; project: NamenymProject }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_BRIEF"; brief: string }
  | {
      type: "SET_SUMMARY";
      summary: string;
      sourceRevision: number;
      sourceFingerprint?: string;
    }
  | { type: "SET_CONSTRAINTS"; constraints: string }
  | { type: "SET_LANGUAGE"; language: string }
  | { type: "TOGGLE_STYLE"; style: NamingStyle }
  | {
      type: "ADD_CONCEPTS";
      concepts: Array<{ label: string; source: "ai" | "manual"; id?: string }>;
    }
  | {
      type:
        | "REMOVE_CONCEPT"
        | "VOTE_CONCEPT"
        | "DISMISS_SYNONYM"
        | "VOTE_SYNONYM"
        | "REMOVE_SYNONYM"
        | "REMOVE_MASHUP"
        | "TOGGLE_SHORTLIST";
      id: string;
    }
  | {
      type: "ADD_SYNONYMS";
      synonyms: Array<{
        conceptId: string;
        label: string;
        source: "ai" | "manual";
      }>;
    }
  | { type: "ADD_MASHUPS"; mashups: NameInput[] }
  | {
      type: "EDIT_ITEM";
      kind: "concepts" | "synonyms" | "mashups";
      id: string;
      label: string;
    }
  | { type: "SET_NOTES"; id: string; notes: string }
  | {
      type: "DOMAIN_RESULT";
      id: string;
      label: string;
      revision: number;
      inputRevision?: string;
      check: DomainCheck;
    }
  | { type: "PREPARED"; ids: string[]; revision: string }
  | {
      type: "RESTORE_THEME";
      theme: Concept;
      words: Synonym[];
      nameSources?: NameSources[];
    }
  | { type: "RESTORE_WORD"; word: Synonym; nameSources?: NameSources[] }
  | { type: "ASSIGN_WORD"; id: string; conceptId: string };

export const preparationRevision = (p: NamenymProject) =>
  JSON.stringify([p.brief, p.summary, p.language, p.constraints]);
export function projectReducer(
  state: NamenymProject,
  a: Action
): NamenymProject {
  switch (a.type) {
    case "APPLY_GENERATION": {
      if (state.appliedRequests?.includes(a.requestId)) return state;
      const next = a.actions.reduce(projectReducer, state);
      return {
        ...next,
        appliedRequests: [...(next.appliedRequests ?? []), a.requestId],
      };
    }
    case "LOAD_PROJECT":
      return a.project;
    case "SET_NAME":
      return { ...state, name: a.name };
    case "SET_BRIEF":
      return a.brief === state.brief
        ? state
        : { ...state, brief: a.brief, briefRevision: state.briefRevision + 1 };
    case "SET_SUMMARY":
      return {
        ...state,
        summary: a.summary,
        summarySourceRevision: a.sourceRevision,
        summaryRevision: state.summaryRevision + 1,
        summarySourceFingerprint: a.sourceFingerprint ?? state.brief,
      };
    case "SET_CONSTRAINTS":
      return { ...state, constraints: a.constraints };
    case "SET_LANGUAGE":
      return { ...state, language: a.language };
    case "TOGGLE_STYLE":
      return {
        ...state,
        selectedStyles: state.selectedStyles.includes(a.style)
          ? state.selectedStyles.filter((s) => s !== a.style)
          : [...state.selectedStyles, a.style],
      };
    case "ADD_CONCEPTS": {
      const seen = new Set(state.concepts.map((c) => normalize(c.label)));
      const concepts = [...state.concepts];
      for (const c of a.concepts)
        if (validLabel(c.label) && !seen.has(normalize(c.label))) {
          seen.add(normalize(c.label));
          concepts.push({
            ...c,
            label: c.label.trim(),
            id: c.id ?? generateId("c"),
            votes: 0,
            included: true,
          });
        }
      return { ...state, concepts };
    }
    case "ADD_SYNONYMS": {
      const seen = new Set(
        state.synonyms.map((s) => `${s.conceptId}:${normalize(s.label)}`)
      );
      const synonyms = [...state.synonyms];
      for (const s of a.synonyms) {
        const key = `${s.conceptId}:${normalize(s.label)}`;
        if (
          validLabel(s.label) &&
          state.concepts.some((c) => c.id === s.conceptId) &&
          !seen.has(key)
        ) {
          seen.add(key);
          synonyms.push({
            ...s,
            label: s.label.trim(),
            id: generateId("s"),
            votes: 0,
            dismissed: false,
          });
        }
      }
      return { ...state, synonyms };
    }
    case "ADD_MASHUPS": {
      const seen = new Set(state.mashups.map((m) => normalize(m.label)));
      const mashups = [...state.mashups];
      for (const m of a.mashups)
        if (
          validLabel(m.label) &&
          !seen.has(normalize(m.label)) &&
          (m.sources ?? []).every((s) =>
            s.type === "concept"
              ? state.concepts.some((c) => c.id === s.id)
              : state.synonyms.some((w) => w.id === s.id)
          )
        ) {
          seen.add(normalize(m.label));
          mashups.push({
            ...m,
            label: m.label.trim(),
            id: generateId("m"),
            votes: 0,
            sources: m.sources ?? [],
            source: m.source ?? "manual",
            domainStatus: "unknown",
            availableDomains: [],
            evaluation: null,
            revision: 0,
            notes: "",
            hidden: false,
          });
        }
      return { ...state, mashups };
    }
    case "EDIT_ITEM": {
      if (
        !validLabel(a.label) ||
        state[a.kind].some(
          (x) =>
            x.id !== a.id &&
            normalize(x.label) === normalize(a.label) &&
            (a.kind !== "synonyms" ||
              (x as Synonym).conceptId ===
                state.synonyms.find((w) => w.id === a.id)?.conceptId)
        )
      )
        return state;
      return {
        ...state,
        [a.kind]: state[a.kind].map((x) =>
          x.id === a.id
            ? {
                ...x,
                label: a.label.trim(),
                ...(a.kind === "mashups"
                  ? {
                      revision: ((x as Mashup).revision ?? 0) + 1,
                      inputRevision: generateId("input"),
                      evaluation: null,
                      domainCheck: undefined,
                      domainStatus: "unknown",
                      availableDomains: [],
                    }
                  : {}),
                ...(a.kind === "concepts"
                  ? { preparedRevision: undefined }
                  : {}),
              }
            : x
        ),
      };
    }
    case "VOTE_CONCEPT":
      return {
        ...state,
        concepts: state.concepts.map((c) =>
          c.id === a.id ? { ...c, included: c.included === false } : c
        ),
      };
    case "DISMISS_SYNONYM":
      return {
        ...state,
        synonyms: state.synonyms.map((w) =>
          w.id === a.id ? { ...w, dismissed: !w.dismissed } : w
        ),
      };
    case "VOTE_SYNONYM":
      return {
        ...state,
        synonyms: state.synonyms.map((w) =>
          w.id === a.id ? { ...w, votes: w.votes > 0 ? 0 : 1 } : w
        ),
      };
    case "REMOVE_CONCEPT":
      return {
        ...state,
        concepts: state.concepts.filter((c) => c.id !== a.id),
        synonyms: state.synonyms.filter((w) => w.conceptId !== a.id),
        mashups: state.mashups.map((m) => ({
          ...m,
          sources: m.sources.filter(
            (s) =>
              s.id !== a.id &&
              !state.synonyms.some((w) => w.conceptId === a.id && w.id === s.id)
          ),
        })),
      };
    case "REMOVE_SYNONYM":
      return {
        ...state,
        synonyms: state.synonyms.filter((w) => w.id !== a.id),
        mashups: state.mashups.map((m) => ({
          ...m,
          sources: m.sources.filter((s) => s.id !== a.id),
        })),
      };
    case "REMOVE_MASHUP":
      return {
        ...state,
        mashups: state.mashups.map((m) =>
          m.id === a.id ? { ...m, hidden: !m.hidden } : m
        ),
      };
    case "TOGGLE_SHORTLIST":
      return state.mashups.some((m) => m.id === a.id)
        ? {
            ...state,
            shortlisted: state.shortlisted.includes(a.id)
              ? state.shortlisted.filter((id) => id !== a.id)
              : [...state.shortlisted, a.id],
          }
        : state;
    case "DOMAIN_RESULT": {
      const name = state.mashups.find((m) => m.id === a.id);
      if (
        !name ||
        name.label !== a.label ||
        (name.revision ?? 0) !== a.revision ||
        name.inputRevision !== a.inputRevision ||
        (name.domainCheck &&
          Date.parse(name.domainCheck.checkedAt) >
            Date.parse(a.check.checkedAt))
      )
        return state;
      return {
        ...state,
        mashups: state.mashups.map((m) =>
          m.id === a.id
            ? {
                ...m,
                domainCheck: a.check,
                availableDomains: a.check.availableDomains,
                domainStatus: a.check.availableDomains.some(
                  (d) => d.domain === `${a.check.query}.com`
                )
                  ? "available"
                  : "unknown",
              }
            : m
        ),
      };
    }
    case "SET_NOTES":
      return {
        ...state,
        mashups: state.mashups.map((m) =>
          m.id === a.id ? { ...m, notes: a.notes } : m
        ),
      };
    case "PREPARED":
      return {
        ...state,
        concepts: state.concepts.map((c) =>
          a.ids.includes(c.id) ? { ...c, preparedRevision: a.revision } : c
        ),
      };
    case "RESTORE_THEME":
      return state.concepts.some(
        (c) => normalize(c.label) === normalize(a.theme.label)
      )
        ? state
        : {
            ...state,
            concepts: [...state.concepts, a.theme],
            synonyms: [...state.synonyms, ...a.words],
            mashups: restoreSources(state.mashups, a.nameSources),
          };
    case "RESTORE_WORD":
      return state.synonyms.some(
        (w) =>
          w.conceptId === a.word.conceptId &&
          normalize(w.label) === normalize(a.word.label)
      ) || !state.concepts.some((c) => c.id === a.word.conceptId)
        ? state
        : {
            ...state,
            synonyms: [...state.synonyms, a.word],
            mashups: restoreSources(state.mashups, a.nameSources),
          };
    case "ASSIGN_WORD": {
      const w = state.unassignedWords.find((w) => w.id === a.id);
      if (!w || !state.concepts.some((c) => c.id === a.conceptId)) return state;
      const duplicate = state.synonyms.find(
        (word) =>
          word.conceptId === a.conceptId &&
          normalize(word.label) === normalize(w.label)
      );
      return {
        ...state,
        synonyms: duplicate
          ? state.synonyms
          : [...state.synonyms, { ...w, conceptId: a.conceptId }],
        unassignedWords: state.unassignedWords.filter(
          (word) => word.id !== a.id
        ),
        migrationArchive: duplicate
          ? [...state.migrationArchive, w]
          : state.migrationArchive,
        mashups: state.mashups.map((name) => ({
          ...name,
          sources: name.sources.map((source) =>
            source.type === "synonym" && source.id === w.id
              ? { ...source, id: duplicate?.id ?? w.id }
              : source
          ),
        })),
      };
    }
  }
}
export function validLabel(value: unknown): value is string {
  return typeof value === "string" && !!normalize(value) && value.length <= 120;
}
