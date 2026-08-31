import { joinVaultPath } from "./vault-paths";

/**
 * Canonical direct-child folder paths established for a modern language root.
 *
 * This structural definition is shared by onboarding and language-root repair
 * so those two authority paths cannot silently drift apart over time.
 *
 * Cyphers and Inflections are included even though their current runtime
 * configuration still lives in plugin settings. They are durable structural
 * homes reserved for the language from the moment its root is established.
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
 * Construct the standard direct-child folder tree from an already-established
 * language root without touching the vault.
 *
 * This helper deliberately does not decide whether `root` is an authorized
 * Languages/<child> boundary. Authority-sensitive callers must validate that
 * separately before using the returned paths.
 */
export function buildStandardLanguagePathsFromRoot(
  root: string,
): StandardLanguagePaths {
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
 * Construct the standard direct-child folder tree for new-language onboarding
 * without touching the vault.
 *
 * `joinVaultPath()` treats the language name as one child path component. It
 * therefore rejects names containing slash/backslash traversal rather than
 * silently sanitizing them into a different creator-visible name.
 */
export function buildStandardLanguagePaths(
  languageName: string,
): StandardLanguagePaths {
  const root = joinVaultPath("Languages", languageName);
  return buildStandardLanguagePathsFromRoot(root);
}
