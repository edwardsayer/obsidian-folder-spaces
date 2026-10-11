import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  // Provide a lightweight obsidian shim for compiled test modules
  const mockObsidianDir = resolve(testDist, "node_modules/obsidian");
  mkdirSync(mockObsidianDir, { recursive: true });
  writeFileSync(
    resolve(mockObsidianDir, "package.json"),
    JSON.stringify({ name: "obsidian", type: "module", main: "index.js" }, null, 2),
    "utf8"
  );
  writeFileSync(
    resolve(mockObsidianDir, "index.js"),
    `export function getLanguage() {
  if (typeof globalThis.__mockObsidianLanguage === "function") {
    return globalThis.__mockObsidianLanguage();
  }
  return typeof globalThis.__mockObsidianLanguage === "string" ? globalThis.__mockObsidianLanguage : "en";
}
export const moment = {
  locale: () => (typeof globalThis.__mockMomentLocale === "string" ? globalThis.__mockMomentLocale : "en")
};
`,
    "utf8"
  );

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
