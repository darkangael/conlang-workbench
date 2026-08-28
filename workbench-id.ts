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
