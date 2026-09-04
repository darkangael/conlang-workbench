import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "conlang-root-action-"));

try {
  const outputFile = join(tempDir, "language-root-action.mjs");

  await build({
    entryPoints: ["language-root-action.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outputFile,
    logLevel: "silent",
  });

  const { chooseLanguageRootAction } = await import(
    `${pathToFileURL(outputFile).href}?t=${Date.now()}`
  );

  const root = "Languages/Test Language";

  /*
   * A valid configured root that currently exists as a folder presents Repair.
   * The helper receives only the abstract filesystem classification and has no
   * Obsidian mutation capability of its own.
   */
  {
    let observedRoot;

    const result = chooseLanguageRootAction(root, (candidate) => {
      observedRoot = candidate;
      return "folder";
    });

    assert.deepEqual(result, {
      status: "repair",
      root,
    });
    assert.equal(observedRoot, root);
  }

  /*
   * A valid configured root that is physically absent presents Recreate rather
   * than Repair. Actual recreation still requires the separate authoritative
   * transaction and confirmation boundary.
   */
  {
    const result = chooseLanguageRootAction(root, () => "missing");

    assert.deepEqual(result, {
      status: "recreate",
      root,
    });
  }

  /*
   * A non-folder occupying the exact root is a collision, not a missing-root
   * condition. Presentation must fail closed instead of offering Recreate.
   */
  {
    const result = chooseLanguageRootAction(root, () => "other");

    assert.equal(result.status, "blocked");
    assert.equal(result.root, root);
    assert.match(result.detail, /non-folder object/i);
  }

  /*
   * A configuration with no modern ownership boundary cannot present either
   * structural mutation. The filesystem callback must not even be consulted
   * because there is no validated path to inspect.
   */
  {
    let pathChecks = 0;

    const result = chooseLanguageRootAction(undefined, () => {
      pathChecks++;
      return "missing";
    });

    assert.equal(result.status, "unavailable");
    assert.equal(pathChecks, 0);
  }

  /*
   * The shared Languages container is broader authority than one language root.
   * Its absence must never be transformed into a Recreate button.
   */
  {
    let pathChecks = 0;

    const result = chooseLanguageRootAction("Languages", () => {
      pathChecks++;
      return "missing";
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.detail, /shared language container/i);
    assert.equal(pathChecks, 0);
  }

  /*
   * Nested paths are not configured language ownership boundaries. Missing
   * nested structure belongs to Repair or other explicit reconciliation after
   * a valid root has been established, not root recreation.
   */
  {
    let pathChecks = 0;

    const result = chooseLanguageRootAction(
      "Languages/Test Language/Grammar",
      () => {
        pathChecks++;
        return "missing";
      },
    );

    assert.equal(result.status, "unavailable");
    assert.match(result.detail, /one immediate child/i);
    assert.equal(pathChecks, 0);
  }

  /*
   * Paths outside the canonical Languages container carry no language-root
   * authority even when they happen to be missing in the vault.
   */
  {
    let pathChecks = 0;

    const result = chooseLanguageRootAction("Reference/Test Language", () => {
      pathChecks++;
      return "missing";
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.detail, /one immediate child/i);
    assert.equal(pathChecks, 0);
  }

  /*
   * Unsafe traversal syntax fails during shared vault-path validation before
   * any filesystem state is observed. This guards against a malformed setting
   * turning "path does not exist" into apparent recreation authority.
   */
  {
    let pathChecks = 0;

    const result = chooseLanguageRootAction("Languages/../Mer", () => {
      pathChecks++;
      return "missing";
    });

    assert.equal(result.status, "unavailable");
    assert.match(result.detail, /not a safe vault path/i);
    assert.equal(pathChecks, 0);
  }

  console.log("language root action presentation regression tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
