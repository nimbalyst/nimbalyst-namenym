export type NamingStyle =
  | "inventive"
  | "evocative"
  | "phrase"
  | "compound"
  | "dictionary";

export const STYLE_DESCRIPTIONS: Record<NamingStyle, string> = {
  inventive: "Brandable coinages (e.g., Google, Kodak)",
  evocative: "Evocative imagery (e.g., Patagonia, Everlane)",
  phrase: "Concise phrases (e.g., The Honest Company)",
  compound: "Compound blends (e.g., Facebook, Microsoft)",
  dictionary: "Real dictionary words (e.g., Stripe, Amazon)",
};

export const ALL_STYLES: NamingStyle[] = [
  "inventive",
  "evocative",
  "phrase",
  "compound",
  "dictionary",
];

export interface Concept {
  included?: boolean;
  legacy?: boolean;
  preparedRevision?: string;
  id: string;
  label: string;
  votes: number;
  source: "ai" | "manual";
}

export interface Synonym {
  id: string;
  conceptId: string;
  label: string;
  votes: number;
  dismissed: boolean;
  source: "ai" | "manual";
}

export interface MashupSource {
  type: "concept" | "synonym";
  id: string;
}

export type DomainStatus =
  | "unknown"
  | "checking"
  | "available"
  | "taken"
  | "error";

export interface AvailableDomain {
  domain: string;
  tld: string;
  registerURL: string;
}

export interface DomainCheck {
  query: string;
  checkedAt: string;
  availableDomains: AvailableDomain[];
}

export interface NameScores {
  conceptFit: number;
  memorability: number;
  pronounceability: number;
  uniqueness: number;
  trademarkRisk: number;
  domainAvailability: number;
  searchDiscoverability: number;
  emotionalResonance: number;
  extendability: number;
  visualAdaptability: number;
}

export const SCORE_WEIGHTS: Record<keyof NameScores, number> = {
  conceptFit: 15,
  memorability: 15,
  pronounceability: 15,
  uniqueness: 12,
  trademarkRisk: 10,
  domainAvailability: 8,
  searchDiscoverability: 5,
  emotionalResonance: 8,
  extendability: 6,
  visualAdaptability: 6,
};

export const SCORE_LABELS: Record<keyof NameScores, string> = {
  conceptFit: "Concept Fit",
  memorability: "Memorability",
  pronounceability: "Pronounceability",
  uniqueness: "Uniqueness",
  trademarkRisk: "Trademark Risk",
  domainAvailability: "Domain Availability",
  searchDiscoverability: "Search Discoverability",
  emotionalResonance: "Emotional Resonance",
  extendability: "Extendability",
  visualAdaptability: "Visual Adaptability",
};

export interface NameEvaluation {
  scores: NameScores;
  totalScore: number;
  strengths: string[];
  risks: string[];
  notes: string;
}

export interface Mashup {
  inputRevision?: string;
  domainCheck?: DomainCheck;
  source?: "ai" | "manual";
  rationale?: string;
  style?: NamingStyle;
  hidden?: boolean;
  notes?: string;
  revision?: number;
  round?: { id: string; direction: string; created: string };
  id: string;
  label: string;
  votes: number;
  sources: MashupSource[];
  domainStatus: DomainStatus;
  availableDomains: AvailableDomain[];
  evaluation: NameEvaluation | null;
}

export interface ProjectSettings {
  showOnlyFavorited: boolean;
  hideUnavailable: boolean;
}

export interface NamenymProject {
  favorites?: Favorite[];
  appliedRequests?: string[];
  importedShortlist?: string[];
  summarySourceFingerprint?: string;
  version: number;
  briefRevision: number;
  summary: string;
  summarySourceRevision: number;
  summaryRevision: number;
  unassignedWords: Synonym[];
  migrationArchive: unknown[];
  language: string;
  constraints: string;
  name: string;
  brief: string;
  selectedStyles: NamingStyle[];
  concepts: Concept[];
  synonyms: Synonym[];
  mashups: Mashup[];
  shortlisted: string[];
  selectedTlds: string[];
  settings: ProjectSettings;
}

export interface Favorite {
  scope: string;
  memberId: string;
  memberName: string;
  nameId: string;
}

export function createEmptyProject(): NamenymProject {
  return {
    version: 2,
    briefRevision: 0,
    summary: "",
    summarySourceRevision: -1,
    summaryRevision: 0,
    unassignedWords: [],
    migrationArchive: [],
    language: "English",
    constraints: "",
    name: "Untitled Project",
    brief: "",
    selectedStyles: [],
    concepts: [],
    synonyms: [],
    mashups: [],
    shortlisted: [],
    selectedTlds: [".com", ".ai"],
    settings: {
      showOnlyFavorited: false,
      hideUnavailable: false,
    },
  };
}

export function generateId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return `${prefix}-${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export const STYLE_LABELS: Record<NamingStyle, string> = {
  dictionary: "Real words",
  evocative: "Evocative",
  phrase: "Phrases",
  compound: "Compounds",
  inventive: "Coined",
};
export const normalize = (label: string): string =>
  label.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
