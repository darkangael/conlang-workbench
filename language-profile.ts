import { App, TFile, CachedMetadata } from "obsidian";
import { LanguageConfig, LanguageProfile } from "./types";
import { parseStringList } from "./word-tokens";

/**
 * Load the canonical Language Profile associated with a configured language.
 *
 * Returns null when:
 * - no profilePath is configured
 * - the path does not resolve to a Markdown file
 * - frontmatter is unavailable
 * - the note is not a language-profile
 * - required profile identity fields are missing
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
  if (!cache) return null;

  const fm = cache.frontmatter ?? {};

  const asString = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return undefined;
  };

  const type = asString(fm.type)?.trim();
  if (type !== "language-profile") return null;

  const id = asString(fm.language_id)?.trim();
  const name = asString(fm.language)?.trim();

  if (!id || !name) return null;

  const modalityList = parseStringList(fm.modality);

  return {
    id,
    name,
    path: abstractFile.path,
    autonym: asString(fm.autonym)?.trim(),
    aliases: parseStringList(fm.aliases),
    status: asString(fm.status)?.trim(),
    modality:
      modalityList && modalityList.length > 1
        ? modalityList
        : modalityList?.[0],
    documentationLanguage: asString(fm.documentation_language)?.trim(),
  };
}
