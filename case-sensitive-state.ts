/**
 * Transactional authority for changing conlang case-sensitive matching.
 *
 * Case sensitivity is a load-time dictionary policy rather than a simple UI
 * preference. Dictionary headwords, declared forms, and phrases are indexed
 * according to this value, so persisted settings and runtime indexes must move
 * together whenever the creator changes it.
 *
 * This module deliberately knows nothing about Obsidian. The plugin supplies
 * save/reload callbacks, which makes the security-sensitive state transition
 * independently testable.
 */

export interface CaseSensitiveMatchingState {
  caseSensitiveMatching: boolean;
}

export type CaseSensitiveMatchingReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type CaseSensitiveMatchingStateResult =
  | {
      status: "applied";
      dictionaryCount: number;
    }
  | {
      status: "unchanged";
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

export interface ApplyCaseSensitiveMatchingStateRequest {
  /**
   * Mutable settings-backed state owned by the plugin.
   *
   * Other runtime consumers also read this property directly, so failed
   * transactions must restore it whenever the old runtime is known to remain
   * authoritative.
   */
  state: CaseSensitiveMatchingState;

  /** Complete requested replacement policy. */
  caseSensitiveMatching: boolean;

  /** Persist the plugin's current in-memory settings state. */
  save: () => Promise<void>;

  /**
   * Rebuild linguistic runtime state under the currently configured policy.
   *
   * reloadActiveLanguage() builds a detached candidate runtime and commits it
   * only after preparation succeeds. Both a returned "blocked" result and a
   * thrown preparation error therefore leave previous indexes untouched.
   */
  reload: () => Promise<CaseSensitiveMatchingReloadResult>;
}

/**
 * Establish one case-sensitive-matching policy change transactionally.
 *
 * Safety contract:
 *
 * 1. An unchanged request performs no persistence or reload work.
 * 2. Initial persistence failure restores the previous in-memory policy.
 * 3. A preflight-blocked reload restores and re-persists the previous policy,
 *    because the old runtime indexes are proven untouched.
 * 4. A thrown detached-preparation error also restores and re-persists the
 *    previous policy because the candidate runtime was never committed.
 * 5. A successfully rolled-back thrown reload remains "reload-failed" so the
 *    caller retains the original failure reason.
 */
export async function applyCaseSensitiveMatchingState(
  request: ApplyCaseSensitiveMatchingStateRequest,
): Promise<CaseSensitiveMatchingStateResult> {
  const previousValue = request.state.caseSensitiveMatching;
  const requestedValue = request.caseSensitiveMatching;

  if (requestedValue === previousValue) {
    return { status: "unchanged" };
  }

  /*
   * Runtime reload reads this setting to select the dictionary's indexing mode,
   * so the requested value must be in memory before save/reload callbacks run.
   */
  request.state.caseSensitiveMatching = requestedValue;

  try {
    await request.save();
  } catch (error) {
    /*
     * Reload has not run, so the old runtime is still authoritative. Restore
     * memory immediately and do not perform a compensating save: the requested
     * persistence never completed successfully in the first place.
     */
    request.state.caseSensitiveMatching = previousValue;
    return { status: "save-failed", error };
  }

  let reload: CaseSensitiveMatchingReloadResult;

  try {
    reload = await request.reload();
  } catch (error) {
    /*
     * Detached runtime preparation cannot partially replace the committed
     * dictionary. A thrown preparation error leaves the previous indexes
     * authoritative, so restore and persist the policy that still matches them.
     */
    request.state.caseSensitiveMatching = previousValue;

    try {
      await request.save();
    } catch (rollbackError) {
      return { status: "rollback-save-failed", error: rollbackError };
    }

    return { status: "reload-failed", error };
  }

  if (reload.status === "loaded") {
    return {
      status: "applied",
      dictionaryCount: reload.dictionaryCount,
    };
  }

  /*
   * This branch handles an explicit preflight refusal. Runtime is untouched here
   * just as it is after a thrown candidate-preparation error. Restore the policy
   * corresponding to those still-authoritative indexes and persist the rollback.
   */
  request.state.caseSensitiveMatching = previousValue;

  try {
    await request.save();
  } catch (error) {
    /*
     * Memory now matches the old runtime, but persistence could not be restored.
     * Surface that distinction rather than reporting an ordinary blocked result.
     */
    return { status: "rollback-save-failed", error };
  }

  return { status: "blocked" };
}
