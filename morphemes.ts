import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import {
  resolveLanguageMembership,
  type LanguageMembershipMode,
} from "./language-membership";
import { Morpheme } from "./types";
import { MorphemeSourceInput, parseMorphemeSource } from "./morpheme-source";
import { WorkbenchSourceRecord } from "./workbench-source";

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

  /**
   * Every source recognized as a morpheme, including sources that are
   * temporarily too malformed to become a complete Morpheme object.
   */
  private sourceRecords: WorkbenchSourceRecord<Morpheme>[] = [];

  private byWorkbenchID = new Map<string, WorkbenchSourceRecord<Morpheme>>();

  // Stable morpheme IDs may be unique only within a language, so keep all
  // matches rather than assuming one globally unique ID across the vault.
  private byId = new Map<string, Morpheme[]>();

  constructor(private app: App) {}

  clear() {
    this.all = [];
    this.sourceRecords = [];
    this.byWorkbenchID.clear();
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
   * Return every source that Workbench recognized as a morpheme.
   *
   * Records with `value: null` remain available here so malformed source data
   * can be surfaced and repaired rather than silently disappearing.
   */
  allSourceRecords(): WorkbenchSourceRecord<Morpheme>[] {
    return this.sourceRecords.slice();
  }

  /**
   * Resolve Workbench's own identity back to the currently loaded source
   * record. This identity is intentionally separate from morpheme IDs.
   */
  lookupWorkbenchID(
    workbenchID: string,
  ): WorkbenchSourceRecord<Morpheme> | undefined {
    return this.byWorkbenchID.get(workbenchID);
  }

  /**
   * Look up morphemes by stable ID.
   *
   * Optional language identity filters let callers distinguish identical
   * morpheme IDs used independently by different languages.
   */
  lookupId(id: string, languageId?: string, language?: string): Morpheme[] {
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
   * Rebuild the inventory from one or more configured language folders.
   *
   * Language name and stable Language Profile ID are inherited from the
   * configured source when a morpheme note does not declare them explicitly.
   */
  async loadFromFolders(
    sources: MorphemeSource[],
    membershipMode: LanguageMembershipMode = "respect-explicit",
  ): Promise<number> {
    this.clear();

    let count = 0;

    for (const source of sources) {
      const folderPath = source.folder.trim();
      if (!folderPath) continue;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) continue;

      const files = this.collectMarkdownFiles(folder);

      for (const file of files) {
        const record = this.readMorphemeSource(file);
        if (!record) continue;

        const morpheme = record.value;

        if (morpheme) {
          const membership = resolveLanguageMembership(
            source.language,
            morpheme.language,
            membershipMode,
          );
          if (!membership.accepted) continue;

          if (
            source.languageId &&
            morpheme.languageId &&
            morpheme.languageId !== source.languageId
          ) {
            continue;
          }

          // Assign runtime membership without modifying the canonical note.
          morpheme.language = membership.runtimeLanguage;

          if (!morpheme.languageId && source.languageId) {
            morpheme.languageId = source.languageId;
          }
        }

        // Store the source record even when it could not become a complete
        // Morpheme. That is what keeps malformed-but-recognized user work
        // visible to Workbench rather than silently discarding it.
        this.addSourceRecord(record);

        if (!morpheme) continue;

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
   * Convert one Obsidian Markdown file into Workbench's source-facing
   * morpheme representation.
   *
   * Raw frontmatter interpretation lives in morpheme-source.ts so this
   * inventory only coordinates source storage and valid feature objects.
   */
  private readMorphemeSource(
    file: TFile,
  ): WorkbenchSourceRecord<Morpheme> | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const input: MorphemeSourceInput = {
      path: file.path,
      basename: file.basename,
      mtime: file.stat.mtime,
      frontmatter: cache.frontmatter ?? {},
    };

    return parseMorphemeSource(input);
  }

  /**
   * Retain a recognized source independently of whether it produced a valid
   * linguistic object.
   */
  private addSourceRecord(record: WorkbenchSourceRecord<Morpheme>) {
    this.sourceRecords.push(record);
    this.byWorkbenchID.set(record.identity.workbenchID, record);
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
