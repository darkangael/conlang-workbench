import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-language-rename-"));

try {
  const outputFile = join(tempDir, "language-rename.mjs");

  await build({
    entryPoints: ["language-rename.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  await readFile(outputFile, "utf8");

  const { planLanguageRename, rewritePathForLanguageRootRename } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  const oldName = "Old Language";
  const oldRoot = `Languages/${oldName}`;

  /*
   * A normal configured language has real folders at each canonical source.
   * Tests can override individual entries to "missing" or "other" when
   * exercising fail-closed vault-state behavior.
   */
  const defaultSourceFolders = [
    `${oldRoot}/Custom Organization/Dictionary`,
    `${oldRoot}/Grammar/Morphemes`,
    `${oldRoot}/Corpus/Examples`,
    `${oldRoot}/Reference/Phonology`,
  ];

  function makeLanguage(overrides = {}) {
    return {
      name: oldName,
      rootFolder: oldRoot,
      dictionaryFolder: `${oldRoot}/Custom Organization/Dictionary`,
      morphemeFolder: `${oldRoot}/Grammar/Morphemes`,
      exampleFolder: `${oldRoot}/Corpus/Examples`,
      phonologyFolder: `${oldRoot}/Reference/Phonology`,
      profilePath: `${oldRoot}/About/Profile.md`,
      sheets: [],
      hoverEnabled: true,
      inflections: [],
      ...overrides,
    };
  }

  function makePathState(entries = {}) {
    const states = new Map([
      [oldRoot, "folder"],
      ...defaultSourceFolders.map((path) => [path, "folder"]),
      ...Object.entries(entries),
    ]);

    return (path) => states.get(path) ?? "missing";
  }

  function plan(overrides = {}) {
    const language = overrides.language ?? makeLanguage();

    return planLanguageRename({
      language,
      languages: overrides.languages ?? [language],
      proposedName: overrides.proposedName ?? "New Language",
      pathState: overrides.pathState ?? makePathState(),
    });
  }

  /*
   * Prefix rewriting preserves the creator's entire custom suffix instead of
   * rebuilding paths from standard Workbench folder names.
   */
  function testPrefixRewritePreservesCustomDescendants() {
    assert.equal(
      rewritePathForLanguageRootRename(
        `${oldRoot}/My Organization/Dictionary`,
        oldRoot,
        "Languages/New Language",
      ),
      "Languages/New Language/My Organization/Dictionary",
    );

    assert.equal(
      rewritePathForLanguageRootRename(
        oldRoot,
        oldRoot,
        "Languages/New Language",
      ),
      "Languages/New Language",
    );

    assert.equal(
      rewritePathForLanguageRootRename(
        "Reference/Shared Profile.md",
        oldRoot,
        "Languages/New Language",
      ),
      "Reference/Shared Profile.md",
    );
  }

  /*
   * A normal plan rewrites every canonical descendant plus an in-root profile
   * while preserving each custom descendant suffix.
   */
  function testSuccessfulPlanPreservesCustomOrganization() {
    const result = plan();

    assert.equal(result.status, "planned");
    assert.deepEqual(result, {
      status: "planned",
      oldName,
      newName: "New Language",
      oldRoot,
      newRoot: "Languages/New Language",
      configuration: {
        name: "New Language",
        rootFolder: "Languages/New Language",
        dictionaryFolder:
          "Languages/New Language/Custom Organization/Dictionary",
        morphemeFolder: "Languages/New Language/Grammar/Morphemes",
        exampleFolder: "Languages/New Language/Corpus/Examples",
        phonologyFolder: "Languages/New Language/Reference/Phonology",
        profilePath: "Languages/New Language/About/Profile.md",
      },
    });
  }

  function testExternalProfileIsPreservedExactly() {
    const language = makeLanguage({
      profilePath: "Reference/Shared Profile.md",
    });

    const result = plan({ language });

    assert.equal(result.status, "planned");
    assert.equal(
      result.configuration.profilePath,
      "Reference/Shared Profile.md",
    );
  }

  function testMissingExplicitRootBlocksRename() {
    const language = makeLanguage({ rootFolder: undefined });
    const result = plan({ language });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "root-unresolved");
  }

  function testMissingCurrentRootBlocksRename() {
    const result = plan({
      pathState: makePathState({
        [oldRoot]: "missing",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "missing-current-root");
  }

  function testCurrentRootMustBeFolder() {
    const result = plan({
      pathState: makePathState({
        [oldRoot]: "other",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "current-root-not-folder");
  }

  /*
   * Another configured language's structural claim remains authoritative even
   * if that other language is inactive or otherwise malformed.
   */
  function testOtherConfiguredRootClaimBlocksDestination() {
    const language = makeLanguage();
    const other = makeLanguage({
      name: "Other Config",
      rootFolder: "Languages/New Language",
      dictionaryFolder: "Languages/New Language/Lexicon",
    });

    const result = plan({
      language,
      languages: [language, other],
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "destination-root-conflict");
  }

  /*
   * An existing unconfigured immediate child is occupied structurally even
   * though no LanguageConfig claims it. Rename cannot silently adopt it.
   */
  function testExistingUnconfiguredDestinationBlocksRename() {
    const result = plan({
      pathState: makePathState({
        "Languages/New Language": "folder",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "destination-root-occupied");
  }

  function testFileAtDestinationBlocksRename() {
    const result = plan({
      pathState: makePathState({
        "Languages/New Language": "other",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "destination-root-not-folder");
  }

  function testDuplicateConfiguredNameBlocksBeforeMutationPlanning() {
    const language = makeLanguage();
    const other = makeLanguage({
      name: "New Language",
      rootFolder: "Languages/Other Root",
      dictionaryFolder: "Languages/Other Root/Lexicon",
    });

    const result = plan({
      language,
      languages: [language, other],
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-name-duplicate");
  }

  /*
   * A slash in the requested display name would create nested structural
   * territory. The standard path builder rejects it rather than sanitizing it
   * into a surprising or ambiguous root.
   */
  function testNestedDestinationNameIsRejected() {
    const result = plan({
      proposedName: "Parent/Child",
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-destination-root");
  }

  /*
   * Rename may move only a configuration whose canonical inventories already
   * belong to its established root. Malformed cross-root configuration must be
   * repaired explicitly rather than carried forward.
   */
  function testCanonicalSourceOutsideCurrentRootBlocksRename() {
    const language = makeLanguage({
      dictionaryFolder: "Languages/Other Language/Lexicon",
    });

    const result = plan({ language });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-dictionary-source");
  }

  function testCanonicalSourceCannotEqualLanguageRoot() {
    const language = makeLanguage({
      exampleFolder: oldRoot,
    });

    const result = plan({ language });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-example-source");
  }

  function testOptionalCanonicalSourcesRemainUndefined() {
    const language = makeLanguage({
      morphemeFolder: undefined,
      exampleFolder: undefined,
      phonologyFolder: undefined,
    });

    const result = plan({ language });

    assert.equal(result.status, "planned");
    assert.equal(result.configuration.morphemeFolder, undefined);
    assert.equal(result.configuration.exampleFolder, undefined);
    assert.equal(result.configuration.phonologyFolder, undefined);
  }

  /*
   * Existing H3 semantics treat blank optional canonical sources as absent.
   * Rename preserves those values rather than interpreting them as vault paths
   * or silently normalizing unrelated configuration.
   */
  function testBlankOptionalCanonicalSourcesRemainAbsent() {
    const language = makeLanguage({
      morphemeFolder: "",
      exampleFolder: "   ",
      phonologyFolder: undefined,
    });

    const result = plan({ language });

    assert.equal(result.status, "planned");
    assert.equal(result.configuration.morphemeFolder, "");
    assert.equal(result.configuration.exampleFolder, "   ");
    assert.equal(result.configuration.phonologyFolder, undefined);
  }

  /*
   * Structural containment is not enough. A configured canonical source must
   * currently exist as a folder before the owned root can be renamed.
   */
  function testMissingDictionarySourceBlocksRename() {
    const dictionaryFolder = `${oldRoot}/Custom Organization/Dictionary`;
    const language = makeLanguage({ dictionaryFolder });

    const result = plan({
      language,
      pathState: makePathState({
        [dictionaryFolder]: "missing",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-dictionary-source");
  }

  function testOptionalCanonicalSourceMustBeFolder() {
    const exampleFolder = `${oldRoot}/Corpus/Examples`;
    const language = makeLanguage({ exampleFolder });

    const result = plan({
      language,
      pathState: makePathState({
        [exampleFolder]: "other",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-example-source");
  }

  function testUnsafeProfilePathBlocksRatherThanDisappears() {
    const language = makeLanguage({
      profilePath: "../Outside.md",
    });

    const result = plan({ language });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "invalid-profile-path");
  }

  function testWhitespaceIsTrimmedOnceForIdentityAndRoot() {
    const result = plan({
      proposedName: "  New Language  ",
    });

    assert.equal(result.status, "planned");
    assert.equal(result.newName, "New Language");
    assert.equal(result.newRoot, "Languages/New Language");
  }

  testPrefixRewritePreservesCustomDescendants();
  testSuccessfulPlanPreservesCustomOrganization();
  testExternalProfileIsPreservedExactly();
  testMissingExplicitRootBlocksRename();
  testMissingCurrentRootBlocksRename();
  testCurrentRootMustBeFolder();
  testOtherConfiguredRootClaimBlocksDestination();
  testExistingUnconfiguredDestinationBlocksRename();
  testFileAtDestinationBlocksRename();
  testDuplicateConfiguredNameBlocksBeforeMutationPlanning();
  testNestedDestinationNameIsRejected();
  testCanonicalSourceOutsideCurrentRootBlocksRename();
  testCanonicalSourceCannotEqualLanguageRoot();
  testOptionalCanonicalSourcesRemainUndefined();
  testBlankOptionalCanonicalSourcesRemainAbsent();
  testMissingDictionarySourceBlocksRename();
  testOptionalCanonicalSourceMustBeFolder();
  testUnsafeProfilePathBlocksRatherThanDisappears();
  testWhitespaceIsTrimmedOnceForIdentityAndRoot();

  console.log("language rename planner regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
