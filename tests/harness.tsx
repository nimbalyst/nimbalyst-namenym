import React from "react";
import { createRoot } from "react-dom/client";
import { NimbalystNamenymEditor } from "../src/NimbalystNamenymEditor";
import { createEmptyProject } from "../src/types";
import { setExtensionContext } from "../src/extensionContext";
import "../src/styles.css";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
const element = document.createElement("div");
element.style.cssText = "height:100vh;width:100%";
document.body.append(element);
document.body.style.margin = "0";
const root = createRoot(element);
let saved = "",
  onSave: any,
  external: any,
  api: any,
  dirty = false,
  writes = 0,
  delayedSave: any = null;
const calls: Array<{
  options: any;
  resolve: (r: any) => void;
  reject: (e: any) => void;
}> = [];
const domainCalls: Array<{
  name: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}> = [];
window.fetch = (async (_url: string, options: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    domainCalls.push({
      name: JSON.parse(options.body as string).name,
      resolve,
      reject,
    });
    options.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true }
    );
  })) as typeof fetch;
setExtensionContext({
  services: {
    ai: {
      listModels: async () => [{ id: "mock-model" }],
      chatCompletion: (options: any) =>
        new Promise((resolve, reject) =>
          calls.push({ options, resolve, reject })
        ),
    },
  },
} as any);
const host: any = {
  filePath: "/fixture.namenym",
  fileName: "fixture.namenym",
  theme: "dark",
  isActive: true,
  loadContent: async () => saved,
  saveContent: async (content: string) => {
    writes++;
    if (delayedSave) await new Promise((resolve) => (delayedSave = resolve));
    saved = content;
    external?.(content);
  },
  setDirty: (value: boolean) => (dirty = value),
  onSaveRequested: (cb: any) => {
    onSave = cb;
    return () => {
      onSave = null;
    };
  },
  onFileChanged: (cb: any) => {
    external = cb;
    return () => {
      external = null;
    };
  },
  registerEditorAPI: (value: any) => (api = value),
  toggleSourceMode: () => {},
};
let sharedDoc: Y.Doc | undefined;
let sharedHost: any;
let readOnlyChanged: ((value: boolean) => void) | undefined;
let forbiddenCalls = 0;
let flushes = 0;
(window as any).fixture = {
  mountShared(
    content: string,
    user = "alice",
    browser = true,
    state?: number[]
  ) {
    sharedDoc = new Y.Doc();
    if (state) Y.applyUpdate(sharedDoc, Uint8Array.from(state));
    const awareness = new Awareness(sharedDoc);
    awareness.setLocalStateField("user", {
      id: user,
      name: user,
      color: "#4188ff",
    });
    const forbidden = () => {
      forbiddenCalls++;
      throw new Error("A shared editor called a filesystem method");
    };
    sharedHost = {
      ...host,
      filePath: "collab://one/project.namenym",
      readOnly: false,
      loadContent: forbidden,
      saveContent: forbidden,
      onSaveRequested: forbidden,
      onFileChanged: forbidden,
      onReadOnlyChanged: (cb: (value: boolean) => void) => {
        readOnlyChanged = cb;
        return () => {
          readOnlyChanged = undefined;
        };
      },
      capabilities: {
        environment: browser ? "browser" : "electron",
        supports: () => false,
      },
      collaboration: {
        yDoc: sharedDoc,
        awareness,
        user: { id: user, name: user, color: "#4188ff" },
        getStatus: () => "connected",
        onStatusChange: () => () => {},
        loadInitialContent: async () => content,
        flushWithAck: async () => {
          flushes++;
          return true;
        },
      },
    };
    root.render(<NimbalystNamenymEditor host={sharedHost} />);
  },
  sharedState: (layoutVersion?: number) => {
    if (layoutVersion === undefined)
      return Array.from(Y.encodeStateAsUpdate(sharedDoc!));
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(sharedDoc!));
    copy.getMap("namenym:meta").set("layoutVersion", layoutVersion);
    const update = Array.from(Y.encodeStateAsUpdate(copy));
    copy.destroy();
    return update;
  },
  mergeShared: (update: number[]) =>
    Y.applyUpdate(sharedDoc!, Uint8Array.from(update)),
  setReadOnly(value: boolean) {
    sharedHost.readOnly = value;
    readOnlyChanged?.(value);
  },
  sharedChecks: () => ({ forbiddenCalls, flushes }),
  apply: (action: any) => api.apply(action),
  domainCalls: () => domainCalls.map((c) => c.name),
  completeDomains(index: number, domains: unknown[], status = 200) {
    domainCalls[index].resolve(
      new Response(JSON.stringify({ domains }), { status })
    );
  },
  mount(content = JSON.stringify(createEmptyProject())) {
    saved = content;
    root.render(<NimbalystNamenymEditor host={host} />);
  },
  calls() {
    return calls.map((c) => c.options);
  },
  complete(index: number, data: any) {
    calls[index].resolve({
      content: JSON.stringify(data),
      model: "mock-model",
    });
  },
  fail(index: number) {
    calls[index].reject(new Error("Provider unavailable"));
  },
  project: () => api?.get(),
  save: () => onSave(),
  saved: () => saved,
  dirty: () => dirty,
  writes: () => writes,
  external(content: string) {
    saved = content;
    external(content);
  },
  delaySave() {
    delayedSave = true;
  },
  finishSave() {
    const resolve = delayedSave;
    delayedSave = null;
    resolve();
  },
};
