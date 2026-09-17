import { defineConfig } from "vite";
import { createExtensionConfig } from "@nimbalyst/extension-sdk/vite";

export default defineConfig({
  ...createExtensionConfig({
    entry: "./src/index.ts",
  }),
  // The desktop dev process may supply NODE_ENV=development to build tools.
  // Pinned browser bundles must use the production-compatible JSX runtime.
  esbuild: { jsx: "automatic", jsxDev: false },
});
