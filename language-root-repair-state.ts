import type { LanguageConfig } from "./types";
import type {
  LanguageRootRepairPlan,
  LanguageRootRepairPlanResult,
} from "./language-root-repair";

/**
 * Result returned by the normal active-language reload boundary.
 *
 * "blocked" has a stronger safety meaning than a thrown exception:
 * reloadActiveLanguage() returns blocked only when source preflight refused the
 * requested configuration before replacing any currently loaded linguistic
 * state.
 */
export type LanguageRootRepairReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

/**
 * Observable outcomes of one explicit language-root repair transaction.
 *
 * Folder creation is deliberately reported separately from settings failures.
 * Repair creates folders additively and never deletes them during rollback, so
 * a creator can distinguish "configuration was restored" from "the vault was
 * returned byte-for-byte to its previous structure." The latter is not promised.
 */
export type LanguageRootRepairStateResult =
  | {
      status: "applied";
      dictionaryCount?: number;
      foldersEstablished: true;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    }
  | {
      status: "folder-creation-failed";
      error: unknown;
    }
  | {
      status: "save-failed";
      error: unknown;
      foldersEstablished: true;
    }
  | {
      status: "reload-blocked";
      foldersEstablished: true;
    }
  | {
      status: "rollback-save-failed";
      error: unknown;
      foldersEstablished: true;
    }
  | {
      status: "reload-failed";
      error: unknown;
      foldersEstablished: true;
    };

/**
 * The configuration fields repaired as one authority unit.
 *
 * profilePath is intentionally absent. Profiles participate in runtime reload,
 * but profilePath does not yet participate in the H3 source preflight. It needs
 * its own authority review rather than being silently absorbed into H7.
 */
interface LanguageRootRepairSnapshot {
  rootFolder: string | undefined;
  dictionaryFolder: string;
  morphemeFolder: string | undefined;
  exampleFolder: string | undefined;
  phonologyFolder: string | undefined;
}

export interface ApplyLanguageRootRepairStateRequest {
  /**
   * Exact configuration object being repaired.
   *
   * Object identity matters because settings and UI callers can already hold
   * this LanguageConfig. The transaction updates the object in place only after
   * structural planning and additive folder establishment succeed.
   */
  language: LanguageConfig;

  /**
   * Active-language names corresponding to current runtime authority.
   *
   * Inactive languages have no loaded inventories to synchronize immediately,
   * so a successful repair can stop after persistence. Activation will still
   * pass through the normal H3 preflight later.
   */
  activeLanguages: readonly string[];

  /**
   * Produce a fresh, read-only repair plan immediately before mutation.
   *
   * Production should inspect current vault state here. Keeping planning inside
   * the transaction boundary prevents a UI from authorizing repair from a stale
   * plan calculated substantially earlier.
   */
  plan: () => LanguageRootRepairPlanResult;

  /**
   * Establish exactly the planner-approved missing folders.
   *
   * Repair never removes folders created during this phase automatically.
   * If establishment fails partway through, additive creator-data structure is
   * safer to preserve than to guess whether rollback deletion is still
   * authorized. The transaction therefore does not claim to know the exact
   * partial set created by a rejected callback.
   */
  createMissingFolders: (plan: LanguageRootRepairPlan) => Promise<void>;

  /**
   * Persist current settings. Production supplies ConlangPlugin.saveSettings().
   */
  save: () => Promise<void>;

  /**
   * Establish active runtime data after the repaired configuration is saved.
   *
   * Only an explicit "blocked" result authorizes configuration rollback.
   * Arbitrary exceptions may happen after runtime replacement has begun.
   */
  reload: () => Promise<LanguageRootRepairReloadResult>;
}

function snapshotLanguageRootRepair(
  language: LanguageConfig,
): LanguageRootRepairSnapshot {
  return {
    rootFolder: language.rootFolder,
    dictionaryFolder: language.dictionaryFolder,
    morphemeFolder: language.morphemeFolder,
    exampleFolder: language.exampleFolder,
    phonologyFolder: language.phonologyFolder,
  };
}

function restoreLanguageRootRepair(
  language: LanguageConfig,
  snapshot: LanguageRootRepairSnapshot,
): void {
  language.rootFolder = snapshot.rootFolder;
  language.dictionaryFolder = snapshot.dictionaryFolder;
  language.morphemeFolder = snapshot.morphemeFolder;
  language.exampleFolder = snapshot.exampleFolder;
  language.phonologyFolder = snapshot.phonologyFolder;
}

function applyPlannedLanguageRootRepair(
  language: LanguageConfig,
  plan: LanguageRootRepairPlan,
): void {
  language.rootFolder = plan.configuration.rootFolder;
  language.dictionaryFolder = plan.configuration.dictionaryFolder;
  language.morphemeFolder = plan.configuration.morphemeFolder;
  language.exampleFolder = plan.configuration.exampleFolder;
  language.phonologyFolder = plan.configuration.phonologyFolder;
}

/**
 * Apply one explicit language-root repair transaction.
 *
 * Ordering is security-sensitive:
 *
 * 1. Calculate a fresh complete plan before mutation.
 * 2. Establish only planner-approved missing folders.
 * 3. Change configuration only after folder establishment succeeds.
 * 4. Persist repaired configuration.
 * 5. Reload only when the language is currently active.
 * 6. Roll configuration back only when reload explicitly reports that H3
 *    preflight blocked before runtime replacement began.
 *
 * Created folders are never deleted during rollback. A folder created by this
 * transaction may have become creator-visible or received content immediately,
 * and deleting it would require stronger authority than additive repair owns.
 */
export async function applyLanguageRootRepairState(
  request: ApplyLanguageRootRepairStateRequest,
): Promise<LanguageRootRepairStateResult> {
  const repairPlan = request.plan();

  if (repairPlan.status === "blocked") {
    return {
      status: "blocked",
      reason: repairPlan.reason,
      detail: repairPlan.detail,
    };
  }

  const previous = snapshotLanguageRootRepair(request.language);

  try {
    await request.createMissingFolders(repairPlan);
  } catch (error) {
    /*
     * Configuration has not changed yet, so no settings rollback is necessary.
     *
     * Folder establishment is additive. If an external failure occurs after
     * some missing folders were created, those folders are intentionally
     * preserved. This transaction does not claim to know the exact partial set
     * because a rejected Promise cannot also return that completion record.
     */
    return {
      status: "folder-creation-failed",
      error,
    };
  }

  applyPlannedLanguageRootRepair(request.language, repairPlan);

  try {
    await request.save();
  } catch (error) {
    /*
     * The repaired configuration was not established reliably. Restore the
     * previous in-memory configuration, but preserve additive folders.
     */
    restoreLanguageRootRepair(request.language, previous);

    return {
      status: "save-failed",
      error,
      foldersEstablished: true,
    };
  }

  const isActive = request.activeLanguages.includes(request.language.name);

  if (!isActive) {
    return {
      status: "applied",
      foldersEstablished: true,
    };
  }

  try {
    const reload = await request.reload();

    if (reload.status === "loaded") {
      return {
        status: "applied",
        dictionaryCount: reload.dictionaryCount,
        foldersEstablished: true,
      };
    }

    /*
     * H3 guarantees that "blocked" means runtime replacement never began.
     * Therefore the old configuration still corresponds to the untouched old
     * runtime and can safely be restored.
     */
    restoreLanguageRootRepair(request.language, previous);

    try {
      await request.save();
    } catch (error) {
      return {
        status: "rollback-save-failed",
        error,
        foldersEstablished: true,
      };
    }

    return {
      status: "reload-blocked",
      foldersEstablished: true,
    };
  } catch (error) {
    /*
     * Do NOT restore the previous configuration here.
     *
     * reloadActiveLanguage() can throw after preflight succeeds and runtime
     * replacement begins. Restoring settings would then falsely imply that the
     * old runtime authority had also been restored.
     */
    return {
      status: "reload-failed",
      error,
      foldersEstablished: true,
    };
  }
}
