import type { LanguageConfig } from "./types";
import { isPathWithinFolder } from "./vault-paths";

/**
 * Decide whether a vault path belongs to a canonical Markdown-backed source
 * currently loaded for one of the active languages.
 *
 * This helper is intentionally observational. It does not validate or repair
 * configuration, mutate creator files, or decide whether a reload is allowed.
 * Its only job is to recognize that already-loaded runtime state may now be
 * stale and therefore needs to pass through the normal settled-state reload.
 *
 * Keep this list aligned with the canonical folder-backed inventories loaded by
 * reloadActiveLanguage() and checked by preflightLanguageSources():
 *
 *   dictionaryFolder  -> lexical entries
 *   morphemeFolder    -> morphemes
 *   exampleFolder     -> standalone linguistic examples
 *   phonologyFolder   -> phonological units and realizations
 *
 * Optional folders that are absent or blank simply do not participate. The
 * shared isPathWithinFolder() helper validates vault-relative paths and fails
 * closed, while also enforcing a real slash boundary rather than raw prefix
 * matching.
 */
export function isWatchedLanguageSourcePath(
  path: string,
  activeLanguages: readonly LanguageConfig[],
): boolean {
  return activeLanguages.some((language) => {
    const folders = [
      language.dictionaryFolder,
      language.morphemeFolder,
      language.exampleFolder,
      language.phonologyFolder,
    ];

    return folders.some((folder) => {
      /*
       * The three newer inventories are optional on legacy configurations.
       * Normalize only enough to decide whether a real configured folder
       * exists. A missing or whitespace-only value contributes no watch scope.
       *
       * Keeping this as ordinary control flow also lets TypeScript narrow
       * `folder` from `string | undefined` to `string` without a non-null
       * assertion.
       */
      const configuredFolder = folder?.trim();
      if (!configuredFolder) return false;

      return isPathWithinFolder(path, configuredFolder);
    });
  });
}
