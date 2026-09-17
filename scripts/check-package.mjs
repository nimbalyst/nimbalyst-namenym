import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const pkg = readJSON("package.json");
const manifest = readJSON("manifest.json");
assert.equal(manifest.version, pkg.version, "Package and manifest versions must match");
assert.equal(pkg.license, "MIT");
assert.equal(manifest.id, "com.nimbalyst.namenym");

// Ignore lifecycle hooks here: prepack itself invokes this check.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [packed] = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
  shell: process.platform === "win32",
}));
const expected = new Set([
  "package.json", "manifest.json", "dist/index.js", "dist/index.css", "dist/index.js.map",
  "samples/demo.namenym", "LICENSE", "README.md", "CHANGELOG.md", "CONTRIBUTING.md",
  "SECURITY.md", "PRIVACY.md", "RELEASING.md", "THIRD_PARTY_NOTICES.md",
]);
const actual = new Set(packed.files.map((file) => file.path));
assert.deepEqual(actual, expected, "Unexpected or missing files in release package");
assert.ok(actual.has(manifest.main), "Manifest entry point must be packaged");
assert.ok(actual.has(manifest.styles), "Manifest styles must be packaged");
for (const screenshot of manifest.marketplace.screenshots) {
  if (screenshot.fileToOpen) assert.ok(actual.has(screenshot.fileToOpen), "Screenshot fixture must be packaged");
}
JSON.parse(manifest.contributions.newFileMenu[0].defaultContent);
readJSON("samples/demo.namenym");
for (const file of packed.files) assert.ok(file.size > 0, `Empty packaged file: ${file.path}`);
const sourceMap = readJSON("dist/index.js.map");
for (const source of sourceMap.sources) {
  assert.ok(!/^(?:\/|[A-Za-z]:[\\/]|file:)/.test(source), `Absolute source-map path: ${source}`);
}
console.log(`Release package verified: ${packed.files.length} files, version ${pkg.version}`);
