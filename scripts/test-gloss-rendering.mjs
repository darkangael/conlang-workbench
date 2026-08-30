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

  const {
    glossConlangToEnglish,
    renderConlangToEnglishString,
    translateEnglishToConlangString,
  } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const entry = (word, definition) => ({
    word,
    definition,
    path: `Lexicon/${word}.md`,
  });

  // ----------------------------------------------------------
  // English -> conlang translation pipeline regression.
  //
  // "water" deliberately resolves to DeWa while the vowel cypher
  // would transform DeWa into DiWae if it were incorrectly applied
  // after dictionary lookup. The expected DeWa result therefore
  // protects the rule that a dictionary hit is already final.
  // ----------------------------------------------------------

  const deWa = entry("DeWa", "water");

  // The production gloss functions only require the dictionary operations
  // they call. This small test double lets us exercise the real translation
  // module without constructing an Obsidian vault.
  const dictionary = {
    lookupEnglishMatches(value, languageName) {
      // The English side is being resolved into Test Language. Returning no
      // result for any other scope makes this test fail if glossing forgets
      // which target lexicon it is allowed to consult.
      if (languageName !== "Test Language") return [];

      return value.trim().toLowerCase() === "water"
        ? [{ entry: deWa }]
        : [];
    },

    lookup(value, languageName) {
      // Reverse/direct lexical lookup interprets Test Language text, so the
      // same explicit language boundary must reach this Dictionary API too.
      if (languageName !== "Test Language") return null;

      return value.trim().toLowerCase() === "dewa" ? deWa : null;
    },

    phraseIndex(languageName) {
      assert.equal(
        languageName,
        "Test Language",
        "reverse phrase lookup must use the source-language scope",
      );

      return {
        byFirstWord: new Map(),
      };
    },

    lookupForm(_value, languageName) {
      assert.equal(
        languageName,
        "Test Language",
        "declared-form lookup must use the source-language scope",
      );
      return [];
    },
  };

  const language = {
    name: "Test Language",
    sheets: [
      {
        name: "Vowels",
        enabled: true,
        rules: [
          {
            input: "a",
            output: "ae",
            type: "default",
            enabled: true,
          },
          {
            input: "e",
            output: "i",
            type: "default",
            enabled: true,
          },
          {
            input: "o",
            output: "u",
            type: "default",
            enabled: true,
          },
        ],
      },
    ],
    inflections: [],
  };

  assert.equal(
    translateEnglishToConlangString("water", dictionary, language),
    "DeWa",
    "dictionary translation must not be cyphered again",
  );

  // A genuine dictionary miss still uses the cypher fallback. This proves the
  // fix did not disable fallback while protecting dictionary-authored forms.
  assert.equal(
    translateEnglishToConlangString("red", dictionary, language),
    "rid",
  );

  // Known and unknown material may coexist. Dictionary vocabulary stays exact,
  // fallback applies only to the unknown word, and punctuation/spacing survive.
  assert.equal(
    translateEnglishToConlangString("water red.", dictionary, language),
    "DeWa rid.",
  );

  // The opposite direction follows the same precedence rule: the known conlang
  // headword resolves through the dictionary rather than reverse cypher.
  assert.equal(
    renderConlangToEnglishString(
      glossConlangToEnglish("DeWa", dictionary, language),
    ),
    "water",
  );

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
