import { App, TFile, CachedMetadata } from "obsidian";
import { LanguageConfig, LanguageProfile } from "./types";
import { parseStringList } from "./word-tokens";
import { validateVaultRelativePath } from "./vault-paths";

export type LanguageProfilePathValidationResult =
  { status: "valid" } | { status: "invalid"; error: string };

/**
 * Convert one metadata-cache frontmatter object into the canonical runtime
 * LanguageProfile model.
 *
 * Keeping this interpretation in one helper prevents the normal loader and the
 * settings-time profile-path validator from gradually accepting different
 * profile formats. The helper is deliberately read-only: creator-authored YAML
 * is interpreted, never repaired or rewritten.
 */
function parseLanguageProfileFrontmatter(
  path: string,
  frontmatter: Record<string, unknown>,
): LanguageProfile | null {
  const asString = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return undefined;
  };

  const type = asString(frontmatter.type)?.trim();
  if (type !== "language-profile") return null;

  const id = asString(frontmatter.language_id)?.trim();
  const name = asString(frontmatter.language)?.trim();

  if (!id || !name) return null;

  const modalityList = parseStringList(frontmatter.modality);

  return {
    id,
    name,
    path,
    autonym: asString(frontmatter.autonym)?.trim(),
    aliases: parseStringList(frontmatter.aliases),
    status: asString(frontmatter.status)?.trim(),
    modality:
      modalityList && modalityList.length > 1
        ? modalityList
        : modalityList?.[0],
    documentationLanguage: asString(frontmatter.documentation_language)?.trim(),
  };
}

/**
 * Validate one creator-requested Language Profile path before it is allowed to
 * replace configured profile authority.
 *
 * Profiles are optional, so undefined means "no canonical profile" and is a
 * valid request. A configured profile may also live outside the language's
 * structural root; H7 deliberately preserves external profile paths. This
 * validator therefore checks path safety, file identity, Markdown type, and
 * profile structure without imposing canonical-folder containment.
 *
 * The profile's `language` field is required by the existing profile format,
 * but it is not required to equal LanguageConfig.name. Display-name matching is
 * a language-model policy that this security transaction must not invent.
 */
export function validateLanguageProfilePath(
  app: App,
  profilePath: string | undefined,
): LanguageProfilePathValidationResult {
  if (profilePath === undefined) {
    return { status: "valid" };
  }

  let safePath: string;

  try {
    safePath = validateVaultRelativePath(profilePath);
  } catch (error) {
    return {
      status: "invalid",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const abstractFile = app.vault.getAbstractFileByPath(safePath);

  if (!(abstractFile instanceof TFile)) {
    return {
      status: "invalid",
      error: `Language profile path "${safePath}" does not resolve to a file.`,
    };
  }

  if (abstractFile.extension !== "md") {
    return {
      status: "invalid",
      error: `Language profile path "${safePath}" is not a Markdown file.`,
    };
  }

  const cache: CachedMetadata | null =
    app.metadataCache.getFileCache(abstractFile);

  if (!cache?.frontmatter) {
    return {
      status: "invalid",
      error: `Language profile "${safePath}" has no readable frontmatter.`,
    };
  }

  if (!parseLanguageProfileFrontmatter(safePath, cache.frontmatter)) {
    return {
      status: "invalid",
      error:
        `Language profile "${safePath}" must have type "language-profile" ` +
        "and nonblank language_id and language fields.",
    };
  }

  return { status: "valid" };
}

/**
 * Load the canonical Language Profile associated with a configured language.
 *
 * Returns null when:
 * - no profilePath is configured
 * - the path does not resolve to a Markdown file
 * - frontmatter is unavailable
 * - the note is not a language-profile
 * - required profile identity fields are missing
 *
 * Runtime loading remains intentionally tolerant: an invalid persisted profile
 * does not crash language loading. Settings-time mutation uses the stricter
 * validateLanguageProfilePath() boundary so new invalid requests fail before
 * they replace configured authority.
 */
export function loadLanguageProfile(
  app: App,
  config: LanguageConfig,
): LanguageProfile | null {
  const profilePath = config.profilePath?.trim();
  if (!profilePath) return null;

  const abstractFile = app.vault.getAbstractFileByPath(profilePath);
  if (!(abstractFile instanceof TFile)) return null;
  if (abstractFile.extension !== "md") return null;

  const cache: CachedMetadata | null =
    app.metadataCache.getFileCache(abstractFile);
  if (!cache?.frontmatter) return null;

  return parseLanguageProfileFrontmatter(abstractFile.path, cache.frontmatter);
}
