import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real TypeScript module so these regression checks exercise the
// production renderer rather than a copied approximation of its logic.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-gloss-rendering-"));
const outfile = join(tempDir, "gloss.mjs");

try {
  buildSync({
    entryPoints: ["gloss.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    external: ["obsidian"],
  });

  const { renderConlangToEnglishString } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const entry = (word, definition) => ({
    word,
    definition,
    path: `Lexicon/${word}.md`,
  });

  // Ordinary dictionary lookup renders the documentation-language definition,
  // not the conlang source form.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "dictionary",
        source: "varu",
        candidates: [entry("varu", "current; flow")],
      },
    ]),
    "current; flow",
  );

  // Phrase entries follow the same directional rule and preserve the full
  // definition rather than silently reducing it to the first sense.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "phrase",
        source: "kira varu",
        candidates: [entry("kira varu", "adoption by current; bondkin adoption")],
      },
    ]),
    "adoption by current; bondkin adoption",
  );

  // Separators remain untouched so a multi-token preview keeps its original
  // spacing and punctuation between resolved pieces.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "dictionary",
        source: "varu",
        candidates: [entry("varu", "current")],
      },
      {
        kind: "separator",
        source: " ",
      },
      {
        kind: "dictionary",
        source: "kira",
        candidates: [entry("kira", "core")],
      },
    ]),
    "current core",
  );

  // Inflections keep the established first-sense plus grammatical-label form.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "inflected",
        source: "varun",
        inflection: {
          lemma: entry("varu", "current; flow"),
          label: "plural",
        },
      },
    ]),
    "current.PLURAL",
  );

  // Cypher fallbacks use their already-resolved fallback text.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "cypher-fallback",
        source: "xyz",
        cypherOutput: "abc",
      },
    ]),
    "abc",
  );

  // Missing fallback output fails conservatively to source text.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "cypher-fallback",
        source: "xyz",
      },
    ]),
    "xyz",
  );

  // Unmatched text is preserved exactly.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "no-match",
        source: "unknown",
      },
    ]),
    "unknown",
  );

  // Even malformed/incomplete renderer input must not invent a translation.
  assert.equal(
    renderConlangToEnglishString([
      {
        kind: "dictionary",
        source: "varu",
      },
      {
        kind: "separator",
        source: " / ",
      },
      {
        kind: "phrase",
        source: "kira varu",
        candidates: [],
      },
    ]),
    "varu / kira varu",
  );

  console.log("gloss rendering tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
