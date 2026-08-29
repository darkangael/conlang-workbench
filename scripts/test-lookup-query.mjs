import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real TypeScript module so these tests exercise the same authority
// logic that production code imports.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-lookup-query-"));
const outfile = join(tempDir, "lookup-query.mjs");

try {
  buildSync({
    entryPoints: ["lookup-query.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { classifyLookupQuery } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const valid = (sourceText, lookupText) => {
    assert.deepEqual(classifyLookupQuery(sourceText), {
      kind: "valid",
      sourceText,
      lookupText,
    });
  };

  const invalid = (sourceText) => {
    assert.deepEqual(classifyLookupQuery(sourceText), {
      kind: "invalid",
      sourceText,
    });
  };

  // Ordinary lookup expressions remain valid.
  valid("varu", "varu");
  valid("varu kira", "varu kira");
  valid("varu   kira", "varu   kira");

  // Harmless outer punctuation or whitespace may expose an otherwise intact
  // lexical expression without changing its internal content.
  valid("  varu  ", "varu");
  valid("(varu)", "varu");
  valid('"varu"', "varu");
  valid("(varu kira)", "varu kira");

  // Existing language-neutral apostrophe/hyphen semantics remain unchanged.
  valid("kala-vren", "kala-vren");
  valid("ta'ru", "ta'ru");

  // H8 preservation: both precomposed and decomposed Unicode spellings must
  // survive lookup classification unchanged. Canonical equivalence belongs to
  // derived dictionary/index keys, not source rewriting here.
  valid("šaru", "šaru");

  const decomposed = "s\u030caru";
  valid(decomposed, decomposed);

  // H9 regression: internal separators must never be deleted to manufacture
  // another lexical query such as "foobar".
  invalid("foo/bar");
  invalid("foo.bar");
  invalid("foo,bar");
  invalid("foo—bar");

  // Non-punctuation material at lexical boundaries must likewise not vanish.
  invalid("foo123bar");
  invalid("123foo");
  invalid("foo123");
  invalid("$foo");

  // Multiple lexical tokens are a phrase only when their internal separation
  // consists solely of whitespace.
  invalid("foo / bar");
  invalid("foo, bar");
  invalid("foo.bar baz");

  // No lexical expression means no lookup authority.
  invalid("");
  invalid("   ");
  invalid("...");
  invalid("///");

  console.log("lookup-query security regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
