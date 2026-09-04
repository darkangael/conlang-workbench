import {
  DEFAULT_SETTINGS,
  type ConlangSettings,
  type CypherRule,
  type CypherSheet,
  type InflectionRule,
  type LanguageConfig,
} from "./types";
import { normalizeClosedChoiceSettings } from "./settings-validation";

/**
 * One exact place where persisted settings failed their runtime contract.
 *
 * `path` uses familiar property/index notation so a diagnostic can point to
 * the damaged value without printing or rewriting the creator's content.
 */
export interface PersistedSettingsIssue {
  path: string;
  expected: string;
  actual: string;
}

export type PersistedSettingsDecodeResult =
  | {
      status: "valid";
      settings: ConlangSettings;
    }
  | {
      status: "blocked";
      issues: PersistedSettingsIssue[];
    };

type RuntimeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RuntimeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeRuntimeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function addTypeIssue(
  issues: PersistedSettingsIssue[],
  path: string,
  expected: string,
  value: unknown,
): void {
  issues.push({
    path,
    expected,
    actual: describeRuntimeValue(value),
  });
}

function validateOptionalString(
  owner: RuntimeRecord,
  key: string,
  path: string,
  issues: PersistedSettingsIssue[],
): void {
  if (owner[key] !== undefined && typeof owner[key] !== "string") {
    addTypeIssue(issues, `${path}.${key}`, "string", owner[key]);
  }
}

function validateRequiredString(
  owner: RuntimeRecord,
  key: string,
  path: string,
  issues: PersistedSettingsIssue[],
): void {
  if (typeof owner[key] !== "string") {
    addTypeIssue(issues, `${path}.${key}`, "string", owner[key]);
  }
}

function validateRequiredBoolean(
  owner: RuntimeRecord,
  key: string,
  path: string,
  issues: PersistedSettingsIssue[],
): void {
  if (typeof owner[key] !== "boolean") {
    addTypeIssue(issues, `${path}.${key}`, "boolean", owner[key]);
  }
}

function validateCypherRule(
  value: unknown,
  path: string,
  issues: PersistedSettingsIssue[],
): value is CypherRule {
  if (!isRecord(value)) {
    addTypeIssue(issues, path, "object", value);
    return false;
  }

  validateRequiredString(value, "input", path, issues);
  validateRequiredString(value, "output", path, issues);
  validateRequiredBoolean(value, "enabled", path, issues);

  if (
    value.type !== "word" &&
    value.type !== "prefix" &&
    value.type !== "suffix" &&
    value.type !== "default"
  ) {
    addTypeIssue(
      issues,
      `${path}.type`,
      '"word", "prefix", "suffix", or "default"',
      value.type,
    );
  }

  return true;
}

function validateCypherSheet(
  value: unknown,
  path: string,
  issues: PersistedSettingsIssue[],
): value is CypherSheet {
  if (!isRecord(value)) {
    addTypeIssue(issues, path, "object", value);
    return false;
  }

  validateRequiredString(value, "name", path, issues);
  validateRequiredBoolean(value, "enabled", path, issues);

  if (!Array.isArray(value.rules)) {
    addTypeIssue(issues, `${path}.rules`, "array", value.rules);
  } else {
    value.rules.forEach((rule, index) => {
      validateCypherRule(rule, `${path}.rules[${index}]`, issues);
    });
  }

  return true;
}

function validateInflectionRule(
  value: unknown,
  path: string,
  issues: PersistedSettingsIssue[],
): value is InflectionRule {
  if (!isRecord(value)) {
    addTypeIssue(issues, path, "object", value);
    return false;
  }

  validateRequiredString(value, "label", path, issues);
  validateRequiredString(value, "pattern", path, issues);
  validateRequiredString(value, "strip", path, issues);
  validateRequiredString(value, "add", path, issues);
  validateRequiredBoolean(value, "enabled", path, issues);
  validateOptionalString(value, "pos", path, issues);
  validateOptionalString(value, "description", path, issues);

  if (value.position !== "suffix" && value.position !== "prefix") {
    addTypeIssue(
      issues,
      `${path}.position`,
      '"suffix" or "prefix"',
      value.position,
    );
  }

  return true;
}

function validateLanguage(
  value: unknown,
  path: string,
  issues: PersistedSettingsIssue[],
): value is LanguageConfig {
  if (!isRecord(value)) {
    addTypeIssue(issues, path, "object", value);
    return false;
  }

  validateRequiredString(value, "name", path, issues);
  validateRequiredString(value, "dictionaryFolder", path, issues);

  /*
   * Older LanguageConfig objects legitimately predate stable configured-language
   * identity, so absence remains a compatibility case handled by migration.
   *
   * A PRESENT malformed value is different. Runtime code will use workbenchID
   * as object identity, so persisted uncertainty must fail closed rather than
   * being coerced into or silently replaced by a newly manufactured identity.
   */
  validateOptionalString(value, "workbenchID", path, issues);

  /*
   * Absence is the legacy compatibility case. A present blank string is not:
   * it claims that configured-language identity exists while supplying no
   * usable identity. Reject it here rather than letting migration silently
   * manufacture a replacement for malformed persisted authority.
   */
  if (
    typeof value.workbenchID === "string" &&
    value.workbenchID.trim().length === 0
  ) {
    issues.push({
      path: `${path}.workbenchID`,
      expected: "nonblank string",
      actual: "blank string",
    });
  }

  validateRequiredBoolean(value, "hoverEnabled", path, issues);

  // Older persisted language configurations legitimately omit this preference.
  // When it is present, however, require an actual boolean rather than
  // coercing another representation into configuration that can later affect
  // what Workbench writes into newly generated creator notes.
  if (value.includePortableIds !== undefined) {
    validateRequiredBoolean(value, "includePortableIds", path, issues);
  }

  validateOptionalString(value, "rootFolder", path, issues);
  validateOptionalString(value, "morphemeFolder", path, issues);
  validateOptionalString(value, "exampleFolder", path, issues);
  validateOptionalString(value, "phonologyFolder", path, issues);
  validateOptionalString(value, "profilePath", path, issues);

  if (!Array.isArray(value.sheets)) {
    addTypeIssue(issues, `${path}.sheets`, "array", value.sheets);
  } else {
    value.sheets.forEach((sheet, index) => {
      validateCypherSheet(sheet, `${path}.sheets[${index}]`, issues);
    });
  }

  if (value.inflections !== undefined) {
    if (!Array.isArray(value.inflections)) {
      addTypeIssue(issues, `${path}.inflections`, "array", value.inflections);
    } else {
      value.inflections.forEach((rule, index) => {
        validateInflectionRule(rule, `${path}.inflections[${index}]`, issues);
      });
    }
  }

  return true;
}

/**
 * Clone JSON-compatible persisted data before migration or normalization.
 *
 * Obsidian's loadData() returns ordinary JSON data. A separate candidate is
 * essential because migration is allowed to update safe runtime settings, but
 * it must never alter the preserved raw representation used for diagnostics.
 */
function clonePersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => clonePersistedValue(item));
  }

  if (isRecord(value)) {
    const clone: RuntimeRecord = {};
    for (const [key, item] of Object.entries(value)) {
      /*
       * Define an own data property rather than assigning by key. In
       * particular, a JSON key named "__proto__" must remain inert creator
       * metadata instead of invoking Object.prototype's legacy setter.
       */
      Object.defineProperty(clone, key, {
        value: clonePersistedValue(item),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return clone;
  }

  return value;
}

/**
 * Decode untrusted persisted plugin data into settings that runtime code may
 * safely consume.
 *
 * This boundary validates representation only. It deliberately does not trim,
 * rename, discard, reorder, or otherwise reinterpret creator-authored names,
 * paths, sheets, or linguistic rules. Semantic/path authority remains with
 * the existing migration and language-source preflight stages.
 *
 * Missing top-level properties retain their documented defaults for backward
 * compatibility. Present creator structures must have the runtime shapes that
 * their consumers require. A malformed structure blocks the entire decode;
 * no partial language list is manufactured and nothing is persisted.
 */
export function decodePersistedSettings(
  raw: unknown,
): PersistedSettingsDecodeResult {
  if (raw !== null && raw !== undefined && !isRecord(raw)) {
    return {
      status: "blocked",
      issues: [
        {
          path: "settings",
          expected: "object",
          actual: describeRuntimeValue(raw),
        },
      ],
    };
  }

  const record: RuntimeRecord = raw ?? {};
  const issues: PersistedSettingsIssue[] = [];

  if (record.languages !== undefined) {
    if (!Array.isArray(record.languages)) {
      addTypeIssue(issues, "settings.languages", "array", record.languages);
    } else {
      record.languages.forEach((language, index) => {
        validateLanguage(language, `settings.languages[${index}]`, issues);
      });
    }
  }

  if (record.activeLanguages !== undefined) {
    if (!Array.isArray(record.activeLanguages)) {
      addTypeIssue(
        issues,
        "settings.activeLanguages",
        "array of strings",
        record.activeLanguages,
      );
    } else {
      record.activeLanguages.forEach((name, index) => {
        if (typeof name !== "string") {
          addTypeIssue(
            issues,
            `settings.activeLanguages[${index}]`,
            "string",
            name,
          );
        }
      });
    }
  }

  const optionalStrings = ["primaryLanguage", "activeLanguage"] as const;
  for (const key of optionalStrings) {
    validateOptionalString(record, key, "settings", issues);
  }

  const optionalBooleans = [
    "hoverConlang",
    "hoverEnglish",
    "hasSeenWelcome",
    "highlightKnownWords",
    "highlightConlang",
    "highlightEnglish",
    "caseSensitiveMatching",
    "showFormsInTooltip",
  ] as const;
  for (const key of optionalBooleans) {
    if (record[key] !== undefined && typeof record[key] !== "boolean") {
      addTypeIssue(issues, `settings.${key}`, "boolean", record[key]);
    }
  }

  if (issues.length > 0) {
    return { status: "blocked", issues };
  }

  /*
   * Clone BOTH sides of the merge. This avoids sharing DEFAULT_SETTINGS'
   * nested language/rule objects with migration and also preserves `raw` as an
   * untouched diagnostic source when the caller retains it.
   */
  const settingsRecord = clonePersistedValue(DEFAULT_SETTINGS) as RuntimeRecord;
  const persistedClone = clonePersistedValue(record) as RuntimeRecord;

  for (const [key, value] of Object.entries(persistedClone)) {
    /*
     * Match the decoder's safe cloning rule during the top-level default
     * merge. Object.assign() would interpret an own "__proto__" key through a
     * legacy setter on ordinary objects instead of preserving it as data.
     */
    Object.defineProperty(settingsRecord, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  const settings = settingsRecord as unknown as ConlangSettings;

  // Closed-choice UI preferences are safe to restore to documented defaults.
  // This narrow existing authority never rewrites creator linguistic content.
  normalizeClosedChoiceSettings(settings);

  return { status: "valid", settings };
}
