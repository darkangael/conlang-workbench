import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Runtime hover invalidation regression
 * -------------------------------------
 *
 * Hover resolution caches the last word under the pointer and may keep its
 * tooltip visible. That cache is valid only for the linguistic runtime that
 * produced it.
 *
 * Conlang Workbench prepares replacement inventories off to the side and
 * installs them atomically in commitLanguageRuntime(). A blocked or failed
 * preparation deliberately leaves the previous runtime authoritative, so hover
 * state must NOT be invalidated merely because a reload was attempted.
 *
 * The invariant belongs at the successful runtime-commit boundary:
 *
 *   - replacing the runtime hides any tooltip derived from the old generation;
 *   - replacing the runtime clears lastHoverWord so the next mousemove resolves
 *     the same visible word against the new dictionary;
 *   - failed/blocked preparation cannot reach that invalidation point.
 *
 * main.ts depends heavily on the Obsidian Plugin runtime, so this focused guard
 * checks that architectural boundary directly rather than pretending to execute
 * the complete browser hover event path in Node.
 */

const source = await readFile("main.ts", "utf8");

const commitStart =
  source.indexOf("private commitLanguageRuntime(candidate: LanguageRuntimeCandidate): void {");
const panelBoundary = source.indexOf("// === Panel management ===", commitStart);

assert.notEqual(
  commitStart,
  -1,
  "main.ts must contain commitLanguageRuntime()",
);
assert.notEqual(
  panelBoundary,
  -1,
  "main.ts must retain the panel-management boundary after commitLanguageRuntime()",
);

const commitSection = source.slice(commitStart, panelBoundary);

assert.match(
  commitSection,
  /this\.dictionary = candidate\.dictionary;/,
  "runtime commit must install the detached dictionary candidate",
);
assert.match(
  commitSection,
  /this\.classifyCache\.clear\(\);/,
  "runtime commit must invalidate classifications from the previous generation",
);
assert.match(
  commitSection,
  /this\.invalidateHoverResolution\(\);/,
  "successful runtime commit must invalidate hover state from the previous generation",
);

const helperMatch = source.match(
  /private invalidateHoverResolution\(\)(?:\s*:\s*void)?\s*\{([\s\S]*?)\n\s*\}/,
);

assert.ok(
  helperMatch,
  "main.ts must contain invalidateHoverResolution()",
);

const helperBody = helperMatch[1];

assert.match(
  helperBody,
  /this\.hideTooltip\(\);/,
  "hover invalidation must immediately hide any visible stale tooltip",
);
assert.match(
  helperBody,
  /this\.lastHoverWord = null;/,
  "hover invalidation must force the next same-word hover to resolve again",
);

console.log(
  "hover runtime invalidation regression test passed",
);
