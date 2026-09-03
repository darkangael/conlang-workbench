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
import { renderMarkdownNote } from "./markdown-note-renderer";
import { MorphemeInventory } from "./morphemes";
import { LinguisticExampleInventory } from "./linguistic-examples";
import { PhonologyInventory } from "./phonology";
import {
  prepareLanguageRuntime,
  type LanguageRuntimeCandidate,
} from "./language-runtime";
import {
  loadLanguageProfile,
  validateLanguageProfilePath,
} from "./language-profile";
import { validateVaultRelativePath } from "./vault-paths";
import { isWatchedLanguageSourcePath } from "./language-source-watch";
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
import { decodePersistedSettings } from "./persisted-settings-decoder";
import { preflightLanguageSources } from "./language-source-preflight";
import { showLanguageSourceDiagnostics } from "./language-source-diagnostics-modal";
import {
  applyActiveLanguageState,
  type ActiveLanguageStateResult,
} from "./active-language-state";
import {
  applyPrimaryLanguageState,
  type PrimaryLanguageStateResult,
} from "./primary-language-state";
import { SettingsAuthorityQueue } from "./settings-authority-queue";
import { createStandardLanguage } from "./language-creator";
import {
  applyLanguageCreationState,
  type LanguageCreationStateResult,
} from "./language-creation-state";
import {
  applyPersistedSettingState,
  type PersistedSettingStateResult,
} from "./persisted-setting-state";
import {
  applyCaseSensitiveMatchingState,
  type CaseSensitiveMatchingStateResult,
} from "./case-sensitive-state";
import {
  applyLanguageMembershipState,
  type LanguageMembershipStateResult,
} from "./language-membership-state";
import {
  LinguisticRuleStateQueue,
  type LinguisticRuleCandidate,
  type LinguisticRuleStateResult,
} from "./linguistic-rule-state";
import {
  applyLanguageSourceState,
  type CanonicalFolderSetting,
  type LanguageSourceStateResult,
} from "./language-source-state";
import {
  applyLanguageProfileState,
  type LanguageProfileStateResult,
} from "./language-profile-state";
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
import {
  applyLanguageRemovalState,
  type LanguageRemovalStateResult,
} from "./language-removal-state";
import { ensureVaultFolderStrict } from "./vault-folder-writer";
import {
  buildSourceDiagnosticGroups,
  type SourceDiagnosticGroup,
} from "./source-diagnostics";
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

  /**
   * Coordinate complete settings-authority transactions across transaction
   * families.
   *
   * The coordinator must be entered before a transaction reads rollback state
   * or installs provisional settings. Serializing saveSettings() alone would
   * be too late because another transaction could already have captured that
   * provisional state as though it were settled authority.
   *
   * H13 migration is intentionally incremental. Only transaction wrappers
   * explicitly routed through this queue are protected by the common boundary
   * until the remaining families have been reviewed and migrated.
   */
  private readonly settingsAuthorityQueue = new SettingsAuthorityQueue();

  /**
   * Serialize all H10 cypher/inflection authority changes across languages.
   *
   * saveSettings() persists the complete settings object, so allowing two
   * linguistic-rule transactions to overlap would make rollback ordering unsafe
   * even when the edits target different languages. The pure queue constructs
   * each candidate only after the preceding H10 transaction has settled.
   *
   * This queue deliberately does not claim to serialize unrelated settings
   * saves. That broader persistence boundary is reviewed separately.
   */
  private readonly linguisticRuleStateQueue = new LinguisticRuleStateQueue();

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

  /**
   * Remember which diagnosed source note most recently produced the brief
   * navigation Notice.
   *
   * This is suppression state only, not diagnostic authority. The actual
   * answer to "does this note currently have diagnostics?" is derived fresh
   * from getSourceDiagnostics() whenever the workspace reports a file switch.
   *
   * Resetting this value after the user moves to an unaffected note means that
   * returning to the diagnosed note later is a new meaningful visit and may
   * notify again.
   */
  private lastNotifiedDiagnosticPath: string | null = null;

  async onload() {
    await this.loadSettings();
    this.dictionary = new Dictionary(this.app);
    this.morphemes = new MorphemeInventory(this.app);
    this.phonology = new PhonologyInventory(this.app);

    this.app.workspace.onLayoutReady(async () => {
      await this.reloadSettledLanguageState();
      this.updateHoverActive();
      this.refreshPanel();
      this.refreshHighlights();
      await this.maybeShowWelcome();
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
    // Also react to canonical linguistic sources being deleted or renamed.
    // Rename checks both paths below so moving a source into or out of an active
    // canonical folder cannot leave the corresponding runtime inventory stale.
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.maybeReloadForPath(file.path)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.maybeReloadForPath(file.path);
        this.maybeReloadForPath(oldPath);
      }),
    );

    /*
     * Diagnostics remain observational even when the creator navigates outside
     * the Diagnostics workspace. A file-open event is the narrow workspace
     * boundary for noticing a meaningful switch to another source note.
     *
     * Repeated workspace events for the same diagnosed note are suppressed by
     * maybeNotifyForDiagnosticFile(); no polling, reload, or source mutation is
     * performed here.
     */
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        this.maybeNotifyForDiagnosticFile(file);
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
        const result = await this.reloadSettledLanguageState();
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
        const requested = !this.settings.highlightKnownWords;
        const result = await this.setPersistedSettingState(
          () => this.settings.highlightKnownWords,
          (value) => {
            this.settings.highlightKnownWords = value;
          },
          requested,
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to save highlighting preference",
            result.error,
          );
          new Notice("Made Up Words: could not save the highlighting change.");
          return;
        }

        if (result.status === "unchanged") return;

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
    /*
     * loadSettings() is the first awaited operation in onload(), making this
     * method the gateway to every later registration, migration, vault read,
     * runtime index, UI behavior, and settings write.
     *
     * loadData() returns untrusted runtime data. Decode it before installing it
     * as settings authority. If decoding blocks, throw here: the rejected raw
     * representation remains untouched on disk, migrateSettings() never sees
     * it, and JavaScript stops onload() before anything below this gateway can
     * register or run.
     */
    const raw: unknown = await this.loadData();
    const decoded = decodePersistedSettings(raw);

    if (decoded.status === "blocked") {
      const issueSummary = decoded.issues
        .map(
          (issue) =>
            `${issue.path}: expected ${issue.expected}, received ${issue.actual}`,
        )
        .join("; ");

      console.error(
        "Conlang Workbench: startup blocked by malformed persisted settings. " +
          "The settings file was not changed.",
        decoded.issues,
      );
      new Notice(
        "Conlang Workbench could not start because its saved settings are " +
          "malformed. Creator data was preserved; see the developer console " +
          "for details.",
        12000,
      );
      throw new Error(
        "Conlang Workbench persisted-settings validation failed: " +
          issueSummary,
      );
    }

    this.settings = decoded.settings;

    // Migration receives authority only after structural validation succeeds.
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
   * Create and register one standard language as a complete settings-authority
   * transaction.
   *
   * H5 remains responsible for filesystem authority: createStandardLanguage()
   * preflights the complete standard folder structure and establishes missing
   * folders additively without deleting creator data during failure recovery.
   *
   * H13 adds the ordering boundary around that existing operation. The queue
   * must be entered before the generated language name is chosen because the
   * current configured-language collection is itself settings authority.
   * Keeping the queue through creation, provisional registration, persistence,
   * and exact-object rollback prevents another settings transaction from
   * observing or overwriting provisional new-language state.
   */
  async createLanguageState(
    includePortableIds: boolean,
  ): Promise<LanguageCreationStateResult> {
    /*
     * The creator may choose the initial portable-ID policy before this method
     * is called, but that choice grants no authority over the generated name,
     * vault destination, or configured-language collection.
     *
     * H13 still enters the common settings queue before those authoritative
     * values are inspected. The already-resolved boolean is merely carried
     * through the transaction into the exact LanguageConfig created by H5.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageCreationState({
        state: this.settings,
        create: (name, existingLanguages) =>
          createStandardLanguage(
            this.app,
            name,
            existingLanguages,
            includePortableIds,
          ),
        save: () => this.saveSettings(),
      }),
    );
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
    /*
     * The complete H6 transaction must enter the common authority boundary
     * before it snapshots activeLanguages and primaryLanguage. The queue then
     * remains held through persistence, runtime reload, and any safe rollback
     * or compensating save performed by applyActiveLanguageState().
     */
    return this.settingsAuthorityQueue.run(() =>
      applyActiveLanguageState({
        state: this.settings,
        activeLanguages,
        primaryLanguage,
        save: () => this.saveSettings(),
        reload: () => this.reloadActiveLanguage(),
      }),
    );
  }

  /**
   * Establish a primary-language-only change without rebuilding linguistic
   * inventories.
   *
   * The active-language authority transaction establishes which languages are
   * loaded. This smaller transaction only selects one member of that already
   * active set as the primary translation and entry-creation target.
   *
   * Keeping persistence and rollback in primary-language-state.ts ensures that
   * Settings and the side panel cannot leave an unsaved primary selection
   * influencing runtime behavior after saveData() fails.
   */
  async setPrimaryLanguageState(
    primaryLanguage: string,
  ): Promise<PrimaryLanguageStateResult> {
    /*
     * Enter the common authority boundary before applyPrimaryLanguageState()
     * reads the current primary language. That guarantees its rollback value
     * comes from settled state rather than another transaction's provisional
     * settings.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyPrimaryLanguageState({
        state: this.settings,
        primaryLanguage,
        save: () => this.saveSettings(),
      }),
    );
  }

  /**
   * Persist one ordinary settings preference without allowing a failed write
   * to remain authoritative in the live settings object.
   *
   * These preferences are consumed directly from settings rather than through
   * a rebuilt linguistic inventory. The requested value therefore needs only
   * one authority boundary: successful persistence. The pure H12 transaction
   * restores the previous live value when saveData() fails so runtime behavior
   * and later whole-settings saves cannot inherit an unsuccessful request.
   *
   * read/write callbacks intentionally support both top-level settings and
   * nested values such as LanguageConfig.hoverEnabled.
   */
  async setPersistedSettingState<T>(
    read: () => T,
    write: (value: T) => void,
    requested: T,
  ): Promise<PersistedSettingStateResult> {
    /*
     * H12 shares the same mutable whole-settings authority as H6, H8, and H9.
     * Enter the common boundary before applyPersistedSettingState() performs
     * its read so rollback state can only come from settled authority.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyPersistedSettingState({
        read,
        write,
        requested,
        save: () => this.saveSettings(),
      }),
    );
  }

  /**
   * Establish one requested cypher/inflection edit as persisted runtime
   * authority.
   *
   * Runtime cypher and inflection consumers read these LanguageConfig arrays
   * directly, so no linguistic inventory reload is needed. Persistence is the
   * authority boundary: a failed save restores the exact previously
   * authoritative arrays.
   *
   * The queue also prevents rapid H10 edits from racing each other. Crucially,
   * the edit callback is not applied until its queued turn begins, so its
   * detached candidate is cloned from the latest successfully settled state
   * rather than from potentially stale state captured while another save was
   * pending.
   *
   * UI callers must modify only the supplied candidate. They must not mutate
   * the captured live LanguageConfig before calling this method.
   */
  async setLinguisticRuleState(
    language: LanguageConfig,
    edit: (candidate: LinguisticRuleCandidate) => void,
  ): Promise<LinguisticRuleStateResult> {
    /*
     * H10 keeps its specialized queue because that queue owns delayed candidate
     * cloning, target reconciliation, and stable object identity across rapid
     * linguistic-rule edits.
     *
     * H13 adds the plugin-wide authority boundary outside that specialized
     * queue. The common queue must be acquired first so unrelated settings
     * transactions cannot begin while H10 has detached candidate arrays
     * provisionally installed for persistence.
     *
     * Lock order is therefore always:
     *
     *   settingsAuthorityQueue -> linguisticRuleStateQueue
     *
     * No production path acquires these queues in the reverse order.
     */
    return this.settingsAuthorityQueue.run(() =>
      this.linguisticRuleStateQueue.apply({
        state: language,
        edit,
        save: () => this.saveSettings(),
      }),
    );
  }

  /**
   * Establish the requested conlang case-matching policy as one authority
   * transaction.
   *
   * Case sensitivity is not merely a display preference. Dictionary headword,
   * declared-form, and phrase indexes are built using this setting, so changing
   * it requires both successful persistence and a successful linguistic reload.
   *
   * The pure transaction owns the safe rollback boundaries:
   *
   * - an initial save failure can restore memory because runtime was untouched;
   * - a preflight-blocked reload can restore and re-save the old setting because
   *   reloadActiveLanguage() guarantees that "blocked" occurs before indexes are
   *   replaced;
   * - an arbitrary thrown reload error is NOT rolled back, because replacement
   *   may already have started and restoring only the setting would falsely
   *   claim that the old runtime had also been restored.
   */
  async setCaseSensitiveMatchingState(
    caseSensitiveMatching: boolean,
  ): Promise<CaseSensitiveMatchingStateResult> {
    /*
     * Enter the common authority boundary before H9 reads the previous policy
     * or installs the requested one. The queue remains held through initial
     * persistence, runtime reload, and any safe rollback/compensating save
     * performed by the specialized case-sensitive transaction.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyCaseSensitiveMatchingState({
        state: this.settings,
        caseSensitiveMatching,
        save: () => this.saveSettings(),
        reload: () => this.reloadActiveLanguage(),
      }),
    );
  }

  /**
   * Establish a requested language-membership policy as one authority
   * transaction.
   *
   * Membership changes which creator-authored sources are accepted into the
   * active linguistic runtime, so persistence and reload must remain one
   * serialized authority operation.
   */
  async setLanguageMembershipState(
    languageMembership: ConlangSettings["languageMembership"],
  ): Promise<LanguageMembershipStateResult> {
    /*
     * Enter the common H13 boundary before the specialized transaction reads
     * previous membership state or installs its provisional replacement.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageMembershipState({
        state: this.settings,
        languageMembership,
        save: () => this.saveSettings(),
        reload: () => this.reloadActiveLanguage(),
      }),
    );
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
    /*
     * H3 must enter the common authority boundary before constructing its
     * transaction request. In particular, activeLanguages and the configured
     * language collection used by validation are shared settings authority.
     *
     * Holding the queue through validation, provisional source mutation,
     * persistence, runtime reload, and any safe rollback/compensating save
     * prevents another settings transaction from observing or restoring H3's
     * provisional source state as though it were settled authority.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageSourceState({
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
      }),
    );
  }

  /**
   * Commit one optional canonical Language Profile path through the shared H11
   * authority transaction.
   *
   * Profile identity participates in active linguistic runtime: morpheme,
   * example, and phonology inventories may receive the loaded profile's stable
   * language id. Persisting profilePath alone is therefore insufficient for an
   * active language. The transaction validates the requested profile before
   * mutation, persists it, and then requires active runtime to be re-established
   * before reporting success.
   *
   * Inactive languages have no profile-derived runtime state to synchronize, so
   * a valid persisted change can wait until normal activation performs the load.
   */
  async setLanguageProfileState(
    language: LanguageConfig,
    profilePath: string | undefined,
  ): Promise<LanguageProfileStateResult> {
    /*
     * H11 shares the same complete settings authority as the other migrated
     * transaction families. Enter the common boundary before the transaction
     * reads active-language state or captures the previous profile path.
     *
     * The queue remains held through validation, provisional profile mutation,
     * persistence, active-runtime reload, and any safe rollback/compensating
     * save. A second settings transaction therefore cannot adopt H11's
     * provisional profile path as settled rollback authority.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageProfileState({
        language,
        activeLanguages: this.settings.activeLanguages,
        profilePath,
        validate: () => validateLanguageProfilePath(this.app, profilePath),
        save: () => this.saveSettings(),
        reload: () => this.reloadActiveLanguage(),
      }),
    );
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

    /*
     * H13: acquire the plugin-wide settings-authority boundary before H7
     * performs its fresh plan, captures rollback state, or establishes folders.
     *
     * Root repair spans both vault structure and whole-settings persistence.
     * Holding the common queue around the complete specialized transaction
     * prevents another settings operation from changing shared authority after
     * H7 plans from it, persisting H7's provisional configuration, or capturing
     * that provisional state as its own rollback authority.
     *
     * language-root-repair-state.ts still owns all H7-specific semantics:
     * additive folder creation, configuration snapshots, persistence, reload,
     * and the limited safe rollback/compensating-save boundary.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageRootRepairState({
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
      }),
    );
  }

  /**
   * Remove one configured language as one serialized settings/runtime
   * authority transaction.
   *
   * H13 requires the common settings-authority queue to be acquired before we
   * even read the language identity that will be presented for confirmation.
   * The queue deliberately remains held while the creator decides. Otherwise a
   * different settings transaction could change the meaning of the pending
   * destructive decision underneath them.
   *
   * The specialized state module owns exact-object revalidation, settings
   * mutation, persistence, reload, and the limited safe rollback boundary.
   * This wrapper supplies only plugin services and cross-family serialization.
   *
   * Removal affects Workbench configuration only. No vault folder or
   * creator-authored file is deleted, renamed, or otherwise modified here.
   */
  async removeLanguageState(
    language: LanguageConfig,
    confirm: (name: string) => Promise<boolean>,
  ): Promise<LanguageRemovalStateResult> {
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageRemovalState({
        state: this.settings,
        language,
        confirm,
        save: () => this.saveSettings(),
        reload: () => this.reloadActiveLanguage(),
      }),
    );
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

    /*
     * H13: acquire the plugin-wide settings-authority boundary before H7
     * recalculates rename authority, captures rollback state, or moves the root.
     *
     * Rename crosses both vault structure and whole-settings persistence. The
     * common queue therefore remains held through the forward root move,
     * provisional identity/path changes, persistence, runtime reload, and any
     * authorized filesystem/settings compensation performed by the specialized
     * rename transaction.
     *
     * language-rename-state.ts continues to own all H7-specific rename and
     * rollback semantics; this wrapper adds only cross-family ordering.
     */
    return this.settingsAuthorityQueue.run(() =>
      applyLanguageRenameState({
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
      }),
    );
  }

  /**
   * Show a one-time welcome notice if this is the user's first time loading
   * the plugin. The notice points them at the ribbon icon and the panel —
   * Autumn flagged that the side panel was hard to discover.
   *
   * The flag persists in settings so the message only shows once per install.
   */
  private async maybeShowWelcome(): Promise<void> {
    /*
     * hasSeenWelcome is ordinary persisted settings authority. Although this
     * startup write is not triggered by a settings control, saveData() still
     * persists the complete settings object. It therefore must share H13's
     * common serialization boundary so it cannot capture another transaction's
     * provisional settings while that transaction is awaiting persistence,
     * reload, confirmation, or rollback.
     *
     * Use the same pure H12 persistence primitive as ordinary settings, but
     * retain this startup path's direct saveData() call. Unlike saveSettings(),
     * showing the welcome notice does not need to refresh panels, highlights,
     * or hover state merely because the one-time flag was persisted.
     */
    const result = await this.settingsAuthorityQueue.run(() =>
      applyPersistedSettingState({
        read: () => this.settings.hasSeenWelcome,
        write: (value) => {
          this.settings.hasSeenWelcome = value;
        },
        requested: true,
        save: () => this.saveData(this.settings),
      }),
    );

    if (result.status === "unchanged") {
      return;
    }

    if (result.status === "save-failed") {
      /*
       * Persistence did not establish the flag, so the H12 primitive restored
       * its previous in-memory value. Still show the welcome message for this
       * startup; a later startup may show it again if persistence continues to
       * fail rather than silently claiming that the notice was durably seen.
       */
      console.error(
        "Made Up Words: failed to persist the welcome-notice flag:",
        result.error,
      );
    }

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

  /**
   * Briefly tell the creator when they meaningfully switch to a source note
   * that currently has Workbench diagnostics.
   *
   * The current diagnostic model remains authoritative. This method only reads
   * that model and displays a Notice; it cannot edit the source note, change an
   * inventory, or repair malformed data.
   *
   * `file-open` can be emitted more than once while workspace state settles.
   * Remembering the currently notified diagnosed path prevents repeated Notices
   * for those duplicate events. Moving to any unaffected file clears that
   * suppression state so a later return to the diagnosed source is meaningful
   * again.
   */
  private maybeNotifyForDiagnosticFile(file: TFile | null): void {
    if (!(file instanceof TFile)) {
      this.lastNotifiedDiagnosticPath = null;
      return;
    }

    const group = this.getSourceDiagnostics().find(
      (candidate) => candidate.path === file.path,
    );

    if (!group) {
      this.lastNotifiedDiagnosticPath = null;
      return;
    }

    if (this.lastNotifiedDiagnosticPath === file.path) {
      return;
    }

    this.lastNotifiedDiagnosticPath = file.path;

    const issueCount = group.diagnostics.length;
    const diagnosticLabel =
      issueCount === 1 ? "diagnostic" : "diagnostics";

    new Notice(
      `Conlang Workbench: ${file.name} has ${issueCount} ${diagnosticLabel}.`,
      2000,
    );
  }

  /**
   * Return the current creator-facing diagnostics for recognized linguistic
   * source notes.
   *
   * Each inventory remains responsible for recognizing and parsing its own
   * source type. This accessor merely gathers the already-established source
   * records and passes them to the pure diagnostic aggregator.
   *
   * Inventory records are supplied twice on purpose:
   * - once in `records`, so parser/authority diagnostics become ordinary cards;
   * - once in separate document-type arrays, so cross-record identity checks
   *   cannot manufacture collisions between unrelated object types.
   *
   * Loaded Language Profiles are supplied separately because they are canonical
   * identity sources but do not use the ordinary WorkbenchSourceRecord adapters.
   * Their paths still produce ordinary navigable diagnostic cards.
   *
   * The aggregator deduplicates repeated diagnostics by Workbench source
   * identity. Nothing in this method grants authority to edit creator files.
   */
  getSourceDiagnostics(): SourceDiagnosticGroup[] {
    const dictionaryRecords = this.dictionary.allSourceRecords();
    const morphemeRecords = this.morphemes.allSourceRecords();
    const exampleRecords = this.linguisticExamples.allSourceRecords();
    const phonologyUnitRecords = this.phonology.allUnitSourceRecords();
    const phonologyRealizationRecords =
      this.phonology.allRealizationSourceRecords();

    return buildSourceDiagnosticGroups({
      records: [
        ...dictionaryRecords,
        ...morphemeRecords,
        ...exampleRecords,
        ...phonologyUnitRecords,
        ...phonologyRealizationRecords,
      ],
      languageProfiles: Array.from(this.languageProfiles.values()),
      dictionaryRecords,
      morphemeRecords,
      exampleRecords,
      phonologyUnitRecords,
      phonologyRealizationRecords,
    });
  }

  /**
   * Reload linguistic runtime state only from settled settings authority.
   *
   * H13 transactions temporarily install requested settings while persistence,
   * runtime reload, and possible rollback are still in progress. A manual,
   * event-driven, startup, or post-entry reload must not observe that
   * provisional state and rebuild runtime indexes from it.
   *
   * This wrapper therefore waits for the plugin-wide settings-authority queue
   * before calling the raw reload primitive.
   *
   * IMPORTANT: transaction modules that already hold settingsAuthorityQueue
   * must continue calling reloadActiveLanguage() directly. Calling this wrapper
   * from inside an existing settings-authority transaction would wait on the
   * transaction itself and deadlock.
   */
  async reloadSettledLanguageState(): Promise<
    { status: "loaded"; dictionaryCount: number } | { status: "blocked" }
  > {
    return this.settingsAuthorityQueue.run(() => this.reloadActiveLanguage());
  }

  async reloadActiveLanguage(): Promise<
    { status: "loaded"; dictionaryCount: number } | { status: "blocked" }
  > {
    /*
     * Source preflight remains the first authority boundary. A blocked request
     * must return before even detached runtime preparation begins.
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

    const active = this.getActiveLanguages();

    /*
     * Build the complete next runtime away from the live plugin.
     *
     * prepareLanguageRuntime() owns every asynchronous/fallible inventory load.
     * If profile or inventory preparation throws, this method exits before
     * commit and the previously settled live runtime remains intact.
     *
     * Each candidate inventory is a complete instance of its feature class.
     * We deliberately do not flatten or reconstruct its private indexes,
     * source records, phrase indexes, realization relationships, or other
     * derived state here.
     */
    const candidate = await prepareLanguageRuntime({
      app: this.app,
      activeLanguages: active,
      caseSensitiveMatching: this.settings.caseSensitiveMatching,
      languageMembership: this.settings.languageMembership,
    });

    this.commitLanguageRuntime(candidate);

    return {
      status: "loaded",
      dictionaryCount: candidate.dictionaryCount,
    };
  }

  /**
   * Install one completely prepared linguistic runtime.
   *
   * No source reads, awaits, persistence, or other fallible preparation belongs
   * inside this method. The candidate has already finished every such step, so
   * commit is a short synchronous replacement of runtime references.
   *
   * Inventories are replaced as whole objects rather than copied field by
   * field. That preserves the internal relationships and indexes each inventory
   * built for itself and prevents this coordinator from needing knowledge of
   * feature-private state.
   *
   * languageProfiles remains a stable Map because callers may retain the map
   * object itself. Its candidate contents are therefore copied synchronously
   * at the same commit boundary. Classification cache entries belong to the
   * previous runtime generation and are invalid only after the new generation
   * becomes authoritative.
   *
   * FUTURE CANONICAL RUNTIME MODULES:
   * A new active-language-dependent inventory must be added to
   * LanguageRuntimeCandidate, prepared before this method is called, and
   * installed here with the existing inventories. It must not introduce an
   * awaited or progressive live-state load into reloadActiveLanguage().
   */
  private commitLanguageRuntime(candidate: LanguageRuntimeCandidate): void {
    this.languageProfiles.clear();
    for (const [name, profile] of candidate.profiles) {
      this.languageProfiles.set(name, profile);
    }

    this.dictionary = candidate.dictionary;
    this.morphemes = candidate.morphemes;
    this.linguisticExamples = candidate.linguisticExamples;
    this.phonology = candidate.phonology;

    this.classifyCache.clear();
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
   * If `path` falls inside any canonical source folder belonging to an active
   * language, reload the settled linguistic state and refresh the UI.
   *
   * The vault/metadata watchers call this for edits and deletions. Rename events
   * call it once for the new path and once for the old path, so moving a source
   * into OR out of a watched canonical folder invalidates the loaded inventory.
   *
   * Keep the folder-membership decision in language-source-watch.ts rather than
   * duplicating the canonical source list here. That helper is deliberately
   * read-only: recognizing that runtime state is stale grants no authority to
   * modify the source note or its configuration.
   */
  private maybeReloadForPath(path: string) {
    if (!isWatchedLanguageSourcePath(path, this.getActiveLanguages())) return;

    // Debounced: metadataCache "changed" can fire repeatedly while a linguistic
    // source note is being edited, and each reload rebuilds the active language
    // inventories plus the dependent UI. Coalescing bursts keeps this responsive.
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
      await this.reloadSettledLanguageState();
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
    let portableIdsOmitted = 0;
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
        if (r.portableIdOmitted) portableIdsOmitted += 1;
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
    const portableIdNote =
      portableIdsOmitted > 0
        ? ` Portable lexeme ${portableIdsOmitted === 1 ? "ID was" : "IDs were"} omitted from ${portableIdsOmitted} ${portableIdsOmitted === 1 ? "entry" : "entries"} because ID generation is not compatible with this environment; ${portableIdsOmitted === 1 ? "it can" : "they can"} be added later with portable-ID backfill.`
        : "";

    if (errors.length > 0) {
      new Notice(
        `Made Up Words: ${created.length} saved, ${errors.length} failed — ${errors.join("; ")}${portableIdNote}`,
        9000,
      );
    } else {
      new Notice(
        `Made Up Words: saved ${created.length} ${created.length === 1 ? "entry" : "entries"}.${portableIdNote}`,
        portableIdsOmitted > 0 ? 9000 : 5000,
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
    | {
        ok: true;
        created: boolean;
        path: string;
        portableIdOmitted: boolean;
      }
    | { ok: false; error: string }
  > {
    const form = p.conlangForm.trim();
    if (!form) return { ok: false, error: "empty conlang form" };

    const result = await writeDictionaryEntry({
      app: this.app,
      form,
      definition: p.englishText,
      partOfSpeech: p.partOfSpeech,
      dictionaryFolder: p.lang.dictionaryFolder,
      includePortableIds: p.lang.includePortableIds ?? false,

      // The writer decides whether a same-spelling lexical source requires a
      // homograph. This creation flow retains authority over exactly which
      // metadata and body belong to its note; the shared renderer only encodes
      // those already-decided values safely as YAML + Markdown.
      buildContent: ({ wordOverride, lexemeId }) =>
        renderMarkdownNote({
          frontmatter: {
            ...(wordOverride ? { word: form } : {}),
            ...(lexemeId ? { lexeme_id: lexemeId } : {}),
            definition: p.englishText,
            language: p.lang.name,
            ...(p.partOfSpeech ? { partOfSpeech: p.partOfSpeech } : {}),
          },
          blankFrontmatter: p.partOfSpeech
            ? ["ipa", "etymology"]
            : ["partOfSpeech", "ipa", "etymology"],
          body: [
            "",
            `# ${form}`,
            "",
            `Translates *${p.englishText}*.`,
            "",
          ].join("\n"),
        }),
    });

    if (result.status === "created") {
      await this.waitForFrontmatter(result.file);

      return {
        ok: true,
        created: true,
        path: result.path,
        portableIdOmitted: result.portableIdOmitted,
      };
    }

    if (result.status === "existing") {
      return {
        ok: true,
        created: false,
        path: result.path,
        portableIdOmitted: false,
      };
    }

    return { ok: false, error: result.error };
  }

  /** Reload the dictionary + refresh UI after entries were added/changed. */
  private async afterEntriesChanged() {
    await this.reloadSettledLanguageState();
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
      includePortableIds: lang.includePortableIds ?? false,

      // Keep this command's established linguistic/document template here.
      // Vocabulary repair retains authority over exactly which metadata and
      // explanatory body this translation workflow may create. The persistence
      // writer owns whether/where creation is safe, while the shared renderer
      // only encodes these already-authorized values as YAML + Markdown.
      buildContent: ({ wordOverride, lexemeId }) =>
        renderMarkdownNote({
          frontmatter: {
            ...(wordOverride ? { word: translated } : {}),
            ...(lexemeId ? { lexeme_id: lexemeId } : {}),
            definition: englishText,
            language: lang.name,
            ...(opts.partOfSpeech ? { partOfSpeech: opts.partOfSpeech } : {}),
          },
          blankFrontmatter: opts.partOfSpeech
            ? ["ipa", "etymology"]
            : ["partOfSpeech", "ipa", "etymology"],
          body: [
            "",
            `# ${translated}`,
            "",
            `Translates *${englishText}*.`,
            "",
          ].join("\n"),
        }),
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
    await this.reloadSettledLanguageState();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;

    const isActive = this.settings.activeLanguages.includes(lang.name);
    const senseNote = result.wordOverride
      ? " as a new sense of an existing word"
      : "";

    const portableIdNote = result.portableIdOmitted
      ? " Portable lexeme ID omitted because ID generation is not compatible with this environment; it can be added later with portable-ID backfill."
      : "";

    new Notice(
      (isActive
        ? `Made Up Words: created "${translated}" in ${lang.name}${senseNote}`
        : `Made Up Words: created "${translated}" in ${lang.name}${senseNote} (inactive — activate it to see hover/highlight)`) +
        portableIdNote,
      result.portableIdOmitted ? 9000 : undefined,
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

    const portableIdNote = writeResult.portableIdOmitted
      ? " Portable lexeme ID omitted because ID generation is not compatible with this environment; it can be added later with portable-ID backfill."
      : "";

    new Notice(
      (writeResult.wordOverride
        ? `Conlang: added "${result.conlangWord}" as a new sense of an existing word`
        : `Conlang: added "${result.conlangWord}"`) + portableIdNote,
      writeResult.portableIdOmitted ? 9000 : undefined,
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
      includePortableIds: lang.includePortableIds ?? false,

      // The writer owns persistence safety, while this callback owns the
      // ordinary-word Markdown schema. Keeping those responsibilities separate
      // lets names and other lexical source types retain their own metadata.
      //
      // An omitted part of speech deliberately remains a visible blank
      // `partOfSpeech:` prompt. A supplied value instead belongs to semantic
      // frontmatter and must be serialized safely as the creator's string.
      buildContent: ({ wordOverride, lexemeId }) =>
        renderMarkdownNote({
          frontmatter: {
            ...(wordOverride ? { word: result.conlangWord } : {}),
            ...(lexemeId ? { lexeme_id: lexemeId } : {}),
            definition: result.englishDefinition,
            language: lang.name,
            ...(result.partOfSpeech
              ? { partOfSpeech: result.partOfSpeech }
              : {}),
          },
          blankFrontmatter: result.partOfSpeech
            ? ["ipa", "etymology"]
            : ["partOfSpeech", "ipa", "etymology"],
          body: ["", `# ${result.conlangWord}`, "", ""].join("\n"),
        }),
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
      includePortableIds: lang.includePortableIds ?? false,

      // Keep Name-specific metadata and body layout in the Name command. The
      // shared writer owns only persistence safety and tells us whether the
      // generated note needs an explicit spelling override. The renderer has
      // no authority to infer Name metadata or merge this policy with ordinary
      // lexical-entry creation.
      //
      // An exactly empty category preserves the existing visible
      // `nameCategory:` placeholder. Any nonempty creator value is semantic
      // frontmatter and is serialized without interpreting YAML-like text.
      buildContent: ({ wordOverride, lexemeId }) =>
        renderMarkdownNote({
          frontmatter: {
            ...(wordOverride ? { word: result.conlangForm } : {}),
            ...(lexemeId ? { lexeme_id: lexemeId } : {}),
            definition: referent,
            language: lang.name,
            partOfSpeech: "proper-noun",
            ...(result.category ? { nameCategory: result.category } : {}),
          },
          blankFrontmatter: result.category
            ? ["ipa", "etymology"]
            : ["nameCategory", "ipa", "etymology"],
          body: [
            "",
            `# ${result.conlangForm}`,
            "",
            // Empty placeholder paragraph — the user fills this in to describe
            // who/what this name refers to in their world. Dictionary uses it
            // as the body preview on hover.
            "",
          ].join("\n"),
        }),
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
    await this.reloadSettledLanguageState();
    this.refreshPanel();
    this.refreshHighlights();
    this.lastHoverWord = null;

    new Notice(
      `Conlang: created name "${result.conlangForm}"` +
        (writeResult.portableIdOmitted
          ? ". Portable lexeme ID omitted because ID generation is not compatible with this environment; it can be added later with portable-ID backfill."
          : ""),
      writeResult.portableIdOmitted ? 9000 : undefined,
    );
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
