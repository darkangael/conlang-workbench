import type { App } from "obsidian";
import { TFolder } from "obsidian";
import { LANGUAGE_CONTAINER } from "./language-root-authority";

/**
 * Result of attempting to establish one already-authorized configured language
 * root at the final Recreate filesystem boundary.
 *
 * This result deliberately distinguishes authority changes from operational
 * failures. A blocked result means the vault changed in a way that removes
 * Recreate authority. Unexpected createFolder() failures are thrown unchanged
 * so the transaction layer can report them as root-establishment failures.
 */
export type LanguageRootRecreationWriteResult =
  | { status: "established" }
  | {
      status: "blocked";
      reason:
        | "container-missing"
        | "container-not-folder"
        | "root-now-folder"
        | "root-not-folder";
      detail: string;
    };

/**
 * Classify the shared Languages container at the strongest filesystem boundary.
 *
 * Recreate owns only one configured Languages/<language> root. It must never
 * acquire Add Language's broader authority to establish the shared Languages
 * container merely because that container disappeared during confirmation or
 * preflight.
 */
function inspectLanguageContainer(
  app: App,
): Extract<LanguageRootRecreationWriteResult, { status: "blocked" }> | null {
  const container = app.vault.getAbstractFileByPath(LANGUAGE_CONTAINER);

  if (container === null) {
    return {
      status: "blocked",
      reason: "container-missing",
      detail:
        `The shared "${LANGUAGE_CONTAINER}" folder is missing. Workbench will ` +
        "not recreate that shared container while recreating one configured " +
        "language. Restore it in the vault before using Recreate language root.",
    };
  }

  if (!(container instanceof TFolder)) {
    return {
      status: "blocked",
      reason: "container-not-folder",
      detail:
        `The shared "${LANGUAGE_CONTAINER}" path is occupied by an object ` +
        "that is not a folder. Workbench will not replace or reinterpret it.",
    };
  }

  return null;
}

/**
 * Classify the configured root only when the shared Languages container is
 * already known to be a folder.
 *
 * A folder appearing here is NOT considered successful recreation. Workbench
 * cannot prove that a concurrently appearing folder is the same missing root
 * the creator authorized it to recreate, so ownership must be reconciled
 * explicitly through Repair instead.
 */
function inspectConfiguredRoot(
  app: App,
  root: string,
): Extract<LanguageRootRecreationWriteResult, { status: "blocked" }> | null {
  const existing = app.vault.getAbstractFileByPath(root);

  if (existing instanceof TFolder) {
    return {
      status: "blocked",
      reason: "root-now-folder",
      detail:
        `A folder now exists at "${root}". Workbench did not recreate the ` +
        "language root because it will not assume this newly present folder " +
        "is the same root that was previously missing. You may wish to try " +
        "Repair language root instead.",
    };
  }

  if (existing !== null) {
    return {
      status: "blocked",
      reason: "root-not-folder",
      detail:
        `The configured language root path "${root}" is now occupied by an ` +
        "object that is not a folder. Workbench will not replace or " +
        "reinterpret it.",
    };
  }

  return null;
}

/**
 * Establish exactly one configured language root for an explicit Recreate
 * transaction.
 *
 * The caller has already obtained a fresh valid recreation plan and completed
 * the whole seven-path read-only hierarchy preflight. This function owns only
 * the final filesystem race immediately adjacent to root creation.
 *
 * Safety boundaries:
 *
 * - Languages/ must still exist as a folder;
 * - the exact configured root must still be absent;
 * - only app.vault.createFolder(root) may establish structure here;
 * - no recursive folder helper is used, so this function cannot create a
 *   missing shared parent;
 * - a concurrently appearing root is a reason to stop, never a reason to adopt
 *   that folder as successful recreation;
 * - an unexplained createFolder() failure is rethrown rather than being hidden.
 *
 * Canonical children are deliberately outside this function. The transaction
 * may establish them additively only after this function positively returns
 * { status: "established" }.
 */
export async function establishLanguageRootForRecreation(
  app: App,
  root: string,
): Promise<LanguageRootRecreationWriteResult> {
  const containerProblem = inspectLanguageContainer(app);

  if (containerProblem) {
    return containerProblem;
  }

  const rootProblem = inspectConfiguredRoot(app, root);

  if (rootProblem) {
    return rootProblem;
  }

  try {
    /*
     * Create only the exact already-authorized language ownership boundary.
     * Unlike ensureVaultFolderStrict(), this does not walk or establish parent
     * path components and does not treat concurrent creation as success.
     */
    await app.vault.createFolder(root);
  } catch (error) {
    /*
     * createFolder() can race with external vault activity. Re-read authority
     * instead of assuming why it failed.
     *
     * The shared container is checked first because losing that broader
     * structural prerequisite removes Recreate authority before root state can
     * be interpreted safely. If the container remains valid, classify the root
     * so a concurrently appearing folder can be routed toward Repair rather
     * than silently adopted.
     */
    const currentContainerProblem = inspectLanguageContainer(app);

    if (currentContainerProblem) {
      return currentContainerProblem;
    }

    const currentRootProblem = inspectConfiguredRoot(app, root);

    if (currentRootProblem) {
      return currentRootProblem;
    }

    /*
     * Neither recognized authority race explains the failure. Preserve the
     * original operational error for the transaction layer rather than
     * converting a permission, adapter, or unexpected vault failure into a
     * misleading success or authority diagnostic.
     */
    throw error;
  }

  return { status: "established" };
}
