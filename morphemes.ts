import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import { Morpheme } from "./types";
import { parseStringList } from "./word-tokens";

/**
 * A configured source folder for one language's morpheme inventory.
 *
 * The caller resolves the canonical Language Profile first and passes its
 * stable ID here when available. The morpheme loader therefore does not need
 * to rediscover or interpret Language Profiles itself.
 */
export interface MorphemeSource {
  folder: string;
  language?: string;
  languageId?: string;
}

/**
 * In-memory inventory of documented morphemes.
 *
 * This deliberately remains separate from Dictionary. Morphemes are
 * morphological documentation and are NOT automatically lexical entries,
 * standalone words, or English-to-conlang lookup candidates.
 */
export class MorphemeInventory {
  private all: Morpheme[] = [];

  // Stable morpheme IDs may be unique only within a language, so keep all
  // matches rather than assuming one globally unique ID across the vault.
  private byId = new Map<string, Morpheme[]>();

  constructor(private app: App) {}

  clear() {
    this.all = [];
    this.byId.clear();
  }

  /**
   * Return every loaded morpheme in insertion order.
   *
   * Return a copy so callers cannot accidentally mutate the inventory's
   * internal collection.
   */
  allMorphemes(): Morpheme[] {
    return this.all.slice();
  }

  /**
   * Look up morphemes by stable ID.
   *
   * Optional language identity filters let callers distinguish identical
   * morpheme IDs used independently by different languages.
   */
  lookupId(
    id: string,
    languageId?: string,
    language?: string
  ): Morpheme[] {
    const normalized = id.trim().toLowerCase();
    if (!normalized) return [];

    const matches = this.byId.get(normalized) ?? [];

    return matches.filter((morpheme) => {
      if (languageId && morpheme.languageId !== languageId) return false;
      if (language && morpheme.language !== language) return false;
      return true;
    });
  }

  /**
   * Load one configured language's morpheme folder.
   *
   * Kept as a convenience wrapper for callers that do not need
   * multi-language loading.
   */
  async loadFromFolder(
    folderPath: string,
    language?: string,
    languageId?: string
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
   * Rebuild the inventory from one or more configured language folders.
   *
   * Language name and stable Language Profile ID are inherited from the
   * configured source when a morpheme note does not declare them explicitly.
   */
  async loadFromFolders(sources: MorphemeSource[]): Promise<number> {
    this.clear();

    let count = 0;

    for (const source of sources) {
      const folderPath = source.folder.trim();
      if (!folderPath) continue;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) continue;

      const files = this.collectMarkdownFiles(folder);

      for (const file of files) {
        const morpheme = this.readMorpheme(file);
        if (!morpheme) continue;

        // Do not allow entries explicitly assigned to another language to leak
        // into this configured source merely because folders overlap.
        if (
          source.language &&
          morpheme.language &&
          morpheme.language !== source.language
        ) {
          continue;
        }

        if (
          source.languageId &&
          morpheme.languageId &&
          morpheme.languageId !== source.languageId
        ) {
          continue;
        }

        // Preserve compatibility with simple notes: language identity may be
        // inherited from configuration rather than repeated in every file.
        if (!morpheme.language && source.language) {
          morpheme.language = source.language;
        }

        if (!morpheme.languageId && source.languageId) {
          morpheme.languageId = source.languageId;
        }

        this.addMorpheme(morpheme);
        count++;
      }
    }

    return count;
  }

  /**
   * Recursively collect Markdown files beneath a configured morpheme folder.
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
   * Parse one canonical morpheme note from frontmatter.
   *
   * Minimal valid note:
   *
   * type: morpheme
   * morpheme_id: plural-s
   * form: -s
   * gloss: plural
   *
   * Richer fields remain optional.
   */
  private readMorpheme(file: TFile): Morpheme | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const fm = cache.frontmatter ?? {};

    const asString = (value: unknown): string | undefined => {
      if (value === undefined || value === null) return undefined;

      if (typeof value === "string") return value;

      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }

      // Arrays and objects are not meaningful for scalar fields.
      return undefined;
    };

    // A morpheme folder may eventually contain supporting Markdown notes.
    // Requiring an explicit document type prevents those from being mistaken
    // for morphemes.
    const documentType = asString(fm.type)?.trim();
    if (documentType !== "morpheme") return null;

    // Stable identity is deliberately explicit rather than filename-derived.
    // Renaming a note or changing its display form must not change references.
    const id = asString(fm.morpheme_id ?? fm.id)?.trim();
    if (!id) return null;

    // `form:` overrides the filename. Filename fallback keeps simple authoring
    // comfortable while the stable identity remains explicit above.
    const formOverride = asString(fm.form)?.trim();
    const form = formOverride || file.basename;
    if (!form.trim()) return null;

    const gloss = asString(
      fm.gloss ?? fm.meaning ?? fm.function
    )?.trim();

    if (!gloss) return null;

    const distributionRaw = asString(fm.distribution)
      ?.trim()
      .toLowerCase();

    const distribution =
      distributionRaw === "free" ||
      distributionRaw === "bound" ||
      distributionRaw === "both" ||
      distributionRaw === "unknown"
        ? distributionRaw
        : undefined;

    return {
      id,
      form,
      gloss,
      type: asString(
        fm.morpheme_type ?? fm.morphemeType ?? fm.category
      )?.trim(),
      distribution,
      realizations: parseStringList(
        fm.realizations ?? fm.allomorphs
      ),
      language: asString(fm.language)?.trim(),
      languageId: asString(
        fm.language_id ?? fm.languageId
      )?.trim(),
      path: file.path,
      notes: asString(fm.notes)?.trim(),
      mtime: file.stat.mtime,
    };
  }

  /**
   * Add a parsed morpheme to the inventory and stable-ID index.
   */
  private addMorpheme(morpheme: Morpheme) {
    this.all.push(morpheme);

    const key = morpheme.id.trim().toLowerCase();
    const existing = this.byId.get(key) ?? [];

    existing.push(morpheme);
    this.byId.set(key, existing);
  }
}
