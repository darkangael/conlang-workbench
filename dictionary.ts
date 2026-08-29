// Dictionary: reads word-entry notes from a folder and indexes them
// for fast lookup. Each entry is a single markdown file whose name is
// the conlang word (e.g. "kala.md") and whose frontmatter holds the
// translation and other metadata.
//
// Expected frontmatter:
//   ---
//   definition: water
//   partOfSpeech: noun
//   ipa: /ˈka.la/
//   etymology: from proto-form *kal-
//   language: Example
//   aliases: Feb, Febr        # optional: alternate forms that resolve here
//   inflectAs: noun           # optional: also match rules filtered to this POS
//   forms:                    # optional: hardcoded irregular forms
//     - "plural: kalath"
//     - "genitive: kalen"
//   ---
//
// Body of the note can contain freeform usage notes; we include it as `notes`.

import { App, TFile, TFolder, CachedMetadata } from "obsidian";
import { DictionaryEntry, LexicalSense } from "./types";
import { extractBodyPreview as _extractBodyPreview } from "./body-preview";
import { parseLexicalSenses } from "./lexical-senses";
import { parseDictionarySource } from "./dictionary-source";
import type { DictionarySourceInput } from "./dictionary-source";
import type { WorkbenchSourceRecord } from "./workbench-source";
import { buildPhraseIndex, EMPTY_PHRASE_INDEX, PhraseIndex } from "./phrases";
import { normalizeLexicalKey } from "./lexical-normalization";

/**
 * A richer English-language dictionary lookup result.
 *
 * `entry` is always present because every lookup ultimately resolves to a
 * dictionary entry. `sense` is present only when the English lookup key
 * specifically matches one of that entry's structured lexical senses.
 *
 * Keeping the sense optional preserves simple dictionary entries as a fully
 * supported format rather than requiring every entry to have structured senses.
 */
export interface EnglishLookupMatch {
  entry: DictionaryEntry;
  sense?: LexicalSense;
}

/**
 * A hit from the declared-forms index: which entry the surface form belongs
 * to, and what grammatical label was declared for it.
 */
export interface FormMatch {
  lemma: DictionaryEntry;
  label: string;
}

export class Dictionary {
  // Conlang lookup: multiple entries possible when multiple languages
  // are active and they share a spelling (e.g. "kala" in two languages).
  private byWord: Map<string, DictionaryEntry[]> = new Map();
  private byEnglish: Map<string, DictionaryEntry[]> = new Map(); // lowercase english -> entries
  // Hardcoded inflected forms declared via the `forms:` frontmatter property.
  // Kept OUT of byWord deliberately: a declared form is not a headword, and
  // merging the two would make hover render "kalath" as its own entry instead
  // of "the plural of kala".
  private byForm: Map<string, FormMatch[]> = new Map();
  // Phrase entries sorted by word count descending. The matcher walks this
  // list to try longer phrases first, so "good morning" beats "good".
  private phrases: DictionaryEntry[] = [];
  // First-word index over `phrases`, rebuilt once per load. This is what the
  // phrase matcher consumes — it avoids scanning every phrase at every word
  // position, which matters once dictionaries grow large.
  private phraseIdx: PhraseIndex = EMPTY_PHRASE_INDEX;
  // Ordered list of all valid entries in insertion order (preserves "recently
  // added" sorting and stable iteration).
  private all: DictionaryEntry[] = [];

  // Source records are kept separately from feature-facing DictionaryEntry
  // objects. A recognized lexical note can therefore remain known to
  // Workbench even when malformed required frontmatter prevents it from
  // becoming a valid dictionary entry.
  private sourceRecords: WorkbenchSourceRecord<DictionaryEntry>[] = [];
  private sourceByWorkbenchID = new Map<
    string,
    WorkbenchSourceRecord<DictionaryEntry>
  >();

  private app: App;
  // When true, conlang-word indexing and lookups preserve case (see the
  // caseSensitiveMatching setting). English-direction lookups are unaffected.
  private caseSensitive = false;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Set case-sensitive matching for conlang-word lookups. Call before a
   * (re)load — the byWord/phrase indexes are keyed using this mode, so a
   * change only takes effect once the dictionary is rebuilt.
   */
  setCaseSensitive(v: boolean): void {
    this.caseSensitive = v;
  }

  /**
   * Build a derived conlang lookup key.
   *
   * The source spelling remains untouched. NFC only makes canonically
   * equivalent Unicode spellings share the same internal index key.
   */
  private norm(s: string): string {
    return normalizeLexicalKey(s, this.caseSensitive);
  }

  clear() {
    this.byWord.clear();
    this.byEnglish.clear();
    this.byForm.clear();
    this.phrases = [];
    this.phraseIdx = EMPTY_PHRASE_INDEX;
    this.all = [];
    this.sourceRecords = [];
    this.sourceByWorkbenchID.clear();
  }

  /**
   * Look up a conlang word and return its dictionary entry, if any.
   * Returns the FIRST match if multiple languages share the spelling.
   * Use lookupAll() to get every match.
   */
  lookup(conlangWord: string): DictionaryEntry | undefined {
    return this.byWord.get(this.norm(conlangWord))?.[0];
  }

  /**
   * Look up a conlang word across all loaded languages. Returns every entry
   * whose word matches, regardless of source language. Empty array if none.
   */
  lookupAll(conlangWord: string): DictionaryEntry[] {
    return this.byWord.get(this.norm(conlangWord)) ?? [];
  }

  /**
   * Look up a surface form in the declared-forms index (`forms:` frontmatter).
   * Returns every entry that declares this form, with the label it was given.
   *
   * Callers should try `lookup`/`lookupAll` first — a real headword outranks
   * another word's inflected form — and `findInflection` after, so that a
   * hardcoded irregular beats whatever the rules would have derived.
   */
  lookupForm(surfaceForm: string): FormMatch[] {
    return this.byForm.get(this.norm(surfaceForm)) ?? [];
  }

  /**
   * Given a phrase-index hit, resolve the real lemma entry behind it if the
   * hit is a synthetic entry standing in for a multi-word declared form.
   * Returns undefined for ordinary phrase entries.
   *
   * The synthetic copies carry the lemma's `path`, which is what makes this
   * recoverable — without it a multi-word form would render as a headword in
   * its own right, complete with the lemma's definition under the wrong word.
   */
  lemmaForDeclaredPhrase(entry: DictionaryEntry): DictionaryEntry | undefined {
    if (!entry.viaFormLabel || !entry.viaFormLemma) return undefined;
    return this.lookupAll(entry.viaFormLemma).find(
      (e) => e.path === entry.path,
    );
  }

  /**
   * Get all phrase entries (entries whose word contains a space),
   * sorted longest-first by word count. Used by the phrase matcher.
   */
  allPhrases(): DictionaryEntry[] {
    return this.phrases;
  }

  /**
   * First-word index over all phrase entries. This is what the phrase
   * matcher (tokeniseWithPhrases / matchPhraseAtStart) consumes.
   */
  phraseIndex(): PhraseIndex {
    return this.phraseIdx;
  }

  /**
   * Look up English text and return any conlang entries that translate to it.
   * Useful for the "highlight English, translate to conlang" workflow.
   */
  lookupEnglish(english: string): DictionaryEntry[] {
    return this.byEnglish.get(english.toLowerCase()) ?? [];
  }

  /**
   * Look up English text while preserving which structured lexical sense
   * caused the match when that information is available.
   *
   * This deliberately builds on the existing `byEnglish` index instead of
   * replacing it. The old lookup API therefore remains available to callers
   * that only need dictionary entries.
   *
   * If more than one structured sense in the same entry explicitly matches
   * the English key, each matching sense is returned separately. If no
   * structured sense matches, the entry is still returned without a sense.
   */
  lookupEnglishMatches(english: string): EnglishLookupMatch[] {
    const normalized = english.trim().toLowerCase();
    const entries = this.byEnglish.get(normalized) ?? [];
    const matches: EnglishLookupMatch[] = [];

    for (const entry of entries) {
      const matchingSenses: LexicalSense[] = [];

      if (entry.senses) {
        for (const sense of entry.senses) {
          const glossMatches = sense.gloss?.trim().toLowerCase() === normalized;

          const lookupTermMatches =
            sense.lookupTerms?.some(
              (term) => term.trim().toLowerCase() === normalized,
            ) ?? false;

          if (glossMatches || lookupTermMatches) {
            matchingSenses.push(sense);
          }
        }
      }

      if (matchingSenses.length > 0) {
        for (const sense of matchingSenses) {
          matches.push({ entry, sense });
        }
      } else {
        matches.push({ entry });
      }
    }

    return matches;
  }

  /**
   * All known conlang words (lowercase). For multi-language vaults, a word
   * appearing in multiple languages is listed once.
   */
  allWords(): string[] {
    return Array.from(this.byWord.keys());
  }

  /**
   * All dictionary entries across all loaded languages, in insertion order.
   */
  allEntries(): DictionaryEntry[] {
    return this.all.slice();
  }

  /**
   * Return every recognized lexical source record, including malformed
   * sources whose value is null and therefore cannot enter the clean indexes.
   */
  allSourceRecords(): WorkbenchSourceRecord<DictionaryEntry>[] {
    return this.sourceRecords.slice();
  }

  /**
   * Look up a recognized lexical source by Workbench's internal source handle.
   *
   * Workbench identity is deliberately separate from the creator's linguistic
   * identity. This API must never be used to manufacture a missing lemma.
   */
  lookupWorkbenchID(
    workbenchID: string,
  ): WorkbenchSourceRecord<DictionaryEntry> | undefined {
    return this.sourceByWorkbenchID.get(workbenchID);
  }

  /**
   * Build the index by scanning a single folder for .md files. Kept for
   * callers that only need one language at a time.
   */
  async loadFromFolder(
    folderPath: string,
    languageName?: string,
  ): Promise<number> {
    return this.loadFromFolders([
      { folder: folderPath, language: languageName },
    ]);
  }

  /**
   * Build the index by scanning multiple folders, one per active language.
   * Each folder is filtered to entries whose frontmatter `language` matches
   * (if specified), so entries don't leak between languages even if folders
   * overlap.
   */
  async loadFromFolders(
    sources: { folder: string; language?: string }[],
  ): Promise<number> {
    this.clear();
    let count = 0;
    const bodyMetadataEntries: { entry: DictionaryEntry; file: TFile }[] = [];
    for (const source of sources) {
      const folder = this.app.vault.getAbstractFileByPath(source.folder);
      if (!folder || !(folder instanceof TFolder)) continue;
      const files = this.collectMarkdownFiles(folder);
      for (const file of files) {
        const record = this.readSource(file);
        if (!record) continue;

        // A positively recognized lexical source remains visible to Workbench
        // even when malformed required data prevents creation of a clean
        // DictionaryEntry. It must not silently disappear from source-facing
        // state or leak into the feature-facing dictionary indexes.
        if (!record.value) {
          this.addSourceRecord(record);
          continue;
        }

        const entry = record.value;

        if (
          source.language &&
          entry.language &&
          entry.language !== source.language
        ) {
          // Preserve the dictionary's existing overlapping-folder behavior:
          // valid entries explicitly assigned to another configured language
          // are not part of this source inventory.
          continue;
        }

        // If the frontmatter didn't specify a language, assume it belongs to
        // the source folder's language. This keeps backward-compat with
        // entries that pre-date the explicit language field.
        if (!entry.language && source.language) {
          entry.language = source.language;
        }

        this.addSourceRecord(record);
        this.addEntry(entry);
        count++;

        // Every lexical entry may contain structured senses in its Markdown
        // body. Keep the file paired with the parsed entry so body-derived
        // metadata can be loaded once after the index itself is built.
        bodyMetadataEntries.push({ entry, file });
      }
    }
    this.finalizePhrases();
    await this.loadBodyMetadata(bodyMetadataEntries);

    // Structured senses are loaded from note bodies after the ordinary
    // dictionary indexes are built. Add their explicit English lookup keys
    // only after that metadata is available.
    this.indexStructuredSenseKeys();

    return count;
  }

  /**
   * Sort the phrase list (longest-first) and rebuild the first-word index.
   * Called once at the end of a load instead of per-insert — sorting on every
   * addEntry was O(n² log n) across a large load.
   */
  private finalizePhrases() {
    this.phrases.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0));
    this.phraseIdx = buildPhraseIndex(this.phrases, this.caseSensitive);
  }

  private isProperNoun(entry: DictionaryEntry): boolean {
    const pos = entry.partOfSpeech?.toLowerCase() ?? "";
    return (
      pos === "proper-noun" || pos === "proper noun" || pos === "propernoun"
    );
  }

  /**
   * Load information derived from the Markdown body of lexical-entry notes.
   *
   * We read each file only once here, then let multiple body-based features
   * share that content. This avoids separate vault reads for previews, senses,
   * and any similar enrichment we may add later.
   */
  private async loadBodyMetadata(
    items: { entry: DictionaryEntry; file: TFile }[],
  ) {
    await Promise.all(
      items.map(async ({ entry, file }) => {
        try {
          const content = await this.app.vault.cachedRead(file);

          // Short prose previews were originally a proper-noun feature.
          // Preserve that behaviour instead of reading arbitrary lexical prose
          // into every tooltip.
          if (this.isProperNoun(entry)) {
            entry.bodyPreview = _extractBodyPreview(content);
          }

          // Optional structured semantic senses from the note's `## Senses`
          // section. Simple entries remain valid when no senses are present.
          const senses = parseLexicalSenses(content);
          entry.senses = senses.length > 0 ? senses : undefined;
        } catch (error) {
          // Body-derived metadata is optional, so a failure should not prevent
          // the dictionary itself from loading. Log the error so problems with
          // sense parsing or file reads are visible during development.
          console.warn(
            "[Conlang] Failed to load body metadata:",
            file.path,
            error,
          );
        }
      }),
    );
  }

  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const out: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
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
   * Read cached frontmatter and hand raw source representation to the pure
   * dictionary adapter. Dictionary itself coordinates inventories and indexes;
   * it does not decide what malformed YAML means.
   */
  private readSource(
    file: TFile,
  ): WorkbenchSourceRecord<DictionaryEntry> | null {
    const cache: CachedMetadata | null =
      this.app.metadataCache.getFileCache(file);

    if (!cache) return null;

    const input: DictionarySourceInput = {
      path: file.path,
      basename: file.basename,
      mtime: file.stat.mtime,
      frontmatter: cache.frontmatter ?? {},
    };

    return parseDictionarySource(input);
  }

  /**
   * Retain source-facing state independently from the clean dictionary index.
   * Malformed recognized sources therefore remain diagnosable without being
   * treated as valid DictionaryEntry objects.
   */
  private addSourceRecord(
    record: WorkbenchSourceRecord<DictionaryEntry>,
  ): void {
    this.sourceRecords.push(record);
    this.sourceByWorkbenchID.set(record.identity.workbenchID, record);
  }

  /**
   * Add one English lookup key for an entry.
   *
   * English lookup is case-insensitive. Avoid duplicate entries when the same
   * key is declared in more than one place, such as both the simple definition
   * and a structured sense.
   */
  private indexEnglishKey(key: string, entry: DictionaryEntry) {
    const normalized = key.trim().toLowerCase();
    if (!normalized) return;

    const list = this.byEnglish.get(normalized) ?? [];

    if (!list.includes(entry)) {
      list.push(entry);
    }

    this.byEnglish.set(normalized, list);
  }

  /**
   * Add explicit lookup vocabulary declared by structured lexical senses.
   *
   * Sense glosses and lookup terms are intentional translation/search keys.
   * Full sense definitions are descriptive prose and deliberately do NOT become
   * entries in the central English-to-conlang lookup index.
   */
  private indexStructuredSenseKeys() {
    for (const entry of this.all) {
      if (!entry.senses) continue;

      for (const sense of entry.senses) {
        if (sense.gloss) {
          this.indexEnglishKey(sense.gloss, entry);
        }

        if (sense.lookupTerms) {
          for (const term of sense.lookupTerms) {
            this.indexEnglishKey(term, entry);
          }
        }
      }
    }
  }

  private addEntry(entry: DictionaryEntry) {
    const key = this.norm(entry.word);
    const existing = this.byWord.get(key) ?? [];
    existing.push(entry);
    this.byWord.set(key, existing);
    this.all.push(entry);
    if (entry.isPhrase) {
      // Sorting and indexing happen once in finalizePhrases() after the load.
      this.phrases.push(entry);
    }

    // Index any aliases so they resolve to this same entry. A multi-word alias
    // is also registered as a phrase so the phrase matcher can catch it.
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const aliasKey = this.norm(alias);
        if (!aliasKey) continue;
        const list = this.byWord.get(aliasKey) ?? [];
        list.push(entry);
        this.byWord.set(aliasKey, list);
        if (/\s/.test(alias)) {
          this.phrases.push({
            ...entry,
            word: alias,
            isPhrase: true,
            wordCount: alias.split(/\s+/).filter((w) => w.length > 0).length,
          });
        }
      }
    }
    // Index hardcoded inflected forms. These go in their own map rather than
    // byWord so hover can say "plural of kala" instead of treating the form as
    // a headword in its own right.
    if (entry.forms) {
      for (const { label, form } of entry.forms) {
        const formKey = this.norm(form);
        // A form identical to its own headword declares nothing.
        if (!formKey || formKey === key) continue;
        const list = this.byForm.get(formKey) ?? [];
        list.push({ lemma: entry, label });
        this.byForm.set(formKey, list);
        // Multi-word forms need the phrase matcher to see them, exactly as
        // multi-word aliases do. The synthetic copy carries the label so the
        // phrase tooltip can still explain what it is.
        if (/\s/.test(form)) {
          this.phrases.push({
            ...entry,
            word: form,
            isPhrase: true,
            wordCount: form.split(/\s+/).filter((w) => w.length > 0).length,
            viaFormLabel: label,
            viaFormLemma: entry.word,
          });
        }
      }
    }

    // Index the simple English definition exactly as before: commas and
    // semicolons separate independently useful lookup meanings.
    const englishKeys = entry.definition.split(/[,;]/);

    for (const key of englishKeys) {
      this.indexEnglishKey(key, entry);
    }
  }

  /**
   * Render an entry into a hover tooltip element using safe DOM construction.
   * Inline parts are separated by spaces to match the previous layout.
   *
   * When `showLanguage` is true, the entry's source language is shown after the
   * headword. Callers set this only when more than one language is active, so
   * single-language vaults stay uncluttered (matches the multi-sense tooltip).
   */
  static renderTooltip(
    entry: DictionaryEntry,
    parent: HTMLElement,
    showLanguage = false,
    showForms = true,
  ): void {
    const sep = () => {
      if (parent.childNodes.length > 0) parent.appendText(" ");
    };
    sep();
    parent.createEl("strong", { text: entry.word });
    if (showLanguage && entry.language) {
      sep();
      parent.createSpan({
        cls: "conlang-tooltip-lang",
        text: entry.language,
      });
    }
    if (entry.aliases && entry.aliases.length > 0) {
      sep();
      parent.createSpan({
        cls: "conlang-tooltip-aliases",
        text: `(also: ${entry.aliases.join(", ")})`,
      });
    }
    if (entry.partOfSpeech) {
      sep();
      parent.createEl("em", { text: entry.partOfSpeech });
    }
    if (entry.nameCategory) {
      sep();
      parent.createSpan({
        cls: "conlang-tooltip-category",
        text: entry.nameCategory,
      });
    }
    if (entry.ipa) {
      sep();
      parent.appendText(entry.ipa);
    }
    sep();
    parent.createDiv({ cls: "conlang-tooltip-def", text: entry.definition });
    // For proper nouns, include a richer description from the note body
    if (entry.bodyPreview) {
      sep();
      parent.createDiv({
        cls: "conlang-tooltip-preview",
        text: entry.bodyPreview,
      });
    }
    if (entry.etymology) {
      sep();
      parent.createDiv({
        cls: "conlang-tooltip-etym",
        text: `Etymology: ${entry.etymology}`,
      });
    }
    // Declared forms (the `forms:` property). Capped, because a full noun
    // declension can run to a dozen rows and a tooltip that tall covers the
    // text the user is trying to read.
    if (showForms && entry.forms && entry.forms.length > 0) {
      sep();
      Dictionary.renderFormsLine(entry.forms, parent);
    }
  }

  /** Maximum declared forms shown in a hover tooltip before summarising. */
  private static readonly TOOLTIP_FORM_LIMIT = 8;

  /**
   * Render an entry's declared forms as a compact one-line table inside a
   * tooltip: `plural kalath · genitive kalen`.
   */
  private static renderFormsLine(
    forms: { label: string; form: string }[],
    parent: HTMLElement,
  ): void {
    const box = parent.createDiv({ cls: "conlang-tooltip-forms" });
    const shown = forms.slice(0, Dictionary.TOOLTIP_FORM_LIMIT);
    shown.forEach((f, i) => {
      if (i > 0) box.createSpan({ cls: "conlang-tooltip-form-sep", text: "·" });
      const item = box.createSpan({ cls: "conlang-tooltip-form" });
      item.createSpan({ cls: "conlang-tooltip-form-label", text: f.label });
      item.createSpan({ cls: "conlang-tooltip-form-value", text: f.form });
    });
    const hidden = forms.length - shown.length;
    if (hidden > 0) {
      box.createSpan({
        cls: "conlang-tooltip-form-more",
        text: `+${hidden} more`,
      });
    }
  }
}

/**
 * Extract the first meaningful paragraph from a markdown note's body.
 * Re-exported from body-preview module so callers can import either spot.
 */
export { extractBodyPreview } from "./body-preview";
