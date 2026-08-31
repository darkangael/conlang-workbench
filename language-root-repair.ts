import type { LanguageConfig } from "./types";
import {
  configuredLanguageRootClaims,
  findLanguageRootClaimConflict,
  type LanguageAuthorityPathState,
  validateLanguageRoot,
} from "./language-root-authority";
import {
  buildStandardLanguagePathsFromRoot,
  type StandardLanguagePaths,
} from "./language-standard-paths";

/**
 * Canonical configuration values established by an explicit root repair.
 *
 * Root repair deliberately returns only the structural/source fields it owns.
 * Callers must preserve unrelated configuration such as sheets, hover state,
 * profilePath, and future creator metadata.
 */
export interface LanguageRootRepairConfiguration {
  rootFolder: string;
  dictionaryFolder: string;
  morphemeFolder: string;
  exampleFolder: string;
  phonologyFolder: string;
}

/**
 * A successful repair plan is still read-only.
 *
 * `foldersToReuse` identifies standard direct children that already exist.
 * `foldersToCreate` identifies standard direct children that may be created
 * additively by a later mutation boundary.
 *
 * No nested search is performed. For example, Old Material/Lexicon does not
 * become canonical merely because it shares the familiar folder name.
 */
export interface LanguageRootRepairPlan {
  status: "planned";
  root: string;
  paths: StandardLanguagePaths;
  foldersToReuse: string[];
  foldersToCreate: string[];
  configuration: LanguageRootRepairConfiguration;
}

export type LanguageRootRepairPlanResult =
  | LanguageRootRepairPlan
  | {
      status: "blocked";
      reason:
        | "invalid-root"
        | "missing-root"
        | "root-not-folder"
        | "root-conflict"
        | "unconfigured-root"
        | "standard-path-not-folder";
      detail: string;
    };

/**
 * Build a fail-closed repair plan for one explicitly selected language root.
 *
 * This function has no Obsidian dependency and performs no mutation.
 *
 * Repair authority is intentionally narrower than new-language creation:
 *
 * - the selected Languages/<root> folder must already exist;
 * - another configured language may not already reserve that root;
 * - an existing root that this configuration does not already own is reserved
 *   for explicit language import rather than being silently adopted by repair;
 * - existing standard direct-child folders are reused;
 * - missing standard direct-child folders may be created later;
 * - a file or other non-folder occupying a standard direct-child path blocks
 *   the entire repair before any mutation begins;
 * - unrelated and nested creator folders are ignored and preserved.
 */
export function planLanguageRootRepair(request: {
  language: LanguageConfig;
  languages: readonly LanguageConfig[];
  rootFolder: string;
  pathState: (path: string) => LanguageAuthorityPathState;
}): LanguageRootRepairPlanResult {
  const { language, languages, rootFolder, pathState } = request;

  const validatedRoot = validateLanguageRoot(rootFolder);

  if (validatedRoot.status === "invalid") {
    return {
      status: "blocked",
      reason: "invalid-root",
      detail: validatedRoot.detail,
    };
  }

  const rootState = pathState(validatedRoot.root);

  if (rootState === "missing") {
    return {
      status: "blocked",
      reason: "missing-root",
      detail:
        `Language root "${validatedRoot.root}" does not exist. Root repair ` +
        "can reconnect only to an existing language root.",
    };
  }

  if (rootState === "other") {
    return {
      status: "blocked",
      reason: "root-not-folder",
      detail: `Language root "${validatedRoot.root}" exists but is not a folder.`,
    };
  }

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
   * Reaching this point already proves that the selected modern language root
   * exists as a folder. Under the structural ownership model, that existence
   * itself means the root is occupied; callers do not get to weaken that fact
   * by supplying a potentially incomplete list of vault roots.
   *
   * Ordinary Repair therefore continues only when this exact configuration
   * already has a structural claim to the selected root. Adopting some other
   * existing Languages/<root> folder is an explicit Import Language action.
   */
  const selfClaims = configuredLanguageRootClaims(language);
  const targetAlreadyOwnedByLanguage = selfClaims.includes(validatedRoot.root);

  if (!targetAlreadyOwnedByLanguage) {
    return {
      status: "blocked",
      reason: "unconfigured-root",
      detail:
        `Language root "${validatedRoot.root}" already exists but is not ` +
        `owned by "${language.name}". Use the explicit Import Language ` +
        "authority path to adopt an existing unconfigured language root.",
    };
  }

  const paths = buildStandardLanguagePathsFromRoot(validatedRoot.root);

  /*
   * Only the six expected DIRECT children participate in canonical repair.
   *
   * This is intentionally shallow. A nested folder such as
   * Historical/Lexicon remains creator-owned material and is never promoted,
   * merged, moved, or interpreted as canonical by this planner.
   */
  const standardChildren = [
    paths.lexicon,
    paths.morphemes,
    paths.inflections,
    paths.cyphers,
    paths.examples,
    paths.phonology,
  ];

  const foldersToReuse: string[] = [];
  const foldersToCreate: string[] = [];

  for (const path of standardChildren) {
    const state = pathState(path);

    if (state === "other") {
      return {
        status: "blocked",
        reason: "standard-path-not-folder",
        detail:
          `Required standard path "${path}" exists but is not a folder. ` +
          "Workbench will not replace, move, or reinterpret that object.",
      };
    }

    if (state === "folder") {
      foldersToReuse.push(path);
    } else {
      foldersToCreate.push(path);
    }
  }

  return {
    status: "planned",
    root: validatedRoot.root,
    paths,
    foldersToReuse,
    foldersToCreate,
    configuration: {
      rootFolder: validatedRoot.root,
      dictionaryFolder: paths.lexicon,
      morphemeFolder: paths.morphemes,
      exampleFolder: paths.examples,
      phonologyFolder: paths.phonology,
    },
  };
}
