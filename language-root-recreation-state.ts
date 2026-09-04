import type { LanguageConfig } from "./types";
import type {
  LanguageRootRecreationPlan,
  LanguageRootRecreationPlanResult,
} from "./language-root-recreation";

/**
 * Settings authority read by Recreate.
 *
 * Recreate does not mutate either collection. They are supplied so the
 * transaction can prove that the exact LanguageConfig selected by the UI is
 * still configured and determine whether successful physical recreation needs
 * an active-runtime reload.
 */
export interface LanguageRootRecreationSettingsState {
  languages: LanguageConfig[];
  activeLanguages: string[];
}

/**
 * Result returned by the ordinary active-language reload boundary.
 *
 * A blocked preflight or thrown detached-preparation error leaves the previous
 * runtime authoritative. Recreate therefore never needs to roll back settings
 * or delete newly established folders after a reload problem.
 */
export type LanguageRootRecreationReloadResult =
  { status: "loaded"; dictionaryCount: number } | { status: "blocked" };

/**
 * Read-only whole-hierarchy preflight performed after confirmation and a fresh
 * recreation plan, but before the first vault mutation.
 *
 * Production should inspect all seven intended folder paths together. A
 * non-folder collision at a later canonical child must therefore block before
 * Workbench creates the root or any earlier child.
 */
export type LanguageRootRecreationHierarchyPreflightResult =
  | { status: "clear" }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    };

/**
 * Result of the strongest filesystem boundary in Recreate.
 *
 * IMPORTANT: production's establishRoot() callback must re-read both the shared
 * Languages container and the exact configured root immediately before trying
 * to create the root. It must NOT use ordinary ensureVaultFolderStrict()
 * semantics for this ownership boundary, because that helper may establish
 * missing ancestors and intentionally reuses a folder that appears
 * concurrently.
 *
 * Recreate has narrower authority:
 *
 * - the shared Languages container must still exist as a folder;
 * - if that container disappeared or became a non-folder, stop rather than
 *   recreating or reinterpreting broader shared structure;
 * - if the configured root is still missing, this transaction may establish it;
 * - if a root folder appeared, stop and direct the creator to Repair instead;
 * - if a non-folder appeared at the root, stop as a hard collision.
 */
export type LanguageRootRecreationRootEstablishmentResult =
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
 * Observable result of one explicit Recreate transaction.
 *
 * There are intentionally no settings-save outcomes here. Recreate restores
 * physical structure at paths the existing configuration already claims; it
 * does not change that configuration.
 */
export type LanguageRootRecreationStateResult =
  | {
      status: "applied";
      name: string;
      root: string;
      dictionaryCount?: number;
      foldersEstablished: true;
    }
  | {
      status: "cancelled";
      name: string;
      root: string;
    }
  | {
      status: "target-missing";
    }
  | {
      status: "target-changed";
      name: string;
      root: string;
    }
  | {
      status: "blocked";
      reason: string;
      detail: string;
    }
  | {
      status: "root-establishment-failed";
      error: unknown;
    }
  | {
      status: "folder-establishment-failed";
      error: unknown;
      rootEstablished: true;
    }
  | {
      status: "reload-blocked";
      name: string;
      root: string;
      foldersEstablished: true;
    }
  | {
      status: "reload-failed";
      name: string;
      root: string;
      error: unknown;
      foldersEstablished: true;
    };

export interface ApplyLanguageRootRecreationStateRequest {
  /**
   * Current settled settings authority.
   *
   * Production must call this transaction from inside SettingsAuthorityQueue so
   * these reads cannot observe another queued transaction's provisional state.
   */
  state: LanguageRootRecreationSettingsState;

  /**
   * Exact configured language selected by the creator.
   *
   * Object identity is part of authorization. A stale settings/diagnostics
   * action must not silently transfer Recreate authority to a replacement
   * object that happens to occupy the same array position or use the same name.
   */
  language: LanguageConfig;

  /**
   * Produce a fresh read-only recreation plan from current settings/vault state.
   *
   * The transaction intentionally calls this twice:
   *
   * 1. before confirmation, to establish what operation is meaningful to ask
   *    the creator to authorize;
   * 2. after confirmation, to ensure the root is still missing and all
   *    configured ownership claims remain valid before structural preflight.
   */
  plan: () => LanguageRootRecreationPlanResult;

  /**
   * Obtain explicit creator authorization for this exact language and root.
   *
   * Production calls the whole state transaction from SettingsAuthorityQueue,
   * so that queue remains held while this Promise is pending.
   */
  confirm: (name: string, root: string) => Promise<boolean>;

  /**
   * Inspect the complete intended seven-folder hierarchy without mutation.
   */
  preflightHierarchy: (
    plan: LanguageRootRecreationPlan,
  ) => LanguageRootRecreationHierarchyPreflightResult;

  /**
   * Perform the final shared-container and missing-root observations immediately
   * adjacent to creation.
   *
   * This callback owns the narrow filesystem races that cannot be reserved by
   * the earlier pure planner or hierarchy preflight. It must verify that the
   * shared Languages container still exists as a folder, and it must never
   * adopt a root folder that appeared while confirmation/preflight was in
   * progress.
   */
  establishRoot: (
    plan: LanguageRootRecreationPlan,
  ) => Promise<LanguageRootRecreationRootEstablishmentResult>;

  /**
   * Establish the six canonical children only after establishRoot() positively
   * established this transaction's ownership boundary.
   *
   * Child creation is additive. Concurrently appearing child folders may be
   * reused, while non-folder collisions still fail closed. Partial creation is
   * deliberately preserved rather than deleted on failure.
   */
  establishChildren: (plan: LanguageRootRecreationPlan) => Promise<void>;

  /**
   * Rebuild runtime inventories only when this configured language is active.
   */
  reload: () => Promise<LanguageRootRecreationReloadResult>;
}

/**
 * Recreate a missing configured language root as one explicit authority
 * transaction.
 *
 * Security-sensitive ordering:
 *
 * 1. Re-find the exact LanguageConfig object before planning or confirmation.
 * 2. Calculate a fresh missing-root plan.
 * 3. Capture the exact name, root, and stable Workbench ID being authorized.
 * 4. Hold the caller's common settings-authority queue while confirmation is
 *    open.
 * 5. After approval, revalidate the exact object and approved identity.
 * 6. Calculate a second fresh plan from current authority.
 * 7. Preflight the complete seven-folder hierarchy without mutation.
 * 8. Let establishRoot() perform the final shared-container and missing-root
 *    observations immediately adjacent to root creation.
 * 9. Only after that root is positively established may the six canonical
 *    children be created additively.
 * 10. Reload only when the language is active.
 *
 * Recreate never changes or saves settings. The configured root, canonical
 * source paths, and Workbench ID are existing authority. It also never deletes
 * folders during failure handling: once additive structure becomes
 * creator-visible, guessing that deletion is still safe would require stronger
 * authority than Recreate owns.
 */
export async function applyLanguageRootRecreationState(
  request: ApplyLanguageRootRecreationStateRequest,
): Promise<LanguageRootRecreationStateResult> {
  if (!request.state.languages.includes(request.language)) {
    return { status: "target-missing" };
  }

  const initialPlan = request.plan();

  if (initialPlan.status === "blocked") {
    return {
      status: "blocked",
      reason: initialPlan.reason,
      detail: initialPlan.detail,
    };
  }

  /*
   * Capture exactly what the creator is about to authorize.
   *
   * workbenchID remains optional in the inherited schema while migration
   * compatibility exists. Comparing the exact current value, including
   * undefined, still detects any unexpected identity replacement while the
   * confirmation Promise is pending.
   */
  const approvedName = request.language.name;
  const approvedRoot = initialPlan.root;
  const approvedWorkbenchID = request.language.workbenchID;

  const confirmed = await request.confirm(approvedName, approvedRoot);

  if (!confirmed) {
    return {
      status: "cancelled",
      name: approvedName,
      root: approvedRoot,
    };
  }

  /*
   * The common queue should exclude all properly coordinated settings writes
   * while confirmation is open. Re-check anyway so accidentally unqueued code
   * cannot turn approval of one language/root into authority over another.
   */
  if (!request.state.languages.includes(request.language)) {
    return { status: "target-missing" };
  }

  if (
    request.language.name !== approvedName ||
    request.language.rootFolder !== approvedRoot ||
    request.language.workbenchID !== approvedWorkbenchID
  ) {
    return {
      status: "target-changed",
      name: approvedName,
      root: approvedRoot,
    };
  }

  const freshPlan = request.plan();

  if (freshPlan.status === "blocked") {
    return {
      status: "blocked",
      reason: freshPlan.reason,
      detail: freshPlan.detail,
    };
  }

  /*
   * Defense-in-depth against a malformed or future planner implementation.
   * The second plan may become more restrictive after confirmation, but it may
   * never silently redirect the already-approved Recreate operation elsewhere.
   */
  if (freshPlan.root !== approvedRoot) {
    return {
      status: "target-changed",
      name: approvedName,
      root: approvedRoot,
    };
  }

  const hierarchy = request.preflightHierarchy(freshPlan);

  if (hierarchy.status === "blocked") {
    return {
      status: "blocked",
      reason: hierarchy.reason,
      detail: hierarchy.detail,
    };
  }

  let rootResult: LanguageRootRecreationRootEstablishmentResult;

  try {
    rootResult = await request.establishRoot(freshPlan);
  } catch (error) {
    return {
      status: "root-establishment-failed",
      error,
    };
  }

  if (rootResult.status === "blocked") {
    return {
      status: "blocked",
      reason: rootResult.reason,
      detail: rootResult.detail,
    };
  }

  /*
   * Ownership of the configured root has now been positively established by
   * this explicit transaction. Ordinary additive child-folder semantics are
   * safe only after this point.
   */
  try {
    await request.establishChildren(freshPlan);
  } catch (error) {
    return {
      status: "folder-establishment-failed",
      error,
      rootEstablished: true,
    };
  }

  const isActive = request.state.activeLanguages.includes(
    request.language.name,
  );

  if (!isActive) {
    return {
      status: "applied",
      name: approvedName,
      root: approvedRoot,
      foldersEstablished: true,
    };
  }

  try {
    const reload = await request.reload();

    if (reload.status === "loaded") {
      return {
        status: "applied",
        name: approvedName,
        root: approvedRoot,
        dictionaryCount: reload.dictionaryCount,
        foldersEstablished: true,
      };
    }

    /*
     * Source preflight blocked before replacing live runtime. No configuration
     * changed, so there is nothing to roll back. Preserve the new additive
     * folder structure and report that runtime remains on its previous state.
     */
    return {
      status: "reload-blocked",
      name: approvedName,
      root: approvedRoot,
      foldersEstablished: true,
    };
  } catch (error) {
    /*
     * Detached runtime preparation failed before commit. Again, settings are
     * unchanged and the additive folders remain intentionally preserved.
     */
    return {
      status: "reload-failed",
      name: approvedName,
      root: approvedRoot,
      error,
      foldersEstablished: true,
    };
  }
}
