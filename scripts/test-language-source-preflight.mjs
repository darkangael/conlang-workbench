import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-source-preflight-"));

try {
  await build({
    entryPoints: ["language-source-preflight.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "language-source-preflight.mjs");
  await readFile(modulePath, "utf8");

  const { preflightLanguageSources } = await import(
    `${pathToFileURL(modulePath).href}?v=${Date.now()}`
  );

  const baseLanguage = {
    name: "Test Language",
    dictionaryFolder: "Languages/Test Language/Lexicon",
    morphemeFolder: "Languages/Test Language/Morphemes",
    exampleFolder: "Languages/Test Language/Examples",
    phonologyFolder: "Languages/Test Language/Phonology",
    hoverEnabled: true,
    sheets: [],
  };

  const daughter = {
    ...baseLanguage,
    name: "Test Language 2",
    dictionaryFolder: "Languages/Test Language 2/Lexicon",
    morphemeFolder: "Languages/Test Language 2/Morphemes",
    exampleFolder: "Languages/Test Language 2/Examples",
    phonologyFolder: "Languages/Test Language 2/Phonology",
  };

  const allFolders = () => "folder";

  assert.deepEqual(
    preflightLanguageSources(
      [baseLanguage, daughter],
      [baseLanguage.name, daughter.name],
      allFolders,
    ),
    [],
    "independent canonical source trees should pass",
  );

  const legacy = {
    name: "Legacy Language",
    dictionaryFolder: "Languages/Legacy Language/Lexicon",
    hoverEnabled: true,
    sheets: [],
  };

  assert.deepEqual(
    preflightLanguageSources([legacy], [legacy.name], (path) =>
      path === "Languages/Legacy Language/Lexicon" ? "folder" : "missing",
    ),
    [],
    "legacy languages may omit optional inventory folders",
  );

  {
    const issues = preflightLanguageSources(
      [baseLanguage],
      [baseLanguage.name],
      (path) => (path.endsWith("/Examples") ? "missing" : "folder"),
    );

    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, "missing-folder");
    assert.equal(issues[0].inventory, "examples");
  }

  {
    const issues = preflightLanguageSources(
      [baseLanguage],
      [baseLanguage.name],
      (path) => (path.endsWith("/Phonology") ? "other" : "folder"),
    );

    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, "not-folder");
    assert.equal(issues[0].inventory, "phonology");
  }

  {
    const invalid = {
      ...legacy,
      dictionaryFolder: "../Outside/Lexicon",
    };

    const issues = preflightLanguageSources(
      [invalid],
      [invalid.name],
      allFolders,
    );

    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, "invalid-path");
  }

  {
    const conflict = {
      ...daughter,
      dictionaryFolder: baseLanguage.dictionaryFolder,
    };

    const issues = preflightLanguageSources(
      [baseLanguage, conflict],
      [baseLanguage.name, conflict.name],
      allFolders,
    );

    assert.ok(
      issues.some(
        (issue) => issue.kind === "overlap" && issue.inventory === "lexicon",
      ),
      "two languages must not claim the same lexicon root",
    );
  }

  {
    const nested = {
      ...daughter,
      dictionaryFolder: "Languages/Test Language/Lexicon/Historical Daughter",
    };

    const issues = preflightLanguageSources(
      [baseLanguage, nested],
      [baseLanguage.name, nested.name],
      allFolders,
    );

    assert.ok(
      issues.some(
        (issue) => issue.kind === "overlap" && issue.inventory === "lexicon",
      ),
      "ancestor/descendant lexicon roots must conflict",
    );
  }

  {
    const crossKind = {
      ...daughter,
      // Different inventory kinds are allowed to be nested because the overlap
      // rule exists to prevent two languages claiming the SAME recursive index.
      morphemeFolder: "Languages/Test Language/Lexicon/Documented Morphemes",
    };

    const issues = preflightLanguageSources(
      [baseLanguage, crossKind],
      [baseLanguage.name, crossKind.name],
      allFolders,
    );

    assert.equal(
      issues.some((issue) => issue.kind === "overlap"),
      false,
      "different inventory kinds must not be rejected merely for nesting",
    );
  }

  {
    const blank = {
      ...daughter,
      name: "   ",
    };

    const issues = preflightLanguageSources(
      [baseLanguage, blank],
      [baseLanguage.name],
      allFolders,
    );

    assert.ok(
      issues.some((issue) => issue.kind === "blank-language-name"),
      "blank runtime language identities must fail closed",
    );
  }

  {
    const issues = preflightLanguageSources(
      [baseLanguage],
      [baseLanguage.name, "Moved Language"],
      allFolders,
    );

    assert.ok(
      issues.some(
        (issue) =>
          issue.kind === "unknown-active-language" &&
          issue.language === "Moved Language",
      ),
      "stale active-language references must fail closed instead of disappearing",
    );
  }

  {
    const duplicate = {
      ...daughter,
      name: baseLanguage.name,
    };

    const issues = preflightLanguageSources(
      [baseLanguage, duplicate],
      [baseLanguage.name],
      allFolders,
    );

    assert.ok(
      issues.some((issue) => issue.kind === "duplicate-language-name"),
      "duplicate runtime language identities must fail closed",
    );
  }

  console.log("language source preflight regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
