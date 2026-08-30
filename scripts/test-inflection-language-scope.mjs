import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real production inflection module. The Dictionary itself is a
// deliberately tiny test double because this test is concerned with one
// boundary: findInflection() must pass the caller's language scope through
// when it resolves the reconstructed lemma.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-inflection-scope-"));
const outfile = join(tempDir, "inflection.mjs");

try {
  buildSync({
    entryPoints: ["inflection.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
    external: ["obsidian"],
  });

  const { findInflection } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  // -------------------------------------------------------------------------
  // SYNTHETIC REGRESSION FIXTURES — NOT MER CANON
  //
  // These names exist only inside this test file. No Markdown lexical entries
  // are created and nothing is written into the user's Mer vault.
  // -------------------------------------------------------------------------

  const merLemma = {
    word: "zzmorphfixture",
    definition: "synthetic Mer morphology fixture",
    path: "Synthetic/Mer/zzmorphfixture.md",
    language: "Mer",
    partOfSpeech: "noun",
  };

  const otherLemma = {
    word: "zzmorphfixture",
    definition: "synthetic other-language morphology fixture",
    path: "Synthetic/Test Language/zzmorphfixture.md",
    language: "Test Language",
    partOfSpeech: "noun",
  };

  const rules = [
    {
      label: "plural",
      enabled: true,
      position: "suffix",
      pattern: "s",
      strip: "s",
      add: "",
      pos: "noun",
    },
  ];

  // Put the other-language entry first deliberately. An unscoped lookup
  // therefore reproduces the old dangerous behavior: the first loaded
  // same-spelled lemma can win regardless of which language's morphology
  // is being interpreted.
  const entries = [otherLemma, merLemma];

  const dictionary = {
    lookup(value, language) {
      const normalized = value.toLowerCase();

      return entries.find(
        (entry) =>
          entry.word.toLowerCase() === normalized &&
          (language === undefined || entry.language === language),
      );
    },
  };

  // -------------------------------------------------------------------------
  // Compatibility: omitted scope retains the old global behavior.
  // -------------------------------------------------------------------------

  const globalMatch = findInflection(
    "zzmorphfixtures",
    dictionary,
    rules,
  );

  assert.ok(globalMatch);
  assert.equal(
    globalMatch.lemma.language,
    "Test Language",
    "unscoped compatibility lookup should still use global-first behavior",
  );

  // -------------------------------------------------------------------------
  // Safety: Mer rules scoped to Mer must resolve only a Mer lemma.
  // -------------------------------------------------------------------------

  const merMatch = findInflection(
    "zzmorphfixtures",
    dictionary,
    rules,
    "Mer",
  );

  assert.ok(merMatch);
  assert.equal(merMatch.lemma, merLemma);
  assert.equal(merMatch.lemma.language, "Mer");

  // -------------------------------------------------------------------------
  // Safety: a requested language with no matching lemma must fail closed.
  // -------------------------------------------------------------------------

  const missingLanguageMatch = findInflection(
    "zzmorphfixtures",
    dictionary,
    rules,
    "Language With No Fixture",
  );

  assert.equal(
    missingLanguageMatch,
    null,
    "morphology must not borrow a lemma from another language",
  );

  console.log("inflection language-scope regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
