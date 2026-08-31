import type { LanguageConfig } from "./types";
import { validateLanguageRename } from "./language-identity";
import {
  configuredLanguageRootClaims,
  findLanguageRootClaimConflict,
  type LanguageAuthorityPathState,
  validateCanonicalSourceWithinRoot,
  validateLanguageRoot,
} from "./language-root-authority";
import type {
  LanguageRenameConfiguration,
  LanguageRenamePlanResult,
} from "./language-rename-state";
import { buildStandardLanguagePaths } from "./language-standard-paths";
import { isPathWithinFolder, validateVaultRelativePath } from "./vault-paths";

/**
 * Rewrite one vault path when it belongs to the root being explicitly renamed.
 *
 * Equality and descendants are both supported because this helper is also used
 * for profilePath. Canonical inventory sources are separately validated to be
 * proper descendants rather than the root itself.
 *
 * The suffix is copied verbatim. We do not reconstruct creator-chosen paths
 * from standard folder names, so custom organization beneath the root survives
 * an intentional language rename.
 */
export function rewritePathForLanguageRootRename(
  path: string,
  oldRoot: string,
  newRoot: string,
): string {
  const safePath = validateVaultRelativePath(path);
  const safeOldRoot = validateVaultRelativePath(oldRoot);
  const safeNewRoot = validateVaultRelativePath(newRoot);

  if (!isPathWithinFolder(safePath, safeOldRoot)) {
    return safePath;
  }

  if (safePath === safeOldRoot) {
    return safeNewRoot;
  }

  return `${safeNewRoot}${safePath.slice(safeOldRoot.length)}`;
}

/**
 * Validate and rewrite one canonical inventory source.
 *
 * Canonical sources are stricter than profilePath: each one must already be a
 * proper descendant of the established old root. A malformed source outside
 * that root blocks rename rather than being preserved, guessed, or silently
 * reinterpreted under the new root.
 */
function rewriteCanonicalSource(
  oldRoot: string,
  newRoot: string,
  sourcePath: string,
  pathState: (path: string) => LanguageAuthorityPathState,
):
  | { status: "rewritten"; path: string }
  | { status: "blocked"; detail: string } {
  const current = validateCanonicalSourceWithinRoot(oldRoot, sourcePath);

  if (current.status === "invalid") {
    return {
      status: "blocked",
      detail: current.detail,
    };
  }

  /*
   * Containment establishes structural authority, but a vault-aware rename
   * must also prove that the currently configured source actually exists as a
   * folder before moving the root.
   *
   * This matters especially for inactive languages: they do not reload during
   * rename, so runtime preflight cannot be relied on to discover a stale or
   * non-folder canonical source afterward.
   */
  const currentState = pathState(sourcePath);

  if (currentState === "missing") {
    return {
      status: "blocked",
      detail: `Canonical source folder "${sourcePath}" does not exist.`,
    };
  }

  if (currentState === "other") {
    return {
      status: "blocked",
      detail: `Canonical source path "${sourcePath}" exists but is not a folder.`,
    };
  }

  const rewritten = rewritePathForLanguageRootRename(
    sourcePath,
    oldRoot,
    newRoot,
  );

  /*
   * Validate the result too. The prefix rewrite is deliberately simple, but
   * checking both sides keeps this planner fail-closed if path/root rules later
   * evolve independently.
   */
  const proposed = validateCanonicalSourceWithinRoot(newRoot, rewritten);

  if (proposed.status === "invalid") {
    return {
      status: "blocked",
      detail: proposed.detail,
    };
  }

  return {
    status: "rewritten",
    path: rewritten,
  };
}

/**
 * Build a complete read-only authorization for one explicit language rename.
 *
 * Rename is not root adoption:
 *
 * - the language must already have an explicit modern rootFolder;
 * - that exact root must exist as a folder;
 * - this configuration must already own that root;
 * - another configuration may not conflict with either old or new root;
 * - the destination root must be physically missing;
 * - canonical inventory paths must already belong to the old root;
 * - creator-chosen descendant organization is preserved by prefix rewriting.
 *
 * Existing unconfigured Languages/<name> roots remain structurally occupied.
 * They are future Import Language territory and cannot be merged into or
 * overwritten by rename.
 */
export function planLanguageRename(request: {
  language: LanguageConfig;
  languages: readonly LanguageConfig[];
  proposedName: string;
  pathState: (path: string) => LanguageAuthorityPathState;
}): LanguageRenamePlanResult {
  const { language, languages, proposedName, pathState } = request;

  /*
   * Reuse the inherited alpha identity rule first: names are trimmed, cannot be
   * blank, cannot be unchanged, and cannot duplicate another configured
   * language's runtime identity.
   */
  const identity = validateLanguageRename(languages, language, proposedName);

  if (!identity.ok) {
    return {
      status: "blocked",
      reason: `invalid-name-${identity.reason}`,
      detail:
        identity.reason === "blank"
          ? "Language name cannot be blank."
          : identity.reason === "unchanged"
            ? "The requested language name is unchanged."
            : `Another configured language is already named "${proposedName.trim()}".`,
    };
  }

  /*
   * Rename requires explicit established modern authority. Legacy inference is
   * intentionally not enough for a filesystem move: repair should first make
   * root ownership explicit before rename can move creator-owned content.
   */
  if (!language.rootFolder) {
    return {
      status: "blocked",
      reason: "root-unresolved",
      detail:
        `Language "${language.name}" has no explicit Languages/<root> ` +
        "ownership boundary. Repair the language root before renaming it.",
    };
  }

  const currentRoot = validateLanguageRoot(language.rootFolder);

  if (currentRoot.status === "invalid") {
    return {
      status: "blocked",
      reason: "invalid-current-root",
      detail: currentRoot.detail,
    };
  }

  const currentRootState = pathState(currentRoot.root);

  if (currentRootState === "missing") {
    return {
      status: "blocked",
      reason: "missing-current-root",
      detail:
        `Language root "${currentRoot.root}" does not exist. Repair the ` +
        "language root before renaming the language.",
    };
  }

  if (currentRootState === "other") {
    return {
      status: "blocked",
      reason: "current-root-not-folder",
      detail: `Language root "${currentRoot.root}" exists but is not a folder.`,
    };
  }

  const currentConflict = findLanguageRootClaimConflict(
    currentRoot.root,
    language,
    languages,
  );

  if (currentConflict) {
    return {
      status: "blocked",
      reason: "current-root-conflict",
      detail:
        `Language root "${currentRoot.root}" conflicts with ` +
        `"${currentConflict.root}", already reserved by ` +
        `"${currentConflict.language}".`,
    };
  }

  /*
   * An explicit rootFolder normally makes this check true automatically, but
   * keeping the ownership assertion explicit documents the authorization being
   * exercised: rename may move only this language's already-owned tree.
   */
  if (!configuredLanguageRootClaims(language).includes(currentRoot.root)) {
    return {
      status: "blocked",
      reason: "current-root-not-owned",
      detail:
        `Language "${language.name}" does not own configured root ` +
        `"${currentRoot.root}". Rename cannot adopt or move another root.`,
    };
  }

  /*
   * buildStandardLanguagePaths() is useful here only for its root construction.
   * It treats the requested language name as exactly one child beneath
   * Languages/ and therefore rejects slash/backslash path injection rather than
   * sanitizing it into a different name.
   */
  let newRoot: string;

  try {
    newRoot = buildStandardLanguagePaths(identity.name).root;
  } catch (error) {
    return {
      status: "blocked",
      reason: "invalid-destination-root",
      detail:
        `Language name "${identity.name}" cannot form a safe language root: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  const destinationRoot = validateLanguageRoot(newRoot);

  if (destinationRoot.status === "invalid") {
    return {
      status: "blocked",
      reason: "invalid-destination-root",
      detail: destinationRoot.detail,
    };
  }

  const destinationConflict = findLanguageRootClaimConflict(
    destinationRoot.root,
    language,
    languages,
  );

  if (destinationConflict) {
    return {
      status: "blocked",
      reason: "destination-root-conflict",
      detail:
        `Requested language root "${destinationRoot.root}" conflicts with ` +
        `"${destinationConflict.root}", already reserved by ` +
        `"${destinationConflict.language}".`,
    };
  }

  /*
   * Every existing immediate child beneath Languages is structurally occupied,
   * even if no LanguageConfig currently adopts it. Rename therefore requires a
   * genuinely missing destination. It never merges with or overwrites an
   * existing folder/file.
   */
  const destinationState = pathState(destinationRoot.root);

  if (destinationState !== "missing") {
    return {
      status: "blocked",
      reason:
        destinationState === "folder"
          ? "destination-root-occupied"
          : "destination-root-not-folder",
      detail:
        destinationState === "folder"
          ? `Requested language root "${destinationRoot.root}" already exists. ` +
            "Rename will not adopt or merge with an existing language root."
          : `Requested language root "${destinationRoot.root}" is occupied by ` +
            "an object that is not a folder.",
    };
  }

  const dictionary = rewriteCanonicalSource(
    currentRoot.root,
    destinationRoot.root,
    language.dictionaryFolder,
    pathState,
  );

  if (dictionary.status === "blocked") {
    return {
      status: "blocked",
      reason: "invalid-dictionary-source",
      detail: dictionary.detail,
    };
  }

  const rewriteOptionalCanonicalSource = (
    sourcePath: string | undefined,
    label: "morpheme" | "example" | "phonology",
  ):
    | { status: "rewritten"; path: string | undefined }
    | { status: "blocked"; reason: string; detail: string } => {
    /*
     * H3 already treats an omitted or blank optional source as absent. Preserve
     * that meaning here rather than turning an old blank value into a rename
     * blocker or silently normalizing creator configuration during an unrelated
     * operation.
     */
    if (sourcePath === undefined || sourcePath.trim() === "") {
      return { status: "rewritten", path: sourcePath };
    }

    const result = rewriteCanonicalSource(
      currentRoot.root,
      destinationRoot.root,
      sourcePath,
      pathState,
    );

    if (result.status === "blocked") {
      return {
        status: "blocked",
        reason: `invalid-${label}-source`,
        detail: result.detail,
      };
    }

    return result;
  };

  const morphemes = rewriteOptionalCanonicalSource(
    language.morphemeFolder,
    "morpheme",
  );

  if (morphemes.status === "blocked") {
    return morphemes;
  }

  const examples = rewriteOptionalCanonicalSource(
    language.exampleFolder,
    "example",
  );

  if (examples.status === "blocked") {
    return examples;
  }

  const phonology = rewriteOptionalCanonicalSource(
    language.phonologyFolder,
    "phonology",
  );

  if (phonology.status === "blocked") {
    return phonology;
  }

  let profilePath = language.profilePath;

  if (profilePath !== undefined) {
    /*
     * Profiles do not yet participate in H3 canonical source authority.
     * Preserve an external profile path exactly. If the profile lives beneath
     * the root being moved, however, its physical location moves with the root
     * and its configured prefix must follow that move.
     *
     * Invalid profile paths block rename rather than being silently discarded.
     */
    try {
      profilePath = rewritePathForLanguageRootRename(
        profilePath,
        currentRoot.root,
        destinationRoot.root,
      );
    } catch (error) {
      return {
        status: "blocked",
        reason: "invalid-profile-path",
        detail:
          `Profile path "${language.profilePath}" is not a safe vault path: ` +
          (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  const configuration: LanguageRenameConfiguration = {
    name: identity.name,
    rootFolder: destinationRoot.root,
    dictionaryFolder: dictionary.path,
    morphemeFolder: morphemes.path,
    exampleFolder: examples.path,
    phonologyFolder: phonology.path,
    profilePath,
  };

  return {
    status: "planned",
    oldName: language.name,
    newName: identity.name,
    oldRoot: currentRoot.root,
    newRoot: destinationRoot.root,
    configuration,
  };
}
