import type { LanguageConfig } from "./types";
import { isPathWithinFolder, validateVaultRelativePath } from "./vault-paths";

/**
 * Workbench's structural container for configured language trees.
 *
 * The container itself is never owned by one language. Each immediate child
 * folder is a separate language root:
 *
 *   Languages/Mer
 *   Languages/Language 2
 *   Languages/Test Language
 *
 * Everything recursively beneath one of those roots belongs to that language.
 */
export const LANGUAGE_CONTAINER = "Languages";

/**
 * Canonical folder-backed source properties currently wired into runtime
 * loading.
 *
 * Root authority is broader than this list: creator-authored folders and notes
 * that Workbench does not currently index still belong to the language when
 * they live beneath its root.
 */
export type CanonicalLanguageSourceSetting =
  "dictionaryFolder" | "morphemeFolder" | "exampleFolder" | "phonologyFolder";

interface ConfiguredCanonicalSource {
  setting: CanonicalLanguageSourceSetting;
  path: string;
}

/**
 * Result of recovering structural root authority from an older configuration
 * that predates LanguageConfig.rootFolder.
 *
 * "inferred" means every configured canonical source identifies exactly the
 * same immediate child beneath Languages/.
 *
 * "unresolved" means Workbench cannot establish a modern language root without
 * guessing. The caller must preserve compatibility behavior or require an
 * explicit creator repair instead of silently inventing authority.
 */
export type LanguageRootInferenceResult =
  | {
      status: "inferred";
      root: string;
    }
  | {
      status: "unresolved";
      reason:
        | "invalid-source-path"
        | "outside-language-container"
        | "source-is-language-container"
        | "inconsistent-language-roots";
      detail: string;
    };

/**
 * Result of validating one path as a structural language root.
 */
export type LanguageRootValidationResult =
  | { status: "valid"; root: string }
  | {
      status: "invalid";
      reason:
        "invalid-root-path" | "root-is-container" | "root-not-direct-child";
      detail: string;
    };

/**
 * Result of validating a canonical source against a known language root.
 *
 * This layer checks structural ownership only. Vault-aware callers must also
 * check that the relevant paths exist and are folders before committing them.
 */
export type CanonicalSourceRootValidationResult =
  | { status: "valid" }
  | {
      status: "invalid";
      reason: "invalid-root" | "invalid-source" | "outside-language-root";
      detail: string;
    };

/**
 * Small vault-state vocabulary used by proactive authority validation.
 *
 * The structural validator deliberately does not import Obsidian. Production
 * translates vault objects into these states, while regression tests can use
 * simple stand-ins.
 */
export type LanguageAuthorityPathState = "folder" | "missing" | "other";

export type LanguageSourceChangeValidationResult =
  | { status: "valid" }
  | {
      status: "invalid";
      reason:
        | "blank-dictionary"
        | "root-unresolved"
        | "invalid-root"
        | "missing-root"
        | "root-not-folder"
        | "root-conflict"
        | "invalid-source"
        | "outside-language-root"
        | "missing-source"
        | "source-not-folder";
      detail: string;
    };

function configuredCanonicalSources(
  language: LanguageConfig,
): ConfiguredCanonicalSource[] {
  const sources: ConfiguredCanonicalSource[] = [
    {
      setting: "dictionaryFolder",
      path: language.dictionaryFolder,
    },
  ];

  if (language.morphemeFolder?.trim()) {
    sources.push({
      setting: "morphemeFolder",
      path: language.morphemeFolder,
    });
  }

  if (language.exampleFolder?.trim()) {
    sources.push({
      setting: "exampleFolder",
      path: language.exampleFolder,
    });
  }

  if (language.phonologyFolder?.trim()) {
    sources.push({
      setting: "phonologyFolder",
      path: language.phonologyFolder,
    });
  }

  return sources;
}

/**
 * Validate that a configured root is exactly one immediate child beneath the
 * Languages container.
 *
 * Valid:
 *   Languages/Mer
 *   Languages/Test Language
 *
 * Invalid:
 *   Languages
 *   Languages/Mer/Grammar
 *   Reference/Mer
 */
export function validateLanguageRoot(
  rootFolder: string,
): LanguageRootValidationResult {
  let safeRoot: string;

  try {
    safeRoot = validateVaultRelativePath(rootFolder);
  } catch (error) {
    return {
      status: "invalid",
      reason: "invalid-root-path",
      detail:
        `language root "${rootFolder}" is not a safe vault path: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  const parts = safeRoot.split("/");

  if (safeRoot === LANGUAGE_CONTAINER) {
    return {
      status: "invalid",
      reason: "root-is-container",
      detail:
        `"${LANGUAGE_CONTAINER}" is the shared language container, not an ` +
        "individual language root.",
    };
  }

  if (parts.length !== 2 || parts[0] !== LANGUAGE_CONTAINER) {
    return {
      status: "invalid",
      reason: "root-not-direct-child",
      detail:
        `language root "${safeRoot}" must be one immediate child beneath ` +
        `"${LANGUAGE_CONTAINER}/".`,
    };
  }

  return {
    status: "valid",
    root: safeRoot,
  };
}

/**
 * Extract the language root identified by one canonical source path.
 *
 * The important distinction is that we do NOT use a generic parent-folder
 * rule. We specifically recognize the first folder immediately beneath the
 * known Languages/ structural container.
 *
 * For example:
 *
 *   Languages/Mer/Lexicon
 *   Languages/Mer/Grammar/Notes
 *
 * both identify:
 *
 *   Languages/Mer
 *
 * A historical path such as "Made Up Words/Example" identifies no modern
 * Workbench language root and therefore remains unresolved.
 */
function rootFromCanonicalSource(
  setting: CanonicalLanguageSourceSetting,
  sourcePath: string,
):
  | { status: "resolved"; root: string }
  | {
      status: "unresolved";
      reason:
        | "invalid-source-path"
        | "outside-language-container"
        | "source-is-language-container";
      detail: string;
    } {
  let safePath: string;

  try {
    safePath = validateVaultRelativePath(sourcePath);
  } catch (error) {
    return {
      status: "unresolved",
      reason: "invalid-source-path",
      detail:
        `${setting} "${sourcePath}" is not a safe vault path: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  const parts = safePath.split("/");

  if (safePath === LANGUAGE_CONTAINER) {
    return {
      status: "unresolved",
      reason: "source-is-language-container",
      detail:
        `${setting} points at "${LANGUAGE_CONTAINER}", which is the shared ` +
        "language container rather than an individual language tree.",
    };
  }

  if (parts.length < 2 || parts[0] !== LANGUAGE_CONTAINER) {
    return {
      status: "unresolved",
      reason: "outside-language-container",
      detail:
        `${setting} "${safePath}" is not inside a language root beneath ` +
        `"${LANGUAGE_CONTAINER}/".`,
    };
  }

  return {
    status: "resolved",
    root: `${LANGUAGE_CONTAINER}/${parts[1]}`,
  };
}

/**
 * Return every structural language root currently reserved by a configuration.
 *
 * A valid explicit root is authoritative. For an older configuration that has
 * no usable rootFolder yet, safely recognizable Languages/<root> source paths
 * still reserve their trees. This matters even when the language is inactive
 * or malformed: deactivation must not surrender structural ownership.
 */
export function configuredLanguageRootClaims(
  language: LanguageConfig,
): string[] {
  if (language.rootFolder) {
    const explicit = validateLanguageRoot(language.rootFolder);

    if (explicit.status === "valid") {
      return [explicit.root];
    }
  }

  const claims = new Set<string>();

  for (const source of configuredCanonicalSources(language)) {
    const resolved = rootFromCanonicalSource(source.setting, source.path);

    if (resolved.status === "resolved") {
      claims.add(resolved.root);
    }
  }

  return [...claims];
}

/**
 * Find another configured language that already reserves a proposed root.
 *
 * Activation state is intentionally absent from this function. Runtime loading
 * may be inactive while structural ownership remains fully in force.
 */
export function findLanguageRootClaimConflict(
  rootFolder: string,
  language: LanguageConfig,
  languages: readonly LanguageConfig[],
): { language: string; root: string } | null {
  for (const other of languages) {
    if (other === language) {
      continue;
    }

    for (const claimedRoot of configuredLanguageRootClaims(other)) {
      if (languageRootsOverlap(rootFolder, claimedRoot)) {
        return {
          language: other.name,
          root: claimedRoot,
        };
      }
    }
  }

  return null;
}

/**
 * Conservatively recover a missing structural root from legacy canonical
 * source configuration.
 *
 * One source is sufficient when it clearly identifies Languages/<root>.
 * Multiple sources are stronger evidence, but they must ALL identify the same
 * root. A configuration split across two language trees is malformed and must
 * be repaired explicitly rather than having Workbench choose one side.
 *
 * The language display name is deliberately irrelevant to legacy inference.
 * A display-name difference must not make recovery guess that structural
 * ownership moved. Explicit authorized rename uses a separate transaction that
 * deliberately renames the already-established owned root.
 */
export function inferLegacyLanguageRoot(
  language: LanguageConfig,
): LanguageRootInferenceResult {
  const sources = configuredCanonicalSources(language);
  let inferredRoot: string | null = null;

  for (const source of sources) {
    const resolved = rootFromCanonicalSource(source.setting, source.path);

    if (resolved.status === "unresolved") {
      return resolved;
    }

    if (inferredRoot === null) {
      inferredRoot = resolved.root;
      continue;
    }

    if (resolved.root !== inferredRoot) {
      return {
        status: "unresolved",
        reason: "inconsistent-language-roots",
        detail:
          `configured canonical sources identify both "${inferredRoot}" and ` +
          `"${resolved.root}" as language roots; Workbench cannot choose ` +
          "between them safely.",
      };
    }
  }

  /*
   * dictionaryFolder is required by LanguageConfig, so a valid configuration
   * always reaches this point with at least one source. Keeping this guard
   * nevertheless makes the function fail loudly if that contract changes.
   */
  if (inferredRoot === null) {
    throw new Error(
      "LanguageConfig contained no canonical source from which to infer a root.",
    );
  }

  return {
    status: "inferred",
    root: inferredRoot,
  };
}

/**
 * Validate that one canonical source remains inside its language's established
 * structural ownership boundary.
 */
export function validateCanonicalSourceWithinRoot(
  rootFolder: string,
  sourcePath: string,
): CanonicalSourceRootValidationResult {
  const rootResult = validateLanguageRoot(rootFolder);

  if (rootResult.status === "invalid") {
    return {
      status: "invalid",
      reason: "invalid-root",
      detail: rootResult.detail,
    };
  }

  let safeSource: string;

  try {
    safeSource = validateVaultRelativePath(sourcePath);
  } catch (error) {
    return {
      status: "invalid",
      reason: "invalid-source",
      detail:
        `canonical source "${sourcePath}" is not a safe vault path: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }

  /*
   * A canonical inventory source must be a descendant of the language root,
   * not the root itself.
   *
   * isPathWithinFolder() deliberately treats equality as containment for many
   * ownership checks. That broader behavior is correct elsewhere, but using the
   * language root itself as an inventory source would let a recursive loader
   * interpret unrelated creator-owned notes beneath the root as dictionary,
   * morpheme, example, or phonology data.
   */
  if (safeSource === rootResult.root) {
    return {
      status: "invalid",
      reason: "outside-language-root",
      detail:
        `canonical source "${safeSource}" must be inside language root ` +
        `"${rootResult.root}", not the root folder itself.`,
    };
  }

  if (!isPathWithinFolder(safeSource, rootResult.root)) {
    return {
      status: "invalid",
      reason: "outside-language-root",
      detail:
        `canonical source "${safeSource}" is outside language root ` +
        `"${rootResult.root}".`,
    };
  }

  return { status: "valid" };
}

/**
 * Validate one requested canonical source before configuration is mutated.
 *
 * This is intentionally stricter than waiting for active-language reload
 * preflight. Inactive languages receive the same protection at edit time.
 *
 * Optional-source removal is allowed because it relinquishes a source claim
 * rather than establishing a new one.
 */
export function validateLanguageSourceChange(request: {
  language: LanguageConfig;
  languages: readonly LanguageConfig[];
  setting: CanonicalLanguageSourceSetting;
  value: string | undefined;
  pathState: (path: string) => LanguageAuthorityPathState;
}): LanguageSourceChangeValidationResult {
  const { language, languages, setting, value, pathState } = request;

  if (setting === "dictionaryFolder" && !value?.trim()) {
    return {
      status: "invalid",
      reason: "blank-dictionary",
      detail: "The dictionary folder cannot be blank.",
    };
  }

  if (setting !== "dictionaryFolder" && value === undefined) {
    return { status: "valid" };
  }

  if (!language.rootFolder) {
    return {
      status: "invalid",
      reason: "root-unresolved",
      detail:
        `Language "${language.name}" has no established Languages/<root> ` +
        "ownership boundary. Repair the language root before changing its " +
        "canonical source folders.",
    };
  }

  const root = validateLanguageRoot(language.rootFolder);

  if (root.status === "invalid") {
    return {
      status: "invalid",
      reason: "invalid-root",
      detail: root.detail,
    };
  }

  const rootState = pathState(root.root);

  if (rootState === "missing") {
    return {
      status: "invalid",
      reason: "missing-root",
      detail:
        `Language root "${root.root}" does not exist. Repair the configured ` +
        "language root before changing canonical sources.",
    };
  }

  if (rootState === "other") {
    return {
      status: "invalid",
      reason: "root-not-folder",
      detail: `Language root "${root.root}" exists but is not a folder.`,
    };
  }

  const conflict = findLanguageRootClaimConflict(
    root.root,
    language,
    languages,
  );

  if (conflict) {
    return {
      status: "invalid",
      reason: "root-conflict",
      detail:
        `Language root "${root.root}" conflicts with "${conflict.root}", ` +
        `already reserved by "${conflict.language}".`,
    };
  }

  const structural = validateCanonicalSourceWithinRoot(root.root, value!);

  if (structural.status === "invalid") {
    return {
      status: "invalid",
      reason:
        structural.reason === "outside-language-root"
          ? "outside-language-root"
          : "invalid-source",
      detail: structural.detail,
    };
  }

  const sourceState = pathState(value!);

  if (sourceState === "missing") {
    return {
      status: "invalid",
      reason: "missing-source",
      detail: `Canonical source folder "${value}" does not exist.`,
    };
  }

  if (sourceState === "other") {
    return {
      status: "invalid",
      reason: "source-not-folder",
      detail: `Canonical source path "${value}" exists but is not a folder.`,
    };
  }

  return { status: "valid" };
}

/**
 * Determine whether two configured roots claim overlapping structural
 * territory.
 *
 * With the current direct-child Languages/<root> model, two valid roots can
 * conflict only by being identical. The ancestor/descendant checks remain here
 * deliberately so this helper still fails closed if malformed or future input
 * reaches it before validation.
 */
export function languageRootsOverlap(
  firstRoot: string,
  secondRoot: string,
): boolean {
  return (
    isPathWithinFolder(firstRoot, secondRoot) ||
    isPathWithinFolder(secondRoot, firstRoot)
  );
}
