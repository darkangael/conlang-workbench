import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real TypeScript module rather than copying its logic into the
// test. That means these regression checks exercise the implementation that
// production code will actually import.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-selection-lookup-"));
const outfile = join(tempDir, "selection-lookup.mjs");

try {
  buildSync({
    entryPoints: ["selection-lookup.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { classifySelectionLookup } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const single = (sourceText, lookupText) => {
    assert.deepEqual(classifySelectionLookup(sourceText), {
      kind: "single-word",
      sourceText,
      lookupText,
    });
  };

  const phrase = (sourceText, lookupText) => {
    assert.deepEqual(classifySelectionLookup(sourceText), {
      kind: "phrase",
      sourceText,
      lookupText,
    });
  };

  const invalid = (sourceText) => {
    assert.deepEqual(classifySelectionLookup(sourceText), {
      kind: "invalid",
      sourceText,
    });
  };

  // Ordinary lexical selections.
  single("varu", "varu");
  single("Kira", "Kira");

  // Boundary punctuation may be excluded without changing the lexical token.
  single("varu,", "varu");
  single("(varu)", "varu");
  single('"varu"', "varu");
  single("  varu  ", "varu");

  // Unicode letters remain ordinary lexical content.
  single("šaru", "šaru");

  // Boundary cleanup must not discard arbitrary non-punctuation characters.
  invalid("123varu");
  invalid("varu123");
  invalid("123varu456");
  invalid("$varu");

  // Existing Workbench word semantics deliberately permit apostrophes and
  // hyphens inside a token. This test preserves that language-neutral boundary
  // rather than imposing English spelling assumptions.
  single("kala-vren", "kala-vren");
  single("ta'ru", "ta'ru");

  // Multiple words separated only by whitespace are phrase candidates.
  phrase("varu kira", "varu kira");
  phrase("varu   kira", "varu   kira");
  phrase("  varu kira  ", "varu kira");
  phrase("(varu kira)", "varu kira");
  phrase("varu\tkira", "varu\tkira");

  // Phrase boundaries follow the same preservation rule as single words.
  invalid("123varu kira");
  invalid("varu kira456");
  invalid("$varu kira");

  // Internal punctuation must never be deleted to manufacture a different
  // token or phrase.
  invalid("varu/kira");
  invalid("varu.kira");
  invalid("varu,kira");
  invalid("varu—kira");

  // Non-lexical selections cannot gain lookup authority.
  invalid("");
  invalid("   ");
  invalid("...");
  invalid("///");

  console.log("selection lookup tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
