import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real TypeScript module in memory so these tests exercise exactly
// the implementation used by Conlang Workbench rather than a copied version.
const result = await build({
  entryPoints: ["vault-paths.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

const { validateVaultRelativePath, joinVaultPath, isPathWithinFolder } =
  await import(moduleUrl);

function assertThrowsPath(path) {
  assert.throws(
    () => validateVaultRelativePath(path),
    Error,
    `Expected unsafe path to be rejected: ${path}`,
  );
}

// Ordinary vault-relative paths remain valid.
assert.equal(
  validateVaultRelativePath("Languages/Mer/Lexicon"),
  "Languages/Mer/Lexicon",
);

assert.equal(
  validateVaultRelativePath("Languages/Test Language/Phonology"),
  "Languages/Test Language/Phonology",
);

// Traversal and ambiguous path forms fail closed rather than being normalized.
assertThrowsPath("Languages/Mer/../Elf");
assertThrowsPath("Languages/Mer/./Lexicon");
assertThrowsPath("../Languages/Mer");
assertThrowsPath("/Languages/Mer");
assertThrowsPath("Languages//Mer");
assertThrowsPath("Languages/Mer/");
assertThrowsPath(" Languages/Mer");
assertThrowsPath("Languages\\Mer");

// Joining permits a single child name but cannot redirect the destination.
assert.equal(
  joinVaultPath("Languages/Mer/Lexicon", "varu.md"),
  "Languages/Mer/Lexicon/varu.md",
);

assert.throws(
  () => joinVaultPath("Languages/Mer/Lexicon", "../varu.md"),
  Error,
);

assert.throws(
  () => joinVaultPath("Languages/Mer/Lexicon", "Other/varu.md"),
  Error,
);

// Folder containment requires a real path-component boundary.
// This specifically protects against Mer accidentally matching Mermaid.
assert.equal(
  isPathWithinFolder("Languages/Mer/Lexicon/varu.md", "Languages/Mer"),
  true,
);

assert.equal(isPathWithinFolder("Languages/Mer", "Languages/Mer"), true);

assert.equal(
  isPathWithinFolder("Languages/Mermaid/Lexicon/song.md", "Languages/Mer"),
  false,
);

assert.equal(
  isPathWithinFolder("Languages/Mer/../Elf/Lexicon/a.md", "Languages/Mer"),
  false,
);

console.log("vault-paths security regression tests passed.");
