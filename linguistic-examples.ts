import { App, CachedMetadata, TFile, TFolder } from "obsidian";
import type { LanguageMembershipMode } from "./language-membership";
import { resolveSourceLanguageAuthority } from "./source-language-authority";
import { parseLinguisticExampleSource } from "./linguistic-example-source";
import type { LinguisticExampleSourceInput } from "./linguistic-example-source";
import type { WorkbenchSourceRecord } from "./workbench-source";

/**
 * A documented example of a language in use.
 *
 * This model describes linguistic roles rather than positions in a particular
 * external format. That lets Workbench represent its own examples while later
 * mapping formats such as Ling Gloss onto the same internal model.
 *
 * Only `text` is required. Other tiers are optional because examples may range
 * from a simple sentence to a fully analyzed linguistic example.
 */
export interface LinguisticExample {
  // Stable identity when an example needs to be referenced elsewhere.
  id?: string;

  // The original expression in the language being documented.
  text: string;

  // Pronunciation, phonetic transcription, signed realization, or another
  // modality-appropriate representation of the expression.
  realization?: string;

  // Morphological segmentation of the original expression.
  segmentation?: string;

  // Morpheme-by-morpheme or other aligned linguistic gloss. This remains
  // separate from the natural translation because they serve different roles.
  gloss?: string;

  // Natural translation into the documentation language.
  translation?: string;

  // Human-readable language or variety name.
  language?: string;

  // Stable Language Profile identity when one is available.
  languageId?: string;

  // Where the example came from: text, speaker, document, field note, etc.
  source?: string;

  // Situation or discourse context needed to interpret the example.
  context?: string;

  // Additional creator-authored commentary.
  notes?: string;

  // Canonical Markdown note containing this example when known.
  path?: string;
}

/**
 * A configured source folder for one language's standalone linguistic examples.
 *
 * The caller is responsible for deciding which folder belongs to which
 * language. The example loader only reads and validates the notes inside it.
 */
export interface LinguisticExampleSource {
  folder: string;
  language?: string;
  languageId?: string;
}

/**
 * In-memory collection of standalone linguistic examples.
 *
 * This inventory deliberately handles only notes explicitly marked
 * `type: linguistic-example`. Other documents may contain embedded examples,
 * but those will be adapted into the same LinguisticExample model later
 * instead of being guessed at here.
 */
export class LinguisticExampleInventory {
  private all: LinguisticExample[] = [];

  // Source records remain separate from valid feature-facing examples.
  // This lets Workbench preserve and diagnose recognized malformed sources
  // without pretending they are complete LinguisticExample objects.
  private sourceRecords: WorkbenchSourceRecord<LinguisticExample>[] = [];
  private sourceByWorkbenchID = new Map<
    string,
    WorkbenchSourceRecord<LinguisticExample>
  >();

  constructor(private app: App) {}

  /**
   * Remove every currently loaded example.
   *
   * We rebuild from the configured folders on reload rather than trying to
   * partially merge old and new state.
   */
  clear(): void {
    this.all = [];
    this.sourceRecords = [];
    this.sourceByWorkbenchID.clear();
  }

  /**
   * Return all loaded examples in insertion order.
   *
   * Returning a copy prevents callers from accidentally modifying the
   * inventory's internal array.
   */
  allExamples(): LinguisticExample[] {
    return this.all.slice();
  }

  /**
   * Return every recognized standalone-example source record, including
   * malformed sources that could not become complete LinguisticExample values.
   *
   * Returning a copy prevents callers from replacing the inventory's internal
   * collection accidentally.
   */
  allSourceRecords(): WorkbenchSourceRecord<LinguisticExample>[] {
    return this.sourceRecords.slice();
  }

  /**
   * Look up a recognized source by Workbench's internal identity.
   *
   * This is separate from the optional creator-authored example_id. A source
   * remains addressable even when its linguistic identity is missing.
   */
  lookupWorkbenchID(
    workbenchID: string,
  ): WorkbenchSourceRecord<LinguisticExample> | undefined {
    return this.sourceByWorkbenchID.get(workbenchID);
  }

  /**
   * Load one configured examples folder.
   *
   * This convenience wrapper keeps the simple single-language case easy while
   * the main loader can still support several active languages later.
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
   * Rebuild the example inventory from one or more configured folders.
   *
   * Readable `language:` membership follows the configured membership policy,
   * while explicit conflicting stable `language_id` identity always rejects.
   * Missing accepted scope may inherit from the configured language in runtime
   * only; this loader never rewrites creator-authored Markdown.
   */
  async loadFromFolders(
    sources: LinguisticExampleSource[],
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
        const record = this.readSource(file);
        if (!record) continue;

        // Once a source is positively recognized, retain it even if required
        // linguistic data is malformed. It remains diagnosable but does not
        // enter the clean feature-facing example collection.
        if (record.value === null) {
          this.addSourceRecord(record);
          continue;
        }

        const example = record.value;

        const authority = resolveSourceLanguageAuthority({
          configuredLanguage: source.language,
          configuredLanguageId: source.languageId,
          explicitLanguage: example.language,
          explicitLanguageId: example.languageId,
          membershipMode,
        });

        if (!authority.accepted) {
          // The parser successfully recognized and interpreted this example.
          // Contextual language rejection therefore must not make the creator's
          // source disappear from diagnostic accounting.
          //
          // Retain the parsed value and derive a new diagnostic array rather
          // than mutating the parser-owned diagnostics in place. The rejected
          // example deliberately does not enter the clean collection below.
          this.addSourceRecord({
            ...record,
            diagnostics: [...record.diagnostics, authority.diagnostic],
          });
          continue;
        }

        // Apply inherited or validated language scope to runtime state only.
        // This does not grant authority to add or repair frontmatter fields.
        example.language = authority.runtimeLanguage;
        example.languageId = authority.runtimeLanguageId;

        this.addSourceRecord(record);
        this.all.push(example);
        count++;
      }
    }

    return count;
  }

  /**
   * Recursively collect Markdown notes beneath an examples folder.
   *
   * Recursion matters because users may later organize examples into
   * subfolders such as proverbs, dialogue, narratives, or grammar examples.
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
   * Read one Markdown note and pass its cached YAML frontmatter to the pure
   * source adapter.
   *
   * Vault access stays here while interpretation stays in
   * linguistic-example-source.ts.
   */
  private readSource(
    file: TFile,
  ): WorkbenchSourceRecord<LinguisticExample> | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const input: LinguisticExampleSourceInput = {
      path: file.path,
      frontmatter: cache.frontmatter ?? {},
    };

    return parseLinguisticExampleSource(input);
  }

  /**
   * Retain one recognized source independently from the clean example index.
   */
  private addSourceRecord(
    record: WorkbenchSourceRecord<LinguisticExample>,
  ): void {
    this.sourceRecords.push(record);
    this.sourceByWorkbenchID.set(record.identity.workbenchID, record);
  }
}
