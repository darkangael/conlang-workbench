import { App, CachedMetadata, TFile, TFolder } from "obsidian";

export type PhonologicalUnitStatus = "established" | "proposed" | "unresolved";

export interface PhonologicalUnit {
  // Stable identity for relationships from later phonotactics,
  // realizations, lexical evidence, and other phonology features.
  id: string;

  // The creator's notation for this contrastive unit.
  // Spoken languages will commonly use IPA here, but the base model
  // deliberately does not require IPA or a spoken modality.
  symbol: string;

  // Optional broad organizational category such as "consonant" or "vowel".
  // This remains open text because those categories are not universal across
  // every modality that Workbench may eventually document.
  category?: string;

  // Analytical status is separate from identity so a documented unit can
  // remain usable while its interpretation is still being worked out.
  status?: PhonologicalUnitStatus;

  // Human-readable language name and stable Language Profile identity are
  // kept separate so later relationships do not have to depend on names.
  language?: string;
  languageId?: string;

  notes?: string;

  // Canonical Markdown source for navigation and future evidence links.
  path?: string;
}

/**
 * Convert a Markdown note's frontmatter into one canonical phonological unit.
 *
 * This parser is intentionally small for the first milestone. It only accepts
 * the fields we have actually decided are part of the stable base model.
 * Later phonology features can add their own structures without forcing this
 * object to become a catch-all for every possible analysis.
 */
export function parsePhonologicalUnit(
  frontmatter: Record<string, unknown>,
  path?: string,
): PhonologicalUnit | null {
  const type =
    typeof frontmatter.type === "string" ? frontmatter.type.trim() : "";

  // Only notes explicitly marked as phonological units belong in this
  // inventory. Other notes may live in the same folder later.
  if (type !== "phonological-unit") {
    return null;
  }

  const rawId =
    frontmatter.unit_id ?? frontmatter.unitId ?? frontmatter["unit-id"];

  const id = typeof rawId === "string" ? rawId.trim() : "";

  const symbol =
    typeof frontmatter.symbol === "string" ? frontmatter.symbol.trim() : "";

  // Identity and representation are the minimum information required for a
  // useful canonical unit. If either is missing, the note is not loadable.
  if (!id || !symbol) {
    return null;
  }

  const category =
    typeof frontmatter.category === "string"
      ? frontmatter.category.trim()
      : undefined;

  const language =
    typeof frontmatter.language === "string"
      ? frontmatter.language.trim()
      : undefined;

  const rawLanguageId =
    frontmatter.language_id ??
    frontmatter.languageId ??
    frontmatter["language-id"];

  const languageId =
    typeof rawLanguageId === "string" ? rawLanguageId.trim() : undefined;

  const notes =
    typeof frontmatter.notes === "string"
      ? frontmatter.notes.trim()
      : undefined;

  const rawStatus =
    typeof frontmatter.status === "string"
      ? frontmatter.status.trim()
      : undefined;

  const status: PhonologicalUnitStatus | undefined =
    rawStatus === "established" ||
    rawStatus === "proposed" ||
    rawStatus === "unresolved"
      ? rawStatus
      : undefined;

  return {
    id,
    symbol,
    category: category || undefined,
    status,
    language: language || undefined,
    languageId: languageId || undefined,
    notes: notes || undefined,
    path,
  };
}

/**
 * A configured source of canonical phonological-unit notes.
 *
 * The folder determines where units are discovered. Language information can
 * be supplied by the active Language Profile when an individual unit note does
 * not repeat it in frontmatter.
 */
export interface PhonologySource {
  folder: string;
  language?: string;
  languageId?: string;
}

/**
 * In-memory collection of documented contrastive phonological units.
 *
 * This first inventory deliberately does only a few things:
 * - discover explicitly marked phonological-unit notes;
 * - preserve their language identity;
 * - index them by stable unit ID.
 *
 * Realizations, allophones, phonotactics, feature systems, and diagnostics
 * belong to later layers rather than being folded into this basic loader.
 */
export class PhonologyInventory {
  private all: PhonologicalUnit[] = [];
  private byId = new Map<string, PhonologicalUnit[]>();

  constructor(private app: App) {}

  /**
   * Remove every currently loaded unit.
   *
   * Reloading starts from an empty inventory so units from languages that are
   * no longer active cannot remain behind as stale data.
   */
  clear(): void {
    this.all = [];
    this.byId.clear();
  }

  /**
   * Return a copy of the loaded inventory rather than exposing the mutable
   * internal array directly.
   */
  allUnits(): PhonologicalUnit[] {
    return this.all.slice();
  }

  /**
   * Find units by their stable ID.
   *
   * IDs are compared case-insensitively for lookup convenience. Optional
   * language filters let identical local IDs coexist across multiple active
   * languages without forcing language names into the IDs themselves.
   */
  lookupId(
    id: string,
    languageId?: string,
    language?: string,
  ): PhonologicalUnit[] {
    const normalized = id.trim().toLowerCase();
    if (!normalized) return [];

    const matches = this.byId.get(normalized) ?? [];

    return matches.filter((unit) => {
      if (languageId && unit.languageId !== languageId) return false;
      if (language && unit.language !== language) return false;
      return true;
    });
  }

  /**
   * Convenience wrapper for loading one configured phonology folder.
   */
  async loadFromFolder(
    folderPath: string,
    language?: string,
    languageId?: string,
  ): Promise<number> {
    return this.loadFromFolders([
      {
        folder: folderPath,
        language,
        languageId,
      },
    ]);
  }

  /**
   * Load canonical phonological-unit notes from every configured source.
   *
   * Explicit language metadata on the note wins. Source-level language data is
   * inherited only when the note omits it, matching the pattern used by the
   * other language-specific inventories.
   */
  async loadFromFolders(sources: PhonologySource[]): Promise<number> {
    this.clear();

    let count = 0;

    for (const source of sources) {
      const folderPath = source.folder.trim();
      if (!folderPath) continue;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) continue;

      const files = this.collectMarkdownFiles(folder);

      for (const file of files) {
        const unit = this.readUnit(file);
        if (!unit) continue;

        // If both the source and the note explicitly name a language, they
        // must agree. This prevents a misplaced note from silently entering
        // the wrong active language's inventory.
        if (
          source.language &&
          unit.language &&
          unit.language !== source.language
        ) {
          continue;
        }

        if (
          source.languageId &&
          unit.languageId &&
          unit.languageId !== source.languageId
        ) {
          continue;
        }

        // A configured language provides context for simpler notes that do not
        // need to repeat the same language metadata individually.
        if (!unit.language && source.language) {
          unit.language = source.language;
        }

        if (!unit.languageId && source.languageId) {
          unit.languageId = source.languageId;
        }

        this.addUnit(unit);
        count++;
      }
    }

    return count;
  }

  /**
   * Recursively gather Markdown files beneath a configured phonology folder.
   *
   * Folder organization is left to the creator; the `type:` marker, not a
   * particular subfolder layout, decides whether a note is a phonological unit.
   */
  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const out: TFile[] = [];

    const walk = (current: TFolder) => {
      for (const child of current.children) {
        if (child instanceof TFile && child.extension === "md") {
          out.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };

    walk(folder);
    return out;
  }

  /**
   * Parse one Markdown file using Obsidian's cached frontmatter.
   */
  private readUnit(file: TFile): PhonologicalUnit | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const frontmatter = cache.frontmatter ?? {};

    return parsePhonologicalUnit(frontmatter, file.path);
  }

  /**
   * Add one validated unit to both the complete inventory and the stable-ID
   * lookup index.
   */
  private addUnit(unit: PhonologicalUnit): void {
    this.all.push(unit);

    const key = unit.id.trim().toLowerCase();
    const existing = this.byId.get(key) ?? [];

    existing.push(unit);
    this.byId.set(key, existing);
  }
}
