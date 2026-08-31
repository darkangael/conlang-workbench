import { App } from "obsidian";
import type { LanguageConfig } from "./types";
import {
  ensureVaultFolderStrict,
  inspectVaultFolderPaths,
} from "./vault-folder-writer";
import { isPathWithinFolder, joinVaultPath } from "./vault-paths";

/**
 * Canonical folder paths established for every language created through the
 * modern Workbench onboarding flow.
 *
 * Cyphers and Inflections are created now even though their current runtime
 * configuration still lives in plugin settings. Establishing those durable
 * homes early prevents Workbench from later claiming folder names that a
 * creator may already have begun using for something else.
 */
export interface StandardLanguagePaths {
  root: string;
  lexicon: string;
  morphemes: string;
  inflections: string;
  cyphers: string;
  examples: string;
  phonology: string;
}

/**
 * Creation deliberately distinguishes an authority refusal from an operational
 * failure.
 *
 * "blocked" means Workbench established before mutation that it did not have a
 * safe destination. "failed" means preflight succeeded, but a later vault
 * operation failed while establishing the additive folder structure.
 */
export type StandardLanguageCreationResult =
  | {
      status: "created";
      language: LanguageConfig;
      paths: StandardLanguagePaths;
    }
  | {
      status: "blocked" | "failed";
      error: string;
    };

interface ConfiguredInventoryPath {
  inventory: "lexicon" | "morphemes" | "examples" | "phonology";
  path: string;
}

/**
 * Construct the standard folder tree without touching the vault.
 *
 * `joinVaultPath()` treats the language name as one child path component. It
 * therefore rejects names containing slash/backslash traversal rather than
 * silently sanitizing them into a different creator-visible name.
 */
export function buildStandardLanguagePaths(
  languageName: string,
): StandardLanguagePaths {
  const root = joinVaultPath("Languages", languageName);

  return {
    root,
    lexicon: joinVaultPath(root, "Lexicon"),
    morphemes: joinVaultPath(root, "Morphemes"),
    inflections: joinVaultPath(root, "Inflections"),
    cyphers: joinVaultPath(root, "Cyphers"),
    examples: joinVaultPath(root, "Examples"),
    phonology: joinVaultPath(root, "Phonology"),
  };
}

/**
 * Return only the canonical inventory roots that the current LanguageConfig
 * model actually wires into runtime source loading.
 *
 * Cyphers and Inflections intentionally are absent here. Their folders are
 * reserved by onboarding now, but their sheet definitions are still stored in
 * plugin settings and will receive their own Markdown-backed design later.
 */
function configuredInventoryPaths(
  language: LanguageConfig,
): ConfiguredInventoryPath[] {
  const sources: ConfiguredInventoryPath[] = [
    {
      inventory: "lexicon",
      path: language.dictionaryFolder,
    },
  ];

  if (language.morphemeFolder?.trim()) {
    sources.push({
      inventory: "morphemes",
      path: language.morphemeFolder,
    });
  }

  if (language.exampleFolder?.trim()) {
    sources.push({
      inventory: "examples",
      path: language.exampleFolder,
    });
  }

  if (language.phonologyFolder?.trim()) {
    sources.push({
      inventory: "phonology",
      path: language.phonologyFolder,
    });
  }

  return sources;
}

/**
 * Check whether the proposed language would claim canonical source authority
 * already assigned to another configured language.
 *
 * Recursive source scanning makes ancestor/descendant overlap just as unsafe
 * as an exact match for the SAME inventory kind. For example, one language's
 * Lexicon may not sit inside another language's Lexicon, because both would
 * claim some of the same lexical Markdown.
 *
 * Different inventory kinds are deliberately independent. A phonology root
 * nested beneath another source kind is not treated as a same-inventory claim
 * here; H3's authority rule applies within each canonical inventory.
 */
function findCanonicalClaimConflict(
  candidate: LanguageConfig,
  existingLanguages: LanguageConfig[],
): string | null {
  const candidateSources = configuredInventoryPaths(candidate);

  for (const existingLanguage of existingLanguages) {
    const existingSources = configuredInventoryPaths(existingLanguage);

    for (const candidateSource of candidateSources) {
      for (const existingSource of existingSources) {
        if (candidateSource.inventory !== existingSource.inventory) {
          continue;
        }

        const overlaps =
          isPathWithinFolder(candidateSource.path, existingSource.path) ||
          isPathWithinFolder(existingSource.path, candidateSource.path);

        if (!overlaps) {
          continue;
        }

        return (
          `${candidateSource.inventory} folder "${candidateSource.path}" ` +
          `overlaps "${existingSource.path}", already configured for ` +
          `"${existingLanguage.name}"`
        );
      }
    }
  }

  return null;
}

/**
 * Establish the complete standard folder structure for a new language.
 *
 * Security/data-safety order:
 *
 * 1. Build every intended path without mutation.
 * 2. Ensure no configured language already owns overlapping same-inventory
 *    authority.
 * 3. Inspect the ENTIRE six-folder structure before creating anything.
 * 4. Only after preflight succeeds, establish missing folders additively.
 * 5. Return the configuration to the caller; this module never persists it.
 *
 * Existing valid folders are reused unchanged. Existing files are never moved,
 * renamed, deleted, or replaced.
 *
 * If an external failure occurs after creation begins, already-created folders
 * are deliberately preserved. Rollback deletion would be unsafe because
 * creator or concurrent data could have appeared inside them during an awaited
 * vault operation.
 */
export async function createStandardLanguage(
  app: App,
  languageName: string,
  existingLanguages: LanguageConfig[],
): Promise<StandardLanguageCreationResult> {
  let paths: StandardLanguagePaths;

  try {
    paths = buildStandardLanguagePaths(languageName);
  } catch (error) {
    return {
      status: "blocked",
      error:
        "invalid language destination: " +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  /*
   * Only currently wired source kinds enter LanguageConfig. Inflections and
   * Cyphers nevertheless receive physical folders as part of the standard
   * durable language structure.
   */
  const language: LanguageConfig = {
    name: languageName,
    dictionaryFolder: paths.lexicon,
    morphemeFolder: paths.morphemes,
    exampleFolder: paths.examples,
    phonologyFolder: paths.phonology,
    hoverEnabled: true,
    sheets: [],
  };

  const conflict = findCanonicalClaimConflict(language, existingLanguages);
  if (conflict) {
    return {
      status: "blocked",
      error: conflict,
    };
  }

  const intendedFolders = [
    paths.root,
    paths.lexicon,
    paths.morphemes,
    paths.inflections,
    paths.cyphers,
    paths.examples,
    paths.phonology,
  ];

  /*
   * This entire pass is read-only. A collision at Phonology, for example, must
   * prevent Workbench from creating Lexicon/Morphemes first and discovering
   * the conflict only afterward.
   */
  const inspectionIssues = inspectVaultFolderPaths(app, intendedFolders);

  if (inspectionIssues.length > 0) {
    const issue = inspectionIssues[0];

    return {
      status: "blocked",
      error:
        `folder preflight failed for "${issue.requestedPath}": ` + issue.detail,
    };
  }

  try {
    for (const folder of intendedFolders) {
      /*
       * The strict writer re-checks authority at mutation time. That protects
       * against a vault object changing after read-only preflight but before
       * this particular awaited folder creation.
       */
      await ensureVaultFolderStrict(app, folder);
    }
  } catch (error) {
    return {
      status: "failed",
      error:
        "couldn't establish the standard language folders: " +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  return {
    status: "created",
    language,
    paths,
  };
}
