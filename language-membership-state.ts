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
   * Runtime loaders read this property directly, so rollback is safe only when
   * we can prove that the previous runtime indexes remain authoritative.
   */
  state: LanguageMembershipState;

  /** Complete requested replacement membership policy. */
  languageMembership: LanguageMembershipPolicy;

  /** Persist the plugin's current in-memory settings state. */
  save: () => Promise<void>;

  /**
   * Rebuild active linguistic runtime state under the current membership policy.
   *
   * "blocked" has a stronger meaning than a thrown exception:
   * reloadActiveLanguage() returns it only when source preflight rejects the
   * reload before any existing linguistic runtime state is replaced.
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
 * 4. A thrown reload exception is NOT treated as a safe rollback point. Once
 *    preflight succeeds, one or more runtime inventories may already have begun
 *    replacement. Restoring only the setting would falsely claim that the
 *    previous runtime had also been reconstructed.
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
     * Fail closed with respect to rollback authority.
     *
     * After source preflight succeeds, reloadActiveLanguage() can throw while
     * dictionary, morpheme, example, or phonology runtime state is already being
     * replaced. Keep the successfully persisted requested policy rather than
     * pretending that changing this setting back could reconstruct the old
     * runtime state.
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
   * "blocked" is the one result that proves runtime authority was untouched.
   * Restore the membership policy corresponding to those still-authoritative
   * indexes and persist that rollback before releasing the transaction.
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
