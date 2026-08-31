import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-root-authority-"));

try {
  const outputFile = join(tempDir, "language-root-authority.mjs");

  await build({
    entryPoints: ["language-root-authority.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  const {
    inferLegacyLanguageRoot,
    languageRootsOverlap,
    validateCanonicalSourceWithinRoot,
    validateLanguageRoot,
    validateLanguageSourceChange,
  } = await import(`${pathToFileURL(outputFile).href}?t=${Date.now()}`);

  function makeLanguage(overrides = {}) {
    return {
      name: "Test Language",
      dictionaryFolder: "Languages/Test Language/Lexicon",
      morphemeFolder: "Languages/Test Language/Morphemes",
      exampleFolder: "Languages/Test Language/Examples",
      phonologyFolder: "Languages/Test Language/Phonology",
      sheets: [],
      hoverEnabled: true,
      ...overrides,
    };
  }

  /*
   * A valid language root is exactly one immediate child beneath Languages/.
   */
  {
    assert.deepEqual(validateLanguageRoot("Languages/Mer"), {
      status: "valid",
      root: "Languages/Mer",
    });

    assert.deepEqual(validateLanguageRoot("Languages/Test Language"), {
      status: "valid",
      root: "Languages/Test Language",
    });
  }

  /*
   * Languages/ itself is only the shared collection container.
   */
  {
    const result = validateLanguageRoot("Languages");

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "root-is-container");
  }

  /*
   * A deeper folder belongs to an existing language tree; it is not itself a
   * separate language root.
   */
  {
    const result = validateLanguageRoot("Languages/Mer/Grammar");

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "root-not-direct-child");
  }

  /*
   * Modern legacy source paths can recover their root from the first child
   * beneath Languages/.
   */
  {
    const result = inferLegacyLanguageRoot(makeLanguage());

    assert.deepEqual(result, {
      status: "inferred",
      root: "Languages/Test Language",
    });
  }

  /*
   * One source is enough when it clearly identifies a modern language tree.
   */
  {
    const result = inferLegacyLanguageRoot({
      name: "Test Language",
      dictionaryFolder: "Languages/Test Language/Lexicon",
      sheets: [],
      hoverEnabled: true,
    });

    assert.deepEqual(result, {
      status: "inferred",
      root: "Languages/Test Language",
    });
  }

  /*
   * A language rename does not affect structural inference. The actual vault
   * source tree remains authoritative.
   */
  {
    const result = inferLegacyLanguageRoot(
      makeLanguage({
        name: "Renamed Language",
      }),
    );

    assert.deepEqual(result, {
      status: "inferred",
      root: "Languages/Test Language",
    });
  }

  /*
   * The historical Made Up Words path is not silently reinterpreted as modern
   * Languages/<root> ownership.
   */
  {
    const result = inferLegacyLanguageRoot({
      name: "Example",
      dictionaryFolder: "Made Up Words/Example",
      sheets: [],
      hoverEnabled: true,
    });

    assert.equal(result.status, "unresolved");
    assert.equal(result.reason, "outside-language-container");
  }

  /*
   * A malformed legacy configuration whose canonical sources cross two
   * language roots must be repaired explicitly.
   */
  {
    const result = inferLegacyLanguageRoot(
      makeLanguage({
        morphemeFolder: "Languages/Other Language/Morphemes",
      }),
    );

    assert.equal(result.status, "unresolved");
    assert.equal(result.reason, "inconsistent-language-roots");
  }

  /*
   * Unsafe path syntax fails closed rather than being normalized into another
   * authority boundary.
   */
  {
    const result = inferLegacyLanguageRoot(
      makeLanguage({
        morphemeFolder: "../Outside/Morphemes",
      }),
    );

    assert.equal(result.status, "unresolved");
    assert.equal(result.reason, "invalid-source-path");
  }

  /*
   * A canonical source anywhere beneath the owned language tree is
   * structurally valid. Workbench does not require every creator folder to be
   * one of the standard six onboarding folders.
   */
  {
    assert.deepEqual(
      validateCanonicalSourceWithinRoot(
        "Languages/Test Language",
        "Languages/Test Language/Grammar/Reference",
      ),
      { status: "valid" },
    );
  }

  /*
   * The language root itself is an ownership boundary, not an inventory
   * source. Accepting it would let recursive inventory loaders inspect
   * unrelated creator documentation anywhere beneath the language root.
   */
  {
    const result = validateCanonicalSourceWithinRoot(
      "Languages/Test Language",
      "Languages/Test Language",
    );

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "outside-language-root");
    assert.match(result.detail, /not the root folder itself/);
  }

  /*
   * A source pointed into another sibling language tree is a structural
   * ownership violation.
   */
  {
    const result = validateCanonicalSourceWithinRoot(
      "Languages/Test Language",
      "Languages/Language 3/Lexicon",
    );

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "outside-language-root");
  }

  /*
   * Configured language roots are exclusive ownership boundaries.
   */
  {
    assert.equal(languageRootsOverlap("Languages/Mer", "Languages/Mer"), true);

    assert.equal(
      languageRootsOverlap(
        "Languages/Mer",
        "Languages/Mer/Historical Daughter",
      ),
      true,
    );

    assert.equal(
      languageRootsOverlap("Languages/Mer", "Languages/Language 3"),
      false,
    );
  }

  /*
   * Inactive languages are proactively protected too. A nonexistent source
   * cannot be persisted merely because no runtime reload would occur.
   */
  {
    const language = makeLanguage({
      rootFolder: "Languages/Test Language",
    });

    const result = validateLanguageSourceChange({
      language,
      languages: [language],
      setting: "dictionaryFolder",
      value: "Languages/Test Language/Missing",
      pathState: (path) =>
        path === "Languages/Test Language" ? "folder" : "missing",
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "missing-source");
  }

  /*
   * A real folder outside Languages/Test Language remains unauthorized. This
   * covers the sibling Made Up Words test fixture: existence is not authority.
   */
  {
    const language = makeLanguage({
      rootFolder: "Languages/Test Language",
    });

    const result = validateLanguageSourceChange({
      language,
      languages: [language],
      setting: "dictionaryFolder",
      value: "Made Up Words/Examples",
      pathState: () => "folder",
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "outside-language-root");
  }

  /*
   * Another configured language reserves its root regardless of activation.
   */
  {
    const language = makeLanguage({
      rootFolder: "Languages/Test Language",
    });

    const other = {
      name: "Other Language",
      rootFolder: "Languages/Test Language",
      dictionaryFolder: "Languages/Test Language/Other Lexicon",
      sheets: [],
      hoverEnabled: true,
    };

    const result = validateLanguageSourceChange({
      language,
      languages: [language, other],
      setting: "dictionaryFolder",
      value: "Languages/Test Language/Lexicon",
      pathState: () => "folder",
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.reason, "root-conflict");
    assert.match(result.detail, /Other Language/);
  }

  /*
   * Removing an optional source relinquishes authority rather than claiming a
   * new path, so it is allowed even for an unresolved legacy configuration.
   */
  {
    const language = {
      name: "Legacy",
      dictionaryFolder: "Made Up Words/Example",
      morphemeFolder: "Made Up Words/Morphemes",
      sheets: [],
      hoverEnabled: true,
    };

    const result = validateLanguageSourceChange({
      language,
      languages: [language],
      setting: "morphemeFolder",
      value: undefined,
      pathState: () => "folder",
    });

    assert.deepEqual(result, { status: "valid" });
  }

  console.log("language root authority regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
