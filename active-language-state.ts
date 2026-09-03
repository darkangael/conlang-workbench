/**
 * Transactional authority for changing the configured active/primary languages.
 *
 * Several UI surfaces can request the same underlying state change. Keeping the
 * persistence/reload/rollback sequence here prevents Settings and the side panel
 * from implementing subtly different security-sensitive behavior.
 *
 * This module deliberately knows nothing about Obsidian or ConlangPlugin. The
 * caller supplies save/reload callbacks, which keeps the transaction reusable
 * and makes the authority boundary independently testable.
 */

export interface ActiveLanguageState {
  activeLanguages: string[];
  primaryLanguage: string;
}

export type ActiveLanguageReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type ActiveLanguageStateResult =
  | {
      status: "applied";
      dictionaryCount: number;
    }
  | {
      status: "invalid-request";
      error: string;
    }
  | {
      status: "save-failed";
      error: unknown;
    }
  | {
      status: "blocked";
    }
  | {
      status: "rollback-save-failed";
      error: unknown;
    }
  | {
      status: "reload-failed";
      error: unknown;
    };

export interface ApplyActiveLanguageStateRequest {
  /**
   * Mutable settings-backed state owned by the plugin.
   *
   * The transaction changes these two properties in place because existing
   * callers already hold the surrounding settings object.
   */
  state: ActiveLanguageState;

  /**
   * Complete requested replacement state. Callers decide UI policy such as
   * which language should become primary after deactivation; this module owns
   * only the transaction that establishes that decision safely.
   */
  activeLanguages: string[];
  primaryLanguage: string;

  /**
   * Persist the current in-memory settings state.
   *
   * In production this is ConlangPlugin.saveSettings(). Tests can provide a
   * small callback without importing the plugin or Obsidian.
   */
  save: () => Promise<void>;

  /**
   * Attempt to establish runtime linguistic state corresponding to the newly
   * persisted configuration.
   *
   * reloadActiveLanguage() prepares the complete next linguistic runtime in
   * detached candidate objects. A returned "blocked" result or a thrown
   * preparation error therefore leaves the previously committed runtime
   * untouched, making rollback to the previous configuration safe.
   */
  reload: () => Promise<ActiveLanguageReloadResult>;
}

/**
 * Apply one active/primary-language configuration change transactionally.
 *
 * Safety contract:
 *
 * 1. Reject internally inconsistent requests before changing settings.
 * 2. Restore the previous in-memory values if the initial save fails.
 * 3. If reload preflight returns "blocked", restore the previous configuration
 *    and persist that rollback so settings agree with the untouched old runtime.
 * 4. If detached runtime preparation throws, restore and re-persist the previous
 *    configuration for the same reason: atomic runtime preparation guarantees
 *    that no candidate inventories were committed before the exception escaped.
 * 5. Preserve "reload-failed" as the result of a successfully rolled-back thrown
 *    reload so callers still know why the requested operation was rejected.
 */
export async function applyActiveLanguageState(
  request: ApplyActiveLanguageStateRequest,
): Promise<ActiveLanguageStateResult> {
  const requestedActive = [...request.activeLanguages];

  /*
   * Active-language configuration is only meaningful when at least one
   * language remains active and the primary language belongs to that set.
   * Reject malformed requests instead of persisting a state that another layer
   * would later have to guess how to repair.
   */
  if (requestedActive.length === 0) {
    return {
      status: "invalid-request",
      error: "at least one language must remain active",
    };
  }

  /*
   * Treat duplicate names as malformed authority input rather than silently
   * normalizing them. The persisted active-language list represents a set of
   * language identities, so accepting duplicates would make the transaction
   * preserve an internally inconsistent representation.
   */
  if (new Set(requestedActive).size !== requestedActive.length) {
    return {
      status: "invalid-request",
      error: "active languages must not contain duplicate names",
    };
  }

  if (!requestedActive.includes(request.primaryLanguage)) {
    return {
      status: "invalid-request",
      error: "the primary language must be active",
    };
  }

  const previousActive = [...request.state.activeLanguages];
  const previousPrimary = request.state.primaryLanguage;

  const restorePreviousState = () => {
    /*
     * Always allocate a fresh array. Reusing either caller-owned array could
     * allow later mutation outside this transaction to alter the restored
     * settings unexpectedly.
     */
    request.state.activeLanguages = [...previousActive];
    request.state.primaryLanguage = previousPrimary;
  };

  request.state.activeLanguages = requestedActive;
  request.state.primaryLanguage = request.primaryLanguage;

  try {
    await request.save();
  } catch (error) {
    /*
     * Persistence never completed reliably, so the requested state was not
     * established. Restore memory immediately. saveSettings() performs its UI
     * refreshes only after saveData succeeds, so no second save is appropriate
     * here.
     */
    restorePreviousState();
    return { status: "save-failed", error };
  }

  let reload: ActiveLanguageReloadResult;

  try {
    reload = await request.reload();
  } catch (error) {
    /*
     * Runtime preparation is detached and commits only after every candidate
     * inventory has loaded successfully. A thrown preparation error therefore
     * leaves the previous runtime authoritative, so restore the configuration
     * that still describes it and persist that rollback.
     */
    restorePreviousState();

    try {
      await request.save();
    } catch (rollbackError) {
      return { status: "rollback-save-failed", error: rollbackError };
    }

    /*
     * Keep the original reload error after a successful rollback. "reload-failed"
     * describes why the requested change was rejected; "rollback-save-failed"
     * is reserved for the more serious case where persistence could not be
     * returned to the known-good configuration.
     */
    return { status: "reload-failed", error };
  }

  if (reload.status === "loaded") {
    return {
      status: "applied",
      dictionaryCount: reload.dictionaryCount,
    };
  }

  /*
   * This branch handles an explicit preflight refusal. Like the thrown
   * candidate-preparation path above, it leaves the previous runtime untouched.
   * Restore the configuration that still matches that authoritative runtime,
   * then persist the rollback.
   */
  restorePreviousState();

  try {
    await request.save();
  } catch (error) {
    /*
     * Memory now reflects the old, still-loaded runtime state, but persistence
     * could not be brought back into agreement. Report that distinction so the
     * UI can warn the creator instead of pretending rollback fully succeeded.
     */
    return { status: "rollback-save-failed", error };
  }

  return { status: "blocked" };
}
