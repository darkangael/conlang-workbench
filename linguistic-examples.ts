import { App, CachedMetadata, TFile, TFolder } from "obsidian";

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
 * Convert Markdown frontmatter into a LinguisticExample.
 *
 * Keeping this parsing logic inside the linguistic-examples module prevents
 * callers such as the main plugin or a future Examples tab from needing to
 * understand the example-note YAML schema themselves.
 *
 * Returns null when the frontmatter does not describe a usable linguistic
 * example. This lets a future loader safely scan notes without treating every
 * Markdown file as an example.
 */
export function parseLinguisticExampleFrontmatter(
  frontmatter: Record<string, unknown>,
  path?: string,
): LinguisticExample | null {
  // Only notes explicitly identified as linguistic examples belong to this
  // feature. Other notes may contain examples later, but embedded examples
  // will be handled separately rather than guessed here.
  if (frontmatter.type !== "linguistic-example") {
    return null;
  }

  // `text` is the one required linguistic tier. A note without original
  // language text cannot yet serve as a LinguisticExample.
  const text =
    typeof frontmatter.text === "string" ? frontmatter.text.trim() : "";

  if (!text) {
    return null;
  }

  /**
   * Read an optional string field consistently.
   *
   * YAML values are not guaranteed to be strings, so checking the runtime
   * type here keeps malformed or unexpected metadata from leaking into the
   * rest of Workbench.
   */
  const optionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;

    const trimmed = value.trim();
    return trimmed || undefined;
  };

  return {
    id: optionalString(frontmatter.example_id),
    text,
    realization: optionalString(frontmatter.realization),
    segmentation: optionalString(frontmatter.segmentation),
    gloss: optionalString(frontmatter.gloss),
    translation: optionalString(frontmatter.translation),
    language: optionalString(frontmatter.language),
    languageId: optionalString(frontmatter.language_id),
    source: optionalString(frontmatter.source),
    context: optionalString(frontmatter.context),
    notes: optionalString(frontmatter.notes),
    path,
  };
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

  constructor(private app: App) {}

  /**
   * Remove every currently loaded example.
   *
   * We rebuild from the configured folders on reload rather than trying to
   * partially merge old and new state.
   */
  clear(): void {
    this.all = [];
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
   * Explicit language metadata on the note takes precedence. If the note does
   * not declare language identity, it may inherit it from the configured
   * source, just as the morpheme inventory does.
   */
  async loadFromFolders(
    sources: LinguisticExampleSource[],
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
        const example = this.readExample(file);
        if (!example) continue;

        // Do not let an example explicitly belonging to another language leak
        // into this source just because its file happens to be inside the
        // configured folder.
        if (
          source.language &&
          example.language &&
          example.language !== source.language
        ) {
          continue;
        }

        if (
          source.languageId &&
          example.languageId &&
          example.languageId !== source.languageId
        ) {
          continue;
        }

        // Simple notes do not have to repeat language metadata if the source
        // configuration already tells Workbench which language owns them.
        if (!example.language && source.language) {
          example.language = source.language;
        }

        if (!example.languageId && source.languageId) {
          example.languageId = source.languageId;
        }

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
   * Read one Markdown note and convert its cached YAML frontmatter into the
   * shared LinguisticExample model.
   */
  private readExample(file: TFile): LinguisticExample | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const frontmatter = cache.frontmatter ?? {};

    return parseLinguisticExampleFrontmatter(
      frontmatter,
      file.path,
    );
  }
}