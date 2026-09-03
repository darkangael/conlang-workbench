/**
 * Transactional authority for changing conlang language-membership policy.
 *
 * Language membership is not merely a display preference. The selected policy
 * controls whether creator-authored dictionary, morpheme, example, and phonology
 * sources are accepted into active runtime indexes when their explicit
 * `language:` metadata disagrees with the configured source language.
 *
 * Because reloadActiveLanguage() reads this setting while rebuilding those
 * indexes, persisted settings and runtime linguistic authority must move
 * together as one logical transaction.
 *
 * This module deliberately knows nothing about Obsidian. The plugin supplies
 * persistence and reload callbacks so the security-sensitive state transition
 * can be regression-tested independently.
 */

export type LanguageMembershipPolicy = "folder" | "respect-explicit";

export interface LanguageMembershipState {
  languageMembership: LanguageMembershipPolicy;
}

export type LanguageMembershipReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

export type LanguageMembershipStateResult =
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

export interface ApplyLanguageMembershipStateRequest {
  /**
   * Mutable settings-backed state owned by the plugin.
   *
   * Runtime loaders read this property directly. reloadActiveLanguage() now
   * prepares replacements off to the side, so blocked or thrown preparation
   * failures both prove that the previous runtime indexes remain authoritative.
   */
  state: LanguageMembershipState;

  /** Complete requested replacement membership policy. */
  languageMembership: LanguageMembershipPolicy;

  /** Persist the plugin's current in-memory settings state. */
  save: () => Promise<void>;

  /**
   * Rebuild active linguistic runtime state under the current membership policy.
   *
   * reloadActiveLanguage() returns "blocked" when source preflight rejects the
   * reload. It can also throw while preparing detached candidate inventories.
   * Neither failure path commits replacement runtime state.
   */
  reload: () => Promise<LanguageMembershipReloadResult>;
}

/**
 * Establish one language-membership policy change transactionally.
 *
 * Safety contract:
 *
 * 1. An unchanged request performs no persistence or runtime reload.
 * 2. Initial persistence failure restores the previous in-memory policy because
 *    runtime replacement has not begun.
 * 3. A preflight-blocked reload restores and re-persists the previous policy
 *    because the old runtime indexes are proven untouched.
 * 4. A thrown detached-preparation error also restores and re-persists the
 *    previous policy because no candidate runtime was committed.
 * 5. The original thrown error remains visible as "reload-failed" after a
 *    successful rollback.
 */
export async function applyLanguageMembershipState(
  request: ApplyLanguageMembershipStateRequest,
): Promise<LanguageMembershipStateResult> {
  const previousMembership = request.state.languageMembership;
  const requestedMembership = request.languageMembership;

  if (requestedMembership === previousMembership) {
    return { status: "unchanged" };
  }

  /*
   * reloadActiveLanguage() reads the current setting while rebuilding every
   * active linguistic inventory, so install the requested policy in memory
   * before either persistence or reload runs.
   */
  request.state.languageMembership = requestedMembership;

  try {
    await request.save();
  } catch (error) {
    /*
     * Runtime reload has not started, so the previous runtime remains
     * authoritative. Restore the matching in-memory policy immediately.
     *
     * Do not perform a compensating save here: the attempted persistence of the
     * requested policy did not complete successfully.
     */
    request.state.languageMembership = previousMembership;
    return { status: "save-failed", error };
  }

  let reload: LanguageMembershipReloadResult;

  try {
    reload = await request.reload();
  } catch (error) {
    /*
     * Candidate inventories are prepared without replacing the committed
     * runtime. If preparation throws, the previous membership policy still
     * describes the authoritative indexes and can safely be restored.
     */
    request.state.languageMembership = previousMembership;

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
   * This branch handles an explicit preflight refusal. Runtime authority remains
   * untouched here just as it does after a thrown candidate-preparation error.
   * Restore the matching membership policy and persist that rollback before
   * releasing the transaction.
   */
  request.state.languageMembership = previousMembership;

  try {
    await request.save();
  } catch (error) {
    /*
     * Memory matches the untouched old runtime, but persisted configuration
     * could not be restored. Surface that distinct state to the UI instead of
     * misreporting an ordinary blocked change.
     */
    return { status: "rollback-save-failed", error };
  }

  return { status: "blocked" };
}
