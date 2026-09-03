import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// ---------------------------------------------------------------------------
// Lexical compound-part relationship regression harness
//
// Bundle the real pure resolver so these tests exercise the exact language,
// normalization, and cardinality policy shared by Diagnostics and the panel.
// ---------------------------------------------------------------------------
const tempDir = mkdtempSync(join(tmpdir(), "conlang-lexical-parts-"));
const outfile = join(tempDir, "lexical-part-relationships.mjs");

try {
  buildSync({
    entryPoints: ["lexical-part-relationships.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { resolveLexicalPart } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const owner = {
    word: "compound",
    language: "Mer",
    languageId: "mer-language",
  };

  const merRoot = {
    word: "Kala",
    aliases: ["water", "Kala"],
    language: "Mer",
    languageId: "mer-language",
    path: "Languages/Mer/Lexicon/Kala.md",
  };

  const otherLanguageRoot = {
    word: "kala",
    aliases: ["water", "other-language-only"],
    language: "Test Language",
    languageId: "test-language",
    path: "Languages/Test Language/Lexicon/kala.md",
  };

  // Language scope must prevent another loaded lexicon from turning a missing
  // local part into a false successful relationship.
  const scoped = resolveLexicalPart(
    owner,
    "kala",
    [merRoot, otherLanguageRoot],
    false,
  );

  assert.equal(scoped.status, "unique");
  assert.deepEqual(
    scoped.targets.map((target) => target.path),
    [merRoot.path],
  );

  const otherLanguageOnly = resolveLexicalPart(
    owner,
    "other-language-only",
    [merRoot, otherLanguageRoot],
    false,
  );

  assert.equal(otherLanguageOnly.status, "unresolved");
  assert.deepEqual(otherLanguageOnly.targets, []);

  // Aliases are valid relationship targets, but repeating the same spelling
  // as both headword and alias on one entry must not duplicate that target.
  const aliasTarget = resolveLexicalPart(owner, "water", [merRoot], false);
  assert.equal(aliasTarget.status, "unique");
  assert.equal(aliasTarget.targets[0].path, merRoot.path);

  const repeatedKey = resolveLexicalPart(owner, "Kala", [merRoot], true);
  assert.equal(repeatedKey.status, "unique");
  assert.equal(repeatedKey.targets.length, 1);

  // Case-insensitive mode sees both same-language spellings; case-sensitive
  // mode keeps their creator-authored distinction.
  const merHomograph = {
    word: "KALA",
    language: "Mer",
    languageId: "mer-language",
    path: "Languages/Mer/Lexicon/KALA.md",
  };

  const ambiguous = resolveLexicalPart(
    owner,
    "kala",
    [merRoot, merHomograph, otherLanguageRoot],
    false,
  );

  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(
    ambiguous.targets.map((target) => target.path),
    [merRoot.path, merHomograph.path],
  );

  const caseSensitive = resolveLexicalPart(
    owner,
    "Kala",
    [merRoot, merHomograph],
    true,
  );

  assert.equal(caseSensitive.status, "unique");
  assert.equal(caseSensitive.targets[0].path, merRoot.path);

  // Canonically equivalent Unicode spellings share the Dictionary's derived
  // NFC key without rewriting either source spelling.
  const unicodeTarget = {
    word: "šaru",
    language: "Mer",
    languageId: "mer-language",
    path: "Languages/Mer/Lexicon/šaru.md",
  };

  const unicode = resolveLexicalPart(
    owner,
    "s\u030caru",
    [unicodeTarget],
    false,
  );

  assert.equal(unicode.status, "unique");
  assert.equal(unicode.targets[0].path, unicodeTarget.path);

  // An owner with no language authority may use another truly unscoped entry,
  // but it must not borrow from a configured language.
  const unscopedOwner = { word: "unscoped-compound" };
  const unscopedTarget = {
    word: "root",
    path: "Loose Lexicon/root.md",
  };
  const scopedRoot = {
    word: "root",
    language: "Mer",
    languageId: "mer-language",
    path: "Languages/Mer/Lexicon/root.md",
  };

  const unscoped = resolveLexicalPart(
    unscopedOwner,
    "root",
    [scopedRoot, unscopedTarget],
    false,
  );

  assert.equal(unscoped.status, "unique");
  assert.equal(unscoped.targets[0].path, unscopedTarget.path);

  console.log("lexical-part relationship regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
