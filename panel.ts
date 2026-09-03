// Translation panel: the main Conlang Workbench side-panel interface.
//
// Tab 1 ("Selection"): updates live whenever the user's selection changes,
// translates in both directions, and surfaces matching dictionary entries.
//
// Tab 2 ("Translator"): provides free-form dictionary-assisted lookup,
// glossing, and transliteration without requiring selected note text.
//
// Tab 3 ("Dictionary"): provides a browsable, searchable, sortable list of
// dictionary entries for the active languages.
//
// Tab 4 ("Morphemes"): provides the modular Morpheme Inventory browser for
// inspecting documented morphemes across the active languages.
//
// Tab 5 ("Examples"): provides the modular Linguistic Examples browser for
// searching documented language use and expanding available analysis tiers.

import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice } from "obsidian";
import type ConlangPlugin from "./main";
import { DictionaryEntry, InflectedForm, LexicalSense } from "./types";
import { MorphemeTab } from "./morpheme-tab";
import { LinguisticExampleTab } from "./linguistic-example-tab";
import { PhonologyTab } from "./phonology-tab";
import { DiagnosticsTab } from "./diagnostics-tab";
import { applyCypherReverse } from "./cypher";
import {
  findInflection,
  generateInflections,
  GeneratedForm,
} from "./inflection";
import { explainInflection } from "./explanations";
import { tokeniseWithPhrases, matchPhraseAtStart } from "./phrases";
import {
  WORD_RE,
  WORD_ANCHORED_RE,
  cleanWord,
  applyCasing,
  firstSense,
} from "./word-tokens";
import { normalizeLexicalKey } from "./lexical-normalization";
import { resolveLexicalPart } from "./lexical-part-relationships";
import {
  glossEnglishToConlang,
  glossConlangToEnglish,
  renderTransliterationString,
  GlossToken,
} from "./gloss";

export const VIEW_TYPE_PANEL = "made-up-words-panel";

type TabId =
  | "translate"
  | "dictionary"
  | "translator"
  | "morphemes"
  | "examples"
  | "phonology";
type PanelMode = "language" | "diagnostics";
type SortKey = "alphabetical" | "recent" | "partOfSpeech";
type TranslatorDirection = "english-to-conlang" | "conlang-to-english";

export class TranslationPanelView extends ItemView {
  private plugin: ConlangPlugin;
  private activeTab: TabId = "translate";
  private panelMode: PanelMode = "language";
  private lastRenderedText: string = "";
  private pollHandle: number | null = null;
  private morphemeEl!: HTMLElement;
  private morphemeTab!: MorphemeTab;
  // The Examples tab has its own renderer, just like Morphemes. The panel owns
  // only the container and the tab instance; example-specific UI remains in the
  // dedicated LinguisticExampleTab module.
  private exampleEl!: HTMLElement;
  private exampleTab!: LinguisticExampleTab;
  // The Phonology tab follows the same modular boundary as Morphemes and
  // Examples. panel.ts owns only the container and tab lifecycle; phonological
  // browsing and filtering remain inside the dedicated PhonologyTab module.
  private phonologyEl!: HTMLElement;
  private phonologyTab!: PhonologyTab;

  // Browser state (persisted across re-renders within a session)
  private searchQuery: string = "";
  private posFilter: string = ""; // empty string = all
  private nameFilter: "all" | "names-only" | "hide-names" = "all";
  // Dictionary opens on the current primary language. The creator may
  // deliberately broaden the browser to every active language for comparison.
  private showAllActiveDictionaryLanguages = false;
  private sortKey: SortKey = "alphabetical";
  // Row cap for the browser list. Large dictionaries would otherwise rebuild
  // thousands of DOM rows per repaint. "Show more" raises the cap; any change
  // to search/filters/sort resets it (tracked via browserFilterSig).
  private static readonly BROWSER_PAGE = 200;
  private browserLimit = TranslationPanelView.BROWSER_PAGE;
  private browserFilterSig = "";
  private searchDebounceTimer: number | null = null;

  // Translator-tab state. Persists while the panel stays open so the user
  // can switch tabs and come back without losing their work.
  private translatorDirection: TranslatorDirection = "english-to-conlang";
  private translatorMode: "gloss" | "transliterate" = "gloss";
  private translatorInput: string = "";
  private translatorDebounceTimer: number | null = null;

  // Cached DOM refs
  private headerEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private tabContentEl!: HTMLElement;
  // Diagnostics is a panel-level workspace rather than a linguistic
  // feature tab. The panel owns its host container and visibility, while the
  // dedicated DiagnosticsTab owns rendering and source-note navigation.
  private diagnosticsEl!: HTMLElement;
  private diagnosticsTab!: DiagnosticsTab;

  // Translate-tab refs
  private translateEmptyEl!: HTMLElement;
  private translateBodyEl!: HTMLElement;
  private sourceLabel!: HTMLElement;
  private sourceText!: HTMLElement;
  private translationLabel!: HTMLElement;
  private translationText!: HTMLElement;
  private actionsEl!: HTMLElement;
  private entriesEl!: HTMLElement;

  // Dictionary-tab refs
  private browserEl!: HTMLElement;
  private browserToolbarEl!: HTMLElement;
  private browserControlsEl!: HTMLElement;
  private browserStatsEl!: HTMLElement;
  private browserListEl!: HTMLElement;
  private browserEmptyEl!: HTMLElement;
  private browserDetailsEl!: HTMLElement;

  /*
   * A Dictionary row can temporarily replace the browser list with one entry's
   * details. Store only the source path, not the DictionaryEntry object itself.
   * Runtime reloads replace the complete Dictionary inventory, so retaining an
   * old object would let the UI display stale derived data.
   */
  private selectedDictionaryEntryPath: string | null = null;

  // Translator-tab refs
  private translatorEl!: HTMLElement;
  private translatorSourceLabel!: HTMLElement;
  private translatorInputEl!: HTMLTextAreaElement;
  private translatorTargetLabel!: HTMLElement;
  private translatorOutputEl!: HTMLElement;
  private translatorSwapBtn!: HTMLButtonElement;
  private translatorCopyBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: ConlangPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_PANEL;
  }

  getDisplayText(): string {
    return "Made Up Words";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("conlang-panel");

    // Header
    this.headerEl = root.createDiv({ cls: "conlang-panel-header" });
    this.renderHeader();

    // Tabs
    this.tabsEl = root.createDiv({ cls: "conlang-panel-tabs" });
    this.renderTabs();

    // Content
    this.tabContentEl = root.createDiv({ cls: "conlang-panel-content" });
    this.buildTranslateTab();
    this.buildTranslatorTab();
    this.buildDictionaryTab();
    this.buildMorphemeTab();
    this.buildExampleTab();
    this.buildPhonologyTab();
    this.buildDiagnosticsWorkspace();
    this.showActiveTab();

    // Update Translate tab on selection change
    this.registerDomEvent(activeDocument, "selectionchange", () => {
      this.scheduleTranslateUpdate();
    });

    // Periodic refresh so header reflects settings/dictionary changes
    this.pollHandle = window.setInterval(() => {
      this.renderHeader();
    }, 1500);

    this.updateTranslate();
    this.renderBrowser();
  }

  async onClose() {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }

    if (this.translatorDebounceTimer !== null) {
      window.clearTimeout(this.translatorDebounceTimer);
      this.translatorDebounceTimer = null;
    }

    if (this.searchDebounceTimer !== null) {
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  /** Called by the plugin after dictionary reload or settings change. */
  refresh() {
    this.lastRenderedText = "";
    this.renderHeader();
    this.updateTranslate();
    this.renderBrowser();

    // Update translator labels in case the active language name changed,
    // and re-translate in case the dictionary changed.
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();

    /*
     * Diagnostics is derived from the same settled inventory state as the
     * feature browsers. When it is visible, rebuild it directly from current
     * source records rather than preserving a separate cache that could become
     * stale.
     */
    if (this.panelMode === "diagnostics") {
      this.diagnosticsTab.render();
      return;
    }

    /*
     * Feature inventories may also have changed during a language-data reload.
     * Refresh whichever modular feature tab is currently visible. Inactive tabs
     * will render from the latest inventory when the user switches to them.
     */
    if (this.activeTab === "morphemes") {
      this.morphemeTab.render();
    } else if (this.activeTab === "examples") {
      this.exampleTab.render(this.exampleEl);
    } else if (this.activeTab === "phonology") {
      this.phonologyTab.render();
    }
  }

  // ===== Header =====

  private renderHeader() {
    this.headerEl.empty();
    const allLangs = this.plugin.settings.languages;
    const activeLangs = this.plugin.getActiveLanguages();
    const activeNames = new Set(activeLangs.map((l) => l.name));
    const primary = this.plugin.getPrimaryLanguage();

    const modeRow = this.headerEl.createDiv({
      cls: "conlang-panel-mode-row",
    });

    let languageModeLabel: string;
    if (activeLangs.length === 0) {
      languageModeLabel = "No active language";
    } else if (activeLangs.length === 1) {
      languageModeLabel = `Language: ${activeLangs[0].name}`;
    } else {
      languageModeLabel = `${activeLangs.length} languages active`;
    }

    const languageMode = modeRow.createEl("button", {
      cls:
        "conlang-panel-mode" +
        (this.panelMode === "language" ? " is-active" : ""),
      text: languageModeLabel,
    });
    languageMode.title = "Show the language workspace.";
    languageMode.addEventListener("click", () => {
      if (this.panelMode === "language") return;

      this.panelMode = "language";
      this.renderHeader();
      this.showActiveTab();
    });

    const diagnosticCount = this.plugin.getSourceDiagnostics().length;
    const diagnosticsMode = modeRow.createEl("button", {
      cls:
        "conlang-panel-mode" +
        (this.panelMode === "diagnostics" ? " is-active" : ""),
      text: `Diagnostics (${diagnosticCount})`,
    });
    diagnosticsMode.title =
      diagnosticCount === 0
        ? "No source notes currently have diagnostics."
        : `Show diagnostics for ${diagnosticCount} source ${
            diagnosticCount === 1 ? "note" : "notes"
          }.`;
    diagnosticsMode.addEventListener("click", () => {
      if (this.panelMode === "diagnostics") return;

      this.panelMode = "diagnostics";
      this.renderHeader();
      this.showActiveTab();
    });

    const subtitle = this.headerEl.createDiv({ cls: "conlang-panel-subtitle" });
    if (activeLangs.length > 0) {
      const count = this.plugin.dictionary.allEntries().length;
      subtitle.setText(
        `${count} dictionary ${count === 1 ? "entry" : "entries"}`,
      );
    }

    // Language chips — only shown when there's more than one configured
    // language. With a single language, chips are noise.
    if (allLangs.length > 1) {
      const chipRow = this.headerEl.createDiv({ cls: "conlang-lang-chips" });
      for (const lang of allLangs) {
        const isActive = activeNames.has(lang.name);
        const isPrimary = lang.name === primary?.name;
        const chip = chipRow.createDiv({
          cls: `conlang-lang-chip${isActive ? " is-active" : ""}${isPrimary ? " is-primary" : ""}`,
        });
        // The chip body: toggle active on click
        const body = chip.createSpan({ cls: "conlang-lang-chip-body" });
        body.setText(lang.name);
        body.title = isActive
          ? `${lang.name} is active. Click to deactivate.`
          : `${lang.name} is inactive. Click to activate.`;
        body.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.toggleLanguageActive(lang.name);
        });

        // The star: indicates primary, click to set primary
        const star = chip.createSpan({ cls: "conlang-lang-chip-star" });
        star.setText(isPrimary ? "★" : "☆");
        star.title = isPrimary
          ? `${lang.name} is the primary language. New entries go here and English→conlang targets this language.`
          : isActive
            ? `Click the star to make ${lang.name} the primary language.`
            : "Activate this language first to make it primary.";
        if (isActive) {
          star.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.setPrimaryLanguage(lang.name);
          });
        } else {
          star.addClass("is-disabled");
        }
      }
    }

    // Quick-action row: buttons to add dictionary entries.
    if (primary) {
      const actions = this.headerEl.createDiv({
        cls: "conlang-panel-header-actions",
      });

      const wordBtn = actions.createEl("button", {
        // The sentence-case rule counts the leading glyph as the first word and
        // asks for "+ word" — which reads worse than the label users already
        // know, so that warning is expected here.
        text: "+ Word",
        cls: "conlang-panel-btn",
      });
      wordBtn.title = `Add a new word to ${primary.name} (the primary language). Click a star above to change the primary.`;
      wordBtn.addEventListener(
        "click",
        () => void this.plugin.createWordFromPanel(),
      );

      const nameBtn = actions.createEl("button", {
        // The sentence-case rule counts the leading glyph as the first word and
        // asks for "+ word" — which reads worse than the label users already
        // know, so that warning is expected here.
        text: "+ Name",
        cls: "conlang-panel-btn",
      });
      nameBtn.title = `Add a proper noun to ${primary.name}. Locked at creation so cypher changes don't affect it.`;
      nameBtn.addEventListener("click", () => void this.plugin.createName());
    }
  }

  /**
   * Toggle whether a language is active from the side panel.
   *
   * The panel decides only the requested active/primary state. Persistence,
   * runtime reload, and blocked-preflight rollback are owned by the same shared
   * plugin authority used by Settings, so the two UI surfaces cannot establish
   * different notions of which languages are active.
   */
  private async toggleLanguageActive(name: string) {
    const settings = this.plugin.settings;
    const current = new Set(settings.activeLanguages);

    if (current.has(name)) {
      // Refuse to deactivate the final active language without mutating state.
      if (current.size <= 1) {
        new Notice("Made Up Words: at least one language must be active.");
        return;
      }

      current.delete(name);
    } else {
      current.add(name);
    }

    const activeLanguages = Array.from(current);
    const primaryLanguage = activeLanguages.includes(settings.primaryLanguage)
      ? settings.primaryLanguage
      : activeLanguages[0];

    const result = await this.plugin.setActiveLanguageState(
      activeLanguages,
      primaryLanguage,
    );

    switch (result.status) {
      case "applied":
      case "blocked":
        break;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save active-language change:",
          result.error,
        );
        new Notice(
          "Made Up Words: could not save the active-language change; the previous selection was restored.",
        );
        break;

      case "rollback-save-failed":
        console.error(
          "Made Up Words: failed to persist active-language rollback:",
          result.error,
        );
        new Notice(
          "Made Up Words: the previous language selection was restored in memory, but the rollback could not be saved. Check the developer console.",
        );
        break;

      case "reload-failed":
        console.error(
          "Made Up Words: active-language reload failed; previous selection was restored:",
          result.error,
        );
        new Notice(
          "Made Up Words: language data failed to reload; the previous language selection was restored. Check the developer console.",
        );
        break;

      case "invalid-request":
        console.error(
          "Made Up Words: rejected invalid active-language request:",
          result.error,
        );
        new Notice(`Made Up Words: ${result.error}.`);
        break;
    }

    /*
     * Render from whatever state the transaction actually established. After
     * success this is the requested state; after blocked preflight or a thrown
     * candidate-preparation failure it is the safely restored previous state.
     */
    this.renderHeader();
    this.renderBrowser();
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
  }

  /**
   * Request a primary-language change through the shared authority transaction.
   *
   * The panel still avoids obviously invalid requests for normal UI behavior,
   * but the transaction independently validates configured and active identity.
   * That keeps correctness at the authority boundary rather than trusting this
   * particular caller.
   */
  private async setPrimaryLanguage(name: string) {
    const settings = this.plugin.settings;

    if (!settings.activeLanguages.includes(name)) return;
    if (settings.primaryLanguage === name) return;

    const result = await this.plugin.setPrimaryLanguageState(name);

    switch (result.status) {
      case "applied":
      case "unchanged":
        break;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save primary-language change:",
          result.error,
        );
        new Notice(
          "Made Up Words: could not save the primary-language change; the previous primary language was restored.",
        );
        break;

      case "invalid-request":
        console.error(
          "Made Up Words: rejected invalid primary-language request:",
          result.error,
        );
        new Notice(`Made Up Words: ${result.error}.`);
        break;
    }

    /*
     * Render from the transaction's final state. A failed save restores the
     * previous primary before control returns here.
     */
    this.renderHeader();
    this.updateTranslatorLabels();
  }

  // ===== Tabs =====

  private renderTabs() {
    this.tabsEl.empty();
    const mkTab = (id: TabId, label: string) => {
      const tab = this.tabsEl.createDiv({ cls: "conlang-tab" });
      tab.setText(label);
      if (id === this.activeTab) tab.addClass("active");
      tab.addEventListener("click", () => {
        if (this.activeTab === id) return;
        this.activeTab = id;
        this.renderTabs();
        this.showActiveTab();
        // Re-render the tab we just switched into so it reflects current state
        if (id === "translate") this.updateTranslate();
        else if (id === "dictionary") this.renderBrowser();
        else if (id === "translator") this.runTranslatorTranslation();
        else if (id === "morphemes") this.morphemeTab.render();
        else if (id === "examples") this.exampleTab.render(this.exampleEl);
        else if (id === "phonology") this.phonologyTab.render();
      });
      return tab;
    };
    mkTab("translate", "Selection");
    mkTab("translator", "Translator");
    mkTab("dictionary", "Dictionary");
    mkTab("morphemes", "Morphemes");
    mkTab("examples", "Examples");
    mkTab("phonology", "Phonology");
  }

  private showActiveTab() {
    this.translateEmptyEl.addClass("conlang-hidden");
    this.translateBodyEl.addClass("conlang-hidden");
    this.browserEl.addClass("conlang-hidden");
    this.translatorEl.addClass("conlang-hidden");
    this.morphemeEl.addClass("conlang-hidden");
    this.exampleEl.addClass("conlang-hidden");
    this.phonologyEl.addClass("conlang-hidden");
    this.diagnosticsEl.addClass("conlang-hidden");

    if (this.panelMode === "diagnostics") {
      this.tabsEl.addClass("conlang-hidden");
      this.diagnosticsEl.removeClass("conlang-hidden");
      this.diagnosticsTab.render();
      return;
    }

    this.tabsEl.removeClass("conlang-hidden");

    if (this.activeTab === "translate") {
      // The updateTranslate method decides between empty and body visibility
      // based on whether there's a selection. Default to empty until it runs.
      this.translateEmptyEl.removeClass("conlang-hidden");
    } else if (this.activeTab === "dictionary") {
      this.browserEl.removeClass("conlang-hidden");
    } else if (this.activeTab === "translator") {
      this.translatorEl.removeClass("conlang-hidden");
      // Focus the input so the user can start typing immediately
      window.setTimeout(() => this.translatorInputEl?.focus(), 0);
    } else if (this.activeTab === "morphemes") {
      this.morphemeEl.removeClass("conlang-hidden");
      this.morphemeTab.render();
    } else if (this.activeTab === "examples") {
      this.exampleEl.removeClass("conlang-hidden");
      this.exampleTab.render(this.exampleEl);
    } else if (this.activeTab === "phonology") {
      this.phonologyEl.removeClass("conlang-hidden");
      this.phonologyTab.render();
    }
  }

  // ===== Translate tab =====

  private buildTranslateTab() {
    this.translateEmptyEl = this.tabContentEl.createDiv({
      cls: "conlang-panel-empty",
    });
    this.translateEmptyEl.createDiv({
      text: "Highlight text in a note.",
      cls: "conlang-empty-headline",
    });
    const hint = this.translateEmptyEl.createDiv({ cls: "conlang-empty-hint" });
    hint.setText(
      "This tab updates automatically as you select text. Select English to see how it translates, or select a conlang word to see its dictionary entry. For free-form typing, use the translator tab instead.",
    );

    this.translateBodyEl = this.tabContentEl.createDiv({
      cls: "conlang-panel-body conlang-hidden",
    });

    const translationBlock = this.translateBodyEl.createDiv({
      cls: "conlang-panel-block",
    });
    this.sourceLabel = translationBlock.createDiv({
      cls: "conlang-panel-label",
    });
    this.sourceText = translationBlock.createDiv({
      cls: "conlang-panel-text conlang-panel-source",
    });
    const arrow = translationBlock.createDiv({ cls: "conlang-panel-arrow" });
    arrow.setText("↓");
    this.translationLabel = translationBlock.createDiv({
      cls: "conlang-panel-label",
    });
    this.translationText = translationBlock.createDiv({
      cls: "conlang-panel-text conlang-panel-translation",
    });

    this.actionsEl = this.translateBodyEl.createDiv({
      cls: "conlang-panel-actions",
    });
    this.entriesEl = this.translateBodyEl.createDiv({
      cls: "conlang-panel-entries",
    });
  }

  private updateScheduled: boolean = false;
  private scheduleTranslateUpdate() {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    window.requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.updateTranslate();
    });
  }

  private updateTranslate() {
    if (this.panelMode !== "language" || this.activeTab !== "translate") return;

    const text = this.readSelection();
    if (text === this.lastRenderedText) return;
    this.lastRenderedText = text;

    if (!text || text.trim().length === 0) {
      this.translateBodyEl.addClass("conlang-hidden");
      this.translateEmptyEl.removeClass("conlang-hidden");
      return;
    }

    this.translateEmptyEl.addClass("conlang-hidden");
    this.translateBodyEl.removeClass("conlang-hidden");

    // If the selection is a single word AND that word resolves to a dictionary
    // entry (directly or via inflection), render the "word details" view
    // instead of the standard translation. This is the learning-tool mode.
    const wordMatch = this.detectSingleWord(text);
    if (wordMatch) {
      this.renderWordDetails(text, wordMatch.entry, wordMatch.viaInflection);
      return;
    }

    const conlangWords = this.findConlangWords(text);
    const direction: "english-to-conlang" | "conlang-to-english" =
      conlangWords.length > 0 ? "conlang-to-english" : "english-to-conlang";

    this.renderTranslation(text, direction, conlangWords);
  }

  /**
   * If the selection looks like a single dictionary-resolvable word, return
   * the matched entry and whether we matched via inflection (so we can
   * label the originating form on screen). Returns null otherwise.
   */
  private detectSingleWord(text: string): {
    entry: DictionaryEntry;
    viaInflection: { form: string; label: string } | null;
  } | null {
    const trimmed = text.trim();

    // Phrase case: selection is multiple words. Try a phrase match.
    // Combining marks are lexical continuation content just as they are in
    // the shared single-word token grammar.
    if (/^[\p{L}\p{M}'\s-]+$/u.test(trimmed) && /\s/.test(trimmed)) {
      const phrases = this.plugin.dictionary.phraseIndex();
      const phraseMatch = matchPhraseAtStart(trimmed, phrases);
      // For phrase matches, only enter word-details mode if the ENTIRE selection
      // is one phrase. Partial phrase matches fall through to the standard
      // translation view.
      if (
        phraseMatch &&
        normalizeLexicalKey(
          phraseMatch.matchedText,
          this.plugin.settings.caseSensitiveMatching,
        ) ===
          normalizeLexicalKey(
            trimmed,
            this.plugin.settings.caseSensitiveMatching,
          )
      ) {
        // A multi-word declared form is indexed as a synthetic phrase entry.
        // Show the real lemma with a "this is the X form of Y" note rather
        // than presenting the form itself as a headword.
        const declaredLemma = this.plugin.dictionary.lemmaForDeclaredPhrase(
          phraseMatch.entry,
        );
        if (declaredLemma && phraseMatch.entry.viaFormLabel) {
          return {
            entry: declaredLemma,
            viaInflection: {
              form: phraseMatch.entry.word,
              label: phraseMatch.entry.viaFormLabel,
            },
          };
        }
        return { entry: phraseMatch.entry, viaInflection: null };
      }
      return null;
    }

    // Single-word case uses the shared lexical-token grammar.
    if (!WORD_ANCHORED_RE.test(trimmed)) return null;

    const cleaned = cleanWord(trimmed);
    if (!cleaned) return null;

    // Direct lookup (conlang word)
    const direct = this.plugin.dictionary.lookup(cleaned);
    if (direct) {
      return { entry: direct, viaInflection: null };
    }

    // Hardcoded form declared on an entry — checked before the rules so a
    // declared irregular wins over a rule-derived guess.
    const declared = this.plugin.dictionary.lookupForm(cleaned)[0];
    if (declared) {
      return {
        entry: declared.lemma,
        viaInflection: { form: cleaned, label: declared.label },
      };
    }

    // Inflected form
    const lang = this.plugin.getActiveLanguage();
    if (lang) {
      const m = findInflection(
        cleaned,
        this.plugin.dictionary,
        lang.inflections,
        lang.name,
      );
      if (m) {
        return {
          entry: m.lemma,
          viaInflection: { form: m.inflectedForm, label: m.rule.label },
        };
      }
    }

    // English word that matches a definition
    const englishHits = this.plugin.dictionary.lookupEnglish(cleaned);
    if (englishHits.length > 0) {
      return { entry: englishHits[0], viaInflection: null };
    }

    return null;
  }

  private readSelection(): string {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const editorSel = view.editor.getSelection();
      if (editorSel && editorSel.length > 0) return editorSel;
    }
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      const anchor = sel.anchorNode;
      if (anchor instanceof Node) {
        const el =
          anchor.nodeType === Node.ELEMENT_NODE
            ? (anchor as Element)
            : anchor.parentElement;
        if (el && el.closest(".conlang-panel")) return "";
      }
      return sel.toString();
    }
    return "";
  }

  private findConlangWords(text: string): DictionaryEntry[] {
    const found: DictionaryEntry[] = [];
    const seen = new Set<string>();
    const lang = this.plugin.getActiveLanguage();
    const phrases = this.plugin.dictionary.phraseIndex();
    // Use the phrase tokeniser so we recognise multi-word entries
    const tokens = tokeniseWithPhrases(text, phrases);
    for (const t of tokens) {
      if (t.kind === "separator") continue;
      let entry: DictionaryEntry | undefined;
      if (t.kind === "phrase") {
        entry = t.entry;
      } else {
        // word token
        entry = this.plugin.dictionary.lookup(t.text);
        // Hardcoded forms sit between headwords and rule matches here too.
        if (!entry) {
          entry = this.plugin.dictionary.lookupForm(t.text)[0]?.lemma;
        }
        if (!entry && lang) {
          const m = findInflection(
            t.text,
            this.plugin.dictionary,
            lang.inflections,
            lang.name,
          );
          if (m) entry = m.lemma;
        }
      }
      if (entry && !seen.has(entry.word.toLowerCase())) {
        seen.add(entry.word.toLowerCase());
        found.push(entry);
      }
    }
    return found;
  }

  private renderTranslation(
    text: string,
    direction: "english-to-conlang" | "conlang-to-english",
    conlangWords: DictionaryEntry[],
  ) {
    // Make sure the translation block is visible (might have been hidden
    // by a previous word-details render).
    this.setTranslationBlockVisible(true);

    const lang = this.plugin.getActiveLanguage();

    if (direction === "english-to-conlang") {
      this.sourceLabel.setText("English");
      this.translationLabel.setText(lang ? lang.name : "Language");
      this.sourceText.setText(text);
      this.translationText.setText(this.plugin.translateToConlang(text));
    } else {
      this.sourceLabel.setText(lang ? lang.name : "Language");
      this.translationLabel.setText("English");
      this.sourceText.setText(text);
      this.translationText.setText(this.translateConlangToEnglish(text));
    }

    this.renderActions(text, direction);
    this.renderEntries(conlangWords, text, direction);
  }

  /**
   * Hide or show the translation block (source/arrow/translation lines).
   * Used by renderWordDetails to take over the space.
   */
  private setTranslationBlockVisible(visible: boolean) {
    const block = this.sourceLabel.parentElement; // the .conlang-panel-block wrapping it
    if (block) block.style.display = visible ? "" : "none";
    this.actionsEl.style.display = visible ? "" : "none";
  }

  /**
   * The "word details" view: rich card for a single dictionary entry.
   * Shows definition, POS, IPA, etymology, and all generated inflected forms
   * grouped by inflection label.
   */
  private renderWordDetails(
    _selectedText: string,
    entry: DictionaryEntry,
    viaInflection: { form: string; label: string } | null,
  ) {
    // Selection owns this container and historically lets its summary card
    // navigate directly to the established source note.
    this.setTranslationBlockVisible(false);
    this.renderEntryDetailsInto(
      this.entriesEl,
      entry,
      viaInflection,
      true,
    );
  }

  /**
   * Render one dictionary entry into a container chosen by the owning surface.
   *
   * Selection and Dictionary may now share the same presentation without
   * sharing navigation state. This remains a read-only renderer: it receives an
   * already-loaded entry and can only navigate to already-established paths.
   *
   * Keeping the extraction inside panel.ts for now limits audit-time churn.
   * Once the wider Dictionary and sense design settles, this method and its
   * helpers can move together into a dedicated component without changing
   * their data-safety boundary.
   */
  private renderEntryDetailsInto(
    container: HTMLElement,
    entry: DictionaryEntry,
    viaInflection: { form: string; label: string } | null,
    openSummaryOnClick: boolean,
  ) {
    container.empty();

    /*
     * Dictionary can display several active languages at once. Inflection rules
     * must therefore come from this entry's owning language rather than from
     * whichever language is currently primary.
     *
     * Truly unscoped legacy entries retain the older primary-language fallback.
     * A scoped entry whose configured language is unavailable receives no
     * borrowed rules from another language.
     */
    const lang = entry.language
      ? this.plugin
          .getActiveLanguages()
          .find((candidate) => candidate.name === entry.language) ?? null
      : this.plugin.getActiveLanguage();

    // === Top card: the dictionary entry itself ===
    const card = container.createDiv({ cls: "conlang-word-card" });

    const head = card.createDiv({ cls: "conlang-word-card-head" });
    const wordEl = head.createSpan({ cls: "conlang-word-card-word" });
    wordEl.setText(entry.word);
    if (entry.partOfSpeech) {
      const pos = head.createSpan({ cls: "conlang-word-card-pos" });
      pos.setText(entry.partOfSpeech);
    }
    if (entry.ipa) {
      const ipa = head.createSpan({ cls: "conlang-word-card-ipa" });
      ipa.setText(entry.ipa);
    }
    if (entry.nameCategory) {
      const category = head.createSpan({
        cls: "conlang-word-card-category",
      });
      category.setText(entry.nameCategory);
    }
    if (
      this.plugin.getActiveLanguages().length > 1 &&
      entry.language
    ) {
      const language = head.createSpan({
        cls: "conlang-word-card-language",
      });
      language.setText(entry.language);
    }

    const def = card.createDiv({ cls: "conlang-word-card-def" });
    def.setText(entry.definition);

    if (entry.aliases && entry.aliases.length > 0) {
      const aliases = card.createDiv({
        cls: "conlang-word-card-aliases",
      });
      aliases.setText(`Also: ${entry.aliases.join(", ")}`);
    }

    if (entry.etymology) {
      const etym = card.createDiv({ cls: "conlang-word-card-etym" });
      etym.setText(`Etymology: ${entry.etymology}`);
    }

    // If we arrived here via an inflected form, surface that fact.
    if (viaInflection) {
      const note = card.createDiv({ cls: "conlang-word-card-note" });
      note.setText(
        `"${viaInflection.form}" is the ${viaInflection.label} form of ${entry.word}`,
      );
      const explanation = explainInflection(viaInflection.label);
      if (explanation) {
        note.title = explanation;
        note.addClass("has-explanation");
      }
    }

    /*
     * Selection retains its established click-to-open behavior. Dictionary
     * details will use an explicit Open note button, so reading metadata or
     * selecting text inside the card cannot unexpectedly navigate away.
     */
    if (openSummaryOnClick) {
      card.addClass("conlang-clickable");
      card.title = "Open dictionary source note";
      card.addEventListener("click", () => {
        this.openDictionaryEntrySource(entry);
      });
    }

    // Structured senses enrich the simple definition without replacing it.
    this.renderEntrySenses(container, entry);

    // === Compound decomposition: show parts if this is a compound ===
    if (entry.parts && entry.parts.length > 0) {
      this.renderPartsDecomposition(container, entry);
    }

    // === Declared forms (the entry's own `forms:` property) ===
    // Rendered before predicted forms because they're authoritative: the user
    // wrote them by hand precisely because the rules get them wrong.
    if (entry.forms && entry.forms.length > 0) {
      this.renderDeclaredForms(container, entry.forms);
    }

    // === Generated forms ===
    const generated: GeneratedForm[] = lang
      ? generateInflections(entry, lang.inflections)
      : [];

    if (generated.length === 0) {
      // Don't nag about missing rules when the entry declares its own forms —
      // that's a complete, deliberate answer, not a gap to fill.
      if (entry.forms && entry.forms.length > 0) return;
      const empty = container.createDiv({ cls: "conlang-forms-empty" });
      if (!entry.partOfSpeech) {
        empty.setText(
          "No inflected forms predicted — this entry has no part of speech, so POS-filtered rules don't apply. " +
            "Edit the entry's frontmatter to add a partOfSpeech.",
        );
      } else {
        empty.setText(
          `No inflection rules apply to ${entry.partOfSpeech}s. Add rules in Settings → Conlang → Inflection rules.`,
        );
      }
      return;
    }

    const header = container.createDiv({
      cls: "conlang-panel-section-header",
    });
    header.setText("Predicted forms");

    // Group by inflection label so e.g. two "plural" rules show side-by-side
    const groups = new Map<string, GeneratedForm[]>();
    for (const g of generated) {
      const list = groups.get(g.rule.label) ?? [];
      list.push(g);
      groups.set(g.rule.label, list);
    }

    const formsList = container.createDiv({ cls: "conlang-forms-list" });
    for (const [label, items] of groups) {
      const row = formsList.createDiv({ cls: "conlang-form-row" });
      const labelEl = row.createDiv({ cls: "conlang-form-label" });
      labelEl.setText(label);

      // Add a hover tooltip explaining what this category means.
      // Priority: user's own description on the rule > built-in explanation > nothing.
      // We check description on the first rule in the group (they share a label).
      const customDescription = items[0]?.rule.description;
      const explanation = customDescription || explainInflection(label);
      if (explanation) {
        labelEl.title = explanation;
        labelEl.addClass("has-explanation");
      }

      const formsEl = row.createDiv({ cls: "conlang-form-values" });
      for (const item of items) {
        const formEl = formsEl.createSpan({ cls: "conlang-form-value" });
        formEl.setText(item.form);
      }
    }

    // Helpful hint at the bottom
    const hint = container.createDiv({ cls: "conlang-forms-hint" });
    hint.setText(
      "Forms are predicted from your inflection rules. Hover any of them in a note to see this entry.",
    );
  }

  /**
   * Render the reader-facing portion of this entry's structured senses.
   *
   * Sense IDs and lookup terms remain available in the runtime model for future
   * reference and editing tools, but they are not prose definitions and should
   * not become visual clutter merely because the model can store them.
   *
   * Keeping sense presentation in one helper leaves room for the pre-alpha
   * schema to grow without coupling those future fields to Dictionary
   * navigation or compound-part resolution.
   */
  private renderEntrySenses(
    container: HTMLElement,
    entry: Readonly<DictionaryEntry>,
  ): void {
    const displayable = (entry.senses ?? []).filter(
      (sense) => Boolean(sense.gloss || sense.definition),
    );
    if (displayable.length === 0) return;

    const section = container.createDiv({
      cls: "conlang-entry-senses",
    });
    section.createDiv({
      cls: "conlang-panel-section-header",
      text: "Senses",
    });

    const list = section.createDiv({
      cls: "conlang-entry-senses-list",
    });

    for (const sense of displayable) {
      const senseEl = list.createDiv({
        cls: "conlang-entry-sense",
      });

      if (sense.gloss) {
        senseEl.createDiv({
          cls: "conlang-entry-sense-gloss",
          text: sense.gloss,
        });
      }

      if (sense.definition) {
        senseEl.createDiv({
          cls: "conlang-entry-sense-definition",
          text: sense.definition,
        });
      }
    }
  }

  /**
   * Render the entry's hardcoded `forms:` as a declension/conjugation table
   * (issues #10 and #15). Grouped by label so several forms sharing a label
   * ("dative: kalim, kalum") sit on one row, matching how predicted forms are
   * grouped directly below.
   */
  private renderDeclaredForms(
    container: HTMLElement,
    forms: InflectedForm[],
  ) {
    const section = container.createDiv({
      cls: "conlang-declared-section",
    });
    const header = section.createDiv({ cls: "conlang-panel-section-header" });
    header.setText("Declared forms");

    const groups = new Map<string, string[]>();
    for (const f of forms) {
      const list = groups.get(f.label) ?? [];
      list.push(f.form);
      groups.set(f.label, list);
    }

    const list = section.createDiv({ cls: "conlang-forms-list is-declared" });
    for (const [label, values] of groups) {
      const row = list.createDiv({ cls: "conlang-form-row" });
      const labelEl = row.createDiv({ cls: "conlang-form-label" });
      labelEl.setText(label);
      const explanation = explainInflection(label);
      if (explanation) {
        labelEl.title = explanation;
        labelEl.addClass("has-explanation");
      }
      const valuesEl = row.createDiv({ cls: "conlang-form-values" });
      for (const v of values) {
        valuesEl.createSpan({ cls: "conlang-form-value is-declared", text: v });
      }
    }

    const hint = section.createDiv({ cls: "conlang-forms-hint" });
    hint.setText(
      "Set by this entry's `forms:` property. A declared label replaces the same-named rule's prediction for this entry.",
    );
  }

  /**
   * Render one lexical entry's compound decomposition.
   *
   * Resolution uses the entry itself as language authority and returns explicit
   * zero/one/many cardinality. Only one proven same-language target becomes
   * clickable. Missing or ambiguous relationships remain visible but cannot
   * silently navigate to another language's or an arbitrarily first-loaded
   * note.
   */
  private renderPartsDecomposition(
    container: HTMLElement,
    owner: DictionaryEntry,
  ) {
    const section = container.createDiv({ cls: "conlang-parts-section" });
    const header = section.createDiv({ cls: "conlang-panel-section-header" });
    header.setText("Parts");
    const list = section.createDiv({ cls: "conlang-parts-list" });
    const candidates = this.plugin.dictionary.allEntries();

    for (const part of owner.parts ?? []) {
      const chip = list.createDiv({ cls: "conlang-part-chip" });
      const wordEl = chip.createSpan({ cls: "conlang-part-word" });
      wordEl.setText(part);

      const resolution = resolveLexicalPart(
        owner,
        part,
        candidates,
        this.plugin.settings.caseSensitiveMatching,
      );

      if (resolution.status === "unresolved") {
        chip.addClass("unknown");
        chip.title =
          "This part isn't in this lexical entry's language dictionary.";
        continue;
      }

      const sep = chip.createSpan({ cls: "conlang-part-sep" });
      sep.setText("→");
      const meaningEl = chip.createSpan({ cls: "conlang-part-meaning" });

      if (resolution.status === "ambiguous") {
        chip.addClass("ambiguous");
        meaningEl.setText(
          `${resolution.targets.length} possible same-language matches`,
        );
        chip.title =
          "This part is ambiguous. Open Diagnostics to inspect every " +
          "matching source before deciding which relationship is intended.";
        continue;
      }

      const [target] = resolution.targets;
      const sense = firstSense(target.definition);
      meaningEl.setText(sense || target.definition);
      chip.addClass("conlang-clickable");
      chip.addEventListener("click", () => {
        const file = this.plugin.app.vault.getAbstractFileByPath(target.path);
        if (file instanceof TFile) {
          void this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      });
    }
  }

  /**
   * Navigate to an already-loaded lexical source.
   *
   * This helper has navigation authority only. It does not create, repair,
   * rename, or rewrite the source when the path is missing or no longer points
   * to a Markdown file.
   */
  private openDictionaryEntrySource(entry: Readonly<DictionaryEntry>): void {
    const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
    if (file instanceof TFile) {
      void this.plugin.app.workspace.getLeaf(false).openFile(file);
    }
  }

  private translateConlangToEnglish(text: string): string {
    const lang = this.plugin.getActiveLanguage();
    const phrases = this.plugin.dictionary.phraseIndex();
    const tokens = tokeniseWithPhrases(text, phrases);
    const out: string[] = [];
    for (const t of tokens) {
      if (t.kind === "separator") {
        out.push(t.text);
        continue;
      }
      if (t.kind === "phrase" && t.entry) {
        // Use the first English sense as a quick gloss for the phrase
        const sense = firstSense(t.entry.definition);
        out.push(sense || t.text);
        continue;
      }
      // Single-word token: try direct lookup, then inflection, then reverse cypher
      const word = t.text;
      const entry = this.plugin.dictionary.lookup(word);
      if (entry) {
        const sense = firstSense(entry.definition);
        out.push(sense || word);
        continue;
      }
      if (lang) {
        const m = findInflection(
          word,
          this.plugin.dictionary,
          lang.inflections,
          lang.name,
        );
        if (m) {
          const sense = firstSense(m.lemma.definition) || m.lemma.word;
          out.push(`${sense}.${m.rule.label.toUpperCase()}`);
          continue;
        }
        out.push(applyCypherReverse(word, lang.sheets));
        continue;
      }
      out.push(word);
    }
    return out.join("");
  }

  private renderActions(
    text: string,
    direction: "english-to-conlang" | "conlang-to-english",
  ) {
    this.actionsEl.empty();
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const hasEditor = view !== null && view.editor.getSelection() === text;

    if (direction === "english-to-conlang") {
      const replaceBtn = this.actionsEl.createEl("button", {
        text: "Replace in note",
        cls: "conlang-panel-btn conlang-panel-btn-primary",
      });
      replaceBtn.disabled = !hasEditor;
      if (!hasEditor)
        replaceBtn.title = "Make a selection in an editor to enable.";
      replaceBtn.addEventListener("click", () => {
        if (view) void this.plugin.commitSelectionToConlang(view.editor);
      });

      const createBtn = this.actionsEl.createEl("button", {
        text: "Save to dictionary",
        cls: "conlang-panel-btn",
      });
      createBtn.title =
        "Create a dictionary entry mapping this English text to its cyphered form.";
      createBtn.addEventListener("click", () => {
        void this.plugin.createDictionaryEntryForText(text);
      });
    }
  }

  private renderEntries(
    entries: DictionaryEntry[],
    text: string,
    direction: "english-to-conlang" | "conlang-to-english",
  ) {
    this.entriesEl.empty();

    if (direction === "english-to-conlang") {
      const matched: DictionaryEntry[] = [];
      const words = text.match(WORD_RE) ?? [];
      const seen = new Set<string>();
      for (const w of words) {
        const hits = this.plugin.dictionary.lookupEnglish(w);
        for (const e of hits) {
          if (!seen.has(e.word.toLowerCase())) {
            seen.add(e.word.toLowerCase());
            matched.push(e);
          }
        }
      }
      if (matched.length > 0) {
        const header = this.entriesEl.createDiv({
          cls: "conlang-panel-section-header",
        });
        header.setText("Matched dictionary entries");
        for (const entry of matched)
          this.renderEntryCard(this.entriesEl, entry);
      }
      return;
    }

    if (entries.length === 0) return;
    const header = this.entriesEl.createDiv({
      cls: "conlang-panel-section-header",
    });
    header.setText("Dictionary entries");
    for (const entry of entries) this.renderEntryCard(this.entriesEl, entry);
  }

  private renderEntryCard(parent: HTMLElement, entry: DictionaryEntry) {
    const card = parent.createDiv({ cls: "conlang-panel-entry" });

    const top = card.createDiv({ cls: "conlang-panel-entry-top" });
    const word = top.createSpan({ cls: "conlang-panel-entry-word" });
    word.setText(entry.word);
    if (entry.partOfSpeech) {
      const pos = top.createSpan({ cls: "conlang-panel-entry-pos" });
      pos.setText(entry.partOfSpeech);
    }
    if (entry.ipa) {
      const ipa = top.createSpan({ cls: "conlang-panel-entry-ipa" });
      ipa.setText(entry.ipa);
    }

    const def = card.createDiv({ cls: "conlang-panel-entry-def" });
    def.setText(entry.definition);

    if (entry.etymology) {
      const etym = card.createDiv({ cls: "conlang-panel-entry-etym" });
      etym.setText(`Etymology: ${entry.etymology}`);
    }

    card.addClass("conlang-clickable");
    card.addEventListener("click", () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        void this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });
  }

  // ===== Translator tab (free-form text input) =====

  private buildTranslatorTab() {
    this.translatorEl = this.tabContentEl.createDiv({
      cls: "conlang-translator",
    });

    // Source row: label
    const sourceRow = this.translatorEl.createDiv({
      cls: "conlang-translator-row",
    });
    this.translatorSourceLabel = sourceRow.createDiv({
      cls: "conlang-translator-label",
    });

    this.translatorInputEl = this.translatorEl.createEl("textarea", {
      cls: "conlang-translator-input",
    });
    this.translatorInputEl.placeholder = "Type something to look up…";
    this.translatorInputEl.rows = 4;
    this.translatorInputEl.value = this.translatorInput;
    this.translatorInputEl.addEventListener("input", () => {
      this.translatorInput = this.translatorInputEl.value;
      this.scheduleTranslatorTranslation();
    });

    // Swap button between input and output
    const swapRow = this.translatorEl.createDiv({
      cls: "conlang-translator-swap-row",
    });
    this.translatorSwapBtn = swapRow.createEl("button", {
      // The sentence-case rule counts the leading glyph as the first word and
      // asks for "swap direction" — which reads worse than the label users
      // already know, so that warning is expected here.
      text: "↑↓ Swap direction",
      cls: "conlang-panel-btn conlang-translator-swap",
    });
    this.translatorSwapBtn.title =
      "Swap which language is the source and which is the target.";
    this.translatorSwapBtn.addEventListener("click", () =>
      this.swapTranslatorDirection(),
    );

    // Mode toggle: Gloss (default, per-word breakdown) vs Transliterate (flat output)
    const modeRow = this.translatorEl.createDiv({
      cls: "conlang-translator-mode-row",
    });
    const modeLabel = modeRow.createSpan({
      cls: "conlang-browser-control-label",
    });
    modeLabel.setText("Mode");
    const modeGroup = modeRow.createDiv({ cls: "conlang-browser-segmented" });
    const modes: {
      value: "gloss" | "transliterate";
      label: string;
      tooltip: string;
    }[] = [
      {
        value: "gloss",
        label: "Gloss",
        tooltip:
          "Word-by-word breakdown. Each word shows its dictionary candidates. Words with no dictionary match are clearly flagged. This is what the plugin actually knows — not a fluent translation.",
      },
      {
        value: "transliterate",
        label: "Transliterate",
        tooltip:
          "Flat output: dictionary words substituted, unknown words run through the cypher as placeholders. Useful for the 'English with different sounds' use case, but not real translation — cypher output is not real conlang grammar.",
      },
    ];
    for (const m of modes) {
      const btn = modeGroup.createEl("button", {
        text: m.label,
        cls: "conlang-browser-segment",
      });
      btn.title = m.tooltip;
      if (m.value === this.translatorMode) btn.addClass("active");
      btn.addEventListener("click", () => {
        this.translatorMode = m.value;
        modeGroup
          .querySelectorAll(".conlang-browser-segment")
          .forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        this.runTranslatorTranslation();
      });
    }

    // Target row: label
    const targetRow = this.translatorEl.createDiv({
      cls: "conlang-translator-row",
    });
    this.translatorTargetLabel = targetRow.createDiv({
      cls: "conlang-translator-label",
    });
    this.translatorCopyBtn = targetRow.createEl("button", {
      text: "Copy",
      cls: "conlang-translator-copy-btn",
    });
    this.translatorCopyBtn.title =
      "Copy the transliteration output to your clipboard. (Gloss mode is rich content and isn't copyable as plain text.)";
    this.translatorCopyBtn.addEventListener(
      "click",
      () => void this.copyTranslation(),
    );

    // Output area: either a gloss render (rich token list) or a flat string
    this.translatorOutputEl = this.translatorEl.createDiv({
      cls: "conlang-translator-output",
    });

    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
  }

  /**
   * Update the source/target language labels based on the current direction.
   */
  private updateTranslatorLabels() {
    const primary = this.plugin.getPrimaryLanguage();
    const activeLangs = this.plugin.getActiveLanguages();
    const primaryName = primary?.name ?? "Language";

    if (this.translatorDirection === "english-to-conlang") {
      this.translatorSourceLabel?.setText("English");
      // English → conlang always targets the primary (cypher can only output
      // one language). When there are multiple actives, make this explicit
      // so users know what's happening.
      if (activeLangs.length > 1) {
        this.translatorTargetLabel?.setText(`${primaryName} (primary)`);
      } else {
        this.translatorTargetLabel?.setText(primaryName);
      }
    } else {
      // Conlang → English queries ALL active languages. Show the source as
      // a combined list when more than one is active.
      if (activeLangs.length > 1) {
        this.translatorSourceLabel?.setText(
          activeLangs.map((l) => l.name).join(" / "),
        );
      } else {
        this.translatorSourceLabel?.setText(primaryName);
      }
      this.translatorTargetLabel?.setText("English");
    }
  }

  private scheduleTranslatorTranslation() {
    if (this.translatorDebounceTimer !== null) {
      window.clearTimeout(this.translatorDebounceTimer);
    }
    this.translatorDebounceTimer = window.setTimeout(() => {
      this.translatorDebounceTimer = null;
      this.runTranslatorTranslation();
    }, 200);
  }

  /**
   * Run the lookup and render the output according to the current mode.
   */
  private runTranslatorTranslation() {
    if (!this.translatorOutputEl) return;
    const input = this.translatorInput;
    this.translatorOutputEl.empty();
    this.translatorOutputEl.removeClass("is-empty");

    if (!input || input.trim().length === 0) {
      this.translatorOutputEl.addClass("is-empty");
      this.translatorOutputEl.setText(
        this.translatorMode === "gloss"
          ? "Type to see a word-by-word breakdown."
          : "Translation will appear here.",
      );
      return;
    }

    const lang = this.plugin.getActiveLanguage();
    const tokens =
      this.translatorDirection === "english-to-conlang"
        ? glossEnglishToConlang(input, this.plugin.dictionary, lang)
        : glossConlangToEnglish(input, this.plugin.dictionary, lang);

    if (this.translatorMode === "gloss") {
      this.renderGloss(tokens);
    } else {
      this.renderTransliteration(tokens);
    }
  }

  /**
   * Render the gloss as a list of word-by-word cards. Each card shows the
   * source word, the kind of match, and any candidates. This is the honest
   * representation: it does NOT pretend to assemble fluent translation.
   */
  private renderGloss(tokens: GlossToken[]) {
    const list = this.translatorOutputEl.createDiv({
      cls: "conlang-gloss-list",
    });
    const visibleTokens = tokens.filter((t) => t.kind !== "separator");
    if (visibleTokens.length === 0) {
      this.translatorOutputEl.addClass("is-empty");
      this.translatorOutputEl.setText("Nothing to look up.");
      return;
    }
    for (const t of visibleTokens) {
      this.renderGlossToken(list, t);
    }
    // Honest footer: explain what the user is looking at
    const footer = this.translatorOutputEl.createDiv({
      cls: "conlang-gloss-footer",
    });
    footer.setText(
      "This is a per-word lookup — not a fluent translation. Real translation requires grammar your dictionary entries don't encode.",
    );
  }

  private renderGlossToken(parent: HTMLElement, t: GlossToken) {
    const card = parent.createDiv({
      cls: `conlang-gloss-token kind-${t.kind}`,
    });

    const head = card.createDiv({ cls: "conlang-gloss-token-head" });
    const source = head.createSpan({ cls: "conlang-gloss-token-source" });
    source.setText(t.source);

    switch (t.kind) {
      case "dictionary": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        const candidates = t.candidates ?? [];
        if (candidates.length === 1) {
          const single = head.createSpan({ cls: "conlang-gloss-token-target" });
          single.setText(candidates[0].word);

          const matchedSenses = this.getMatchedSenses(t, candidates[0]);

          if (matchedSenses.length > 1) {
            // The lexical entry itself is unambiguous, but the English key
            // belongs to several of its senses. Show the word once and make
            // the within-entry sense ambiguity explicit below it.
            this.renderTokenMeta(card, candidates[0], undefined, false);
            this.renderMatchedSenses(card, matchedSenses);
          } else {
            const matchedSense = matchedSenses[0];
            this.renderTokenMeta(card, candidates[0], matchedSense);
          }
        } else {
          const note = head.createSpan({ cls: "conlang-gloss-multi-note" });
          note.setText(`${candidates.length} matches`);
          this.renderCandidates(card, candidates, t);
        }
        break;
      }
      case "phrase": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        const c = t.candidates?.[0];
        if (c) {
          const target = head.createSpan({ cls: "conlang-gloss-token-target" });
          target.setText(c.word);
          const tag = head.createSpan({ cls: "conlang-gloss-token-tag" });
          tag.setText("Phrase");
          const matchedSense = this.getSingleMatchedSense(t, c);
          this.renderTokenMeta(card, c, matchedSense);
        }
        break;
      }
      case "inflected": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("→");
        if (t.inflection) {
          const target = head.createSpan({ cls: "conlang-gloss-token-target" });
          const sense = firstSense(t.inflection.lemma.definition);
          target.setText(sense || t.inflection.lemma.word);
          const tag = head.createSpan({ cls: "conlang-gloss-token-tag" });
          tag.setText(t.inflection.label);
          const expl = explainInflection(t.inflection.label);
          if (expl) tag.title = expl;
          // Show the lemma underneath
          const meta = card.createDiv({ cls: "conlang-gloss-token-meta" });
          meta.setText(`lemma: ${t.inflection.lemma.word}`);
        }
        break;
      }
      case "cypher-fallback": {
        const arrow = head.createSpan({ cls: "conlang-gloss-token-arrow" });
        arrow.setText("≈");
        const target = head.createSpan({ cls: "conlang-gloss-token-target" });
        target.setText(t.cypherOutput ?? "");
        const tag = head.createSpan({
          cls: "conlang-gloss-token-tag conlang-gloss-warn",
        });
        tag.setText("Cypher only");
        tag.title =
          "No dictionary entry — this is a phonological placeholder from the cypher rules, not a real translation.";
        break;
      }
      case "no-match": {
        const tag = head.createSpan({
          cls: "conlang-gloss-token-tag conlang-gloss-warn",
        });
        tag.setText("No match");
        tag.title =
          "No dictionary entry and the cypher rules don't apply. Consider adding this to the dictionary.";
        break;
      }
    }
  }

  /**
   * Return every structured lexical sense that matched this dictionary entry.
   *
   * `englishMatches` may contain several results for the same lexical entry
   * when one English lookup key belongs to more than one of its senses. Keeping
   * all of them lets the UI show that ambiguity instead of silently choosing.
   */
  private getMatchedSenses(
    token: GlossToken,
    entry: DictionaryEntry,
  ): LexicalSense[] {
    return (
      token.englishMatches
        ?.filter((match) => match.entry === entry && match.sense)
        .map((match) => match.sense as LexicalSense) ?? []
    );
  }

  /**
   * Return one structured sense only when the lookup identified exactly one.
   *
   * This helper remains useful for ordinary unambiguous matches. When several
   * senses matched, return undefined so callers cannot accidentally present one
   * of them as the definite meaning.
   */
  private getSingleMatchedSense(
    token: GlossToken,
    entry: DictionaryEntry,
  ): LexicalSense | undefined {
    const senses = this.getMatchedSenses(token, entry);
    return senses.length === 1 ? senses[0] : undefined;
  }

  /**
   * Render the small metadata area under a gloss token.
   *
   * When a specific structured sense caused the English lookup match, prefer
   * that sense's compact gloss. If the sense has no gloss but does have a
   * fuller definition, show that definition on its own line beneath the
   * metadata. With no matched structured sense, preserve the original
   * simple-definition behaviour.
   */
  private renderTokenMeta(
    card: HTMLElement,
    entry: DictionaryEntry,
    matchedSense?: LexicalSense,
    showSimpleDefinition = true,
  ) {
    const meta = card.createDiv({ cls: "conlang-gloss-token-meta" });
    const parts: string[] = [];

    if (entry.partOfSpeech) parts.push(entry.partOfSpeech);
    if (entry.ipa) parts.push(entry.ipa);

    if (matchedSense) {
      // A structured gloss is already intended to be a short reader-facing
      // meaning, so it belongs naturally in the compact metadata line.
      if (
        matchedSense.gloss &&
        matchedSense.gloss.toLowerCase() !== entry.word.toLowerCase()
      ) {
        parts.push(`"${matchedSense.gloss}"`);
      }
    } else if (showSimpleDefinition) {
      // Simple entries retain the original behaviour based on the entry-level
      // definition. A caller can suppress this fallback when several
      // structured senses matched and those senses will be shown explicitly.
      const sense = firstSense(entry.definition);
      if (sense && sense.toLowerCase() !== entry.word.toLowerCase()) {
        parts.push(`"${sense}"`);
      }
    }

    meta.setText(parts.join(" · "));

    // A structured sense may intentionally have no short gloss. Its fuller
    // definition is still useful, but it is prose rather than compact metadata,
    // so display it on a separate line instead of squeezing it beside POS/IPA.
    if (matchedSense && !matchedSense.gloss && matchedSense.definition) {
      const senseDef = card.createDiv({
        cls: "conlang-gloss-token-sense-def",
      });
      senseDef.setText(matchedSense.definition);
    }

    card.addClass("conlang-clickable");
    card.addEventListener("click", () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        void this.plugin.app.workspace.getLeaf(false).openFile(file);
      }
    });
  }

  /**
   * Render several structured senses that matched one lexical entry.
   *
   * Prefer a sense gloss as the reader-facing heading. When no gloss exists,
   * use the fuller definition directly instead. Stable sense IDs remain
   * structural metadata and are intentionally not shown here.
   */
  private renderMatchedSenses(card: HTMLElement, senses: LexicalSense[]) {
    const note = card.createDiv({ cls: "conlang-gloss-multi-note" });
    note.setText(`${senses.length} matching senses`);

    const list = card.createDiv({ cls: "conlang-gloss-matched-senses" });

    for (const sense of senses) {
      const row = list.createDiv({ cls: "conlang-gloss-matched-sense" });

      if (sense.gloss) {
        const gloss = row.createDiv({
          cls: "conlang-gloss-matched-sense-gloss",
        });
        gloss.setText(sense.gloss);

        if (sense.definition) {
          const definition = row.createDiv({
            cls: "conlang-gloss-matched-sense-def",
          });
          definition.setText(sense.definition);
        }
      } else if (sense.definition) {
        const definition = row.createDiv({
          cls: "conlang-gloss-matched-sense-def",
        });
        definition.setText(sense.definition);
      }
    }
  }

  /**
   * Render multiple dictionary-entry matches for the same English lookup.
   *
   * Each row represents a different lexical entry. When structured sense
   * information is available, show the particular sense that caused that
   * entry to match rather than only its general entry-level definition.
   */
  private renderCandidates(
    card: HTMLElement,
    candidates: DictionaryEntry[],
    token: GlossToken,
  ) {
    const list = card.createDiv({ cls: "conlang-gloss-candidates" });
    // Only show language tags when more than one language is active —
    // otherwise it's just visual noise.
    const showLang = this.plugin.getActiveLanguages().length > 1;
    for (const entry of candidates) {
      const row = list.createDiv({ cls: "conlang-gloss-candidate" });
      const word = row.createSpan({ cls: "conlang-gloss-candidate-word" });
      word.setText(entry.word);
      if (showLang && entry.language) {
        const lang = row.createSpan({ cls: "conlang-gloss-candidate-lang" });
        lang.setText(entry.language);
      }
      if (entry.partOfSpeech) {
        const pos = row.createSpan({ cls: "conlang-gloss-candidate-pos" });
        pos.setText(entry.partOfSpeech);
      }
      const def = row.createSpan({ cls: "conlang-gloss-candidate-def" });

      // Use the structured sense that actually caused this English lookup
      // when there is exactly one such sense for this candidate. This keeps
      // the candidate list honest: it explains why this particular word was
      // offered instead of always showing the entry's general definition.
      const matchedSense = this.getSingleMatchedSense(token, entry);
      const matchedMeaning =
        matchedSense?.gloss ?? matchedSense?.definition ?? entry.definition;

      def.setText(matchedMeaning);
      row.addClass("conlang-clickable");
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const file = this.plugin.app.vault.getAbstractFileByPath(entry.path);
        if (file instanceof TFile) {
          void this.plugin.app.workspace.getLeaf(false).openFile(file);
        }
      });
    }
  }

  /**
   * Render flat transliteration output with cypher fallbacks visually marked.
   * The output is still text-based, but we wrap cypher-fallback words in a
   * span so the user can see at a glance which words are placeholders.
   */
  private renderTransliteration(tokens: GlossToken[]) {
    const container = this.translatorOutputEl.createDiv({
      cls: "conlang-translit",
    });
    for (const t of tokens) {
      switch (t.kind) {
        case "separator":
          container.appendText(t.source);
          break;
        case "dictionary":
        case "phrase":
          if (t.candidates && t.candidates.length > 0) {
            const span = container.createSpan({ cls: "conlang-translit-dict" });
            span.setText(applyCasing(t.source, t.candidates[0].word));
            if (t.candidates.length > 1) {
              span.title = `${t.candidates.length} senses: ${t.candidates.map((c) => c.word).join(", ")}`;
              span.addClass("multi-sense");
            }
          } else {
            container.appendText(t.source);
          }
          break;
        case "inflected":
          if (t.inflection) {
            const span = container.createSpan({ cls: "conlang-translit-dict" });
            const sense = firstSense(t.inflection.lemma.definition);
            span.setText(
              `${sense || t.inflection.lemma.word}.${t.inflection.label.toUpperCase()}`,
            );
          }
          break;
        case "cypher-fallback": {
          const cspan = container.createSpan({
            cls: "conlang-translit-cypher",
          });
          cspan.setText(t.cypherOutput ?? t.source);
          cspan.title =
            "Cypher placeholder — no dictionary entry exists for this word.";
          break;
        }
        case "no-match": {
          const nspan = container.createSpan({
            cls: "conlang-translit-nomatch",
          });
          nspan.setText(t.source);
          nspan.title =
            "No dictionary entry and no cypher transformation. Original word unchanged.";
          break;
        }
      }
    }

    const footer = this.translatorOutputEl.createDiv({
      cls: "conlang-gloss-footer",
    });
    footer.setText(
      "Words from your dictionary are in plain text. Italicised words are cypher placeholders — they preserve sound but don't carry conlang grammar.",
    );
  }

  /**
   * Swap the translation direction. The current source text stays as input,
   * we just flip the direction. (We don't move output→input as before because
   * gloss output isn't plain text.)
   */
  private swapTranslatorDirection() {
    this.translatorDirection =
      this.translatorDirection === "english-to-conlang"
        ? "conlang-to-english"
        : "english-to-conlang";
    this.updateTranslatorLabels();
    this.runTranslatorTranslation();
    this.translatorInputEl?.focus();
  }

  /**
   * Copy current transliteration output (only works in transliterate mode;
   * gloss mode is rich and not copyable as plain text).
   */
  private async copyTranslation() {
    if (this.translatorMode !== "transliterate") {
      // Build the flat string from current tokens
      const input = this.translatorInput;
      if (!input.trim()) return;
      const lang = this.plugin.getActiveLanguage();
      const tokens =
        this.translatorDirection === "english-to-conlang"
          ? glossEnglishToConlang(input, this.plugin.dictionary, lang)
          : glossConlangToEnglish(input, this.plugin.dictionary, lang);
      const text = renderTransliterationString(tokens);
      try {
        await navigator.clipboard.writeText(text);
        const original = this.translatorCopyBtn.textContent ?? "Copy";
        this.translatorCopyBtn.setText("Copied!");
        this.translatorCopyBtn.disabled = true;
        window.setTimeout(() => {
          this.translatorCopyBtn.setText(original);
          this.translatorCopyBtn.disabled = false;
        }, 1200);
      } catch {
        // clipboard unavailable
      }
      return;
    }
    const text = this.translatorOutputEl?.textContent ?? "";
    if (!text || this.translatorOutputEl?.hasClass("is-empty")) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = this.translatorCopyBtn.textContent ?? "Copy";
      this.translatorCopyBtn.setText("Copied!");
      this.translatorCopyBtn.disabled = true;
      window.setTimeout(() => {
        this.translatorCopyBtn.setText(original);
        this.translatorCopyBtn.disabled = false;
      }, 1200);
    } catch {
      // ignore
    }
  }

  // ===== Dictionary tab (browser) =====

  private buildDictionaryTab() {
    this.browserEl = this.tabContentEl.createDiv({ cls: "conlang-browser" });

    // Toolbar: search + filter + sort
    this.browserToolbarEl = this.browserEl.createDiv({
      cls: "conlang-browser-toolbar",
    });

    const searchInput = this.browserToolbarEl.createEl("input", {
      type: "search",
      cls: "conlang-browser-search",
      placeholder: "Search words or definitions…",
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      // Debounced: filtering + rebuilding the list on every keystroke gets
      // expensive with large dictionaries. 200ms after the last keystroke.
      if (this.searchDebounceTimer !== null) {
        window.clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.searchDebounceTimer = null;
        this.renderBrowserList();
      }, 200);
    });

    this.browserControlsEl = this.browserEl.createDiv({
      cls: "conlang-browser-controls",
    });
    const controlsRow = this.browserControlsEl;

    /*
     * Each label and its control share one non-breaking flex item. The outer
     * controls row may still wrap for a narrow side panel, but it cannot leave
     * a label stranded at the end of one line while its control moves below.
     */
    const sortGroup = controlsRow.createDiv({
      cls: "conlang-browser-control-group",
    });
    const sortLabel = sortGroup.createSpan({
      cls: "conlang-browser-control-label",
    });
    sortLabel.setText("Sort");
    const sortSelect = sortGroup.createEl("select", {
      cls: "conlang-browser-select",
    });
    const sortOptions: { value: SortKey; label: string }[] = [
      { value: "alphabetical", label: "Alphabetical" },
      { value: "recent", label: "Recently added" },
      { value: "partOfSpeech", label: "Part of speech" },
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl("option", {
        text: opt.label,
        value: opt.value,
      });
      if (opt.value === this.sortKey) o.selected = true;
    }
    sortSelect.addEventListener("change", () => {
      this.sortKey = sortSelect.value as SortKey;
      this.renderBrowserList();
    });

    const posGroup = controlsRow.createDiv({
      cls: "conlang-browser-control-group",
    });
    const posLabel = posGroup.createSpan({
      cls: "conlang-browser-control-label",
    });
    posLabel.setText("Type");
    const posSelect = posGroup.createEl("select", {
      cls: "conlang-browser-select",
    });
    // The "all" option is always present; specific POS values are filled in
    // dynamically by renderBrowser() based on what's actually in the dictionary.
    posSelect.addEventListener("change", () => {
      this.posFilter = posSelect.value;
      this.renderBrowserList();
    });
    // Tag the element so we can find and refill it later
    posSelect.addClass("conlang-pos-select");

    // Names filter: a 3-way segmented control. Toggle to focus on (or hide)
    // proper nouns without re-typing them into the search box.
    const namesControlGroup = controlsRow.createDiv({
      cls: "conlang-browser-control-group",
    });
    const namesLabel = namesControlGroup.createSpan({
      cls: "conlang-browser-control-label",
    });
    namesLabel.setText("Names");
    const namesGroup = namesControlGroup.createDiv({
      cls: "conlang-browser-segmented",
    });
    const namesOptions: {
      value: "all" | "names-only" | "hide-names";
      label: string;
      tooltip: string;
    }[] = [
      {
        value: "all",
        label: "All",
        tooltip: "Show all entries, including proper nouns.",
      },
      {
        value: "names-only",
        label: "Only",
        tooltip: "Show only proper nouns (characters, places, factions, etc.).",
      },
      {
        value: "hide-names",
        label: "Hide",
        tooltip: "Hide all proper nouns from the list.",
      },
    ];
    for (const opt of namesOptions) {
      const btn = namesGroup.createEl("button", {
        text: opt.label,
        cls: "conlang-browser-segment",
      });
      btn.title = opt.tooltip;
      if (opt.value === this.nameFilter) btn.addClass("active");
      btn.addEventListener("click", () => {
        this.nameFilter = opt.value;
        namesGroup
          .querySelectorAll(".conlang-browser-segment")
          .forEach((el) => el.removeClass("active"));
        btn.addClass("active");
        this.renderBrowserList();
      });
    }

    /*
     * Language scope follows the primary language by default.
     *
     * This is intentionally a two-state scope control rather than a second
     * language selector. The star at the top remains authoritative for which
     * active language is primary; Dictionary merely decides whether to show
     * that language alone or broaden the comparison to all active ones.
     */
    const languageControlGroup = controlsRow.createDiv({
      cls: "conlang-browser-control-group",
    });
    const langLabel = languageControlGroup.createSpan({
      cls: "conlang-browser-control-label",
    });
    langLabel.setText("Language");

    const langScope = languageControlGroup.createDiv({
      cls: "conlang-browser-segmented",
    });

    const primaryButton = langScope.createEl("button", {
      text: "Primary",
      cls: "conlang-browser-segment",
    });
    primaryButton.title =
      "Show only the language currently marked as primary by the star.";

    const allActiveButton = langScope.createEl("button", {
      text: "All active",
      cls: "conlang-browser-segment",
    });
    allActiveButton.title =
      "Show entries from every currently active language.";

    const updateScopeButtons = () => {
      primaryButton.toggleClass(
        "active",
        !this.showAllActiveDictionaryLanguages,
      );
      allActiveButton.toggleClass(
        "active",
        this.showAllActiveDictionaryLanguages,
      );
    };

    primaryButton.addEventListener("click", () => {
      if (!this.showAllActiveDictionaryLanguages) return;
      this.showAllActiveDictionaryLanguages = false;
      updateScopeButtons();
      this.renderBrowser();
    });

    allActiveButton.addEventListener("click", () => {
      if (this.showAllActiveDictionaryLanguages) return;
      this.showAllActiveDictionaryLanguages = true;
      updateScopeButtons();
      this.renderBrowser();
    });

    updateScopeButtons();

    // Stats line
    this.browserStatsEl = this.browserEl.createDiv({
      cls: "conlang-browser-stats",
    });

    // List + empty state. The text gets swapped depending on whether the
    // dictionary is genuinely empty or just hidden by filters.
    this.browserListEl = this.browserEl.createDiv({
      cls: "conlang-browser-list",
    });
    this.browserEmptyEl = this.browserEl.createDiv({
      cls: "conlang-browser-empty conlang-hidden",
    });

    /*
     * Details have their own host rather than replacing browserEl itself.
     * Search controls and their event listeners therefore remain mounted while
     * details are open, preserving the creator's filter state and avoiding a
     * second competing Dictionary interface.
     */
    this.browserDetailsEl = this.browserEl.createDiv({
      cls: "conlang-browser-details conlang-hidden",
    });
  }

  /**
   * Build the host container for the modular Morpheme Inventory tab.
   *
   * The parent panel owns tab placement and visibility. MorphemeTab owns the
   * feature-specific UI rendered inside this container.
   */
  private buildMorphemeTab() {
    this.morphemeEl = this.tabContentEl.createDiv({
      cls: "conlang-morpheme-tab conlang-hidden",
    });

    this.morphemeTab = new MorphemeTab(this.plugin);
    this.morphemeTab.mount(this.morphemeEl);
  }

  /**
   * Build the container for the standalone linguistic example browser.
   *
   * The panel only provides the host element and plugin runtime owner. The
   * feature tab resolves the currently committed example inventory when it
   * renders, so an atomic runtime swap cannot leave the tab on stale data.
   */
  private buildExampleTab() {
    this.exampleEl = this.tabContentEl.createDiv({
      cls: "conlang-example-tab conlang-hidden",
    });

    this.exampleTab = new LinguisticExampleTab(this.plugin);

    this.exampleTab.render(this.exampleEl);
  }

  /**
   * Build the host container for the modular Phonology Inventory tab.
   *
   * The panel owns placement and visibility. PhonologyTab owns the feature UI,
   * while PhonologyInventory remains responsible for loading and indexing the
   * underlying phonological-unit data.
   */
  private buildPhonologyTab() {
    this.phonologyEl = this.tabContentEl.createDiv({
      cls: "conlang-phonology-tab conlang-hidden",
    });

    this.phonologyTab = new PhonologyTab(this.plugin);
    this.phonologyTab.mount(this.phonologyEl);
  }

  /**
   * Build the host container for the top-level Diagnostics workspace.
   *
   * Diagnostics is deliberately not another linguistic feature tab. The panel
   * owns placement and Language/Diagnostics mode switching; DiagnosticsTab owns
   * the read-only diagnostic presentation inside this container.
   */
  private buildDiagnosticsWorkspace() {
    this.diagnosticsEl = this.tabContentEl.createDiv({
      cls: "conlang-diagnostics conlang-hidden",
    });

    this.diagnosticsTab = new DiagnosticsTab(this.plugin);
    this.diagnosticsTab.mount(this.diagnosticsEl);
  }

  /**
   * Return the entries eligible for the Dictionary's current language scope.
   *
   * This is a presentation boundary only. It neither changes the loaded
   * Dictionary inventory nor rewrites any source note. Primary mode is strict:
   * entries must explicitly belong to the current primary language. All active
   * mode returns the complete inventory loaded for the active languages.
   */
  private dictionaryEntriesInLanguageScope(): DictionaryEntry[] {
    const entries = this.plugin.dictionary.allEntries();

    if (this.showAllActiveDictionaryLanguages) {
      return entries;
    }

    const primaryLanguage = this.plugin.getPrimaryLanguage()?.name;
    if (!primaryLanguage) {
      return [];
    }

    return entries.filter((entry) => entry.language === primaryLanguage);
  }

  private renderBrowser() {
    const scopedEntries = this.dictionaryEntriesInLanguageScope();

    // Re-populate the POS dropdown from entries eligible for the current
    // language scope. This prevents Primary mode from offering parts of speech
    // that exist only in another active language.
    const posSelect = this.browserToolbarEl.parentElement?.querySelector(
      ".conlang-pos-select",
    ) as HTMLSelectElement | null;
    if (posSelect) {
      const previous = this.posFilter;
      posSelect.empty();
      posSelect.createEl("option", { text: "All", value: "" });
      const posSet = new Set<string>();
      for (const entry of scopedEntries) {
        if (entry.partOfSpeech) posSet.add(entry.partOfSpeech);
      }
      const sortedPos = Array.from(posSet).sort();
      for (const pos of sortedPos) {
        const opt = posSelect.createEl("option", { text: pos, value: pos });
        if (pos === previous) opt.selected = true;
      }
      // If the previously selected POS no longer exists, fall back to "All"
      if (previous && !posSet.has(previous)) {
        this.posFilter = "";
      }
    }

    /*
     * Resolve the selected path against the current inventory generation.
     * A reload may replace or remove the entry, so the saved path is only a
     * request to rediscover it—not authority to retain a stale object.
     */
    if (this.selectedDictionaryEntryPath) {
      const selected = scopedEntries.find(
        (entry) => entry.path === this.selectedDictionaryEntryPath,
      );

      if (selected) {
        this.renderBrowserDetails(selected);
        return;
      }

      this.selectedDictionaryEntryPath = null;
    }

    this.showBrowserList();
    this.renderBrowserList();
  }

  /**
   * Show the ordinary searchable Dictionary inventory.
   *
   * The controls remain mounted while details are open, so returning to the
   * list preserves the creator's current search, filters, and sort order.
   */
  private showBrowserList(): void {
    this.browserToolbarEl.removeClass("conlang-hidden");
    this.browserControlsEl.removeClass("conlang-hidden");
    this.browserStatsEl.removeClass("conlang-hidden");
    this.browserDetailsEl.addClass("conlang-hidden");
  }

  /**
   * Replace the Dictionary list with one entry's read-only details.
   *
   * Back changes only panel state. Open note navigates to an already-known
   * source. Neither action edits, repairs, or rewrites creator-authored data.
   */
  private renderBrowserDetails(entry: DictionaryEntry): void {
    this.browserToolbarEl.addClass("conlang-hidden");
    this.browserControlsEl.addClass("conlang-hidden");
    this.browserStatsEl.addClass("conlang-hidden");
    this.browserListEl.addClass("conlang-hidden");
    this.browserEmptyEl.addClass("conlang-hidden");

    this.browserDetailsEl.removeClass("conlang-hidden");
    this.browserDetailsEl.empty();

    const actions = this.browserDetailsEl.createDiv({
      cls: "conlang-panel-actions conlang-browser-details-actions",
    });

    const backButton = actions.createEl("button", {
      cls: "conlang-panel-btn",
      text: "← Back to dictionary",
    });
    backButton.title = "Return to the current Dictionary search and filters.";
    backButton.addEventListener("click", () => {
      this.selectedDictionaryEntryPath = null;
      this.renderBrowser();
    });

    const openButton = actions.createEl("button", {
      cls: "conlang-panel-btn conlang-panel-btn-primary",
      text: "Open note",
    });
    openButton.title = "Open this entry's existing Markdown source note.";
    openButton.addEventListener("click", () => {
      this.openDictionaryEntrySource(entry);
    });

    /*
     * The shared renderer empties the container it owns. Give it a child host
     * so it cannot erase the Dictionary navigation controls above.
     */
    const content = this.browserDetailsEl.createDiv({
      cls: "conlang-browser-details-content",
    });
    this.renderEntryDetailsInto(content, entry, null, false);
  }

  /** True if the entry's partOfSpeech indicates it's a proper noun. */
  private isProperNoun(entry: DictionaryEntry): boolean {
    const p = entry.partOfSpeech?.toLowerCase() ?? "";
    return p === "proper-noun" || p === "proper noun" || p === "propernoun";
  }

  private renderBrowserList() {
    this.browserListEl.empty();

    /*
     * Language scope is applied before every other browser filter. The same
     * scoped entry set supplies both the result denominator and the available
     * Type choices, so the controls and statistics describe the same inventory.
     */
    const all = this.dictionaryEntriesInLanguageScope();

    // Filter
    const q = this.searchQuery.trim().toLowerCase();
    const languageScopeSignature = this.showAllActiveDictionaryLanguages
      ? "all-active"
      : `primary:${this.plugin.getPrimaryLanguage()?.name ?? ""}`;

    // Reset the row cap whenever the effective filter/sort changes, so a new
    // search starts from the first page again.
    const sig = [
      q,
      this.posFilter,
      this.nameFilter,
      languageScopeSignature,
      this.sortKey,
    ].join("\u0000");
    if (sig !== this.browserFilterSig) {
      this.browserFilterSig = sig;
      this.browserLimit = TranslationPanelView.BROWSER_PAGE;
    }
    let filtered = all.filter((entry) => {
      // Names filter (proper-noun gating)
      const isName = this.isProperNoun(entry);
      if (this.nameFilter === "names-only" && !isName) return false;
      if (this.nameFilter === "hide-names" && isName) return false;

      // Language eligibility was already established by
      // dictionaryEntriesInLanguageScope() before these content filters run.

      if (this.posFilter && entry.partOfSpeech !== this.posFilter) return false;
      if (!q) return true;
      if (entry.word.toLowerCase().includes(q)) return true;
      if (entry.definition.toLowerCase().includes(q)) return true;

      // Structured senses participate in dictionary browsing search. This lets
      // a richer sense be discoverable through its gloss, full definition, or
      // explicit lookup terms without changing the simple entry definition.
      if (
        entry.senses?.some((sense) => {
          if (sense.gloss?.toLowerCase().includes(q)) return true;
          if (sense.definition?.toLowerCase().includes(q)) return true;
          if (
            sense.lookupTerms?.some((term) => term.toLowerCase().includes(q))
          ) {
            return true;
          }
          return false;
        })
      ) {
        return true;
      }

      // For names, also search by category (e.g. "place" finds all places)
      if (entry.nameCategory && entry.nameCategory.toLowerCase().includes(q))
        return true;
      return false;
    });

    // Sort
    filtered = filtered.slice().sort((a, b) => {
      if (this.sortKey === "recent") {
        return (b.mtime ?? 0) - (a.mtime ?? 0);
      }
      if (this.sortKey === "partOfSpeech") {
        const pa = a.partOfSpeech ?? "~"; // ~ sorts after letters, so "no POS" ends up last
        const pb = b.partOfSpeech ?? "~";
        const c = pa.localeCompare(pb);
        if (c !== 0) return c;
      }
      return a.word.localeCompare(b.word);
    });

    // Stats
    this.renderStats(all, filtered);

    if (filtered.length === 0) {
      this.browserListEl.addClass("conlang-hidden");
      this.browserEmptyEl.removeClass("conlang-hidden");
      this.browserEmptyEl.empty();
      if (all.length > 0) {
        // Entries exist but filters hide them all
        this.browserEmptyEl.createDiv({
          text: "No entries match your filters.",
          cls: "conlang-empty-headline",
        });
        const hint = this.browserEmptyEl.createDiv({
          cls: "conlang-empty-hint",
        });
        hint.setText(
          "Try clearing the search box, changing the type filter, or showing all names.",
        );
      } else {
        // Genuinely empty dictionary — first-time onboarding hint
        const primary = this.plugin.getPrimaryLanguage();
        this.browserEmptyEl.createDiv({
          text: "Your dictionary is empty.",
          cls: "conlang-empty-headline",
        });
        const hint = this.browserEmptyEl.createDiv({
          cls: "conlang-empty-hint",
        });
        hint.setText(
          primary
            ? `Add your first word by clicking + Word at the top, or highlight any English text in a note and use the "Create dictionary entry from selection" command. Words are saved as markdown files in ${primary.dictionaryFolder}.`
            : "Activate at least one language in Settings → Conlang to start adding entries.",
        );
      }
      return;
    }
    this.browserListEl.removeClass("conlang-hidden");
    this.browserEmptyEl.addClass("conlang-hidden");

    // Render up to the current cap; a "Show more" button extends it. This
    // keeps the DOM small for multi-thousand-entry dictionaries.
    const visible =
      filtered.length > this.browserLimit
        ? filtered.slice(0, this.browserLimit)
        : filtered;
    for (const entry of visible) {
      this.renderBrowserRow(entry);
    }
    if (filtered.length > visible.length) {
      const moreBtn = this.browserListEl.createEl("button", {
        cls: "conlang-panel-btn conlang-browser-show-more",
        text: `Show more (${visible.length} of ${filtered.length} shown)`,
      });
      moreBtn.addEventListener("click", () => {
        this.browserLimit += TranslationPanelView.BROWSER_PAGE * 2;
        this.renderBrowserList();
      });
    }
  }

  private renderStats(all: DictionaryEntry[], filtered: DictionaryEntry[]) {
    this.browserStatsEl.empty();

    const total = all.length;
    const shown = filtered.length;

    const summary = this.browserStatsEl.createSpan({
      cls: "conlang-browser-stats-summary",
    });
    if (shown === total) {
      summary.setText(`${total} ${total === 1 ? "entry" : "entries"}`);
    } else {
      summary.setText(`${shown} of ${total} shown`);
    }

    // Per-POS breakdown of the current language scope, not the filtered view
    const counts = new Map<string, number>();
    for (const entry of all) {
      const key = entry.partOfSpeech ?? "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size > 0 && counts.size <= 8) {
      const breakdown = this.browserStatsEl.createSpan({
        cls: "conlang-browser-stats-breakdown",
      });
      const parts: string[] = [];
      const sortedKeys = Array.from(counts.keys()).sort();
      for (const k of sortedKeys) {
        parts.push(`${counts.get(k)} ${k}`);
      }
      breakdown.setText(`(${parts.join(", ")})`);
    }
  }

  private renderBrowserRow(entry: DictionaryEntry) {
    const row = this.browserListEl.createDiv({ cls: "conlang-browser-row" });
    if (this.isProperNoun(entry)) row.addClass("is-name");
    if (entry.isPhrase) row.addClass("is-phrase");

    const word = row.createDiv({ cls: "conlang-browser-row-word" });
    word.setText(entry.word);
    if (entry.isPhrase) {
      // Small "phrase" badge so multi-word entries are visually distinct
      const phraseBadge = word.createSpan({ cls: "conlang-browser-row-badge" });
      phraseBadge.setText("Phrase");
    }
    // Language labels are needed only in the deliberate All active comparison
    // view. Primary mode already establishes one visible language.
    const activeCount = this.plugin.getActiveLanguages().length;
    if (
      activeCount > 1 &&
      this.showAllActiveDictionaryLanguages &&
      entry.language
    ) {
      const langBadge = word.createSpan({ cls: "conlang-browser-row-lang" });
      langBadge.setText(entry.language);
    }
    if (entry.partOfSpeech) {
      const tag = word.createSpan({ cls: "conlang-browser-row-pos" });
      // For proper nouns, show the more specific category if available
      if (this.isProperNoun(entry) && entry.nameCategory) {
        tag.setText(entry.nameCategory);
      } else {
        tag.setText(entry.partOfSpeech);
      }
    }

    const def = row.createDiv({ cls: "conlang-browser-row-def" });
    def.setText(entry.definition);

    // Structured senses enrich the simple entry rather than replacing its
    // definition. Show only reader-facing semantic information here; IDs and
    // lookup terms remain internal/reference metadata.
    if (entry.senses && entry.senses.length > 0) {
      const sensesEl = row.createDiv({ cls: "conlang-browser-row-senses" });

      for (const sense of entry.senses) {
        const senseEl = sensesEl.createDiv({
          cls: "conlang-browser-row-sense",
        });

        if (sense.gloss) {
          const gloss = senseEl.createDiv({
            cls: "conlang-browser-row-sense-gloss",
          });
          gloss.setText(sense.gloss);
        }

        if (sense.definition) {
          const senseDef = senseEl.createDiv({
            cls: "conlang-browser-row-sense-def",
          });
          senseDef.setText(sense.definition);
        }
      }
    }

    if (entry.ipa) {
      const ipa = row.createDiv({ cls: "conlang-browser-row-ipa" });
      ipa.setText(entry.ipa);
    }

    row.title = "View dictionary entry details";
    row.addEventListener("click", () => {
      /*
       * Retain only the stable source path. renderBrowser() resolves the entry
       * again from the current Dictionary inventory before displaying it.
       */
      this.selectedDictionaryEntryPath = entry.path;
      this.renderBrowser();
    });
  }
}
