import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real production modules. This prevents the regression test from
// accidentally proving a copied test implementation instead of Workbench code.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-lexical-normalization-"));
const outfile = join(tempDir, "h8-regression.mjs");
const entryFile = join(tempDir, "entry.ts");

try {
  // A tiny temporary entry point lets one bundle expose both production
  // modules without changing the plugin's public API just for testing.
  await import("node:fs").then(({ writeFileSync }) =>
    writeFileSync(
      entryFile,
      `
export {
  normalizeLexicalKey,
  isLexicalLetter,
  isLexicalMark,
  isLexicalBaseOrMark,
} from ${JSON.stringify(join(process.cwd(), "lexical-normalization.ts"))};

export {
  WORD_RE,
  WORD_ANCHORED_RE,
  cleanWord,
  isWordChar,
} from ${JSON.stringify(join(process.cwd(), "word-tokens.ts"))};

export {
  buildPhraseIndex,
  tokeniseWithPhrases,
} from ${JSON.stringify(join(process.cwd(), "phrases.ts"))};

export {
  applyCypher,
} from ${JSON.stringify(join(process.cwd(), "cypher.ts"))};
`,
    ),
  );

  buildSync({
    entryPoints: [entryFile],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const {
    normalizeLexicalKey,
    isLexicalLetter,
    isLexicalMark,
    isLexicalBaseOrMark,
    WORD_RE,
    WORD_ANCHORED_RE,
    cleanWord,
    isWordChar,
    buildPhraseIndex,
    tokeniseWithPhrases,
    applyCypher,
  } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  const precomposed = "\u0161aru"; // šaru
  const decomposed = "s\u030caru"; // s + COMBINING CARON + aru

  // -----------------------------------------------------------------------
  // Derived keys: canonical equivalence without rewriting source spelling.
  // -----------------------------------------------------------------------

  assert.equal(
    normalizeLexicalKey(precomposed, true),
    normalizeLexicalKey(decomposed, true),
  );

  assert.equal(
    normalizeLexicalKey(precomposed.toUpperCase(), false),
    normalizeLexicalKey(decomposed, false),
  );

  // Existing case policy remains intact.
  assert.notEqual(
    normalizeLexicalKey("Varu", true),
    normalizeLexicalKey("varu", true),
  );
  assert.equal(
    normalizeLexicalKey("Varu", false),
    normalizeLexicalKey("varu", false),
  );

  // Normalization is derived-only: the creator-authored string itself is not
  // mutated or replaced.
  const original = decomposed;
  normalizeLexicalKey(original, true);
  assert.equal(original, decomposed);
  assert.notEqual(original, precomposed);

  // -----------------------------------------------------------------------
  // Unicode character semantics.
  // -----------------------------------------------------------------------

  assert.equal(isLexicalLetter("s"), true);
  assert.equal(isLexicalLetter("\u030c"), false);
  assert.equal(isLexicalMark("\u030c"), true);
  assert.equal(isLexicalBaseOrMark("s"), true);
  assert.equal(isLexicalBaseOrMark("\u030c"), true);
  assert.equal(isLexicalBaseOrMark("-"), false);

  // -----------------------------------------------------------------------
  // Word tokenization: decomposed graphemes stay inside one token.
  // -----------------------------------------------------------------------

  const tokenRe = new RegExp(WORD_RE.source, "gu");
  assert.deepEqual(decomposed.match(tokenRe), [decomposed]);
  assert.equal(WORD_ANCHORED_RE.test(decomposed), true);
  assert.equal(cleanWord(decomposed), decomposed);
  assert.equal(isWordChar("\u030c"), true);

  // A free-floating combining mark still cannot start a word.
  assert.equal(WORD_ANCHORED_RE.test("\u030c"), false);

  // H8 deliberately does not redesign the existing punctuation policy.
  assert.equal(WORD_ANCHORED_RE.test("kala-vren"), true);
  assert.equal(WORD_ANCHORED_RE.test("ta'ru"), true);
  assert.equal(WORD_ANCHORED_RE.test("varu-"), true);
  assert.equal(WORD_ANCHORED_RE.test("varu'"), true);

  // -----------------------------------------------------------------------
  // Phrase integration: index and input may use different canonical Unicode
  // representations and must still resolve to the same phrase.
  // -----------------------------------------------------------------------

  const entry = {
    word: `${precomposed} kira`,
  };

  const phraseIndex = buildPhraseIndex([entry], false);
  const tokens = tokeniseWithPhrases(`${decomposed} kira`, phraseIndex);

  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].kind, "phrase");
  assert.equal(tokens[0].text, `${decomposed} kira`);
  assert.equal(tokens[0].entry, entry);

  // -----------------------------------------------------------------------
  // Cypher integration: combining marks must not manufacture boundaries.
  // -----------------------------------------------------------------------

  // This rule may replace "s" only when "s" occurs at the end of lexical
  // material. In decomposed "s" + COMBINING CARON, the mark continues the
  // same grapheme, so the suffix rule must NOT activate between them.
  const suffixSheet = {
    name: "H8 suffix boundary regression",
    enabled: true,
    rules: [
      {
        input: "s",
        output: "X",
        type: "suffix",
        enabled: true,
      },
    ],
  };

  assert.equal(applyCypher(decomposed, [suffixSheet]), decomposed);

  // The canonically equivalent precomposed spelling also remains untouched.
  // It contains no standalone "s" for this rule to match.
  assert.equal(applyCypher(precomposed, [suffixSheet]), precomposed);

  // Confirm that the suffix rule itself still works at a genuine boundary.
  // This guards against "fixing" the bug merely by disabling suffix matching.
  assert.equal(applyCypher("tas", [suffixSheet]), "taX");

  // The same internal-boundary protection applies to a whole-word rule.
  const wordSheet = {
    name: "H8 word boundary regression",
    enabled: true,
    rules: [
      {
        input: "s",
        output: "X",
        type: "word",
        enabled: true,
      },
    ],
  };

  assert.equal(applyCypher(decomposed, [wordSheet]), decomposed);
  assert.equal(applyCypher("s", [wordSheet]), "X");

  // -----------------------------------------------------------------------
  // Compatibility: cypher sheet order remains an ordered transformation.
  // -----------------------------------------------------------------------

  const firstPipelineSheet = {
    name: "first pipeline sheet",
    enabled: true,
    rules: [
      {
        input: "a",
        output: "b",
        type: "default",
        enabled: true,
      },
    ],
  };

  const secondPipelineSheet = {
    name: "second pipeline sheet",
    enabled: true,
    rules: [
      {
        input: "b",
        output: "c",
        type: "default",
        enabled: true,
      },
    ],
  };

  assert.equal(
    applyCypher("a", [firstPipelineSheet, secondPipelineSheet]),
    "c",
    "later cypher sheets must consume the transformed output of earlier sheets",
  );
  assert.equal(
    applyCypher("a", [secondPipelineSheet, firstPipelineSheet]),
    "b",
    "reordering cypher sheets must change the transformation pipeline",
  );

  console.log("lexical normalization tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
