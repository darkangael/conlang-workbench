import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// Bundle the real production scanner. The regression must exercise the same
// Unicode-boundary logic that editor cursor lookup and rendered-text hover
// will use, rather than proving a copied implementation inside this test.
const tempDir = mkdtempSync(join(tmpdir(), "conlang-word-scan-"));
const outfile = join(tempDir, "h10-regression.mjs");
const entryFile = join(tempDir, "entry.ts");

try {
  writeFileSync(
    entryFile,
    `
export {
  findWordRangeAt,
} from ${JSON.stringify(join(process.cwd(), "word-scan.ts"))};
`,
  );

  buildSync({
    entryPoints: [entryFile],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { findWordRangeAt } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  function wordAt(text, offset) {
    const range = findWordRangeAt(text, offset);
    return range ? text.substring(range.start, range.end) : null;
  }

  // -----------------------------------------------------------------------
  // Existing BMP behavior must remain intact.
  // -----------------------------------------------------------------------

  assert.equal(wordAt("varu", 0), "varu");
  assert.equal(wordAt("varu", 2), "varu");
  assert.equal(wordAt("varu", 4), "varu");

  assert.equal(wordAt("\u0161aru", 1), "\u0161aru");

  // Decomposed s + COMBINING CARON must remain one lexical word.
  const decomposed = "s\u030caru";
  assert.equal(wordAt(decomposed, 0), decomposed);
  assert.equal(wordAt(decomposed, 1), decomposed);
  assert.equal(wordAt(decomposed, 2), decomposed);

  // -----------------------------------------------------------------------
  // H10: supplementary-plane letters occupy two UTF-16 code units.
  //
  // U+10400 DESERET CAPITAL LETTER LONG I is a real Unicode Letter. Both
  // UTF-16 positions belonging to that code point must resolve to the same
  // complete lexical word rather than splitting at either surrogate half.
  // -----------------------------------------------------------------------

  const supplementary = "\u{10400}";
  assert.equal(/\p{L}/u.test(supplementary), true);
  assert.equal(supplementary.length, 2);

  const initial = `${supplementary}aru`;
  assert.equal(wordAt(initial, 0), initial);
  assert.equal(wordAt(initial, 1), initial);
  assert.equal(wordAt(initial, 2), initial);

  const medial = `var${supplementary}u`;
  assert.equal(wordAt(medial, 3), medial);
  assert.equal(wordAt(medial, 4), medial);
  assert.equal(wordAt(medial, 5), medial);

  const final = `aru${supplementary}`;
  assert.equal(wordAt(final, 3), final);
  assert.equal(wordAt(final, 4), final);
  assert.equal(wordAt(final, 5), final);

  // Word boundaries remain UTF-16 offsets because Obsidian editor positions
  // and DOM text offsets use UTF-16 coordinates.
  assert.deepEqual(findWordRangeAt(medial, 3), {
    start: 0,
    end: medial.length,
  });

  // Ordinary non-word material must still form a boundary.
  assert.equal(wordAt("varu kira", 4), "varu");
  assert.equal(wordAt("varu kira", 5), "kira");

  console.log("word-scan regression tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
