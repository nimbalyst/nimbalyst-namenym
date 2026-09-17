import type { ExtensionContext } from "@nimbalyst/extension-sdk";
let context: ExtensionContext | null = null;
export function setExtensionContext(value: ExtensionContext) {
  context = value;
}
export function getExtensionContext() {
  return context;
}
export function getAIService() {
  return context?.services?.ai ?? null;
}
