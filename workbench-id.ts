/**
 * Internal identity model for sources known to Conlang Workbench.
 *
 * Three identities are deliberately kept separate:
 *
 * - workbenchID: Workbench's handle for this known source/object;
 * - sourceID: identity of the source-side object as represented by its adapter;
 * - linguisticID: identity supplied by the language documentation.
 *
 * None of these IDs silently substitute for another. In particular, a
 * Workbench ID must never become a morpheme ID, phonological-unit ID, lemma,
 * or other linguistic identity merely because source data is malformed.
 */

export interface WorkbenchIdentity {
  workbenchID: string;
  sourceID: string;
  linguisticID?: string;
}

/**
 * Canonical structural roles owned by one configured language.
 *
 * The role is identity-bearing while the corresponding vault path is only the
 * object's current location. A language rename can therefore move Lexicon from
 * one path to another without changing which configured Lexicon Workbench means.
 */
export type ConfiguredLanguageStructureRole =
  | "lexicon"
  | "morphemes"
  | "inflections"
  | "cyphers"
  | "examples"
  | "phonology";

/**
 * Bootstrap the stable Workbench ID for a configured language.
 *
 * `name` and `authorityPath` are used only as the migration/creation seed.
 * Callers persist the returned value on LanguageConfig and MUST preserve that
 * stored value across later display-name changes, root renames, and repairs.
 *
 * Combining the inherited language name with its already-authoritative path
 * reduces accidental collisions between legacy configurations without treating
 * either mutable value as the language's permanent identity after migration.
 */
export function createConfiguredLanguageWorkbenchID(
  name: string,
  authorityPath: string,
): string {
  const normalizedName = name.trim();
  const normalizedAuthorityPath = authorityPath.trim();

  /*
   * A configured-language Workbench ID is authority-bearing internal identity.
   * Refuse incomplete seeds rather than manufacturing a degenerate identifier
   * that later code could mistake for a valid configured object.
   */
  if (!normalizedName) {
    throw new Error("configured language name must not be blank");
  }

  if (!normalizedAuthorityPath) {
    throw new Error(
      "configured language identity authority path must not be blank",
    );
  }

  return (
    `wb:language:${encodeURIComponent(normalizedName)}:` +
    encodeURIComponent(normalizedAuthorityPath)
  );
}

/**
 * Represent one configured language through the shared WorkbenchIdentity model.
 *
 * A configured language comes from persisted Workbench settings rather than an
 * Obsidian Markdown adapter, so its sourceID explicitly names that source
 * domain. No Markdown path or portable linguistic ID is fabricated here.
 */
export function createConfiguredLanguageWorkbenchIdentity(
  workbenchID: string,
): WorkbenchIdentity {
  return {
    workbenchID,
    sourceID: `settings-language:${workbenchID}`,
  };
}

/**
 * Derive one stable structural-child Workbench identity from its configured
 * language and immutable role.
 *
 * Six independent UUIDs are intentionally unnecessary. The parent identity
 * establishes which configured language owns the structure, while the role
 * distinguishes Lexicon, Morphemes, Inflections, Cyphers, Examples, and
 * Phonology. The current vault path remains separate location data.
 */
export function createConfiguredLanguageStructureIdentity(
  languageWorkbenchID: string,
  role: ConfiguredLanguageStructureRole,
): WorkbenchIdentity {
  const workbenchID = `${languageWorkbenchID}:${role}`;

  return {
    workbenchID,
    sourceID: `settings-language-structure:${workbenchID}`,
  };
}

/**
 * Create the initial identity for an Obsidian Markdown source.
 *
 * The path is currently the source system's stable-enough identity. This first
 * implementation therefore changes identity when a note is moved or renamed.
 * Keeping construction behind this module lets Workbench adopt persistent IDs
 * later without teaching linguistic feature modules how those IDs are made.
 *
 * encodeURIComponent keeps the Workbench handle unambiguous when a vault path
 * contains spaces, punctuation, or separator-like characters.
 */
export function createObsidianWorkbenchIdentity(
  path: string,
  linguisticID?: string,
): WorkbenchIdentity {
  const sourceID = `obsidian-file:${path}`;

  return {
    workbenchID: `wb:obsidian-file:${encodeURIComponent(path)}`,
    sourceID,
    linguisticID,
  };
}
