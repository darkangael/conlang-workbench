import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real decoder and migration helper independently so this
// regression exercises production code without requiring an Obsidian runtime.
//
// Each build has one entry point. Keeping them separate matches the existing
// decoder-test pattern and avoids giving esbuild an artificial output-directory
// requirement merely for this in-memory test harness.
async function importBundled(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });

  assert.equal(
    result.outputFiles.length,
    1,
    `${entryPoint} should produce exactly one in-memory bundle`,
  );

  const moduleUrl =
    "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64");

  return import(moduleUrl);
}

const { decodePersistedSettings } = await importBundled(
  "persisted-settings-decoder.ts",
);
const { migrateLanguageSelectionSettings } = await importBundled(
  "settings-migration.ts",
);

function makeLanguage(name) {
  return {
    name,
    dictionaryFolder: `Languages/${name}/Lexicon`,
    hoverEnabled: true,
    sheets: [],
  };
}

function decode(input) {
  const decoded = decodePersistedSettings(input);
  assert.equal(decoded.status, "valid");
  return decoded;
}

/*
 * Legacy two-language configuration:
 * the creator selected Second before activeLanguages/primaryLanguage existed.
 * Current defaults must not hide that persisted legacy choice.
 */
{
  const decoded = decode({
    languages: [makeLanguage("First"), makeLanguage("Second")],
    activeLanguage: "Second",
  });

  assert.equal(decoded.persistedPresence.activeLanguages, false);

  migrateLanguageSelectionSettings(decoded.settings, {
    persistedActiveLanguages: decoded.persistedPresence.activeLanguages,
  });

  assert.deepEqual(decoded.settings.activeLanguages, ["Second"]);
  assert.equal(decoded.settings.primaryLanguage, "Second");
}

/*
 * Modern activeLanguages is authoritative when it was actually persisted.
 * A stale legacy activeLanguage may coexist in an upgraded settings file, but
 * it must never regain authority over the modern field.
 */
{
  const decoded = decode({
    languages: [makeLanguage("First"), makeLanguage("Second")],
    activeLanguages: ["First"],
    primaryLanguage: "First",
    activeLanguage: "Second",
  });

  assert.equal(decoded.persistedPresence.activeLanguages, true);

  migrateLanguageSelectionSettings(decoded.settings, {
    persistedActiveLanguages: decoded.persistedPresence.activeLanguages,
  });

  assert.deepEqual(decoded.settings.activeLanguages, ["First"]);
  assert.equal(decoded.settings.primaryLanguage, "First");
}

/*
 * An explicitly persisted modern empty list is still modern state. The old
 * field must not override it; ordinary compatibility fallback chooses the
 * first configured language instead.
 */
{
  const decoded = decode({
    languages: [makeLanguage("First"), makeLanguage("Second")],
    activeLanguages: [],
    activeLanguage: "Second",
  });

  migrateLanguageSelectionSettings(decoded.settings, {
    persistedActiveLanguages: decoded.persistedPresence.activeLanguages,
  });

  assert.deepEqual(decoded.settings.activeLanguages, ["First"]);
  assert.equal(decoded.settings.primaryLanguage, "First");
}

/*
 * Unknown metadata preservation:
 * migration owns only the active/primary selection fields. Unrecognized
 * top-level and nested language metadata must survive both migration and the
 * later JSON persistence shape unchanged.
 */
{
  const decoded = decode({
    languages: [
      {
        ...makeLanguage("First"),
        creatorLanguageMetadata: {
          preserve: ["nested", "exactly"],
        },
      },
      makeLanguage("Second"),
    ],
    activeLanguage: "Second",
    creatorTopLevelMetadata: {
      untouched: true,
    },
  });

  migrateLanguageSelectionSettings(decoded.settings, {
    persistedActiveLanguages: decoded.persistedPresence.activeLanguages,
  });

  const persistedRoundTrip = JSON.parse(JSON.stringify(decoded.settings));

  assert.deepEqual(
    persistedRoundTrip.creatorTopLevelMetadata,
    { untouched: true },
    "migration and later persistence must preserve unknown top-level metadata",
  );
  assert.deepEqual(
    persistedRoundTrip.languages[0].creatorLanguageMetadata,
    { preserve: ["nested", "exactly"] },
    "migration and later persistence must preserve unknown nested language metadata",
  );
}

/*
 * Idempotency: after a migrated result is persisted in modern form, a later
 * startup must preserve that modern state instead of reapplying activeLanguage.
 */
{
  const first = decode({
    languages: [makeLanguage("First"), makeLanguage("Second")],
    activeLanguage: "Second",
  });

  migrateLanguageSelectionSettings(first.settings, {
    persistedActiveLanguages: first.persistedPresence.activeLanguages,
  });

  const persistedModern = {
    ...first.settings,
    activeLanguages: [...first.settings.activeLanguages],
  };

  const second = decode(persistedModern);
  assert.equal(second.persistedPresence.activeLanguages, true);

  migrateLanguageSelectionSettings(second.settings, {
    persistedActiveLanguages: second.persistedPresence.activeLanguages,
  });

  assert.deepEqual(second.settings.activeLanguages, ["Second"]);
  assert.equal(second.settings.primaryLanguage, "Second");
}

console.log("settings migration data-safety regression tests passed.");
