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
   * "blocked" has a special safety guarantee: source preflight rejected the
   * reload before any previous linguistic indexes were replaced.
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
 * 4. A thrown reload exception is NOT treated as a safe rollback point. Once
 *    preflight succeeds, dictionary replacement may already have begun, so
 *    changing the setting back would not reconstruct the old indexes.
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
     * Do NOT restore the previous setting here.
     *
     * reloadActiveLanguage() can throw after preflight has succeeded and after
     * dictionary replacement has begun. Leaving the successfully persisted
     * requested policy in place is more truthful than claiming an old runtime
     * state that this transaction cannot reconstruct.
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
   * "blocked" is the one reload result that guarantees runtime was untouched.
   * Restore the setting corresponding to those still-authoritative indexes and
   * persist that rollback.
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
