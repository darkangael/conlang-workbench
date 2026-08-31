// Conlang plugin main entry.

import {
  Editor,
  EditorPosition,
  MarkdownFileInfo,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  WorkspaceLeaf,
  debounce,
} from "obsidian";
import {
  ConlangSettings,
  DEFAULT_SETTINGS,
  LanguageConfig,
  LanguageProfile,
  DictionaryEntry,
} from "./types";
import { applyCypher, applyCypherReverse } from "./cypher";
import { Dictionary, FormMatch } from "./dictionary";
import {
  inspectDictionaryEntry,
  writeDictionaryEntry,
  type DictionaryEntryWriteResult,
} from "./dictionary-entry-writer";
import { MorphemeInventory } from "./morphemes";
import { LinguisticExampleInventory } from "./linguistic-examples";
import { PhonologyInventory } from "./phonology";
import { loadLanguageProfile } from "./language-profile";
import { isPathWithinFolder, validateVaultRelativePath } from "./vault-paths";
import { findInflection, InflectionMatch } from "./inflection";
import { matchPhraseAtStart, PhraseIndex, EMPTY_PHRASE_INDEX } from "./phrases";
import { WORD_RE, cleanWord } from "./word-tokens";
import { findWordRangeAt } from "./word-scan";
import { classifySelectionLookup } from "./selection-lookup";
import { classifyLookupQuery } from "./lookup-query";
import { confirmPhraseTranslation } from "./phrase-confirm-modal";
import { confirmTranslationCommit } from "./translation-commit-modal";
import { promptTranslationUnresolved } from "./translation-unresolved-modal";
import {
  glossConlangToEnglish,
  glossEnglishToConlang,
  renderConlangToEnglishString,
  translateEnglishToConlangString,
} from "./gloss";
import { buildEnglishToConlangCommitPlan } from "./translation-commit-plan";
import { repairMissingTranslationVocabulary } from "./translation-vocabulary-repair";
import { ConlangSettingTab } from "./settings";
import { TranslationPanelView, VIEW_TYPE_PANEL } from "./panel";
import {
  EntryCreationModal,
  EntryCreationOptions,
  MultiEntryModal,
  MultiEntryResult,
  MultiEntryLanguageInit,
} from "./entry-modal";
import { NameCreationModal, NameCreationResult } from "./name-modal";
import { LookupModal, LookupMatch } from "./lookup-modal";
import { WordCreationModal, WordCreationResult } from "./word-modal";
import {
  makeHighlightExtension,
  highlightElement,
  refreshHighlightEffect,
  registerEntryLinkHandler,
} from "./highlight";
import type { HighlightKind } from "./highlight-core";
import { normalizeClosedChoiceSettings } from "./settings-validation";
import { preflightLanguageSources } from "./language-source-preflight";
import { showLanguageSourceDiagnostics } from "./language-source-diagnostics-modal";
import {
  applyActiveLanguageState,
  type ActiveLanguageStateResult,
} from "./active-language-state";
import {
  applyLanguageSourceState,
  type CanonicalFolderSetting,
  type LanguageSourceStateResult,
} from "./language-source-state";
import {
  inferLegacyLanguageRoot,
  validateLanguageSourceChange,
} from "./language-root-authority";
import { planLanguageRootRepair } from "./language-root-repair";
import {
  applyLanguageRootRepairState,
  type LanguageRootRepairStateResult,
} from "./language-root-repair-state";
import { planLanguageRename } from "./language-rename";
import {
  applyLanguageRenameState,
  type LanguageRenameStateResult,
} from "./language-rename-state";
import { ensureVaultFolderStrict } from "./vault-folder-writer";
import { EditorView } from "@codemirror/view";

export default class ConlangPlugin extends Plugin {
  settings: ConlangSettings = DEFAULT_SETTINGS;
  dictionary: Dictionary = new Dictionary(this.app);

  // Morphological documentation is indexed separately from lexical entries.
  // Morphemes do not automatically participate in dictionary lookup,
  // translation, highlighting, or inflection.
  morphemes: MorphemeInventory = new MorphemeInventory(this.app);

  // Standalone linguistic examples are loaded into their own feature-specific
  // inventory. Keeping this state here lets future UI components share the same
  // loaded examples without taking ownership of the parsing/loading logic.
  linguisticExamples: LinguisticExampleInventory =
    new LinguisticExampleInventory(this.app);

  // Canonical phonological units are loaded separately from dictionary and
  // morphology data. Later phonology, phonotactics, and diagnostic features
  // can share this inventory without taking ownership of its loading logic.
  phonology: PhonologyInventory = new PhonologyInventory(this.app);

  // Parsed canonical Language Profiles for currently active languages.
  // Keyed by LanguageConfig.name for compatibility with the inherited
  // settings model. The profile itself carries its stable language id.
  readonly languageProfiles: Map<string, LanguageProfile> = new Map();

  // Memoized word-classification results for the highlighter (see
  // highlight-core.ts). Cleared whenever the dictionary reloads or settings
  // change, since either can alter what a word resolves to.
  readonly classifyCache: Map<string, HighlightKind | null> = new Map();

  private tooltipEl: HTMLDivElement | null = null;
  private tooltipHideTimer: number | null = null;
  private lastHoverWord: string | null = null;
  // Hover throttling: mousemove fires very frequently, and resolving the word
  // under the cursor calls caretRangeFromPoint (a layout query). We cap this
  // to one resolve per HOVER_THROTTLE_MS, with a trailing call so the cursor's
  // final resting position is always resolved.
  private static readonly HOVER_THROTTLE_MS = 50;
  private hoverLastRun = 0;
  private hoverPendingTimer: number | null = null;
  private lastMouseEvent: MouseEvent | null = null;
  // Cached "does any active language want hover tooltips" — recomputed on
  // settings change so the mousemove fast-path is a single boolean check.
  private hoverActive = false;

  async onload() {
    await this.loadSettings();
    this.dictionary = new Dictionary(this.app);
    this.morphemes = new MorphemeInventory(this.app);
    this.phonology = new PhonologyInventory(this.app);

    this.app.workspace.onLayoutReady(async () => {
      await this.reloadActiveLanguage();
      this.updateHoverActive();
      this.refreshPanel();
      this.refreshHighlights();
      this.maybeShowWelcome();
    });

    // Known-word highlighting: a CM6 editor extension for Live Preview /
    // Source mode, plus a post-processor for Reading view. Both read the
    // live dictionary, so they stay in sync as entries change.
    this.registerEditorExtension(makeHighlightExtension(this));
    this.registerMarkdownPostProcessor((el) => highlightElement(this, el));
    // One delegated click handler opens an entry note when its highlighted word
    // is clicked, in both Reading view and Live Preview.
    registerEntryLinkHandler(this);
    this.applyHighlightStyleClass();

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.maybeReloadForPath(file.path);
      }),
    );
    // Also react to dictionary files being deleted or renamed so removed words
    // stop (and renamed words start) highlighting without a manual reload.
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.maybeReloadForPath(file.path)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.maybeReloadForPath(file.path);
        this.maybeReloadForPath(oldPath);
      }),
    );

    this.addSettingTab(new ConlangSettingTab(this.app, this));

    // Register the side-panel view
    this.registerView(
      VIEW_TYPE_PANEL,
      (leaf: WorkspaceLeaf) => new TranslationPanelView(leaf, this),
    );

    // Ribbon icon to open the panel.
    // "book-open" is a Lucide icon bundled with Obsidian. Other safe choices:
    // "book", "globe", "message-square", "type". The "languages" icon exists
    // in newer Lucide but isn't always bundled, so we avoid it.
    const ribbon = this.addRibbonIcon(
      "book-open",
      "Open Made Up Words panel",
      () => {
        void this.openPanel();
      },
    );
    ribbon.addClass("conlang-ribbon-icon");

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: () => this.openPanel(),
    });

    this.addCommand({
      id: "translate-selection-preview",
      name: "Translate selection to primary language (preview)",
      editorCallback: (editor: Editor) => this.previewToConlang(editor),
    });

    this.addCommand({
      id: "translate-selection-commit",
      name: "Translate selection to primary language and replace",
      editorCallback: (editor: Editor, ctx) =>
        this.commitSelectionToConlang(editor, ctx),
    });

    this.addCommand({
      id: "translate-selection-to-english-preview",
      name: "Translate selection to English (preview)",
      editorCallback: (editor: Editor) => this.previewToEnglish(editor),
    });

    this.addCommand({
      id: "reload-dictionary",
      name: "Reload dictionary",
      callback: async () => {
        const result = await this.reloadActiveLanguage();
        if (result.status === "blocked") return;

        this.refreshPanel();
        this.refreshHighlights();
        new Notice(
          `Made Up Words: loaded ${result.dictionaryCount} dictionary entries`,
        );
      },
    });

    this.addCommand({
      id: "create-entry-from-selection",
      name: "Add selection to dictionary",
      editorCallback: (editor: Editor) => this.createEntryFromSelection(editor),
    });

    this.addCommand({
      id: "create-name",
      name: "Add a name (proper noun)",
      callback: () => this.createName(),
    });

    this.addCommand({
      id: "create-word",
      name: "Add a word",
      callback: () => this.createWordFromPanel(),
    });

    this.addCommand({
      id: "lookup-word",
      name: "Look up word (all senses)",
      editorCallback: (editor: Editor) => this.lookupWord(editor),
    });

    this.addCommand({
      id: "toggle-highlighting",
      name: "Toggle known-word highlighting",
      callback: async () => {
        this.settings.highlightKnownWords = !this.settings.highlightKnownWords;
        await this.saveSettings();
        new Notice(
          `Made Up Words: highlighting ${
            this.settings.highlightKnownWords ? "on" : "off"
          }`,
        );
      },
    });

    // Right-click (editor context menu) entry point for adding the selected
    // word/selection to a dictionary — more discoverable than the palette.
    // Opens the language chooser (which auto-skips when only one language).
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const sel = this.getSelectionOrWord(editor);
        if (!sel) return;
        menu.addItem((item) =>
          item
            .setTitle("Add to Made Up Words dictionary…")
            .setIcon("plus")
            .onClick(() => this.createEntryFromSelection(editor)),
        );
      }),
    );

    // Hover tooltip handler (throttled — see onMouseMove)
    this.registerDomEvent(activeDocument, "mousemove", (evt) => {
      this.onMouseMove(evt);
    });
  }

  onunload() {
    this.scheduleDictionaryReload.cancel();
    this.hideTooltip();
    if (this.hoverPendingTimer !== null) {
      window.clearTimeout(this.hoverPendingTimer);
      this.hoverPendingTimer = null;
    }
    if (this.tooltipEl && this.tooltipEl.parentElement) {
      this.tooltipEl.parentElement.removeChild(this.tooltipEl);
    }
    activeDocument.body.removeClass(
      "conlang-hl-underline",
      "conlang-hl-italic",
      "conlang-hl-background",
    );
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<ConlangSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

    // Persisted settings are runtime data, so TypeScript's compile-time unions
    // cannot guarantee that closed-choice values are actually valid here.
    // Normalize them before any DOM rendering or mutation behavior can use
    // those values.
    normalizeClosedChoiceSettings(this.settings);

    this.migrateSettings();
  }

  /**
   * Migrate older single-active-language settings to the multi-active format.
   * Runs every load; safe to re-run because it only acts when activeLanguages
   * is empty or doesn't contain a valid name.
   */
  private migrateSettings() {
    /*
     * Configurations created before structural language-root authority was
     * introduced may not yet have rootFolder.
     *
     * Recover it only when the already-configured canonical source paths
     * clearly identify one immediate child beneath Languages/. The inference
     * deliberately ignores the renameable language display name.
     *
     * Examples:
     *
     *   Languages/Mer/Lexicon
     *     -> Languages/Mer
     *
     *   Made Up Words/Example
     *     -> unresolved
     *
     * An unresolved configuration is left untouched. Workbench must require an
     * explicit repair rather than guessing which vault subtree the creator
     * intended to authorize.
     */
    for (const language of this.settings.languages) {
      if (!language.rootFolder) {
        const inferred = inferLegacyLanguageRoot(language);

        if (inferred.status === "inferred") {
          language.rootFolder = inferred.root;
        }
      }
    }

    const known = new Set(this.settings.languages.map((l) => l.name));

    // If we have legacy activeLanguage but no activeLanguages, migrate.
    if (
      (!this.settings.activeLanguages ||
        this.settings.activeLanguages.length === 0) &&
      this.settings.activeLanguage
    ) {
      this.settings.activeLanguages = [this.settings.activeLanguage];
    }
    // Ensure activeLanguages exists and only contains known names
    if (!this.settings.activeLanguages) this.settings.activeLanguages = [];
    this.settings.activeLanguages = this.settings.activeLanguages.filter((n) =>
      known.has(n),
    );
    // If still empty, pick the first known language (if any)
    if (
      this.settings.activeLanguages.length === 0 &&
      this.settings.languages.length > 0
    ) {
      this.settings.activeLanguages = [this.settings.languages[0].name];
    }

    // Ensure primaryLanguage is one of the active languages
    if (
      !this.settings.primaryLanguage ||
      !known.has(this.settings.primaryLanguage)
    ) {
      this.settings.primaryLanguage =
        this.settings.activeLanguages[0] ??
        this.settings.languages[0]?.name ??
        "";
    }
    if (
      this.settings.activeLanguages.length > 0 &&
      !this.settings.activeLanguages.includes(this.settings.primaryLanguage)
    ) {
      this.settings.primaryLanguage = this.settings.activeLanguages[0];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateHoverActive();
    this.refreshPanel();
    this.refreshHighlights();
  }

  /**
   * Establish a requested active/primary-language configuration as one
   * authority transaction.
   *
   * Settings and the side panel are separate UI surfaces, but they must not
   * independently decide when an active-language change has succeeded. The
   * shared transaction persists the requested configuration, asks the normal
   * runtime loader to establish it, and safely restores the prior configuration
   * when source preflight rejects the request before runtime state is touched.
   *
   * This wrapper intentionally contains no rollback logic of its own. Keeping
   * that logic in active-language-state.ts gives every UI caller the same
   * behavior and keeps the security-sensitive transaction independently
   * testable without importing Obsidian.
   */
  async setActiveLanguageState(
    activeLanguages: string[],
    primaryLanguage: string,
  ): Promise<ActiveLanguageStateResult> {
    return applyActiveLanguageState({
      state: this.settings,
      activeLanguages,
      primaryLanguage,
      save: () => this.saveSettings(),
      reload: () => this.reloadActiveLanguage(),
    });
  }

  /**
   * Establish a requested canonical source-folder change as one authority
   * transaction.
   *
   * Settings owns only the UI decision about which source path the creator is
   * requesting. The shared transaction owns persistence, active-runtime
   * establishment, and the limited rollback that is safe when H3 source
   * preflight blocks before any runtime data is replaced.
   *
   * Keeping this wrapper beside setActiveLanguageState() gives UI callers one
   * plugin-level entry point while leaving the security-sensitive transaction
   * independently testable without importing Obsidian.
   */
  async setLanguageSourceState(
    language: LanguageConfig,
    setting: CanonicalFolderSetting,
    value: string | undefined,
  ): Promise<LanguageSourceStateResult> {
    return applyLanguageSourceState({
      language,
      activeLanguages: this.settings.activeLanguages,
      setting,
      value,
      validate: () =>
        validateLanguageSourceChange({
          language,
          languages: this.settings.languages,
          setting,
          value,
          pathState: (path) => {
            const existing = this.app.vault.getAbstractFileByPath(path);

            if (!existing) return "missing";
            return existing instanceof TFolder ? "folder" : "other";
          },
        }),
      save: () => this.saveSettings(),
      reload: () => this.reloadActiveLanguage(),
    });
  }

  /**
   * Repair one language's configured structural root and canonical source
   * folders through the shared H7 authority transaction.
   *
   * The pure planner is recalculated inside the transaction immediately before
   * mutation so a UI cannot authorize repair from stale vault information.
   * Planning also proves that this exact LanguageConfig already owns the root;
   * adopting an existing unconfigured root belongs to the separate future
   * Import Language authority path.
   *
   * Folder establishment is strictly additive. Only standard folders listed by
   * the fresh plan as missing may be created, and the shared folder writer
   * refuses to replace non-folder creator data. Transactional persistence,
   * active-language reload, and the limited safe rollback boundary remain in
   * language-root-repair-state.ts rather than being duplicated here.
   */
  async repairLanguageRoot(
    language: LanguageConfig,
    rootFolder: string,
  ): Promise<LanguageRootRepairStateResult> {
    const pathState = (path: string) => {
      const existing = this.app.vault.getAbstractFileByPath(path);

      if (!existing) return "missing" as const;
      return existing instanceof TFolder
        ? ("folder" as const)
        : ("other" as const);
    };

    return applyLanguageRootRepairState({
      language,
      activeLanguages: this.settings.activeLanguages,

      // plan() is intentionally called by the transaction itself immediately
      // before any folder or configuration mutation.
      plan: () =>
        planLanguageRootRepair({
          language,
          languages: this.settings.languages,
          rootFolder,
          pathState,
        }),

      createMissingFolders: async (plan) => {
        /*
         * Do not create the root itself or infer additional paths here.
         * The planner requires the selected root to exist already and returns
         * the complete, preflighted set of missing direct standard children.
         *
         * ensureVaultFolderStrict() re-checks each path during mutation, so a
         * concurrent folder creation is safely reused while a newly appearing
         * non-folder collision still fails closed.
         */
        for (const folder of plan.foldersToCreate) {
          await ensureVaultFolderStrict(this.app, folder);
        }
      },

      save: () => this.saveSettings(),
      reload: () => this.reloadActiveLanguage(),
    });
  }

  /**
   * Rename one configured language and its already-owned structural root as one
   * authority transaction.
   *
   * This is deliberately stronger than merely changing LanguageConfig.name.
   * An explicit creator-approved rename keeps the human-readable language name
   * and its established Languages/<root> ownership boundary synchronized by
   * renaming that exact root in place.
   *
   * The pure planner runs inside the transaction immediately before mutation.
   * It proves that the current root is this language's existing authority,
   * verifies that the requested destination is safe and unoccupied, and
   * prefix-rewrites configured descendant paths without resetting custom
   * creator organization.
   *
   * The filesystem callback performs another narrow check immediately before
   * each forward or compensating rename. That closes the gap between read-only
   * planning and mutation if vault state changes asynchronously.
   *
   * Creator-authored Markdown/YAML is not parsed or rewritten here. Obsidian's
   * FileManager performs the physical folder rename and may update links
   * according to the creator's normal Obsidian link-update preference.
   */
  async renameLanguage(
    language: LanguageConfig,
    proposedName: string,
  ): Promise<LanguageRenameStateResult> {
    const pathState = (path: string) => {
      const existing = this.app.vault.getAbstractFileByPath(path);

      if (!existing) return "missing" as const;
      return existing instanceof TFolder
        ? ("folder" as const)
        : ("other" as const);
    };

    return applyLanguageRenameState({
      language,

      /*
       * LanguageConfig.name is still the inherited alpha identity used by
       * activeLanguages and primaryLanguage. The shared transaction migrates
       * these settings together rather than allowing the settings UI to update
       * them independently.
       */
      settings: this.settings,

      // Recalculate complete rename authority immediately before any mutation.
      plan: () =>
        planLanguageRename({
          language,
          languages: this.settings.languages,
          proposedName,
          pathState,
        }),

      renameRoot: async (from, to) => {
        /*
         * The planner has already authorized these exact paths, but vault state
         * can change between planning and mutation. Resolve both paths again at
         * the last responsible moment instead of trusting stale TFolder
         * references.
         */
        const source = this.app.vault.getAbstractFileByPath(from);

        if (!(source instanceof TFolder)) {
          throw new Error(
            `Cannot rename language root "${from}": it is no longer a folder.`,
          );
        }

        const destination = this.app.vault.getAbstractFileByPath(to);

        if (destination !== null) {
          throw new Error(
            `Cannot rename language root to "${to}": the destination is now occupied.`,
          );
        }

        /*
         * FileManager.renameFile() is preferred over Vault.rename() because it
         * performs Obsidian's normal safe rename/move behavior, including link
         * updates when the creator has enabled that Obsidian preference.
         */
        await this.app.fileManager.renameFile(source, to);
      },

      save: () => this.saveSettings(),
      reload: () => this.reloadActiveLanguage(),
    });
  }

  /**
   * Show a one-time welcome notice if this is the user's first time loading
   * the plugin. The notice points them at the ribbon icon and the panel —
   * Autumn flagged that the side panel was hard to discover.
   *
   * The flag persists in settings so the message only shows once per install.
   */
  private maybeShowWelcome() {
    if (this.settings.hasSeenWelcome) return;
    // Mark as seen immediately so we don't double-show even if something
    // below throws.
    this.settings.hasSeenWelcome = true;
    void this.saveData(this.settings);

    // Use a longer-than-default duration since we have meaningful content.
    // 12 seconds is enough to read without being intrusive.
    const message =
      "Made Up Words is loaded. Open the side panel via the book-open icon in the left ribbon, " +
      "or via the command palette → 'Made Up Words: Open panel'.";
    new Notice(message, 12000);
  }

  /**
   * Return the primary language config (the one used for new entries and
   * for English→conlang translation). Equivalent to the old getActiveLanguage
   * for callers that only deal with one language.
   */
  getPrimaryLanguage(): LanguageConfig | null {
    const name = this.settings.primaryLanguage;
    return this.settings.languages.find((l) => l.name === name) ?? null;
  }

  /**
   * Return ALL currently active languages. Hover and lookup query all of these.
   */
  getActiveLanguages(): LanguageConfig[] {
    const names = new Set(this.settings.activeLanguages);
    return this.settings.languages.filter((l) => names.has(l.name));
  }

  /**
   * Backwards compat: many existing callers use getActiveLanguage(). Keep it
   * working by returning the primary language. New code should use
   * getPrimaryLanguage() or getActiveLanguages() depending on intent.
   */
  getActiveLanguage(): LanguageConfig | null {
    return this.getPrimaryLanguage();
  }

  /**
   * Return the loaded canonical profile for a configured language.
   *
   * Callers should use this accessor instead of reading `languageProfiles`
   * directly. Profiles are currently stored by LanguageConfig.name because
   * the inherited settings model still identifies languages by display name.
   * Keeping that implementation detail here gives us one place to change when
   * runtime language identity moves to the stable `language_id`.
   */
  getLanguageProfile(lang: LanguageConfig): LanguageProfile | null {
    return this.languageProfiles.get(lang.name) ?? null;
  }

  /**
   * Return the loaded canonical profile for the primary language.
   *
   * A language may legitimately have no profile while older configurations
   * remain supported, so callers must handle a null result.
   */
  getPrimaryLanguageProfile(): LanguageProfile | null {
    const lang = this.getPrimaryLanguage();
    return lang ? this.getLanguageProfile(lang) : null;
  }

  async reloadActiveLanguage(): Promise<
    { status: "loaded"; dictionaryCount: number } | { status: "blocked" }
  > {
    /*
     * Establish source authority before touching ANY currently loaded state.
     *
     * A malformed path, missing configured folder, non-folder collision, or
     * cross-language overlap must not result in a half-cleared/half-rebuilt
     * runtime. The existing indexes remain authoritative until a complete
     * replacement load has passed this gate.
     */
    const issues = preflightLanguageSources(
      this.settings.languages,
      this.settings.activeLanguages,
      (path) => {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (!existing) return "missing";
        return existing instanceof TFolder ? "folder" : "other";
      },
    );

    if (issues.length > 0) {
      showLanguageSourceDiagnostics(this.app, issues);
      return { status: "blocked" };
    }

    // With multi-active languages, this loads ALL active dictionaries
    // into the single Dictionary index. Each entry carries its `language`
    // field so callers can distinguish source.
    const active = this.getActiveLanguages();

    // Language Profiles are canonical linguistic data stored in Markdown.
    // Refresh the in-memory view whenever active-language data is reloaded.
    this.languageProfiles.clear();
    for (const lang of active) {
      const profile = loadLanguageProfile(this.app, lang);
      if (profile) {
        this.languageProfiles.set(lang.name, profile);
      }
    }

    // Index case mode is a load-time decision — set it before (re)loading.
    this.dictionary.setCaseSensitive(this.settings.caseSensitiveMatching);

    if (active.length === 0) {
      this.dictionary.clear();
      this.morphemes.clear();
      this.linguisticExamples.clear();
      this.phonology.clear();
      this.classifyCache.clear();
      return { status: "loaded", dictionaryCount: 0 };
    }

    const count = await this.dictionary.loadFromFolders(
      active.map((l) => ({ folder: l.dictionaryFolder, language: l.name })),
      this.settings.languageMembership,
    );

    // Morphemes are loaded from their own optional canonical folders and remain
    // separate from Dictionary. Languages without a configured morpheme folder
    // simply contribute no morpheme source.
    await this.morphemes.loadFromFolders(
      active
        .filter((l) => Boolean(l.morphemeFolder?.trim()))
        .map((l) => ({
          folder: l.morphemeFolder!.trim(),
          language: l.name,
          languageId: this.getLanguageProfile(l)?.id,
        })),
      this.settings.languageMembership,
    );

    // Standalone linguistic examples are loaded from their own optional canonical
    // folders. The inventory handles parsing and validation; main.ts only supplies
    // the configured sources for the currently active languages.
    await this.linguisticExamples.loadFromFolders(
      active
        .filter((l) => Boolean(l.exampleFolder?.trim()))
        .map((l) => ({
          folder: l.exampleFolder!.trim(),
          language: l.name,
          languageId: this.getLanguageProfile(l)?.id,
        })),
      this.settings.languageMembership,
    );

    // Canonical phonological units are loaded from each active language's
    // optional phonology folder. The phonology module owns parsing and indexing;
    // main.ts only provides the configured source and canonical language identity.
    await this.phonology.loadFromFolders(
      active
        .filter((l) => Boolean(l.phonologyFolder?.trim()))
        .map((l) => ({
          folder: l.phonologyFolder!.trim(),
          language: l.name,
          languageId: this.getLanguageProfile(l)?.id,
        })),
      this.settings.languageMembership,
    );

    // The dictionary changed, so cached word classifications are stale.
    // Morphemes do not yet participate in classification.
    this.classifyCache.clear();
    return { status: "loaded", dictionaryCount: count };
  }

  // === Panel management ===

  async openPanel() {
    try {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PANEL);
      if (existing.length > 0) {
        await this.app.workspace.revealLeaf(existing[0]);
        return;
      }
      let leaf = this.app.workspace.getRightLeaf(false);
      // Fall back to creating a new leaf if right sidebar isn't available
      if (!leaf) {
        leaf = this.app.workspace.getLeaf(true);
      }
      if (!leaf) {
        new Notice("Made Up Words: could not open panel (no available leaf)");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_PANEL, active: true });
      await this.app.workspace.revealLeaf(leaf);
    } catch (e) {
      console.error("[Conlang] openPanel failed:", e);
      new Notice("Made Up Words: failed to open panel — see developer console");
    }
  }

  refreshPanel() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PANEL);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TranslationPanelView) {
        view.refresh();
      }
    }
  }

  /**
   * Set the body-level class that drives the highlight appearance. CSS keys
   * off "conlang-hl-<style>" so the underline/italic/background variants are
   * pure styling with no inline styles. Cleared entirely when highlighting
   * is off so no stray rules apply.
   */
  applyHighlightStyleClass() {
    activeDocument.body.removeClass(
      "conlang-hl-underline",
      "conlang-hl-italic",
      "conlang-hl-background",
    );
    if (this.settings.highlightKnownWords) {
      activeDocument.body.addClass(
        `conlang-hl-${this.settings.highlightStyle}`,
      );
    }
  }

  /**
   * Recompute highlighting everywhere after the dictionary or settings
   * change. Editors are nudged with a refresh effect so the CM6 ViewPlugin
   * rebuilds its decorations; Reading views are re-rendered so the
   * post-processor runs again.
   */
  /**
   * If `path` falls inside ANY active language's dictionary folder, reload the
   * dictionary and refresh the panel + highlights. Used by the metadata and
   * vault watchers so added/edited/deleted/renamed entries take effect live.
   *
   * Previously this only watched the *primary* language's folder, so words kept
   * in another active language's folder never triggered a live refresh.
   */
  private maybeReloadForPath(path: string) {
    const inDict = this.getActiveLanguages().some(
      (l) => l.dictionaryFolder && isPathWithinFolder(path, l.dictionaryFolder),
    );
    if (!inDict) return;
    // Debounced: metadataCache "changed" fires repeatedly while a dictionary
    // note is being edited, and each reload is a full reindex plus a global
    // re-render. Coalescing bursts keeps large dictionaries responsive.
    this.scheduleDictionaryReload();
  }

  // Trailing-edge debounce (resetTimer=true): a burst of vault events results
  // in one reload ~500ms after the last event.
  private scheduleDictionaryReload = debounce(
    () => void this.performDictionaryReload(),
    500,
    true,
  );
  private reloadInFlight = false;
  private reloadQueued = false;

  /**
   * Run one dictionary reload + UI refresh. If a reload is already running,
   * queue exactly one follow-up so events that arrive mid-reload aren't lost,
   * and overlapping reloads can't interleave.
   */
  private async performDictionaryReload() {
    if (this.reloadInFlight) {
      this.reloadQueued = true;
      return;
    }
    this.reloadInFlight = true;
    try {
      await this.reloadActiveLanguage();
      this.refreshPanel();
      this.refreshHighlights();
    } finally {
      this.reloadInFlight = false;
      if (this.reloadQueued) {
        this.reloadQueued = false;
        this.scheduleDictionaryReload();
      }
    }
  }

  refreshHighlights() {
    // Settings (highlight direction, active languages, …) may have changed;
    // cached classifications could be stale either way. Cheap to rebuild.
    this.classifyCache.clear();
    this.applyHighlightStyleClass();
    // Primary mechanism: re-apply registered editor extensions across every
    // editor. This re-instantiates our ViewPlugin and re-runs its build()
    // against the current dictionary, and works even when an individual
    // EditorView handle isn't reachable (e.g. Reading mode or cached panes).
    try {
      this.app.workspace.updateOptions();
    } catch (e) {
      console.error("[Made Up Words] updateOptions failed:", e);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      // Secondary: nudge the live editor directly, in case updateOptions
      // didn't recreate the ViewPlugin for this pane.
      const cm = (view.editor as Editor & { cm?: EditorView }).cm;
      if (cm) {
        try {
          cm.dispatch({ effects: refreshHighlightEffect.of(null) });
        } catch {
          /* non-fatal */
        }
      }
      // Re-render Reading-view panes so the markdown post-processor re-runs.
      const preview = (
        view as MarkdownView & {
          previewMode?: { rerender?(full: boolean): void };
        }
      ).previewMode;
      if (preview && typeof preview.rerender === "function") {
        try {
          preview.rerender(true);
        } catch {
          /* non-fatal */
        }
      }
    }
  }

  // === Translation ===

  /**
   * Translate English text to the conlang. Public so the panel can call it.
   */
  translateToConlang(text: string): string {
    const lang = this.getActiveLanguage();
    if (!lang) return text;
    return this.translateToConlangWith(text, lang);
  }

  /**
   * Translate English text through the shared translation module.
   *
   * main.ts only supplies the active dictionary and language. The gloss module
   * owns the safety-sensitive rule that dictionary results are final and the
   * cypher is used only as fallback for unmatched source material.
   */
  private translateToConlangWith(text: string, lang: LanguageConfig): string {
    return translateEnglishToConlangString(text, this.dictionary, lang);
  }

  private getSelectionOrWord(
    editor: Editor,
  ): { text: string; from: EditorPosition; to: EditorPosition } | null {
    const text = editor.getSelection();
    if (text && text.length > 0) {
      return {
        text,
        from: editor.getCursor("from"),
        to: editor.getCursor("to"),
      };
    }
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);

    // Delegate lexical boundary handling to the shared scanner. It preserves
    // Obsidian's UTF-16 cursor coordinates while scanning complete Unicode
    // code points, including supplementary-plane letters.
    const range = findWordRangeAt(line, cursor.ch);
    if (!range) return null;

    return {
      text: line.substring(range.start, range.end),
      from: { line: cursor.line, ch: range.start },
      to: { line: cursor.line, ch: range.end },
    };
  }

  private async previewToConlang(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    const translated = this.translateToConlang(sel.text);
    new Notice(`${sel.text}  →  ${translated}`, 6000);
  }

  /**
   * Preview and explicitly authorize replacement of creator-authored text.
   *
   * The proposed replacement is generated exactly once before confirmation.
   * If approved, that same string is passed to replaceRange(); translation or
   * wrapper logic is never rerun after the user has reviewed the preview.
   *
   * Because a modal introduces an asynchronous gap, the command also captures
   * its original file and source text. Both must still match immediately before
   * mutation or the operation stops safely.
   */
  async commitSelectionToConlang(
    editor: Editor,
    ctx: MarkdownView | MarkdownFileInfo,
  ) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }

    // Capture both object identity and the path now. TFile.path can change if a
    // file is renamed, so storing the path separately lets us detect that
    // change even if Obsidian retains the same TFile object.
    const originalFile = ctx.file;
    const originalPath = originalFile?.path ?? null;

    if (!originalFile || !originalPath) {
      new Notice(
        "Made Up Words: could not identify the note containing this text",
      );
      return;
    }

    // Capture the target language before opening any asynchronous UI.
    //
    // LanguageConfig is the linguistic authority for this operation: its name
    // scopes lexical resolution to one lexicon, while its rules/sheets describe
    // that language's configured translation behavior. We must not silently
    // switch to a different primary language if settings change later.
    const targetLanguage = this.getActiveLanguage();

    if (!targetLanguage) {
      new Notice("Made Up Words: no active language");
      return;
    }

    // The ordinary Translator is allowed to show exploratory cypher fallback.
    // A note mutation has a stricter boundary: first obtain the language-scoped
    // gloss tokens, then let the pure commit planner decide whether every
    // lexical item has enough creator-authored authority to be written.
    let tokens = glossEnglishToConlang(
      sel.text,
      this.dictionary,
      targetLanguage,
    );
    let plan = buildEnglishToConlangCommitPlan(tokens);

    if (plan.status === "blocked") {
      // One unresolved lexical item invalidates authorization for the entire
      // replacement. The creator may authorize ONE missing-vocabulary repair
      // pass, but that permission does not authorize editing the original note.
      const action = await promptTranslationUnresolved(
        this.app,
        plan.unresolved,
      );

      if (action === "cancel") return;

      const repair = await repairMissingTranslationVocabulary(
        plan.unresolved,
        targetLanguage,
        {
          // Bind the optional Cypher helper to the target captured when this
          // translation began. It must not drift to a later primary language.
          promptForWord: (source, language) =>
            this.promptForWord(source, language),

          // The repair controller receives lexical persistence authority only.
          // It has no Editor, selection, range, or replaceRange() capability.
          writeWord: (language, result) =>
            this.writeWordEntry(language, result),
        },
      );

      // Cancelling any word modal terminates the remaining translation flow.
      // Entries explicitly saved before cancellation remain durable because
      // each of those vocabulary writes was independently authorized.
      if (repair.status === "cancelled") return;

      if (repair.status === "failed") {
        new Notice(
          `Conlang Workbench: ${repair.error}. Translation was not replaced.`,
          9000,
        );
        return;
      }

      // "in-progress" means the permitted vocabulary-repair pass succeeded,
      // not that the translation itself is complete. Reload authoritative
      // lexical data before asking the planner again.
      await this.afterEntriesChanged();

      // Never reuse the pre-repair planner result. Re-resolve the ORIGINAL
      // captured source text against the SAME captured target language.
      tokens = glossEnglishToConlang(sel.text, this.dictionary, targetLanguage);
      plan = buildEnglishToConlangCommitPlan(tokens);

      if (plan.status === "blocked") {
        // A completed repair pass should have consumed every missing-vocabulary
        // item that the creator authorized. Cancellation and write failure
        // already return above, so reaching this point with another "missing"
        // classification means our repair/reload assumptions did not hold.
        //
        // Fail closed rather than silently starting another repair cycle or
        // pretending the translation is safe to commit.
        const stillMissing = plan.unresolved.some(
          (item) => item.reason === "missing",
        );

        if (stillMissing) {
          new Notice(
            "Conlang Workbench: vocabulary repair finished, but a missing word " +
              "did not resolve after reload. Nothing was replaced.",
            9000,
          );
          return;
        }

        // At this stage the remaining blockers are things the repair queue was
        // never authorized to solve, such as ambiguity or unsupported forms.
        // Keep them visible until the creator closes the diagnostic modal.
        await promptTranslationUnresolved(this.app, plan.unresolved, true);
        return;
      }
    }

    // This guard documents the authority boundary for TypeScript and future
    // readers: only a ready planner result may ever reach replacement preview.
    if (plan.status !== "ready") return;

    // `plan.replacement` is the exact Markdown string authorized by the
    // planner. Preview that exact value and, if the creator confirms, pass the
    // same string to replaceRange() without regenerating or wrapping it.
    const confirmed = await confirmTranslationCommit(this.app, {
      original: sel.text,
      translated: plan.translated,
      replacement: plan.replacement,
    });

    if (!confirmed) return;

    // Translation approval is also scoped to the target language captured when
    // this operation began. Do not silently reinterpret an approved preview
    // through a different primary language if settings changed asynchronously.
    //
    // LanguageConfig does not yet have a stable settings-level id, so the
    // current alpha boundary uses the configured language name as identity.
    const currentTargetLanguage = this.getActiveLanguage();
    if (
      !currentTargetLanguage ||
      currentTargetLanguage.name !== targetLanguage.name
    ) {
      new Notice(
        "Made Up Words: the target language changed while the preview was open. Nothing was replaced.",
        8000,
      );
      return;
    }

    // The editor callback context remains associated with the originating
    // Markdown view/file. If that target changed while the modal was open, the
    // user's approval no longer describes the current document.
    const currentFile = ctx.file;
    if (
      !currentFile ||
      currentFile !== originalFile ||
      currentFile.path !== originalPath
    ) {
      new Notice(
        "Made Up Words: the target note changed while the preview was open. Nothing was replaced.",
        8000,
      );
      return;
    }

    let currentText: string;
    try {
      currentText = editor.getRange(sel.from, sel.to);
    } catch {
      // Structural edits can make a previously valid range unusable. Treat
      // that as stale authorization rather than guessing at a new target.
      new Notice(
        "Made Up Words: the target text changed while the preview was open. Nothing was replaced.",
        8000,
      );
      return;
    }

    if (currentText !== sel.text) {
      new Notice(
        "Made Up Words: the target text changed while the preview was open. Nothing was replaced.",
        8000,
      );
      return;
    }

    editor.replaceRange(plan.replacement, sel.from, sel.to);
  }

  private wrapForCommit(translated: string, original: string): string {
    switch (this.settings.commitWrapper) {
      case "html-tooltip": {
        const safe = original
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<abbr title="${safe}">${translated}</abbr>`;
      }
      case "footnote-style":
        return `${translated}^[${original}]`;
      case "wikilink":
        return `[[${translated}|${translated}]]`;
      default:
        return translated;
    }
  }

  private async previewToEnglish(editor: Editor) {
    // Preserve whether the user explicitly selected text before falling back
    // to the word under the cursor. Arbitrary explicit selections need a
    // stricter interpretation boundary than cursor-derived lexical tokens.
    const explicitSelection = editor.getSelection();

    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }

    if (explicitSelection.length > 0) {
      const intent = classifySelectionLookup(explicitSelection);

      if (intent.kind === "invalid") {
        // Do not delete punctuation or other internal separators and then
        // perform lookup on a token the user never actually selected.
        new Notice(
          "Made Up Words: selection is not a single word or whitespace-separated phrase",
        );
        return;
      }

      if (intent.kind === "phrase") {
        // A multi-word selection is meaningful, but translating the complete
        // phrase is a different operation from looking up one lexical token.
        // Require explicit approval before doing that broader interpretation.
        const confirmed = await confirmPhraseTranslation(
          this.app,
          intent.sourceText,
        );
        if (!confirmed) return;

        const lang = this.getActiveLanguage();
        const tokens = glossConlangToEnglish(
          intent.lookupText,
          this.dictionary,
          lang,
        );
        const translated = renderConlangToEnglishString(tokens);

        new Notice(`${intent.sourceText}  →  ${translated}`, 6000);
        return;
      }

      // A safely classified explicit single-word selection may exclude only
      // harmless outer punctuation/whitespace. Use the classifier's lexical
      // token instead of destructively cleaning the whole selected string.
      const entry = this.dictionary.lookup(intent.lookupText);
      if (entry) {
        new Notice(`${entry.word}  →  ${entry.definition}`, 6000);
        return;
      }

      const lang = this.getActiveLanguage();
      if (!lang) {
        new Notice("Made Up Words: no active language");
        return;
      }

      const reversed = applyCypherReverse(intent.lookupText, lang.sheets);
      new Notice(`${intent.sourceText}  →  ${reversed} (reverse cypher)`, 6000);
      return;
    }

    // The no-selection path is already constrained by getSelectionOrWord(),
    // which returns only a lexical word identified by the shared word scanner.
    // Keep its established behavior intact rather than broadening this
    // security fix unnecessarily.
    const entry = this.dictionary.lookup(cleanWord(sel.text));
    if (entry) {
      new Notice(`${entry.word}  →  ${entry.definition}`, 6000);
      return;
    }

    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }

    const reversed = applyCypherReverse(sel.text, lang.sheets);
    new Notice(`${sel.text}  →  ${reversed} (reverse cypher)`, 6000);
  }

  private async createEntryFromSelection(editor: Editor) {
    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }
    await this.openMultiLangEntries(sel.text);
  }

  /**
   * Open the multi-language "Save to dictionary" modal: pick one or more
   * languages, tweak each cypher-seeded form, set a shared part of speech,
   * then create one entry per chosen language (each in its own folder).
   */
  private async openMultiLangEntries(englishText: string) {
    const langs = this.settings.languages;
    if (langs.length === 0) {
      new Notice("Made Up Words: no languages configured");
      return;
    }
    const primary = this.settings.primaryLanguage;
    const inits: MultiEntryLanguageInit[] = langs.map((l) => ({
      languageName: l.name,
      folder: l.dictionaryFolder,
      form: this.translateToConlangWith(englishText, l),
      checked: l.name === primary,
    }));
    const result = await new Promise<MultiEntryResult | null>((resolve) => {
      new MultiEntryModal(this.app, englishText, inits, resolve).open();
    });
    if (!result) return;

    const created: string[] = [];
    const errors: string[] = [];
    let firstPath: string | null = null;
    for (const target of result.targets) {
      const lang = langs.find((l) => l.name === target.languageName);
      if (!lang) continue;
      const r = await this.createOneEntry({
        englishText,
        lang,
        conlangForm: target.form,
        partOfSpeech: result.partOfSpeech,
      });
      if (r.ok) {
        created.push(
          `${target.form} (${lang.name}${r.created ? "" : ", existing"})`,
        );
        if (!firstPath) firstPath = r.path;
      } else {
        errors.push(`${lang.name}: ${r.error}`);
      }
    }
    await this.afterEntriesChanged();
    if (firstPath) {
      const f = this.app.vault.getAbstractFileByPath(firstPath);
      if (f instanceof TFile)
        await this.app.workspace.getLeaf(false).openFile(f);
    }
    if (errors.length > 0) {
      new Notice(
        `Made Up Words: ${created.length} saved, ${errors.length} failed — ${errors.join("; ")}`,
        9000,
      );
    } else {
      new Notice(
        `Made Up Words: saved ${created.length} ${created.length === 1 ? "entry" : "entries"}`,
        5000,
      );
    }
  }

  /**
   * Create one dictionary entry requested by the multi-language creation flow.
   *
   * The reusable writer owns the persistent safety boundary: destination
   * validation, strict folder creation, collision/source-authority checks,
   * homograph allocation, and the final vault write. This method remains
   * responsible for the entry-specific Markdown template and for adapting the
   * writer's structured result to the older multi-entry caller contract.
   */
  private async createOneEntry(p: {
    englishText: string;
    lang: LanguageConfig;
    conlangForm: string;
    partOfSpeech: string;
  }): Promise<
    { ok: true; created: boolean; path: string } | { ok: false; error: string }
  > {
    const form = p.conlangForm.trim();
    if (!form) return { ok: false, error: "empty conlang form" };

    const result = await writeDictionaryEntry({
      app: this.app,
      form,
      definition: p.englishText,
      partOfSpeech: p.partOfSpeech,
      dictionaryFolder: p.lang.dictionaryFolder,

      // The writer decides whether a same-spelling lexical source requires a
      // homograph. It then tells this callback whether the real spelling needs
      // an explicit `word:` override in the generated Markdown.
      buildContent: ({ wordOverride }) =>
        [
          "---",
          ...(wordOverride ? [`word: ${form}`] : []),
          `definition: ${p.englishText}`,
          `language: ${p.lang.name}`,
          `partOfSpeech: ${p.partOfSpeech}`,
          "ipa: ",
          "etymology: ",
          "---",
          "",
          `# ${form}`,
          "",
          `Translates *${p.englishText}*.`,
          "",
        ].join("\n"),
    });

    if (result.status === "created") {
      await this.waitForFrontmatter(result.file);
      return { ok: true, created: true, path: result.path };
    }

    if (result.status === "existing") {
      return { ok: true, created: false, path: result.path };
    }

    return { ok: false, error: result.error };
  }

  /** Reload the dictionary + refresh UI after entries were added/changed. */
  private async afterEntriesChanged() {
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;
  }

  /**
   * Open the lookup modal for the selected text or word under cursor.
   * Gathers ALL possible matches (direct conlang entry, inflected form,
   * English-direction matches, cypher transformation) and presents them.
   *
   * This is the multi-sense lookup the linguist tester asked for: the
   * plugin does not pick a "best" translation. The user picks.
   */
  private async lookupWord(editor: Editor) {
    // Preserve whether the user explicitly selected arbitrary editor text.
    // Cursor-derived words are already constrained by getSelectionOrWord(),
    // while explicit selections require a separate lexical authority check.
    const explicitSelection = editor.getSelection();

    const sel = this.getSelectionOrWord(editor);
    if (!sel) {
      new Notice("Made Up Words: no selection or word under cursor");
      return;
    }

    let query = sel.text.trim();
    if (!query) return;

    if (explicitSelection.length > 0) {
      const intent = classifyLookupQuery(explicitSelection);

      if (intent.kind === "invalid") {
        // Never delete internal punctuation, digits, combining marks, or other
        // content and then perform lookup on a different expression.
        new Notice(
          "Made Up Words: selection is not a single word or whitespace-separated phrase",
        );
        return;
      }

      query = intent.lookupText;
    }

    const matches = this.collectLookupMatches(query);
    new LookupModal(this.app, query, matches).open();
  }

  /**
   * Build the full list of candidates for a given query, exploring every
   * direction the plugin understands. Returns matches in priority order:
   *   1. Direct conlang dictionary entry (highest confidence)
   *   2. Inflected form of a conlang entry
   *   3. English-direction matches (often multi-sense)
   *   4. Cypher transformation (lowest confidence, clearly labelled)
   */
  private collectLookupMatches(query: string): LookupMatch[] {
    const out: LookupMatch[] = [];

    // `query` has already passed the command's lexical authority boundary.
    // Do not delete or rewrite characters here: doing so could manufacture a
    // different word or phrase from what the user actually supplied.
    const cleaned = query;
    const activeLangs = this.getActiveLanguages();
    const primary = this.getPrimaryLanguage();

    // 1. Direct conlang lookup across all active languages
    const directMatches = this.dictionary.lookupAll(cleaned);
    if (directMatches.length > 0) {
      out.push({ kind: "dictionary", candidates: directMatches });
    }

    // 2a. Hardcoded forms declared on an entry (`forms:` frontmatter). Listed
    // before rule matches because a declared irregular outranks a derivation.
    // Multi-word declared forms are indexed too, so this isn't gated on
    // single words the way rule matching is.
    // One lemma can declare the same surface form under several labels
    // (syncretism — a genuinely common thing in case systems). Merge those
    // into one card rather than repeating the entry per label.
    const formLabelsByPath = new Map<
      string,
      { lemma: DictionaryEntry; labels: string[] }
    >();
    for (const hit of this.dictionary.lookupForm(cleaned)) {
      if (directMatches.some((e) => e.path === hit.lemma.path)) continue;
      const acc = formLabelsByPath.get(hit.lemma.path);
      if (acc) {
        if (!acc.labels.includes(hit.label)) acc.labels.push(hit.label);
      } else {
        formLabelsByPath.set(hit.lemma.path, {
          lemma: hit.lemma,
          labels: [hit.label],
        });
      }
    }
    for (const { lemma, labels } of formLabelsByPath.values()) {
      out.push({
        kind: "inflected",
        candidates: [lemma],
        inflectionLabel: labels.join(" / "),
      });
    }

    // 2b. Inflected form (only meaningful for single words) — try each language's rules
    if (!/\s/.test(cleaned)) {
      for (const lang of activeLangs) {
        const inflectionMatch = findInflection(
          cleaned,
          this.dictionary,
          lang.inflections,
          lang.name,
        );
        if (!inflectionMatch) continue;
        // Skip if this lemma is already on the list — either as a direct hit
        // or via a hardcoded form, which supersedes the rule derivation.
        const alreadyShown = out.some((m) =>
          (m.candidates ?? []).some(
            (c) => c.path === inflectionMatch.lemma.path,
          ),
        );
        if (alreadyShown) continue;
        out.push({
          kind: "inflected",
          candidates: [inflectionMatch.lemma],
          inflectionLabel: inflectionMatch.rule.label,
        });
        // Don't break — different languages might produce different inflection matches
        // for the same surface form, all worth showing.
      }
    }

    // 3. English-direction matches (whole input or single word)
    const englishHits = this.dictionary.lookupEnglish(cleaned);
    if (englishHits.length > 0) {
      // Filter out entries already shown as direct/inflected
      const shownPaths = new Set(
        out.flatMap((m) => (m.candidates ?? []).map((c) => c.path)),
      );
      const fresh = englishHits.filter((e) => !shownPaths.has(e.path));
      if (fresh.length > 0) {
        const isPhrase = /\s/.test(cleaned);
        out.push({ kind: isPhrase ? "phrase" : "english", candidates: fresh });
      }
    }

    // 4. Cypher fallback (only for single words, only if nothing else hit).
    // Uses the PRIMARY language's cypher because cypher output can't be
    // honestly merged across languages.
    if (out.length === 0 && !/\s/.test(cleaned) && primary) {
      const cyphered = applyCypher(cleaned, primary.sheets);
      if (cyphered !== cleaned) {
        out.push({ kind: "cypher", cypherOutput: cyphered });
      }
    }

    if (out.length === 0) {
      out.push({ kind: "none" });
    }
    return out;
  }

  /**
   * Public so the panel button can call it.
   */
  async createDictionaryEntryForText(
    englishText: string,
    targetLang?: LanguageConfig,
  ) {
    const lang = targetLang ?? this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const translated = this.translateToConlangWith(englishText, lang);
    const folder = lang.dictionaryFolder;

    // Reject an unsafe configured destination before any folder or note can be
    // created. Interactive creation reports the setting problem to the user
    // and stops without changing the vault.
    try {
      validateVaultRelativePath(folder);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(
        `Conlang Workbench: invalid dictionary folder for ${lang.name} — ${msg}`,
        9000,
      );
      return;
    }

    // Inspect first without mutating the vault. This preserves the existing
    // quick-entry behavior: an already-known word opens immediately, while a
    // genuinely new word or homograph proceeds to the part-of-speech prompt.
    const inspection = inspectDictionaryEntry(
      this.app,
      folder,
      translated,
      englishText,
    );

    if (inspection.status === "blocked") {
      new Notice(
        `Conlang Workbench: ${inspection.error}. No new entry was created.`,
        9000,
      );
      return;
    }

    if (inspection.status === "existing") {
      await this.app.workspace.getLeaf(false).openFile(inspection.file);
      new Notice(`Conlang: opened existing entry "${translated}"`);
      return;
    }

    // Prompt only after the read-only inspection establishes that creation may
    // actually be needed. Cancelling here therefore performs no vault mutation.
    const opts = await this.promptForEntryOptions(englishText, translated);
    if (opts === null) return; // user cancelled

    const result = await writeDictionaryEntry({
      app: this.app,
      form: translated,
      definition: englishText,
      partOfSpeech: opts.partOfSpeech,
      dictionaryFolder: folder,

      // Keep this command's established Markdown template here. The writer owns
      // persistence safety, not the linguistic/document presentation.
      buildContent: ({ wordOverride }) =>
        [
          "---",
          ...(wordOverride ? [`word: ${translated}`] : []),
          `definition: ${englishText}`,
          `language: ${lang.name}`,
          `partOfSpeech: ${opts.partOfSpeech}`,
          "ipa: ",
          "etymology: ",
          "---",
          "",
          `# ${translated}`,
          "",
          `Translates *${englishText}*.`,
          "",
        ].join("\n"),
    });

    if (result.status === "blocked" || result.status === "failed") {
      new Notice(
        `Conlang Workbench: ${result.error}. No new entry was created.`,
        9000,
      );
      return;
    }

    if (result.status === "existing") {
      // The vault may have changed while the modal was open. Re-running the
      // writer's safety checks after confirmation means a newly appeared
      // same-meaning entry is opened rather than duplicated.
      await this.app.workspace.getLeaf(false).openFile(result.file);
      new Notice(`Conlang: opened existing entry "${translated}"`);
      return;
    }

    const file = result.file;
    await this.app.workspace.getLeaf(false).openFile(file);

    // Obsidian populates frontmatter metadata asynchronously after file
    // creation. Wait for this specific file before rebuilding Dictionary so
    // the new lexical source is not temporarily omitted from the index.
    await this.waitForFrontmatter(file);
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;

    const isActive = this.settings.activeLanguages.includes(lang.name);
    const senseNote = result.wordOverride
      ? " as a new sense of an existing word"
      : "";

    new Notice(
      isActive
        ? `Made Up Words: created "${translated}" in ${lang.name}${senseNote}`
        : `Made Up Words: created "${translated}" in ${lang.name}${senseNote} (inactive — activate it to see hover/highlight)`,
    );
  }

  private promptForEntryOptions(
    englishText: string,
    translated: string,
  ): Promise<EntryCreationOptions | null> {
    return new Promise((resolve) => {
      new EntryCreationModal(this.app, englishText, translated, resolve).open();
    });
  }

  /**
   * Open the Word Creation modal — used by the panel's "+ Word" button
   * when there's no selected text to bootstrap from. Asks for English
   * meaning and conlang form (with optional cypher derivation).
   */
  async createWordFromPanel() {
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const result = await this.promptForWord();
    if (!result) return;

    const writeResult = await this.writeWordEntry(lang, result);

    if (writeResult.status === "blocked" || writeResult.status === "failed") {
      new Notice(
        `Conlang Workbench: ${writeResult.error}. No new entry was created.`,
        9000,
      );
      return;
    }

    if (writeResult.status === "existing") {
      await this.app.workspace.getLeaf(false).openFile(writeResult.file);
      new Notice(`Conlang: opened existing entry "${result.conlangWord}"`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(writeResult.file);
    await this.afterEntriesChanged();

    new Notice(
      writeResult.wordOverride
        ? `Conlang: added "${result.conlangWord}" as a new sense of an existing word`
        : `Conlang: added "${result.conlangWord}"`,
    );
  }

  /**
   * Persist one ordinary lexical entry without taking over the workspace.
   *
   * This is intentionally separate from createWordFromPanel(): persistence is
   * shared behavior, while opening the resulting note is specific to the panel
   * command. Translation repair can therefore create vocabulary without moving
   * the creator away from the note whose text may later be replaced.
   *
   * writeDictionaryEntry() remains the security-sensitive authority boundary.
   * It revalidates the configured path, current vault objects, lexical source
   * authority, same-meaning collisions, and genuine homographs immediately
   * before writing.
   *
   * Newly created files are also allowed to reach Obsidian's metadata cache
   * before this helper returns. A caller that reloads Dictionary immediately
   * afterward will therefore not silently miss the new lexical entry.
   */
  private async writeWordEntry(
    lang: LanguageConfig,
    result: WordCreationResult,
  ): Promise<DictionaryEntryWriteResult> {
    const writeResult = await writeDictionaryEntry({
      app: this.app,
      form: result.conlangWord,
      definition: result.englishDefinition,
      partOfSpeech: result.partOfSpeech,
      dictionaryFolder: lang.dictionaryFolder,

      // The writer owns persistence safety, while this callback owns the
      // ordinary-word Markdown schema. Keeping those responsibilities separate
      // lets names and other lexical source types retain their own metadata.
      buildContent: ({ wordOverride }) => {
        const fmLines = [
          "---",
          ...(wordOverride ? [`word: ${result.conlangWord}`] : []),
          `definition: ${result.englishDefinition}`,
          `language: ${lang.name}`,
        ];

        if (result.partOfSpeech) {
          fmLines.push(`partOfSpeech: ${result.partOfSpeech}`);
        } else {
          fmLines.push("partOfSpeech: ");
        }

        fmLines.push(
          "ipa: ",
          "etymology: ",
          "---",
          "",
          `# ${result.conlangWord}`,
          "",
          "",
        );

        return fmLines.join("\n");
      },
    });

    if (writeResult.status === "created") {
      await this.waitForFrontmatter(writeResult.file);
    }

    return writeResult;
  }

  /**
   * Ask the creator for one ordinary lexical entry.
   *
   * `initialEnglishDefinition` is optional because the normal "+ Word" command
   * starts empty, while translation repair already knows which source word is
   * missing and can save the creator from retyping it.
   *
   * `targetLanguage` is also optional. Ordinary "+ Word" creation keeps the
   * existing behavior of deriving through the current active language.
   * Translation repair instead supplies the language captured when that
   * translation operation began. This prevents the optional Cypher button from
   * silently deriving a form through a different language.
   *
   * This helper only owns the modal interaction. It does not write to the vault
   * or open files, which lets several workflows reuse the same creator input
   * without inheriting one another's mutation behavior.
   */
  private promptForWord(
    initialEnglishDefinition = "",
    targetLanguage?: LanguageConfig,
  ): Promise<WordCreationResult | null> {
    return new Promise((resolve) => {
      const cypherFn = (s: string) =>
        targetLanguage
          ? this.translateToConlangWith(s, targetLanguage)
          : this.translateToConlang(s);

      new WordCreationModal(
        this.app,
        cypherFn,
        resolve,
        initialEnglishDefinition,
      ).open();
    });
  }

  /**
   * Open the Create Name modal and, on submit, create a proper-noun
   * dictionary entry for the new name. Called from a ribbon command and
   * from the panel.
   */
  async createName() {
    const lang = this.getActiveLanguage();
    if (!lang) {
      new Notice("Made Up Words: no active language");
      return;
    }
    const result = await this.promptForName();
    if (!result) return;

    const folder = lang.dictionaryFolder;

    // Names use the same canonical dictionary destination as ordinary words.
    // Validate that authority boundary before creating folders or files.
    try {
      validateVaultRelativePath(folder);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(
        `Conlang Workbench: invalid dictionary folder for ${lang.name} — ${msg}`,
        9000,
      );
      return;
    }

    // A name's referent is its lexical definition for collision purposes.
    // When no separate referent was supplied, preserve the existing fallback
    // to the name itself.
    const referent = result.referent || result.conlangForm;

    const writeResult = await writeDictionaryEntry({
      app: this.app,
      form: result.conlangForm,
      definition: referent,

      // Names always use proper-noun in their stored lexical metadata, but the
      // user-facing category is a better filename disambiguator for homographs.
      // Passing it here preserves the existing "Name (place).md"-style policy.
      partOfSpeech: result.category || "name",
      dictionaryFolder: folder,

      // Keep Name-specific metadata and body layout in the Name command. The
      // shared writer owns only persistence safety and tells us whether the
      // generated note needs an explicit spelling override.
      buildContent: ({ wordOverride }) =>
        [
          "---",
          ...(wordOverride ? [`word: ${result.conlangForm}`] : []),
          `definition: ${referent}`,
          `language: ${lang.name}`,
          "partOfSpeech: proper-noun",
          `nameCategory: ${result.category}`,
          "ipa: ",
          "etymology: ",
          "---",
          "",
          `# ${result.conlangForm}`,
          "",
          // Empty placeholder paragraph — the user fills this in to describe
          // who/what this name refers to in their world. Dictionary uses it as
          // the body preview on hover.
          "",
        ].join("\n"),
    });

    if (writeResult.status === "blocked" || writeResult.status === "failed") {
      new Notice(
        `Conlang Workbench: ${writeResult.error}. No new entry was created.`,
        9000,
      );
      return;
    }

    if (writeResult.status === "existing") {
      await this.app.workspace.getLeaf(false).openFile(writeResult.file);
      new Notice(`Conlang: opened existing entry "${result.conlangForm}"`);
      return;
    }

    const file = writeResult.file;
    await this.app.workspace.getLeaf(false).openFile(file);

    await this.waitForFrontmatter(file);
    await this.reloadActiveLanguage();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;
    new Notice(`Conlang: created name "${result.conlangForm}"`);
  }

  private promptForName(): Promise<NameCreationResult | null> {
    return new Promise((resolve) => {
      const cypherFn = (s: string) => this.translateToConlang(s);
      new NameCreationModal(this.app, cypherFn, resolve).open();
    });
  }

  /**
   * Wait up to ~2 seconds for Obsidian's metadata cache to have parsed
   * frontmatter for the given file. Resolves immediately if it's already
   * there. The metadataCache fires a "changed" event for each file once
   * its cache is populated.
   */
  private waitForFrontmatter(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache && cache.frontmatter && cache.frontmatter.definition) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.app.metadataCache.offref(ref);
        window.clearTimeout(timer);
        resolve();
      };
      const ref = this.app.metadataCache.on("changed", (changed) => {
        if (changed.path !== file.path) return;
        const c = this.app.metadataCache.getFileCache(changed);
        if (c && c.frontmatter && c.frontmatter.definition) finish();
      });
      // Safety net: don't block forever if the cache never fires
      const timer = window.setTimeout(finish, 2000);
    });
  }

  // === Hover tooltips ===
  // Tooltip shows dictionary definitions when available, falls back to
  // a cypher preview so every word gives feedback.

  /**
   * Recompute whether any active language wants hover tooltips. Called on load
   * and whenever settings change, so the mousemove handler can bail out with a
   * single boolean check instead of scanning languages on every event.
   */
  private updateHoverActive() {
    // With both directions off there is nothing a tooltip could show — not even
    // the cypher preview, which the English direction now gates — so the whole
    // mousemove path can short-circuit before any caret resolution (a layout
    // flush) happens.
    const anyDirection =
      this.settings.hoverConlang || this.settings.hoverEnglish;
    this.hoverActive =
      anyDirection && this.getActiveLanguages().some((l) => l.hoverEnabled);
    // Hover just went inert. Any tooltip already on screen would otherwise stay
    // pinned there, because the mousemove handler now returns before reaching
    // the code that hides it.
    if (!this.hoverActive) {
      this.hideTooltip();
      this.lastHoverWord = null;
    }
  }

  /**
   * Throttled entry point for mousemove. Resolving the word under the cursor
   * uses caretRangeFromPoint, which forces a layout flush, so we cap how often
   * handleHover runs. A leading call keeps the tooltip responsive; a single
   * trailing timer guarantees the cursor's final resting position resolves.
   */
  private onMouseMove(evt: MouseEvent) {
    if (!this.hoverActive) return;
    this.lastMouseEvent = evt;
    const now = Date.now();
    const since = now - this.hoverLastRun;
    if (since >= ConlangPlugin.HOVER_THROTTLE_MS) {
      this.hoverLastRun = now;
      this.handleHover(evt);
    } else if (this.hoverPendingTimer === null) {
      this.hoverPendingTimer = window.setTimeout(() => {
        this.hoverPendingTimer = null;
        this.hoverLastRun = Date.now();
        if (this.lastMouseEvent) this.handleHover(this.lastMouseEvent);
      }, ConlangPlugin.HOVER_THROTTLE_MS - since);
    }
  }

  private handleHover(evt: MouseEvent) {
    // Fast-path guard: if no active language wants hover tooltips, do nothing.
    // (Cached via updateHoverActive so this stays a single boolean check.)
    if (!this.hoverActive) {
      this.hideTooltip();
      return;
    }

    // Check if the configured modifier key is held. "none" means always show
    // (the old behaviour); any other value requires the matching key.
    if (!this.modifierHeld(evt)) {
      this.hideTooltip();
      this.lastHoverWord = null;
      return;
    }

    const target = evt.target as HTMLElement | null;
    if (!target) {
      this.hideTooltip();
      return;
    }
    const inMarkdown =
      target.closest(".markdown-preview-view") ||
      target.closest(".markdown-source-view") ||
      target.closest(".cm-content");
    if (!inMarkdown) {
      this.hideTooltip();
      return;
    }
    if (target.closest(".conlang-panel")) {
      this.hideTooltip();
      return;
    }

    const ctx = this.getContextAtPoint(evt.clientX, evt.clientY);
    if (!ctx) {
      this.scheduleHideTooltip();
      this.lastHoverWord = null;
      return;
    }
    const word = ctx.word;
    const cleaned = cleanWord(word);
    if (!cleaned) {
      this.scheduleHideTooltip();
      this.lastHoverWord = null;
      return;
    }

    if (
      cleaned === this.lastHoverWord &&
      this.tooltipEl &&
      this.tooltipEl.hasClass("conlang-tooltip-visible")
    ) {
      this.positionTooltip(evt.clientX, evt.clientY);
      return;
    }
    this.lastHoverWord = cleaned;

    // Phrase check FIRST: if the hovered word is part of a known phrase,
    // show the phrase entry rather than the single-word lookup. We scan
    // backward from the cursor looking for phrase starts.
    // Phrase entries are conlang headwords, so this is the conlang direction
    // (same gating highlight-core applies to the phrase index).
    const phrases = this.settings.hoverConlang
      ? this.dictionary.phraseIndex()
      : EMPTY_PHRASE_INDEX;
    if (phrases.size > 0) {
      const phraseHit = this.findPhraseAroundCursor(ctx, phrases);
      if (phraseHit) {
        this.showDictionaryTooltip(evt.clientX, evt.clientY, phraseHit);
        return;
      }
    }

    // Resolution order, matching highlight-core.ts exactly:
    //   1. conlang headword            (lookupAll)
    //   2. hardcoded declared form     (lookupForm)
    //   3. rule-derived inflected form (findInflection)
    //   4. English text a definition matches
    //   5. forward cypher preview (primary language)
    //
    // The whole conlang side WINS over the English side: if the hovered word
    // resolves as any of 1-3, the English direction is never consulted.
    // Merging the two meant a word that is both one of your words and some
    // other entry's English definition produced a tooltip mixing "what your
    // word means" with "how to say this English word" — issue #12. Giving only
    // headwords precedence would leave the bug live for every inflected form,
    // which in an inflecting conlang is most tokens in a sentence.
    const conlangSide = this.settings.hoverConlang;
    const dictEntries = conlangSide ? this.dictionary.lookupAll(cleaned) : [];

    // 2 and 3 are only worth computing when 1 missed; a headword outranks both.
    let declaredForm: FormMatch | undefined;
    let inflectionMatch: InflectionMatch | null = null;
    if (conlangSide && dictEntries.length === 0) {
      declaredForm = this.dictionary.lookupForm(cleaned)[0];
      if (!declaredForm) {
        for (const activeLang of this.getActiveLanguages()) {
          inflectionMatch = findInflection(
            cleaned,
            this.dictionary,
            activeLang.inflections,
            activeLang.name,
          );
          if (inflectionMatch) break;
        }
      }
    }
    const conlangMatched =
      dictEntries.length > 0 ||
      declaredForm !== undefined ||
      inflectionMatch !== null;

    const englishHits =
      this.settings.hoverEnglish && !conlangMatched
        ? this.dictionary.lookupEnglish(cleaned)
        : [];
    const combined: DictionaryEntry[] = [...dictEntries];
    for (const e of englishHits) {
      if (!combined.some((c) => c.path === e.path)) combined.push(e);
    }
    // Expand to cross-language siblings: other entries that share a definition
    // with any match. So hovering one language's form (e.g. "Traenslaetis")
    // also surfaces the same concept in other active languages
    // (e.g. "Translateees"), since they share the English definition.
    //
    // Deliberately NOT gated on hoverEnglish: it keys off an already matched
    // entry's definition rather than the hovered text, so it's a
    // conlang-to-conlang bridge that happens to route through the shared gloss.
    //
    // The one way it could route back to the hovered text is an entry whose
    // definition repeats its own headword or alias (e.g. a loanword or a proper
    // noun entered with the same conlang form and referent). Skipping a sense
    // equal to the hovered word closes that path, which would otherwise
    // reintroduce exactly the English-direction hits suppressed above.
    const selfKey = cleaned.toLowerCase();
    const seenDefs = new Set<string>();
    for (const e of [...combined]) {
      for (const sense of e.definition.split(/[,;]/)) {
        const key = sense.trim().toLowerCase();
        if (!key || key === selfKey || seenDefs.has(key)) continue;
        seenDefs.add(key);
        for (const sib of this.dictionary.lookupEnglish(key)) {
          if (!combined.some((c) => c.path === sib.path)) combined.push(sib);
        }
      }
    }
    if (combined.length === 1) {
      this.showDictionaryTooltip(evt.clientX, evt.clientY, combined[0]);
      return;
    }
    if (combined.length > 1) {
      this.showMultiSenseTooltip(evt.clientX, evt.clientY, cleaned, combined);
      return;
    }

    // A hardcoded declared form beats a rule-derived one (issue #10).
    if (declaredForm) {
      this.showInflectionTooltip(evt.clientX, evt.clientY, {
        lemma: declaredForm.lemma,
        label: declaredForm.label,
        inflectedForm: cleaned,
      });
      return;
    }
    if (inflectionMatch) {
      this.showInflectionTooltip(
        evt.clientX,
        evt.clientY,
        ConlangPlugin.toFormBanner(inflectionMatch),
      );
      return;
    }

    // No dictionary match. Respect the user's setting for what to show as
    // a fallback — cypher preview (default) or nothing (less noise).
    //
    // The cypher preview is itself an English-to-conlang transformation of the
    // hovered text, so it belongs to the English direction. Showing it while
    // that direction is switched off would keep producing exactly the output
    // the user turned off (issue #12).
    if (
      !this.settings.hoverEnglish ||
      this.settings.hoverFallback === "nothing"
    ) {
      this.scheduleHideTooltip();
      return;
    }
    // Cypher fallback uses the PRIMARY language's rules. With multi-language,
    // there's no honest way to cypher into multiple languages at once.
    const primary = this.getPrimaryLanguage();
    if (!primary) {
      this.scheduleHideTooltip();
      return;
    }
    const cyphered = applyCypher(cleaned, primary.sheets);
    if (cyphered === cleaned) {
      this.scheduleHideTooltip();
      return;
    }
    this.showCypherTooltip(evt.clientX, evt.clientY, cleaned, cyphered);
  }

  /**
   * Returns true if the configured hover modifier key is held during the
   * given mouse event. "none" always returns true (always-on hover).
   */
  private modifierHeld(evt: MouseEvent): boolean {
    switch (this.settings.hoverModifier) {
      case "none":
        return true;
      case "shift":
        return evt.shiftKey;
      case "alt":
        return evt.altKey;
      case "ctrl":
        // Treat Cmd on Mac the same as Ctrl elsewhere
        return evt.ctrlKey || evt.metaKey;
      default:
        return true;
    }
  }

  /**
   * Check if the word under the cursor is part of any phrase entry.
   * Scans the backward context to find candidate phrase starts, then tries
   * each one to see if it forms a phrase that includes the cursor's word.
   */
  private findPhraseAroundCursor(
    ctx: { word: string; forwardContext: string; backwardContext: string },
    phrases: PhraseIndex,
  ): DictionaryEntry | null {
    // Take all words in the backward+forward context, then for each starting
    // position try the phrase matcher. The matcher's longest-first guarantee
    // means we'll catch the right phrase.
    const fullContext =
      ctx.backwardContext + ctx.forwardContext.slice(ctx.word.length);
    // Where in fullContext does the hovered word START?
    const cursorWordStart = ctx.backwardContext.length - ctx.word.length;

    // Find all word boundaries up to and including the cursor word's start
    const wordRe = new RegExp(WORD_RE.source, "gu");
    const wordPositions: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(fullContext)) !== null) {
      if (m.index > cursorWordStart) break;
      wordPositions.push(m.index);
    }

    // Try starting a phrase match at each candidate position (closest to the
    // cursor first; that way the match that *includes* the cursor wins)
    for (let i = wordPositions.length - 1; i >= 0; i--) {
      const startPos = wordPositions[i];
      const candidate = fullContext.slice(startPos);
      const hit = matchPhraseAtStart(candidate, phrases);
      if (!hit) continue;
      // Does the matched span actually cover the cursor's word?
      const matchEnd = startPos + hit.matchedText.length;
      if (matchEnd > cursorWordStart) {
        return hit.entry;
      }
    }
    return null;
  }

  /**
   * Like getWordAtPoint, but also returns text on either side of the cursor
   * up to nearby word boundaries — enough to run phrase matching against.
   *
   * Returns:
   *   word: the word directly under the cursor
   *   forwardContext: text from the start of `word` to the next ~50 chars
   *   backwardContext: text from ~50 chars before `word` to the end of `word`
   */
  private getContextAtPoint(
    x: number,
    y: number,
  ): { word: string; forwardContext: string; backwardContext: string } | null {
    // `caretPositionFromPoint` / `caretRangeFromPoint` are non-standard across
    // browsers, so type just the two methods we probe for rather than using any.
    // They are declared standalone (rather than intersected with `Document`) so
    // the legacy call below resolves to this declaration instead of the
    // deprecated `Document.caretRangeFromPoint` in lib.dom.
    type CaretProbe = {
      caretRangeFromPoint?(x: number, y: number): Range | null;
      caretPositionFromPoint?(
        x: number,
        y: number,
      ): { offsetNode: Node; offset: number } | null;
    };
    const doc = activeDocument as unknown as CaretProbe;
    let textNode: Node | null = null;
    let offset = 0;
    // Prefer the standard `caretPositionFromPoint`; fall back to the legacy
    // `caretRangeFromPoint` for the older Chromium builds shipped with
    // Obsidian releases down to minAppVersion 1.7.2, where the standard method
    // isn't available. The fallback is deliberate.
    if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(x, y);
      if (!pos) return null;
      textNode = pos.offsetNode;
      offset = pos.offset;
    } else if (typeof doc.caretRangeFromPoint === "function") {
      const range: Range | null = doc.caretRangeFromPoint(x, y);
      if (!range) return null;
      textNode = range.startContainer;
      offset = range.startOffset;
    }
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
    const text = textNode.textContent ?? "";
    if (!text) return null;
    // DOM text offsets are also UTF-16 coordinates, so the same scanner used
    // by editor cursor lookup can safely identify the complete lexical word
    // here without splitting supplementary-plane Unicode characters.
    const range = findWordRangeAt(text, offset);
    if (!range) return null;

    const word = text.substring(range.start, range.end);

    // Grab ~50 chars on either side for phrase context. We can't see across
    // text nodes from a single hover, but phrases are short enough that
    // a single text node usually contains them.
    const forwardContext = text.substring(
      range.start,
      Math.min(text.length, range.end + 50),
    );
    const backwardContext = text.substring(
      Math.max(0, range.start - 50),
      range.end,
    );

    return { word, forwardContext, backwardContext };
  }

  private ensureTooltipEl(): HTMLDivElement {
    if (!this.tooltipEl) {
      // Left as a DOM call on purpose — see the note in highlight.ts:
      // `activeWindow.createDiv()` resolves to an unresolved type here.
      this.tooltipEl = activeDocument.createElement("div");
      this.tooltipEl.addClass("conlang-tooltip");
      activeDocument.body.appendChild(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  private showDictionaryTooltip(x: number, y: number, entry: DictionaryEntry) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    // A multi-word declared form is indexed as a synthetic phrase entry. Show
    // the real lemma with the usual "= plural of X" banner, so it reads the
    // same as a single-word declared form rather than as its own headword.
    const declaredLemma = this.dictionary.lemmaForDeclaredPhrase(entry);
    if (declaredLemma && entry.viaFormLabel) {
      this.showInflectionTooltip(x, y, {
        lemma: declaredLemma,
        label: entry.viaFormLabel,
        inflectedForm: entry.word,
      });
      return;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    Dictionary.renderTooltip(
      entry,
      el,
      this.getActiveLanguages().length > 1,
      this.settings.showFormsInTooltip,
    );
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  /**
   * Tooltip for a word that resolved to a lemma via inflection — either a
   * hardcoded `forms:` declaration or a rule match. Both render identically;
   * the user shouldn't have to care which route got them there.
   */
  private showInflectionTooltip(
    x: number,
    y: number,
    match: { lemma: DictionaryEntry; label: string; inflectedForm: string },
  ) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    // Render the dictionary entry as normal, then add a banner line noting
    // that this is an inflected form.
    Dictionary.renderTooltip(
      match.lemma,
      el,
      this.getActiveLanguages().length > 1,
      this.settings.showFormsInTooltip,
    );
    el.createDiv({
      cls: "conlang-tooltip-inflection",
      text: `${match.inflectedForm} = ${match.label} of ${match.lemma.word}`,
    });
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  /** Adapt a rule-based InflectionMatch to the shared tooltip shape. */
  private static toFormBanner(match: InflectionMatch) {
    return {
      lemma: match.lemma,
      label: match.rule.label,
      inflectedForm: match.inflectedForm,
    };
  }

  /**
   * Show multiple candidates when an English word matches several conlang
   * entries with different senses. This is the multi-sense lookup the tester
   * asked for: the plugin doesn't guess which sense is intended.
   */
  private showMultiSenseTooltip(
    x: number,
    y: number,
    sourceWord: string,
    entries: DictionaryEntry[],
  ) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    // Header changes depending on whether matches come from multiple languages.
    const languages = new Set(entries.map((e) => e.language).filter(Boolean));
    const headerSummary =
      languages.size > 1
        ? `${entries.length} matches across ${languages.size} languages`
        : `${entries.length} senses`;
    const header = el.createDiv({ cls: "conlang-tooltip-multisense-header" });
    header.createEl("strong", { text: sourceWord });
    header.appendText(` — ${headerSummary}`);
    for (const entry of entries) {
      const sense = el.createDiv({ cls: "conlang-tooltip-sense" });
      sense.createEl("strong", { text: entry.word });
      // Show source language when there are multiple languages in play.
      // Hidden when all entries are from the same language to avoid noise.
      if (languages.size > 1 && entry.language) {
        sense.appendText(" ");
        sense.createSpan({ cls: "conlang-tooltip-lang", text: entry.language });
      }
      if (entry.partOfSpeech) {
        sense.appendText(" ");
        sense.createEl("em", { text: entry.partOfSpeech });
      }
      sense.appendText(" ");
      sense.createSpan({
        cls: "conlang-tooltip-sense-def",
        text: entry.definition,
      });
    }
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  private showCypherTooltip(
    x: number,
    y: number,
    original: string,
    translated: string,
  ) {
    if (this.tooltipHideTimer !== null) {
      window.clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const el = this.ensureTooltipEl();
    el.empty();
    const cypher = el.createDiv({ cls: "conlang-tooltip-cypher" });
    cypher.createSpan({ cls: "conlang-tooltip-original", text: original });
    cypher.createSpan({ cls: "conlang-tooltip-arrow-inline", text: "→" });
    cypher.createSpan({ cls: "conlang-tooltip-translation", text: translated });
    el.createDiv({
      cls: "conlang-tooltip-hint",
      text: "cypher only — not in dictionary",
    });
    el.addClass("conlang-tooltip-visible");
    this.positionTooltip(x, y);
  }

  private positionTooltip(x: number, y: number) {
    if (!this.tooltipEl) return;
    const pad = 12;
    const rect = this.tooltipEl.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight) {
      top = y - rect.height - pad;
    }
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }

  private scheduleHideTooltip() {
    if (this.tooltipHideTimer !== null) return;
    this.tooltipHideTimer = window.setTimeout(() => {
      this.hideTooltip();
      this.tooltipHideTimer = null;
    }, 150);
  }

  private hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.removeClass("conlang-tooltip-visible");
    }
  }
}
