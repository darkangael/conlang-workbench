import type { LanguageConfig } from "./types";
import { isPathWithinFolder, validateVaultRelativePath } from "./vault-paths";

export type CanonicalInventoryKind =
  "lexicon" | "morphemes" | "examples" | "phonology";

export type CanonicalPathState = "folder" | "missing" | "other";

export interface CanonicalSourceIssue {
  kind:
    | "blank-language-name"
    | "duplicate-language-name"
    | "unknown-active-language"
    | "invalid-path"
    | "missing-folder"
    | "not-folder"
    | "overlap";

  language?: string;
  otherLanguage?: string;
  inventory?: CanonicalInventoryKind;
  path?: string;
  otherPath?: string;
  detail?: string;
}

interface CanonicalSource {
  language: string;
  languageIndex: number;
  inventory: CanonicalInventoryKind;
  path: string;
}

/**
 * Validate the canonical source authority used by a language-data reload.
 *
 * This function does not mutate settings, create folders, repair paths, or
 * choose between conflicting sources. Its only responsibility is to answer:
 * "Is it safe to rebuild runtime language indexes from this configuration?"
 *
 * `pathState` is supplied by main.ts so this module stays independent of
 * Obsidian runtime classes and can be regression-tested as ordinary TypeScript.
 */
export function preflightLanguageSources(
  languages: LanguageConfig[],
  activeLanguageNames: string[],
  pathState: (path: string) => CanonicalPathState,
): CanonicalSourceIssue[] {
  const issues: CanonicalSourceIssue[] = [];

  // Language names are still the alpha-era runtime identity. Blank or duplicate
  // names therefore make active/primary routing ambiguous. Diagnose them rather
  // than silently inventing or rewriting an identity.
  const seenNames = new Map<string, number>();

  languages.forEach((language, index) => {
    const name = language.name;

    if (!name.trim()) {
      issues.push({
        kind: "blank-language-name",
        language: name,
      });
      return;
    }

    const prior = seenNames.get(name);
    if (prior !== undefined) {
      issues.push({
        kind: "duplicate-language-name",
        language: name,
      });
      return;
    }

    seenNames.set(name, index);
  });

  const configuredNames = new Set(languages.map((language) => language.name));

  // Active-language references are persisted by name in the inherited alpha
  // settings model. If one points at a language that no longer exists, do not
  // silently drop it during reload: that would hide a routing/configuration
  // problem and make the loaded state differ from the creator's saved intent.
  for (const activeLanguage of activeLanguageNames) {
    if (!configuredNames.has(activeLanguage)) {
      issues.push({
        kind: "unknown-active-language",
        language: activeLanguage,
      });
    }
  }

  const activeNames = new Set(activeLanguageNames);
  const sources: CanonicalSource[] = [];

  languages.forEach((language, languageIndex) => {
    if (!activeNames.has(language.name)) return;

    const configured: Array<{
      inventory: CanonicalInventoryKind;
      path: string | undefined;
      required: boolean;
    }> = [
      {
        inventory: "lexicon",
        path: language.dictionaryFolder,
        required: true,
      },
      {
        inventory: "morphemes",
        path: language.morphemeFolder,
        required: false,
      },
      {
        inventory: "examples",
        path: language.exampleFolder,
        required: false,
      },
      {
        inventory: "phonology",
        path: language.phonologyFolder,
        required: false,
      },
    ];

    for (const source of configured) {
      // Legacy optional inventories remain optional. A configured optional path,
      // however, becomes an asserted canonical source and must be valid.
      if (!source.required && !source.path?.trim()) continue;

      const rawPath = source.path ?? "";

      let safePath: string;
      try {
        safePath = validateVaultRelativePath(rawPath);
      } catch (error) {
        issues.push({
          kind: "invalid-path",
          language: language.name,
          inventory: source.inventory,
          path: rawPath,
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const state = pathState(safePath);

      if (state === "missing") {
        issues.push({
          kind: "missing-folder",
          language: language.name,
          inventory: source.inventory,
          path: safePath,
        });
        continue;
      }

      if (state === "other") {
        issues.push({
          kind: "not-folder",
          language: language.name,
          inventory: source.inventory,
          path: safePath,
        });
        continue;
      }

      sources.push({
        language: language.name,
        languageIndex,
        inventory: source.inventory,
        path: safePath,
      });
    }
  });

  // Different inventory kinds may legitimately be nested. For example, a
  // creator is free to organize non-Workbench material however they like.
  // What is unsafe is two different languages recursively claiming the same
  // canonical inventory tree.
  for (let leftIndex = 0; leftIndex < sources.length; leftIndex++) {
    const left = sources[leftIndex];

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sources.length;
      rightIndex++
    ) {
      const right = sources[rightIndex];

      if (left.languageIndex === right.languageIndex) continue;
      if (left.inventory !== right.inventory) continue;

      if (
        isPathWithinFolder(left.path, right.path) ||
        isPathWithinFolder(right.path, left.path)
      ) {
        issues.push({
          kind: "overlap",
          language: left.language,
          otherLanguage: right.language,
          inventory: left.inventory,
          path: left.path,
          otherPath: right.path,
        });
      }
    }
  }

  return issues;
}
