import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Hover direction compatibility regression
 * ----------------------------------------
 *
 * Upstream issue #12 found that hover used to merge two different lookup
 * directions: interpreting a token as conlang vocabulary and interpreting the
 * same text as an English definition. That made a conlang word which happened
 * to resemble an English lookup key display unrelated translation candidates.
 *
 * The repaired contract has three parts:
 *
 *   - a conlang-side match wins before direct English lookup;
 *   - sibling expansion may bridge already-matched entries through a shared
 *     definition, but may not loop the hovered word back through English;
 *   - cypher preview is an English-to-conlang fallback and therefore remains
 *     disabled whenever the English hover direction is disabled.
 *
 * main.ts depends on the Obsidian Plugin and browser DOM runtime, so this test
 * intentionally guards those architectural conditions in source rather than
 * claiming to execute a complete mouse-hover event in Node.
 */

const source = await readFile("main.ts", "utf8");

const resolutionStart = source.indexOf(
  "const conlangSide = this.settings.hoverConlang;",
);
const methodBoundary = source.indexOf(
  "private modifierHeld(evt: MouseEvent): boolean {",
  resolutionStart,
);

assert.notEqual(
  resolutionStart,
  -1,
  "main.ts must contain the hover conlang-resolution boundary",
);
assert.notEqual(
  methodBoundary,
  -1,
  "main.ts must retain modifierHeld() after the hover resolution path",
);

const hoverResolution = source.slice(resolutionStart, methodBoundary);

/*
 * Protect precedence for the whole conlang side, not merely dictionary
 * headwords. Declared and rule-derived inflected forms are also conlang
 * interpretations and must suppress direct English-direction lookup.
 */
assert.match(
  hoverResolution,
  /const conlangMatched\s*=\s*[\s\S]*?dictEntries\.length > 0[\s\S]*?declaredForm !== undefined[\s\S]*?inflectionMatch !== null;/,
  "hover must classify headword, declared-form, and rule-derived matches as conlang-side matches",
);

assert.match(
  hoverResolution,
  /this\.settings\.hoverEnglish\s*&&\s*!conlangMatched\s*\?\s*this\.dictionary\.lookupEnglish\(cleaned\)/,
  "direct English hover lookup must be gated off whenever the conlang side matched",
);

/*
 * Cross-language sibling expansion is intentionally allowed after a conlang
 * match, but the definition key equal to the hovered token must be rejected
 * before lookupEnglish() can route back into the suppressed English direction.
 */
assert.match(
  hoverResolution,
  /const selfKey = cleaned\.toLowerCase\(\);/,
  "sibling expansion must derive a normalized key for the hovered token",
);

assert.match(
  hoverResolution,
  /if \(!key \|\| key === selfKey \|\| seenDefs\.has\(key\)\) continue;/,
  "sibling expansion must reject a definition equal to the hovered token",
);

/*
 * Cypher fallback transforms presumed English text into the primary conlang.
 * Turning off the English hover direction must therefore stop before cyphering.
 */
assert.match(
  hoverResolution,
  /if \(\s*!this\.settings\.hoverEnglish \|\|\s*this\.settings\.hoverFallback === "nothing"\s*\) \{\s*this\.scheduleHideTooltip\(\);\s*return;\s*\}/,
  "cypher fallback must remain disabled while English-direction hover is disabled",
);

console.log("hover direction compatibility regression test passed");
