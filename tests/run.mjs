import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const temp = await mkdtemp(join(tmpdir(), "namenym-tests-"));
try {
  const file = join(temp, "core.test.mjs");
  await build({
    stdin: {
      contents:
        'import "./tests/core.test.ts"; import "./tests/collab.test.ts";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const result = spawnSync(process.execPath, ["--test", file], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
