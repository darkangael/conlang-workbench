/**
 * Transactional authority for live cypher-sheet and inflection-rule settings.
 *
 * Unlike dictionary data, these linguistic rules are not copied into a separate
 * runtime index. Translation, lookup, hover, and inflection code read them
 * directly from the LanguageConfig object stored in plugin settings. That makes
 * persistence the authority boundary: a failed settings save must not leave an
 * unpersisted rule configuration active for the rest of the Obsidian session.
 *
 * Candidate states are deliberately detached copies. UI code can construct and
 * edit a candidate without mutating the currently authoritative rule objects.
 * The transaction installs that complete candidate only for the persistence
 * attempt. If persistence fails, it restores the exact original array
 * references, preserving the last known-good in-memory authority.
 */

import type { CypherRule, CypherSheet, InflectionRule } from "./types";

/**
 * The part of LanguageConfig whose changes immediately affect linguistic
 * behaviour at runtime.
 *
 * Keep this interface intentionally narrow. H10 governs cypher sheets and
 * inflection rules; unrelated language settings have their own authority
 * boundaries and must not accidentally become part of this transaction.
 */
export interface LinguisticRuleState {
  sheets: CypherSheet[];
  inflections?: InflectionRule[];
}

/**
 * A complete detached replacement for the H10 linguistic-rule state.
 *
 * This has the same data shape as LinguisticRuleState, but the separate name
 * documents an important contract: callers must build it from cloned objects,
 * not by mutating the currently authoritative arrays in place.
 */
export interface LinguisticRuleCandidate {
  sheets: CypherSheet[];
  inflections?: InflectionRule[];
}

export type LinguisticRuleStateResult =
  | {
      status: "applied";
    }
  | {
      status: "target-missing";
    }
  | {
      status: "save-failed";
      error: unknown;
    };

/**
 * Abort one queued edit because the exact object authorized by the UI no
 * longer exists in current linguistic-rule authority.
 *
 * This is an expected fail-closed outcome, not a persistence failure. Keeping
 * it distinct from arbitrary exceptions means stale UI controls cannot mutate a
 * replacement object while genuine programming errors still reject visibly.
 */
export class LinguisticRuleTargetMissingError extends Error {
  constructor() {
    super("linguistic-rule authority target no longer exists");
    this.name = "LinguisticRuleTargetMissingError";
  }
}

export interface ApplyLinguisticRuleStateRequest {
  /** Mutable LanguageConfig-compatible state owned by plugin settings. */
  state: LinguisticRuleState;

  /**
   * Complete requested replacement state.
   *
   * The transaction assigns these detached arrays as one state transition
   * before asking the plugin to persist them.
   */
  requested: LinguisticRuleCandidate;

  /** Persist the plugin's current in-memory settings state. */
  save: () => Promise<void>;
}

/**
 * One queued linguistic-rule edit.
 *
 * The edit callback receives a fresh detached candidate only when this request
 * reaches the front of the queue. Delaying candidate construction is essential:
 * a candidate cloned while an earlier save was still pending could otherwise
 * overwrite that earlier transaction with stale rule data.
 */
export interface QueueLinguisticRuleStateRequest {
  /** Mutable LanguageConfig-compatible state owned by plugin settings. */
  state: LinguisticRuleState;

  /**
   * Apply one requested change to a detached candidate.
   *
   * This callback must modify only the supplied candidate. It must not mutate
   * the live LanguageConfig captured by UI code.
   */
  edit: (candidate: LinguisticRuleCandidate) => void;

  /** Persist the plugin's current in-memory settings state. */
  save: () => Promise<void>;
}

/**
 * Clone one cypher rule.
 *
 * CypherRule currently contains only primitive values, so an explicit object
 * copy is a complete clone. Keeping this helper explicit makes future additions
 * to the rule type visible during review instead of hiding them inside a
 * serialization-based clone.
 */
function cloneCypherRule(rule: CypherRule): CypherRule {
  return { ...rule };
}

/**
 * Deep-clone cypher sheets far enough to detach every mutable object.
 *
 * Copying only the outer sheets array would be unsafe: each sheet and each
 * nested rule would still be shared with live settings, so editing a candidate
 * could silently edit the rollback state as well.
 */
export function cloneCypherSheets(sheets: CypherSheet[]): CypherSheet[] {
  return sheets.map((sheet) => ({
    ...sheet,
    rules: sheet.rules.map(cloneCypherRule),
  }));
}

/**
 * Clone the optional inflection-rule array while preserving the distinction
 * between "not configured" (undefined) and "configured with zero rules" ([]).
 */
export function cloneInflectionRules(
  rules: InflectionRule[] | undefined,
): InflectionRule[] | undefined {
  return rules?.map((rule) => ({ ...rule }));
}

/**
 * Build a fully detached candidate from the currently authoritative rule state.
 *
 * UI code should start each requested edit from this helper, modify the returned
 * candidate, then pass that complete candidate to applyLinguisticRuleState().
 * That keeps partially constructed edits away from live runtime consumers.
 */
export function cloneLinguisticRuleState(
  state: LinguisticRuleState,
): LinguisticRuleCandidate {
  return {
    sheets: cloneCypherSheets(state.sheets),
    inflections: cloneInflectionRules(state.inflections),
  };
}

/**
 * Provenance captured while the queue constructs a detached candidate.
 *
 * Candidate objects cannot safely use their array indexes as identity because
 * sheet and rule order is editable. These maps let a successful transaction
 * reconnect each surviving clone to the exact authoritative object it came
 * from, even after the candidate has been reordered.
 *
 * Newly added candidate objects intentionally have no map entry. They become
 * new authoritative objects after persistence succeeds.
 */
interface LinguisticRuleCloneProvenance {
  sheets: Map<CypherSheet, CypherSheet>;
  rules: Map<CypherRule, CypherRule>;
  inflections: Map<InflectionRule, InflectionRule>;
}

/**
 * Clone the current authority while remembering the origin of every existing
 * mutable object.
 *
 * This is queue-internal rather than part of the public cloning API because the
 * provenance is meaningful only for the exact state from which this candidate
 * was constructed.
 */
function cloneLinguisticRuleStateWithProvenance(state: LinguisticRuleState): {
  candidate: LinguisticRuleCandidate;
  provenance: LinguisticRuleCloneProvenance;
} {
  const provenance: LinguisticRuleCloneProvenance = {
    sheets: new Map(),
    rules: new Map(),
    inflections: new Map(),
  };

  const sheets = state.sheets.map((sheet) => {
    const candidateSheet: CypherSheet = {
      ...sheet,
      rules: sheet.rules.map((rule) => {
        const candidateRule = { ...rule };
        provenance.rules.set(candidateRule, rule);
        return candidateRule;
      }),
    };

    provenance.sheets.set(candidateSheet, sheet);
    return candidateSheet;
  });

  const inflections = state.inflections?.map((rule) => {
    const candidateRule = { ...rule };
    provenance.inflections.set(candidateRule, rule);
    return candidateRule;
  });

  return {
    candidate: {
      sheets,
      inflections,
    },
    provenance,
  };
}

/**
 * Re-establish successfully persisted candidate values using the pre-existing
 * authoritative objects wherever those objects survived the edit.
 *
 * Why reconcile after saving?
 *
 * During saveSettings(), the detached candidate must be installed so the exact
 * requested values are what persistence serializes. After that save succeeds,
 * however, keeping all of those clones as runtime authority would invalidate
 * object references already held by the rendered Settings UI.
 *
 * Provenance lets us preserve identity without weakening authorization:
 *
 * - surviving sheets/rules reuse their exact previous objects;
 * - reordered objects keep their identities in their new order;
 * - deleted objects are omitted;
 * - newly added objects have no provenance and therefore become new authority;
 * - persisted primitive values are copied from the candidate only after save
 *   success, so a failed save never contaminates the old authority.
 */
function reconcileSuccessfulCandidate(
  state: LinguisticRuleState,
  previousSheets: CypherSheet[],
  previousInflections: InflectionRule[] | undefined,
  candidate: LinguisticRuleCandidate,
  provenance: LinguisticRuleCloneProvenance,
): void {
  const reconciledSheets = candidate.sheets.map((candidateSheet) => {
    const authoritativeSheet =
      provenance.sheets.get(candidateSheet) ?? candidateSheet;

    const reconciledRules = candidateSheet.rules.map((candidateRule) => {
      const authoritativeRule =
        provenance.rules.get(candidateRule) ?? candidateRule;

      if (authoritativeRule !== candidateRule) {
        Object.assign(authoritativeRule, candidateRule);
      }

      return authoritativeRule;
    });

    if (authoritativeSheet !== candidateSheet) {
      authoritativeSheet.name = candidateSheet.name;
      authoritativeSheet.enabled = candidateSheet.enabled;

      /*
       * Preserve the existing rules-array identity for surviving sheets. Some
       * rendered controls may still hold this array through their sheet object.
       */
      authoritativeSheet.rules.splice(
        0,
        authoritativeSheet.rules.length,
        ...reconciledRules,
      );
    }

    return authoritativeSheet;
  });

  /*
   * Preserve the outer sheets-array identity as well. Reordering changes its
   * contents, not the identity of the authoritative collection itself.
   */
  previousSheets.splice(0, previousSheets.length, ...reconciledSheets);
  state.sheets = previousSheets;

  if (candidate.inflections === undefined) {
    state.inflections = undefined;
    return;
  }

  const reconciledInflections = candidate.inflections.map((candidateRule) => {
    const authoritativeRule =
      provenance.inflections.get(candidateRule) ?? candidateRule;

    if (authoritativeRule !== candidateRule) {
      Object.assign(authoritativeRule, candidateRule);
    }

    return authoritativeRule;
  });

  if (previousInflections !== undefined) {
    previousInflections.splice(
      0,
      previousInflections.length,
      ...reconciledInflections,
    );
    state.inflections = previousInflections;
  } else {
    /*
     * There was no previous array identity to preserve. The newly persisted
     * candidate array therefore becomes the first authoritative inflection
     * collection.
     */
    state.inflections = reconciledInflections;
  }
}

/**
 * Establish one complete linguistic-rule configuration transactionally.
 *
 * Safety contract:
 *
 * 1. The caller constructs requested state without mutating live rule objects.
 * 2. The complete candidate is installed immediately before persistence so the
 *    save callback serializes exactly the requested configuration.
 * 3. Successful persistence leaves that candidate installed. When this
 *    primitive is used through LinguisticRuleStateQueue, the queue immediately
 *    reconciles the persisted values back into surviving authoritative objects
 *    so rendered UI references remain valid.
 * 4. Failed persistence restores the exact original array references. This is
 *    stronger than reconstructing equivalent values and prevents stale nested
 *    candidate objects from becoming the last known-good authority.
 */
export async function applyLinguisticRuleState(
  request: ApplyLinguisticRuleStateRequest,
): Promise<LinguisticRuleStateResult> {
  const previousSheets = request.state.sheets;
  const previousInflections = request.state.inflections;

  request.state.sheets = request.requested.sheets;
  request.state.inflections = request.requested.inflections;

  try {
    await request.save();
  } catch (error) {
    request.state.sheets = previousSheets;
    request.state.inflections = previousInflections;

    return {
      status: "save-failed",
      error,
    };
  }

  return { status: "applied" };
}

/**
 * Serialize H10 linguistic-rule changes.
 *
 * Several Settings controls can fire while an earlier settings save is still
 * pending. Running those transactions concurrently would make rollback unsafe:
 * an older failed save could restore its snapshot over a newer successful edit.
 *
 * This queue gives H10 changes a strict order. Each request waits for the
 * previous request to settle, then clones the latest settled state. A rejected
 * persistence attempt is converted into the normal "save-failed" result by
 * applyLinguisticRuleState(), so one failure does not poison later requests.
 *
 * Scope is intentionally narrow. This serializes cypher/inflection authority
 * transactions with each other; it does not claim to serialize every unrelated
 * plugin setting save. Broader settings-persistence concurrency remains a
 * separate authority question.
 */
export class LinguisticRuleStateQueue {
  /*
   * The tail represents completion of the most recently queued H10 request.
   * Starting with an already-resolved Promise means the first request can run
   * immediately.
   */
  private tail: Promise<void> = Promise.resolve();

  apply(
    request: QueueLinguisticRuleStateRequest,
  ): Promise<LinguisticRuleStateResult> {
    /*
     * Build the actual transaction only after earlier work has settled. This is
     * what prevents a rapid second UI edit from cloning stale pre-save state.
     */
    const result = this.tail.then(async () => {
      /*
       * Snapshot the authoritative collection references before constructing
       * the candidate. Successful reconciliation will deliberately reuse these
       * identities; failed persistence is already handled by the transaction.
       */
      const previousSheets = request.state.sheets;
      const previousInflections = request.state.inflections;

      const { candidate: requested, provenance } =
        cloneLinguisticRuleStateWithProvenance(request.state);

      try {
        request.edit(requested);
      } catch (error) {
        if (error instanceof LinguisticRuleTargetMissingError) {
          return { status: "target-missing" };
        }
        throw error;
      }

      const transaction = await applyLinguisticRuleState({
        state: request.state,
        requested,
        save: request.save,
      });

      if (transaction.status === "applied") {
        reconcileSuccessfulCandidate(
          request.state,
          previousSheets,
          previousInflections,
          requested,
          provenance,
        );
      }

      return transaction;
    });

    /*
     * Keep the queue tail fulfilled regardless of the transaction result.
     * applyLinguisticRuleState() normally reports save failures as values, but
     * this defensive rejection handler also prevents an unexpected exception
     * (for example from a future edit callback) from permanently blocking every
     * later H10 request.
     */
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
