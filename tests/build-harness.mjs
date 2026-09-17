import { build } from "esbuild";
import { resolve } from "node:path";
await build({
  entryPoints: ["tests/harness.tsx"],
  outfile: "node_modules/.cache/namenym-tests/harness.js",
  bundle: true,
  format: "iife",
  // Exercise the real hook without the SDK barrel's unrelated host-only
  // screenshot/document helpers in this standalone browser fixture.
  plugins: [
    {
      name: "sdk-collaboration-hook",
      setup(build) {
        build.onResolve({ filter: /^@nimbalyst\/extension-sdk$/ }, () => ({
          path: resolve(
            "node_modules/@nimbalyst/extension-sdk/dist/useCollaborativeEditor.js"
          ),
        }));
      },
    },
  ],
  define: { "process.env.NODE_ENV": '"production"' },
});
