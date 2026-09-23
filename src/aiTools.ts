import type {
  AIToolContext,
  ExtensionAITool,
  ExtensionToolResult,
} from "@nimbalyst/extension-sdk";
import { parseProject } from "./persistence";
import { getOpenProject, type ProjectSession } from "./editorRegistry";
import { projectReducer, validLabel, type Action } from "./state";
import { normalize, type NamenymProject } from "./types";

// Serialize closed-file mutations, including concurrent tool calls for the same path.
const writes = new Map<string, Promise<unknown>>();
async function access(
  context: AIToolContext,
  mutate: (project: NamenymProject) => Action[],
  mutating = true
): Promise<ExtensionToolResult> {
  const path = context.activeFilePath;
  const shared = path?.startsWith("collab://");
  if (!path || (!shared && !path.endsWith(".namenym")))
    return { success: false, error: "Select a .namenym project." };
  const run = async () => {
    try {
      const routedEditor = (
        context as AIToolContext & { editorAPI?: ProjectSession }
      ).editorAPI;
      let editor = routedEditor ?? getOpenProject(path);
      if (shared && !editor?.collaborative)
        throw new Error(
          "The shared Namenym editor is not ready. Open the document or retry after it has loaded."
        );
      let project =
        editor?.get() ??
        parseProject(
          await context.extensionContext.services.filesystem.readFile(path)
        );
      // An editor may mount while the disk read is pending.
      editor = routedEditor ?? getOpenProject(path);
      if (editor) project = editor.get();
      const before = project;
      const actions = mutate(project);
      for (const action of actions) {
        if (editor) {
          editor.apply(action);
          project = editor.get();
        } else project = projectReducer(project, action);
      }
      if (actions.length && !editor)
        await context.extensionContext.services.filesystem.writeFile(
          path,
          JSON.stringify(project, null, 2)
        );
      if (mutating && editor?.collaborative) {
        if (!editor.flush)
          throw new Error(
            "The shared host does not expose persistence acknowledgement."
          );
        await editor.flush();
      }
      const added = [
        ...project.concepts,
        ...project.synonyms,
        ...project.mashups,
      ]
        .filter(
          (x) =>
            ![...before.concepts, ...before.synonyms, ...before.mashups].some(
              (y) => y.id === x.id
            )
        )
        .map((x) => ({ id: x.id, label: x.label }));
      return {
        success: true,
        message: actions.length
          ? `Applied ${actions.length} action(s); added ${added.length} entries. Exact duplicates reuse existing entries.`
          : "Retrieved naming project.",
        data: actions.length ? { added } : project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const pending = (writes.get(path) ?? Promise.resolve()).then(run, run);
  writes.set(path, pending);
  try {
    return await pending;
  } finally {
    if (writes.get(path) === pending) writes.delete(path);
  }
}
function labels(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length > 100 || !value.every(validLabel))
    throw new Error(`${key} must contain 1–120 character labels (up to 100).`);
  return value;
}
const listSchema = {
  type: "array" as const,
  items: { type: "string" as const },
};
export const aiTools: ExtensionAITool[] = [
  {
    name: "namenym.get_project",
    access: { kind: "editor-read" },
    description:
      "Read the current naming project, including unsaved editor changes. The pipeline is brief -> root words -> synonyms of liked words -> names. In the data, concepts are root words (votes > 0 means the user liked it; included false means excluded), synonyms belong to a root word by conceptId (votes > 0 means preferred), and mashups are names with sources and the shortlist.",
    inputSchema: { type: "object", properties: {} },
    handler: (_a, c) => access(c, () => [], false),
  },
  {
    name: "namenym.add_themes",
    access: { kind: "editor-write" },
    description:
      "Add root words: single dictionary words the user can like or exclude, each standing for one idea the product could be named around (for example knowledge, trust, relay). Not phrases or name concepts. Liked words and their synonyms guide name generation. Exact duplicates reuse existing entries.",
    inputSchema: {
      type: "object",
      properties: { themes: listSchema },
      required: ["themes"],
    },
    handler: (a, c) =>
      access(c, () => [
        {
          type: "ADD_CONCEPTS",
          concepts: labels(a, "themes").map((label) => ({
            label,
            source: "manual",
          })),
        },
      ]),
  },
  {
    name: "namenym.add_words",
    access: { kind: "editor-write" },
    description:
      "Add synonyms or near-synonyms to an existing root word by its ID (a concept ID from namenym.get_project). Use the sense the brief implies, not loose associations.",
    inputSchema: {
      type: "object",
      properties: { themeId: { type: "string" }, words: listSchema },
      required: ["themeId", "words"],
    },
    handler: (a, c) =>
      access(c, (p) => {
        if (!p.concepts.some((t) => t.id === a.themeId))
          throw new Error("Unknown theme ID.");
        return [
          {
            type: "ADD_SYNONYMS",
            synonyms: labels(a, "words").map((label) => ({
              label,
              conceptId: String(a.themeId),
              source: "manual",
            })),
          },
        ];
      }),
  },
  {
    name: "namenym.add_names",
    access: { kind: "editor-write" },
    description:
      "Add finished names without generating or imposing a required-word constraint.",
    inputSchema: {
      type: "object",
      properties: { names: listSchema },
      required: ["names"],
    },
    handler: (a, c) =>
      access(c, () => [
        {
          type: "ADD_MASHUPS",
          mashups: labels(a, "names").map((label) => ({
            label,
            source: "manual",
          })),
        },
      ]),
  },
  {
    name: "namenym.shortlist",
    access: { kind: "editor-write" },
    description:
      "Set your own favorite membership for existing names in a shared project, or shortlist membership in a local project.",
    inputSchema: {
      type: "object",
      properties: { names: listSchema, shortlisted: { type: "boolean" } },
      required: ["names", "shortlisted"],
    },
    handler: (a, c) =>
      access(c, (p) => {
        if (typeof a.shortlisted !== "boolean")
          throw new Error("shortlisted must be boolean.");
        const names = new Set(labels(a, "names").map(normalize));
        return p.mashups
          .filter(
            (m) =>
              names.has(normalize(m.label)) &&
              p.shortlisted.includes(m.id) !== a.shortlisted
          )
          .map((m) => ({ type: "TOGGLE_SHORTLIST", id: m.id }));
      }),
  },
];
