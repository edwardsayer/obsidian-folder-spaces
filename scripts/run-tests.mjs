import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const testDist = resolve(".test-dist");
const testDir = resolve(".test-dist/tests");
const tsc = resolve("node_modules/typescript/bin/tsc");

rmSync(testDist, { recursive: true, force: true });

try {
  const compile = spawnSync(process.execPath, [tsc, "-p", "tsconfig.tests.json"], {
    stdio: "inherit"
  });
  if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
  }

  const testFiles = readdirSync(testDir)
    .filter((file) => file.endsWith(".test.js"))
    .map((file) => resolve(testDir, file));

  const tests = spawnSync(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit"
  });
  process.exit(tests.status ?? 1);
} finally {
  rmSync(testDist, { recursive: true, force: true });
}
