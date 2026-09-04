import type { LanguageConfig } from "./types";
import {
  findLanguageRootClaimConflict,
  LANGUAGE_CONTAINER,
  type LanguageAuthorityPathState,
  validateLanguageRoot,
} from "./language-root-authority";
import {
  buildStandardLanguagePathsFromRoot,
  type StandardLanguagePaths,
} from "./language-standard-paths";

/**
 * Read-only plan for explicitly recreating a configured language root that has
 * disappeared from the vault.
 *
 * The root and six standard direct children are listed together because later
 * mutation must establish exactly this canonical structure and nothing else.
 * Planning itself creates no folders and changes no configuration.
 */
export interface LanguageRootRecreationPlan {
  status: "planned";
  root: string;
  paths: StandardLanguagePaths;
  foldersToEstablish: string[];
}

export type LanguageRootRecreationPlanResult =
  | LanguageRootRecreationPlan
  | {
      status: "blocked";
      reason:
        | "root-unresolved"
        | "invalid-root"
        | "root-conflict"
        | "container-missing"
        | "container-not-folder"
        | "root-now-folder"
        | "root-not-folder";
      detail: string;
    };

/**
 * Build a fail-closed plan for recreating one configured language's missing
 * structural ownership boundary.
 *
 * Recreate is intentionally NOT a folder picker. The proposed root comes only
 * from LanguageConfig.rootFolder, which represents authority already settled
 * for this exact configured language.
 *
 * Authority rules:
 *
 * - the configuration must already contain a valid Languages/<root> boundary;
 * - no other configured language may claim overlapping structural authority;
 * - the shared Languages container must already exist as a folder;
 * - the configured root must still be missing;
 * - an existing folder stops recreation because Workbench must not assume that
 *   a folder which appeared later is the same root that was previously absent;
 * - an existing non-folder is a hard collision and is never replaced;
 * - successful planning identifies only the root and six canonical children.
 *
 * A later mutation transaction MUST re-check the root immediately before
 * creation. This read-only plan cannot reserve filesystem state across awaits.
 */
export function planLanguageRootRecreation(request: {
  language: LanguageConfig;
  languages: readonly LanguageConfig[];
  pathState: (path: string) => LanguageAuthorityPathState;
}): LanguageRootRecreationPlanResult {
  const { language, languages, pathState } = request;

  /*
   * Unlike legacy inference, recreation is allowed only after Workbench has an
   * explicit configured ownership boundary. Guessing a root from a display
   * name or another path would turn this operation into unauthorized adoption.
   */
  if (!language.rootFolder) {
    return {
      status: "blocked",
      reason: "root-unresolved",
      detail:
        `Language "${language.name}" has no established Languages/<root> ` +
        "ownership boundary. Workbench cannot choose a root to recreate.",
    };
  }

  const validatedRoot = validateLanguageRoot(language.rootFolder);

  if (validatedRoot.status === "invalid") {
    return {
      status: "blocked",
      reason: "invalid-root",
      detail: validatedRoot.detail,
    };
  }

  /*
   * Structural ownership remains meaningful even while the physical root is
   * absent. Another configured language's conflicting claim therefore blocks
   * recreation before vault existence can grant any mutation authority.
   */
  const conflict = findLanguageRootClaimConflict(
    validatedRoot.root,
    language,
    languages,
  );

  if (conflict) {
    return {
      status: "blocked",
      reason: "root-conflict",
      detail:
        `Language root "${validatedRoot.root}" conflicts with ` +
        `"${conflict.root}", already reserved by "${conflict.language}".`,
    };
  }

  /*
   * Recreate owns one already-configured language boundary, not the shared
   * Languages container itself.
   *
   * Add Language has separate authority to establish the shared container when
   * it is absent. Recreate deliberately does not inherit that broader creation
   * authority: disappearance of Languages/ means the creator must restore that
   * shared structure before any individual configured language can be
   * recreated beneath it.
   */
  const containerState = pathState(LANGUAGE_CONTAINER);

  if (containerState === "missing") {
    return {
      status: "blocked",
      reason: "container-missing",
      detail:
        `The shared "${LANGUAGE_CONTAINER}" folder is missing. Workbench will ` +
        "not recreate that shared container while recreating one configured " +
        "language. Restore it in the vault before using Recreate language root.",
    };
  }

  if (containerState === "other") {
    return {
      status: "blocked",
      reason: "container-not-folder",
      detail:
        `The shared "${LANGUAGE_CONTAINER}" path is occupied by an object ` +
        "that is not a folder. Workbench will not replace or reinterpret it.",
    };
  }

  const rootState = pathState(validatedRoot.root);

  if (rootState === "folder") {
    return {
      status: "blocked",
      reason: "root-now-folder",
      detail:
        `A folder now exists at "${validatedRoot.root}". Workbench did not ` +
        "recreate the language root because it will not assume this newly " +
        "present folder is the same root that was previously missing. You may " +
        "wish to try Repair language root instead.",
    };
  }

  if (rootState === "other") {
    return {
      status: "blocked",
      reason: "root-not-folder",
      detail:
        `The configured language root path "${validatedRoot.root}" is now ` +
        "occupied by an object that is not a folder. Workbench will not " +
        "replace or reinterpret it.",
    };
  }

  const paths = buildStandardLanguagePathsFromRoot(validatedRoot.root);

  return {
    status: "planned",
    root: validatedRoot.root,
    paths,
    foldersToEstablish: [
      paths.root,
      paths.lexicon,
      paths.morphemes,
      paths.inflections,
      paths.cyphers,
      paths.examples,
      paths.phonology,
    ],
  };
}
