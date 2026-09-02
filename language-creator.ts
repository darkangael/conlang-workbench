import { App, TFolder } from "obsidian";
import type { LanguageConfig } from "./types";
import {
  ensureVaultFolderStrict,
  inspectVaultFolderPaths,
} from "./vault-folder-writer";
import { isPathWithinFolder } from "./vault-paths";
import {
  buildStandardLanguagePaths,
  type StandardLanguagePaths,
} from "./language-standard-paths";
import {
  configuredLanguageRootClaims,
  languageRootsOverlap,
} from "./language-root-authority";

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
  existingLanguages: readonly LanguageConfig[],
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
 * 2. Ensure no configured language already owns the proposed structural root
 *    or overlapping same-inventory authority.
 * 3. Ensure the proposed root does not already exist independently in the
 *    vault. Existing unconfigured language roots belong to Import Language,
 *    not Add Language.
 * 4. Inspect the ENTIRE six-folder structure before creating anything.
 * 5. Only after preflight succeeds, establish missing folders additively.
 * 6. Return the configuration to the caller; this module never persists it.
 *
 * Add Language creates a new structural root. It never adopts an existing
 * Languages/<root> folder. Existing creator-authored language roots are
 * preserved for the separate explicit Import Language authority path.
 *
 * Existing folders created during the additive operation are reused when an
 * awaited concurrent operation creates them first. Existing files are never
 * moved, renamed, deleted, or replaced.
 *
 * If an external failure occurs after creation begins, already-created folders
 * are deliberately preserved. Rollback deletion would be unsafe because
 * creator or concurrent data could have appeared inside them during an awaited
 * vault operation.
 */
export async function createStandardLanguage(
  app: App,
  languageName: string,
  existingLanguages: readonly LanguageConfig[],
  includePortableIds: boolean,
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

    /*
     * Record the structural ownership boundary independently from the display
     * name. A later settings-controlled language rename therefore does not
     * silently move authority to a different vault subtree.
     */
    rootFolder: paths.root,

    dictionaryFolder: paths.lexicon,
    morphemeFolder: paths.morphemes,
    exampleFolder: paths.examples,
    phonologyFolder: paths.phonology,
    hoverEnabled: true,

    /*
     * Record the creator's explicit onboarding choice on the new language.
     *
     * This controls only whether future Workbench-generated notes should
     * automatically receive portable linguistic IDs. It does not authorize
     * changing existing creator notes and it does not control recognition of
     * IDs already present in source data.
     */
    includePortableIds,

    sheets: [],
  };

  /*
   * A configured language owns its complete Languages/<root> subtree.
   *
   * Activation does not affect that ownership. Older configurations that do
   * not yet have rootFolder still reserve any Languages/<root> tree that can
   * be proven from their canonical source paths.
   *
   * Check this before creating anything so onboarding can never take another
   * configured language's root or create a language beneath somebody else's
   * structural territory.
   */
  for (const existingLanguage of existingLanguages) {
    for (const claimedRoot of configuredLanguageRootClaims(existingLanguage)) {
      if (languageRootsOverlap(paths.root, claimedRoot)) {
        return {
          status: "blocked",
          error:
            `language root "${paths.root}" conflicts with "${claimedRoot}", ` +
            `already reserved by "${existingLanguage.name}"`,
        };
      }
    }
  }

  const conflict = findCanonicalClaimConflict(language, existingLanguages);
  if (conflict) {
    return {
      status: "blocked",
      error: conflict,
    };
  }

  /*
   * Folder existence itself carries structural ownership beneath Languages/.
   *
   * Add Language is authorized to create a NEW language root; it is not
   * authorized to adopt an existing unconfigured root merely because no
   * LanguageConfig currently claims it. Explicit adoption belongs to the
   * separate Import Language authority path.
   *
   * A non-folder collision is also refused here. The later hierarchy preflight
   * remains defense in depth for descendants and races.
   */
  const existingRoot = app.vault.getAbstractFileByPath(paths.root);

  if (existingRoot instanceof TFolder) {
    return {
      status: "blocked",
      error:
        `language root "${paths.root}" already exists but is not configured. ` +
        "Use Import Language to explicitly adopt an existing language root.",
    };
  }

  if (existingRoot) {
    return {
      status: "blocked",
      error: `language root "${paths.root}" exists but is not a folder`,
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
