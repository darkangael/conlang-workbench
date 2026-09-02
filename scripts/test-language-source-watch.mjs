import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

// ---------------------------------------------------------------------------
// Canonical language-source watch regression harness
//
// Bundle the real TypeScript helper so this test exercises the same read-only
// path decision used by main.ts. The helper receives only the already-selected
// active LanguageConfig objects; it has no vault mutation or settings authority.
// ---------------------------------------------------------------------------
const tempDir = mkdtempSync(join(tmpdir(), "conlang-language-source-watch-"));
const outfile = join(tempDir, "language-source-watch.mjs");

try {
  buildSync({
    entryPoints: ["language-source-watch.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });

  const { isWatchedLanguageSourcePath } = await import(
    `${pathToFileURL(outfile).href}?t=${Date.now()}`
  );

  const mer = {
    name: "Mer",
    dictionaryFolder: "Languages/Mer/Lexicon",
    morphemeFolder: "Languages/Mer/Morphemes",
    exampleFolder: "Languages/Mer/Examples",
    phonologyFolder: "Languages/Mer/Phonology",
    sheets: [],
    hoverEnabled: true,
  };

  // Every canonical Markdown-backed inventory loaded by reloadActiveLanguage()
  // must invalidate the settled runtime state when one of its descendants
  // changes.
  for (const path of [
    "Languages/Mer/Lexicon/varu.md",
    "Languages/Mer/Morphemes/plural-s.md",
    "Languages/Mer/Examples/example-001.md",
    "Languages/Mer/Phonology/vowels/a.md",
  ]) {
    assert.equal(
      isWatchedLanguageSourcePath(path, [mer]),
      true,
      `${path} should be watched`,
    );
  }

  // The configured folder itself also matches. This matters for rename/delete
  // events where Obsidian may report the folder path rather than a child note.
  assert.equal(
    isWatchedLanguageSourcePath("Languages/Mer/Morphemes", [mer]),
    true,
  );

  // Folder membership is structural, not raw string-prefix matching.
  assert.equal(
    isWatchedLanguageSourcePath(
      "Languages/Mermaid/Lexicon/not-mer.md",
      [mer],
    ),
    false,
  );

  // Unrelated material under the same language root is not currently a loaded
  // canonical inventory and therefore must not cause an expensive full reload.
  assert.equal(
    isWatchedLanguageSourcePath("Languages/Mer/Notes/research.md", [mer]),
    false,
  );

  // Optional canonical inventories remain optional. Blank/absent paths do not
  // accidentally broaden the watch boundary.
  const legacy = {
    name: "Legacy",
    dictionaryFolder: "Languages/Legacy/Lexicon",
    morphemeFolder: "   ",
    sheets: [],
    hoverEnabled: true,
  };

  assert.equal(
    isWatchedLanguageSourcePath(
      "Languages/Legacy/Examples/example.md",
      [legacy],
    ),
    false,
  );
  assert.equal(
    isWatchedLanguageSourcePath(
      "Languages/Legacy/Lexicon/word.md",
      [legacy],
    ),
    true,
  );

  // Invalid configured paths fail closed through isPathWithinFolder().
  const malformed = {
    name: "Malformed",
    dictionaryFolder: "../Outside/Lexicon",
    sheets: [],
    hoverEnabled: true,
  };

  assert.equal(
    isWatchedLanguageSourcePath("../Outside/Lexicon/word.md", [malformed]),
    false,
  );

  // main.ts supplies only active languages. Prove that the helper does not
  // somehow infer or expand that authority to another configured language.
  const other = {
    name: "Other",
    dictionaryFolder: "Languages/Other/Lexicon",
    morphemeFolder: "Languages/Other/Morphemes",
    exampleFolder: "Languages/Other/Examples",
    phonologyFolder: "Languages/Other/Phonology",
    sheets: [],
    hoverEnabled: true,
  };

  assert.equal(
    isWatchedLanguageSourcePath(
      "Languages/Other/Morphemes/root.md",
      [mer],
    ),
    false,
  );
  assert.equal(
    isWatchedLanguageSourcePath(
      "Languages/Other/Morphemes/root.md",
      [mer, other],
    ),
    true,
  );

  console.log("language source watch regression tests passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
