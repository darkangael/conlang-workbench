import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle the real decoder so these tests exercise the same boundary used by
// plugin startup without requiring an Obsidian runtime.
const result = await build({
  entryPoints: ["persisted-settings-decoder.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});

const source = result.outputFiles[0].text;
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { decodePersistedSettings } = await import(moduleUrl);

function makeLanguage(overrides = {}) {
  return {
    name: "Unusual / Creator Language",
    rootFolder: "Languages/Unusual Language",
    dictionaryFolder: "Languages/Unusual Language/Personal Lexicon",
    morphemeFolder: "Languages/Unusual Language/Grammar/Morphemes",
    hoverEnabled: false,
    sheets: [
      {
        name: "Creator's first sheet",
        enabled: true,
        rules: [
          {
            input: "",
            output: "æ",
            type: "default",
            enabled: false,
            creatorRuleMetadata: { preserve: true },
          },
        ],
        creatorSheetMetadata: "preserve this too",
      },
    ],
    inflections: [
      {
        label: "creator-defined category",
        pattern: "",
        position: "suffix",
        strip: "",
        add: "",
        enabled: false,
        description: "Unusual is not malformed.",
      },
    ],
    creatorLanguageMetadata: { preserve: ["exactly"] },
    ...overrides,
  };
}

const raw = {
  languages: [makeLanguage()],
  activeLanguages: ["Unusual / Creator Language"],
  primaryLanguage: "Unusual / Creator Language",
  hoverConlang: true,
  hoverEnglish: false,
  highlightKnownWords: true,
  highlightConlang: true,
  highlightEnglish: false,
  caseSensitiveMatching: true,
  showFormsInTooltip: false,
  creatorTopLevelMetadata: { untouched: true },
};
const originalSnapshot = JSON.stringify(raw);

const valid = decodePersistedSettings(raw);
assert.equal(valid.status, "valid");
assert.equal(JSON.stringify(raw), originalSnapshot, "raw data must not mutate");
assert.notStrictEqual(valid.settings, raw);
assert.notStrictEqual(valid.settings.languages, raw.languages);
assert.deepEqual(valid.settings.languages, raw.languages);
assert.deepEqual(
  valid.settings.creatorTopLevelMetadata,
  raw.creatorTopLevelMetadata,
  "unknown creator metadata must survive decoding",
);

// JSON can contain an own property named "__proto__". It is creator data, not
// permission to alter the prototype of the decoded settings or nested objects.
const prototypeNamedMetadata = JSON.parse(
  '{"__proto__":{"polluted":true},"languages":[]}',
);
const prototypeSafe = decodePersistedSettings(prototypeNamedMetadata);
assert.equal(prototypeSafe.status, "valid");
assert.equal(Object.getPrototypeOf(prototypeSafe.settings), Object.prototype);
assert.equal(Object.prototype.polluted, undefined);
assert.deepEqual(prototypeSafe.settings.__proto__, { polluted: true });

// Missing top-level fields belong to compatibility/default merging. They do
// not make a structurally valid older settings object malformed.
const older = decodePersistedSettings({
  languages: [makeLanguage({ rootFolder: undefined })],
  activeLanguage: "Unusual / Creator Language",
});
assert.equal(older.status, "valid");
assert.equal(older.settings.hoverModifier, "shift");

// Portable linguistic IDs are an optional per-language generation policy.
// Older language configurations may omit the field entirely. Workbench must
// not invent a persisted value merely while decoding those settings; the
// feature boundary treats absence as automatic generation being disabled.
const portableIdsAbsent = decodePersistedSettings({
  languages: [makeLanguage()],
});
assert.equal(portableIdsAbsent.status, "valid");
assert.equal(
  portableIdsAbsent.settings.languages[0].includePortableIds,
  undefined,
  "legacy language settings should remain valid without inventing an ID policy",
);

// Both actual boolean choices are valid creator configuration and must survive
// decoding exactly. The setting controls FUTURE automatic ID generation only;
// these decoder tests deliberately grant no authority to modify source notes.
const portableIdsEnabled = decodePersistedSettings({
  languages: [makeLanguage({ includePortableIds: true })],
});
assert.equal(portableIdsEnabled.status, "valid");
assert.equal(portableIdsEnabled.settings.languages[0].includePortableIds, true);

const portableIdsDisabled = decodePersistedSettings({
  languages: [makeLanguage({ includePortableIds: false })],
});
assert.equal(portableIdsDisabled.status, "valid");
assert.equal(
  portableIdsDisabled.settings.languages[0].includePortableIds,
  false,
);

// A representation such as the string "true" must not be coerced into an
// authority-bearing boolean preference. Persisted structural uncertainty fails
// closed at the exact language field.
const malformedPortableIds = {
  languages: [makeLanguage({ includePortableIds: "true" })],
};
const malformedPortableIdsSnapshot = JSON.stringify(malformedPortableIds);
const portableIdsBlocked = decodePersistedSettings(malformedPortableIds);
assert.equal(portableIdsBlocked.status, "blocked");
assert.ok(
  portableIdsBlocked.issues.some(
    (issue) => issue.path === "settings.languages[0].includePortableIds",
  ),
  "malformed portable-ID policy should identify the exact language field",
);
assert.equal(
  JSON.stringify(malformedPortableIds),
  malformedPortableIdsSnapshot,
  "rejecting a malformed portable-ID policy must not mutate persisted input",
);

// Closed-choice UI preferences retain the existing narrow normalization rule.
const closedChoice = decodePersistedSettings({
  languageMembership: "future-mode",
  hoverModifier: 42,
  commitWrapper: null,
});
assert.equal(closedChoice.status, "valid");
assert.equal(closedChoice.settings.languageMembership, "folder");
assert.equal(closedChoice.settings.hoverModifier, "shift");
assert.equal(closedChoice.settings.commitWrapper, "html-tooltip");

const malformedCases = [
  ["non-object root", [], "settings"],
  ["languages container", { languages: "Mer" }, "settings.languages"],
  ["language object", { languages: [null] }, "settings.languages[0]"],
  [
    "language name",
    { languages: [makeLanguage({ name: 42 })] },
    "settings.languages[0].name",
  ],
  [
    "source path",
    { languages: [makeLanguage({ morphemeFolder: 42 })] },
    "settings.languages[0].morphemeFolder",
  ],
  [
    "cypher sheets",
    { languages: [makeLanguage({ sheets: {} })] },
    "settings.languages[0].sheets",
  ],
  [
    "cypher rule type",
    {
      languages: [
        makeLanguage({
          sheets: [
            {
              name: "Bad",
              enabled: true,
              rules: [
                { input: "a", output: "e", type: "invented", enabled: true },
              ],
            },
          ],
        }),
      ],
    },
    "settings.languages[0].sheets[0].rules[0].type",
  ],
  [
    "inflection position",
    {
      languages: [
        makeLanguage({
          inflections: [
            {
              label: "plural",
              pattern: "s",
              position: "middle",
              strip: "s",
              add: "",
              enabled: true,
            },
          ],
        }),
      ],
    },
    "settings.languages[0].inflections[0].position",
  ],
  [
    "active language member",
    { activeLanguages: ["Mer", null] },
    "settings.activeLanguages[1]",
  ],
  [
    "runtime preference",
    { highlightKnownWords: "yes" },
    "settings.highlightKnownWords",
  ],
];

for (const [label, input, expectedPath] of malformedCases) {
  const snapshot = JSON.stringify(input);
  const decoded = decodePersistedSettings(input);
  assert.equal(decoded.status, "blocked", `${label} must block decoding`);
  assert.ok(
    decoded.issues.some((issue) => issue.path === expectedPath),
    `${label} should identify ${expectedPath}`,
  );
  assert.equal(
    JSON.stringify(input),
    snapshot,
    `${label} must preserve the rejected raw input`,
  );
}

console.log("persisted settings decoder security regression tests passed.");
