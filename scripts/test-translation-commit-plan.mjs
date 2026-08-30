import assert from "node:assert/strict";
import esbuild from "esbuild";
import { pathToFileURL } from "node:url";

const outfile = "/tmp/conlang-workbench-test-translation-commit-plan.mjs";

await esbuild.build({
  entryPoints: ["translation-commit-plan.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  external: ["obsidian"],
});

const { buildEnglishToConlangCommitPlan } = await import(
  pathToFileURL(outfile).href + `?t=${Date.now()}`
);

function entry(word, definition = "") {
  return {
    word,
    definition,
    path: `Languages/Test Language/Lexicon/${word}.md`,
  };
}

// ---------------------------------------------------------------------------
// One established dictionary entry is authoritative.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water",
      candidates: [deWa],
    },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "DeWa",
    replacement: "[[DeWa|water]]",
    resolved: [
      {
        source: "water",
        target: "DeWa",
        representation: "known-wikilink",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Separators, punctuation, and spacing are preserved exactly.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");
  const varu = entry("Varu", "current");

  const plan = buildEnglishToConlangCommitPlan([
    { kind: "dictionary", source: "water", candidates: [deWa] },
    { kind: "separator", source: ",  " },
    { kind: "dictionary", source: "current", candidates: [varu] },
    { kind: "separator", source: "!" },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "DeWa,  Varu!",
    replacement: "[[DeWa|water]],  [[Varu|current]]!",
    resolved: [
      {
        source: "water",
        target: "DeWa",
        representation: "known-wikilink",
      },
      {
        source: "current",
        target: "Varu",
        representation: "known-wikilink",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Phrase matches use one link whose alias preserves the complete source span.
// ---------------------------------------------------------------------------

{
  const phrase = entry("Shalla Koa", "deep water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "phrase",
      source: "deep water",
      candidates: [phrase],
    },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "Shalla Koa",
    replacement: "[[Shalla Koa|deep water]]",
    resolved: [
      {
        source: "deep water",
        target: "Shalla Koa",
        representation: "known-wikilink",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Several structured senses pointing to the SAME entry are not ambiguous.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water",
      candidates: [deWa],
      englishMatches: [
        { entry: deWa, sense: { gloss: "water" } },
        { entry: deWa, sense: { lookupTerms: ["water"] } },
      ],
    },
  ]);

  assert.equal(plan.status, "ready");
  assert.equal(plan.replacement, "[[DeWa|water]]");
}

// ---------------------------------------------------------------------------
// A known target containing wikilink structure remains valid vocabulary.
// Only the Markdown representation falls back to literal target text.
// ---------------------------------------------------------------------------

{
  const unusual = entry("De|Wa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water",
      candidates: [unusual],
    },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "De|Wa",
    replacement: "De|Wa",
    resolved: [
      {
        source: "water",
        target: "De|Wa",
        representation: "known-plain-text",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// The source/alias side can also make a wikilink structurally unsafe.
// Preserve both creator-authored strings rather than escaping or rewriting.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water|liquid",
      candidates: [deWa],
    },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "DeWa",
    replacement: "DeWa",
    resolved: [
      {
        source: "water|liquid",
        target: "DeWa",
        representation: "known-plain-text",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// `]` receives the same conservative treatment because it can terminate link
// syntax. This is a representation fallback, not an unknown lexical item.
// ---------------------------------------------------------------------------

{
  const unusual = entry("De]Wa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water",
      candidates: [unusual],
    },
  ]);

  assert.equal(plan.status, "ready");
  assert.equal(plan.replacement, "De]Wa");
  assert.equal(plan.resolved[0].representation, "known-plain-text");
}

// ---------------------------------------------------------------------------
// One translation can legitimately contain both safe links and literal known
// forms. The entire operation remains ready because every lexical item is
// authoritative.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");
  const unusual = entry("X|Y", "dragon");
  const varu = entry("Varu", "current");

  const plan = buildEnglishToConlangCommitPlan([
    { kind: "dictionary", source: "water", candidates: [deWa] },
    { kind: "separator", source: " " },
    { kind: "dictionary", source: "dragon", candidates: [unusual] },
    { kind: "separator", source: " " },
    { kind: "dictionary", source: "current", candidates: [varu] },
  ]);

  assert.deepEqual(plan, {
    status: "ready",
    translated: "DeWa X|Y Varu",
    replacement: "[[DeWa|water]] X|Y [[Varu|current]]",
    resolved: [
      {
        source: "water",
        target: "DeWa",
        representation: "known-wikilink",
      },
      {
        source: "dragon",
        target: "X|Y",
        representation: "known-plain-text",
      },
      {
        source: "current",
        target: "Varu",
        representation: "known-wikilink",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Distinct lexical destinations are ambiguous. Never silently choose first.
// ---------------------------------------------------------------------------

{
  const a = entry("DeWa", "water");
  const b = entry("Aqua", "water");

  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "dictionary",
      source: "water",
      candidates: [a, b],
    },
  ]);

  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.unresolved, [
    {
      source: "water",
      reason: "ambiguous",
      candidates: [a, b],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Cypher output is a suggestion only. It cannot authorize note mutation.
// ---------------------------------------------------------------------------

{
  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "cypher-fallback",
      source: "dragon",
      cypherOutput: "draegun",
    },
  ]);

  assert.deepEqual(plan, {
    status: "blocked",
    unresolved: [
      {
        source: "dragon",
        reason: "missing",
        suggestion: "draegun",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Plain no-match is missing established vocabulary.
// ---------------------------------------------------------------------------

{
  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "no-match",
      source: "dragon",
    },
  ]);

  assert.deepEqual(plan, {
    status: "blocked",
    unresolved: [
      {
        source: "dragon",
        reason: "missing",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// One unresolved lexical item blocks the WHOLE replacement.
// ---------------------------------------------------------------------------

{
  const deWa = entry("DeWa", "water");

  const plan = buildEnglishToConlangCommitPlan([
    { kind: "dictionary", source: "water", candidates: [deWa] },
    { kind: "separator", source: " " },
    {
      kind: "cypher-fallback",
      source: "dragon",
      cypherOutput: "draegun",
    },
    { kind: "separator", source: " " },
    { kind: "no-match", source: "red" },
  ]);

  assert.deepEqual(plan, {
    status: "blocked",
    unresolved: [
      {
        source: "dragon",
        reason: "missing",
        suggestion: "draegun",
      },
      {
        source: "red",
        reason: "missing",
      },
    ],
  });

  assert.equal("replacement" in plan, false);
}

// ---------------------------------------------------------------------------
// Unsupported/unexpected token kinds fail conservatively.
// ---------------------------------------------------------------------------

{
  const plan = buildEnglishToConlangCommitPlan([
    {
      kind: "inflected",
      source: "waters",
      inflection: {
        lemma: entry("DeWa", "water"),
        label: "plural",
      },
    },
  ]);

  assert.deepEqual(plan, {
    status: "blocked",
    unresolved: [
      {
        source: "waters",
        reason: "unsupported",
      },
    ],
  });
}

console.log("translation commit plan regression tests passed");
