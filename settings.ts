// Settings tab: manage languages, dictionary folders, cypher sheets, and
// inflection rules, plus global hover / highlighting / translation behaviour.
//
// Layout (v0.16): global behaviour is grouped into labelled sections, and each
// language is a collapsible card (with its cypher sheets and inflection rules
// as nested collapsibles) so the page stays manageable with many languages.
// Expand/collapse state is preserved across the full-tab re-renders that most
// edits trigger.

import {
  App,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  TFolder,
} from "obsidian";
import type ConlangPlugin from "./main";
import {
  ConlangSettings,
  CypherSheet,
  HashType,
  LanguageConfig,
} from "./types";
import { INFLECTION_PRESETS, findPreset } from "./presets";
import { validateLanguageRename } from "./language-identity";
import {
  confirmLanguageRename,
  showLanguageRenameBlocked,
} from "./language-rename-modal";
import { chooseLanguageRootAction } from "./language-root-action";
import { confirmLanguageRootRecreation } from "./language-root-recreation-modal";
import { confirmDeletion } from "./delete-confirm-modal";
import { choosePortableIdsForNewLanguage } from "./portable-id-choice-modal";
import type { CanonicalFolderSetting } from "./language-source-state";
import { LinguisticRuleTargetMissingError } from "./linguistic-rule-state";

export class ConlangSettingTab extends PluginSettingTab {
  plugin: ConlangPlugin;

  // Persist expand/collapse state across re-renders, keyed by language name.
  private openCards = new Set<string>();
  private openSheets = new Set<string>();
  private openInflections = new Set<string>();

  constructor(app: App, plugin: ConlangPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * Obsidian's entry point into this tab. Kept as a thin wrapper so that the
   * ~15 internal "something changed, redraw" callers go through `rerender()`
   * instead of calling `display()` on themselves.
   *
   * That indirection is deliberate: `PluginSettingTab.display` is marked
   * deprecated as of Obsidian 1.13.0 in favour of `getSettingDefinitions`,
   * but this plugin's `minAppVersion` is 1.7.2 and the new API doesn't exist
   * there. Overriding `display` is still the only way to support 1.7.2, so we
   * keep the override and simply stop referencing the deprecated symbol from
   * our own code.
   */
  display(): void {
    this.rerender();
  }

  /**
   * Build (or rebuild) the whole settings pane while preserving its position.
   *
   * Most settings changes redraw this entire container. `empty()` removes the
   * previous contents and would otherwise leave the user back at the top of a
   * long settings page after adding, deleting, reordering, or editing an item.
   *
   * Preserve the current pixel position across the rebuild. If the new page is
   * shorter (for example after deleting a large section), clamp the old value
   * to the highest scroll position that still exists.
   */
  private rerender(): void {
    const { containerEl } = this;
    const previousScrollTop = containerEl.scrollTop;

    containerEl.empty();
    containerEl.addClass("conlang-settings");

    this.renderLanguageOverview(containerEl);
    this.renderHoverSection(containerEl);
    this.renderHighlightSection(containerEl);
    this.renderMatchingSection(containerEl);
    this.renderTranslationSection(containerEl);

    new Setting(containerEl).setName("Individual languages").setHeading();
    containerEl.createEl("p", {
      cls: "conlang-help",
      text:
        "Each language is a card below. Expand one to edit its dictionary " +
        "folder, cypher sheets, and inflection rules.",
    });
    for (let i = 0; i < this.plugin.settings.languages.length; i++) {
      this.renderLanguageCard(containerEl, this.plugin.settings.languages[i]);
    }

    const maximumScrollTop = Math.max(
      0,
      containerEl.scrollHeight - containerEl.clientHeight,
    );
    containerEl.scrollTop = Math.min(previousScrollTop, maximumScrollTop);
  }

  // ===== Top overview =====

  private renderLanguageOverview(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Languages").setHeading();
    new Setting(containerEl)
      .setName("Active languages")
      .setDesc(
        "Active languages contribute to hover, lookup, dictionary browsing, " +
          "and highlighting. Tick to activate; click the star to set the primary.",
      );

    new Setting(containerEl)
      .setName("Language membership")
      .setDesc(
        "Configured folders is recommended: canonical source folders determine " +
          "runtime membership and existing `language:` metadata is left untouched. " +
          "Respect explicit metadata preserves the older behavior and rejects a " +
          "source whose `language:` value conflicts with its configured language.",
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("folder", "Configured folders (recommended)");
        dropdown.addOption(
          "respect-explicit",
          "Respect explicit language metadata",
        );
        dropdown.setValue(this.plugin.settings.languageMembership);
        dropdown.onChange(async (value) => {
          const requestedMembership =
            value as ConlangSettings["languageMembership"];

          /*
           * Membership controls which creator-authored sources are accepted
           * into active runtime indexes. Delegate the complete authority
           * transaction to the plugin so previous-state capture, persistence,
           * reload, and any safe rollback all remain inside the shared H13
           * serialization boundary.
           */
          const result =
            await this.plugin.setLanguageMembershipState(requestedMembership);

          if (result.status === "applied") {
            /*
             * The requested policy and replacement runtime indexes are both
             * established. Preserve the existing membership-setting behavior
             * by refreshing consumers and rebuilding this settings view.
             */
            this.plugin.refreshPanel();
            this.plugin.refreshHighlights();
            this.rerender();
            return;
          }

          if (result.status === "unchanged") {
            return;
          }

          if (result.status === "save-failed") {
            new Notice(
              "Made Up Words: could not save the language membership change.",
            );
            this.rerender();
            return;
          }

          if (result.status === "blocked") {
            new Notice(
              "Made Up Words: language membership was restored because reload was blocked.",
            );
            this.rerender();
            return;
          }

          if (result.status === "rollback-save-failed") {
            new Notice(
              "Made Up Words: the previous membership setting was restored in memory, " +
                "but the rollback could not be saved. Review settings before restarting Obsidian.",
            );
            this.rerender();
            return;
          }

          /*
           * Detached runtime preparation failed before anything was committed.
           * The transaction restored and re-persisted the previous membership
           * policy, which still matches the authoritative runtime indexes.
           */
          console.error(
            "Made Up Words: language membership reload failed; previous membership was restored",
            result.error,
          );
          new Notice(
            "Made Up Words: language membership reload failed; the previous membership setting was restored. " +
              "See the developer console.",
          );
          this.rerender();
        });
      });

    const list = containerEl.createDiv({ cls: "conlang-lang-overview" });
    for (const lang of this.plugin.settings.languages) {
      const isActive = this.plugin.settings.activeLanguages.includes(lang.name);
      const isPrimary = this.plugin.settings.primaryLanguage === lang.name;
      const row = list.createDiv({ cls: "conlang-lang-overview-row" });

      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = isActive;
      cb.addEventListener("change", () => {
        void this.toggleActive(lang.name, cb.checked).then(() =>
          this.rerender(),
        );
      });

      const star = row.createSpan({
        cls: "conlang-lang-overview-star" + (isPrimary ? " is-primary" : ""),
        text: isPrimary ? "★" : "☆",
      });
      star.setAttribute("aria-label", "Set as primary language");
      star.addEventListener("click", () => {
        void (async () => {
          if (!this.plugin.settings.activeLanguages.includes(lang.name)) {
            /*
             * Clicking the star on an inactive language means "activate it,
             * then make it primary." Do not perform the second mutation unless
             * the activation transaction actually established that language in
             * runtime authority.
             */
            const activated = await this.toggleActive(lang.name, true);
            if (!activated) {
              this.rerender();
              return;
            }
          }

          const result = await this.plugin.setPrimaryLanguageState(lang.name);

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
           * Always redraw from the state the transaction actually established.
           * On save failure that is the safely restored previous primary.
           */
          this.rerender();
        })();
      });

      const name = row.createSpan({
        cls: "conlang-lang-overview-name",
        text: lang.name,
      });
      name.addEventListener("click", () => cb.click());

      if (isPrimary) {
        row.createSpan({
          cls: "conlang-badge conlang-badge-primary",
          text: "primary",
        });
      } else if (isActive) {
        row.createSpan({
          cls: "conlang-badge conlang-badge-active",
          text: "active",
        });
      } else {
        row.createSpan({ cls: "conlang-badge", text: "inactive" });
      }
    }

    new Setting(containerEl)
      .addButton((btn) =>
        btn
          .setButtonText("Add language")
          .setCta()
          .onClick(async () => {
            /*
             * Portable linguistic IDs are recommended for new languages, but
             * they remain a creator choice. Ask before entering the H13
             * settings transaction so the queue is never held open while
             * waiting for human input.
             *
             * The modal owns presentation only. It cannot choose a language
             * name, inspect settings authority, or mutate the vault.
             */
            const includePortableIds = await choosePortableIdsForNewLanguage(
              this.app,
            );

            if (includePortableIds === null) {
              return;
            }

            /*
             * The plugin owns the complete H13 authority transaction. Settings
             * passes only the already-resolved boolean choice, so no
             * provisional language mutation can escape the shared
             * serialization boundary through this UI.
             */
            const result =
              await this.plugin.createLanguageState(includePortableIds);

            if (result.status === "blocked" || result.status === "failed") {
              new Notice(`Could not add "${result.name}": ${result.error}`);
              return;
            }

            if (result.status === "save-failed") {
              const message =
                result.error instanceof Error
                  ? result.error.message
                  : String(result.error);

              /*
               * The H5 creator has already established additive vault
               * structure. A settings-save failure restores only the exact
               * LanguageConfig inserted by this transaction; those folders are
               * deliberately preserved because creator data may exist there.
               */
              new Notice(
                `Created folders for "${result.name}", but could not save ` +
                  `the language configuration: ${message}`,
              );
              return;
            }

            /*
             * Preserve the existing UI behavior: a newly added language card
             * opens after successful persistence, but the language is not
             * automatically activated or made primary.
             */
            this.openCards.add(result.name);
            this.rerender();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Reload dictionaries").onClick(async () => {
          const result = await this.plugin.reloadSettledLanguageState();
          if (result.status === "blocked") return;

          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
          new Notice(
            `Made Up Words: loaded ${result.dictionaryCount} dictionary entries`,
          );
        }),
      );
  }

  /**
   * Request an active-language change without committing it directly.
   *
   * Settings owns the UI policy: it decides which languages should be active
   * and which active language should remain primary. The plugin-level
   * transaction owns persistence, runtime establishment, and safe rollback when
   * source preflight rejects the requested authority.
   *
   * Returning true only when the requested state was actually established lets
   * callers stop follow-up mutations such as "activate, then make primary".
   */
  private async toggleActive(name: string, active: boolean): Promise<boolean> {
    const current = new Set(this.plugin.settings.activeLanguages);

    if (active) {
      current.add(name);
    } else {
      current.delete(name);
    }

    /*
     * Refuse to deactivate the final active language without transiently
     * changing settings. The previous implementation removed it and then added
     * it back; calculating the requested state first is simpler and safer.
     */
    if (current.size === 0) {
      new Notice("Made Up Words: at least one language must stay active.");
      return false;
    }

    const activeLanguages = Array.from(current);
    const primaryLanguage = activeLanguages.includes(
      this.plugin.settings.primaryLanguage,
    )
      ? this.plugin.settings.primaryLanguage
      : activeLanguages[0];

    const result = await this.plugin.setActiveLanguageState(
      activeLanguages,
      primaryLanguage,
    );

    switch (result.status) {
      case "applied":
        return true;

      case "blocked":
        /*
         * reloadActiveLanguage() already displayed the source diagnostics.
         * The shared transaction has restored and persisted the configuration
         * matching the untouched previous runtime.
         */
        return false;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save active-language change:",
          result.error,
        );
        new Notice(
          "Made Up Words: could not save the active-language change; the previous selection was restored.",
        );
        return false;

      case "rollback-save-failed":
        console.error(
          "Made Up Words: failed to persist active-language rollback:",
          result.error,
        );
        new Notice(
          "Made Up Words: the previous language selection was restored in memory, but the rollback could not be saved. Check the developer console.",
        );
        return false;

      case "reload-failed":
        console.error(
          "Made Up Words: active-language reload failed; previous selection was restored:",
          result.error,
        );
        new Notice(
          "Made Up Words: language data failed to reload; the previous language selection was restored. Check the developer console.",
        );
        return false;

      case "invalid-request":
        console.error(
          "Made Up Words: rejected invalid active-language request:",
          result.error,
        );
        new Notice(`Made Up Words: ${result.error}.`);
        return false;
    }
  }

  /**
   * Commit one canonical language-source setting through the shared H7
   * transaction rather than mutating LanguageConfig directly from the UI.
   *
   * Returning true means the requested source configuration was established.
   * Returning false means the caller should refresh its displayed value from
   * the LanguageConfig object, because the transaction may have restored the
   * previous source or may have retained the requested source after a reload
   * exception where rollback is no longer known to be safe.
   */
  private async commitLanguageSource(
    lang: LanguageConfig,
    setting: CanonicalFolderSetting,
    value: string | undefined,
  ): Promise<boolean> {
    const result = await this.plugin.setLanguageSourceState(
      lang,
      setting,
      value,
    );

    switch (result.status) {
      case "applied":
        return true;

      case "blocked":
        /*
         * H3 source preflight already displayed detailed diagnostics. Because
         * that gate runs before runtime replacement begins, the transaction has
         * safely restored and persisted the previous source configuration.
         */
        return false;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save language-source change:",
          result.error,
        );
        new Notice(
          "Made Up Words: could not save the language-source change; the previous source was restored.",
        );
        return false;

      case "rollback-save-failed":
        console.error(
          "Made Up Words: failed to persist language-source rollback:",
          result.error,
        );
        new Notice(
          "Made Up Words: the previous source was restored in memory, but the rollback could not be saved. Check the developer console.",
        );
        return false;

      case "reload-failed":
        /*
         * Detached candidate preparation failed before runtime commit. The
         * transaction has restored and re-persisted the previous canonical
         * source, which still describes the authoritative runtime.
         */
        console.error(
          "Made Up Words: language-source reload failed; previous source was restored:",
          result.error,
        );
        new Notice(
          "Made Up Words: language data failed to reload; the previous source was restored. Check the developer console.",
        );
        return false;

      case "invalid-request":
        console.error(
          "Made Up Words: rejected invalid language-source request:",
          result.error,
        );
        new Notice(`Made Up Words: ${result.error}.`);
        return false;
    }
  }

  /**
   * Commit one optional Language Profile path through the H11 authority
   * transaction instead of mutating LanguageConfig directly from this control.
   *
   * The helper deliberately mirrors the established H7 source-change reporting:
   * a blocked reload is already explained by H3 diagnostics, while either
   * preflight blocking or detached candidate-preparation failure leaves old
   * runtime authoritative and allows the previous path to be restored.
   */
  private async commitLanguageProfile(
    lang: LanguageConfig,
    profilePath: string | undefined,
  ): Promise<boolean> {
    const result = await this.plugin.setLanguageProfileState(lang, profilePath);

    switch (result.status) {
      case "applied":
        return true;

      case "blocked":
        /*
         * H3 preflight stopped the reload before profile/inventory replacement.
         * The transaction has therefore safely restored and re-persisted the
         * previous profile path.
         */
        return false;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save language-profile change:",
          result.error,
        );
        new Notice(
          "Made Up Words: could not save the language-profile change; the previous profile path was restored.",
        );
        return false;

      case "rollback-save-failed":
        console.error(
          "Made Up Words: failed to persist language-profile rollback:",
          result.error,
        );
        new Notice(
          "Made Up Words: the previous profile path was restored in memory, but the rollback could not be saved. Check the developer console.",
        );
        return false;

      case "reload-failed":
        /*
         * Detached candidate preparation failed before runtime commit. The
         * transaction has restored and re-persisted the previous profile path,
         * which still matches the authoritative profile-derived runtime.
         */
        console.error(
          "Made Up Words: language-profile reload failed; previous profile path was restored:",
          result.error,
        );
        new Notice(
          "Made Up Words: language data failed to reload; the previous profile path was restored. Check the developer console.",
        );
        return false;

      case "invalid-request":
        console.error(
          "Made Up Words: rejected invalid language-profile request:",
          result.error,
        );
        new Notice(`Made Up Words: ${result.error}`);
        return false;
    }
  }

  /**
   * Run an explicit structural repair for one language's already-established
   * root.
   *
   * Repair is deliberately not a folder picker. It may restore the standard
   * direct-child folders and canonical source configuration inside a root this
   * exact language already owns, but it may not adopt an unrelated existing
   * Languages/<root> folder. Adoption belongs to the separate future Import
   * Language authority path.
   *
   * The transaction reports whether additive folder work, persistence, and
   * active runtime establishment succeeded. Created folders are never deleted
   * merely because a later save or reload step failed.
   */
  private async repairLanguageRoot(lang: LanguageConfig): Promise<void> {
    const rootFolder = lang.rootFolder;

    if (!rootFolder) {
      new Notice(
        "Made Up Words: this language has no established Languages/<root> ownership boundary. It cannot be repaired automatically.",
      );
      return;
    }

    const wasActive = this.plugin.settings.activeLanguages.includes(lang.name);
    const result = await this.plugin.repairLanguageRoot(lang, rootFolder);

    switch (result.status) {
      case "applied":
        /*
         * An active repair has also established the corresponding runtime data.
         * Inactive repairs stop after persistence; their data will be loaded
         * through the normal H3 preflight if the language is later activated.
         */
        if (wasActive) {
          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
        }

        this.rerender();

        new Notice(
          wasActive
            ? `Made Up Words: repaired "${lang.name}" and reloaded ${result.dictionaryCount ?? 0} dictionary entries across active languages.`
            : `Made Up Words: repaired "${lang.name}". It remains inactive.`,
        );
        return;

      case "blocked":
        /*
         * Planner rejection happens before folder or configuration mutation.
         * Surface its exact fail-closed reason rather than replacing it with a
         * generic repair error.
         */
        new Notice(`Made Up Words: ${result.detail}`);
        return;

      case "folder-creation-failed":
        /*
         * Configuration is still unchanged here. Folder creation is additive,
         * however, so folders successfully established before the failure may
         * remain in the vault and must not be deleted automatically.
         */
        console.error(
          "Made Up Words: language-root folder establishment failed:",
          result.error,
        );
        new Notice(
          "Made Up Words: language-root repair could not establish all required folders. Configuration was not changed; any folders already created were preserved. Check the developer console.",
        );
        this.rerender();
        return;

      case "save-failed":
        console.error(
          "Made Up Words: failed to save language-root repair:",
          result.error,
        );
        new Notice(
          "Made Up Words: the repaired configuration could not be saved and was restored in memory. Additively created folders were preserved.",
        );
        this.rerender();
        return;

      case "reload-blocked":
        /*
         * H3 blocked before runtime replacement began, so the transaction could
         * safely restore and persist the previous configuration. Additive folder
         * creation remains intentionally preserved.
         *
         * reloadActiveLanguage() already displayed the detailed H3 diagnostic.
         */
        new Notice(
          "Made Up Words: language-root repair was cancelled because the repaired sources could not be safely loaded. The previous configuration was restored; any created folders were preserved.",
        );
        this.rerender();
        return;

      case "rollback-save-failed":
        console.error(
          "Made Up Words: failed to persist language-root repair rollback:",
          result.error,
        );
        new Notice(
          "Made Up Words: the previous language-root configuration was restored in memory, but the rollback could not be saved. Created folders were preserved. Review settings before restarting the app.",
        );
        this.rerender();
        return;

      case "reload-failed":
        /*
         * Detached runtime preparation failed before commit. The transaction
         * restored and re-persisted the previous repair-owned configuration,
         * while preserving the additively established folders.
         */
        console.error(
          "Made Up Words: language-root reload failed; previous configuration was restored:",
          result.error,
        );
        new Notice(
          "Made Up Words: language data failed to reload; the previous language-root configuration was restored. Created folders were preserved. Check the developer console.",
        );
        this.rerender();
        return;
    }
  }

  /**
   * Ask the creator to explicitly recreate one configured language root that
   * is currently missing.
   *
   * This settings-layer method owns presentation only. The plugin transaction
   * holds the shared settings-authority queue, calculates the planner twice,
   * revalidates the exact LanguageConfig after confirmation, performs the full
   * hierarchy preflight, and delegates the final root race to the specialized
   * writer.
   *
   * Recreate does not search for, move, adopt, or delete creator-authored data.
   * It creates a new canonical root only at the already-configured location.
   */
  private async recreateLanguageRoot(lang: LanguageConfig): Promise<void> {
    const wasActive = this.plugin.settings.activeLanguages.includes(lang.name);

    const result = await this.plugin.recreateLanguageRoot(
      lang,
      (approvedName, approvedRoot) =>
        confirmLanguageRootRecreation(this.app, approvedName, approvedRoot),
    );

    switch (result.status) {
      case "cancelled":
        return;

      case "target-missing":
        new Notice(
          "Made Up Words: the language is no longer configured, so its root was not recreated.",
        );
        this.rerender();
        return;

      case "target-changed":
        new Notice(
          "Made Up Words: the language changed while root recreation confirmation was open. No root was recreated.",
        );
        this.rerender();
        return;

      case "blocked":
        /*
         * Planner, hierarchy-preflight, and final filesystem race failures all
         * preserve their precise explanation. Rerender as well because a common
         * race outcome is that the root appeared while confirmation was open;
         * in that case Repair should become the visible action immediately.
         */
        new Notice(`Made Up Words: ${result.detail}`);
        this.rerender();
        return;

      case "root-establishment-failed":
        /*
         * The specialized writer could not positively establish this
         * transaction's ownership boundary. No child-folder authority was
         * granted, so do not imply that Repair can safely continue from here.
         */
        console.error(
          "Made Up Words: language-root recreation failed before root establishment:",
          result.error,
        );
        new Notice(
          "Made Up Words: the language root could not be safely recreated. No child folders were established by this operation. Check the developer console.",
        );
        this.rerender();
        return;

      case "folder-establishment-failed":
        /*
         * Root ownership was positively established before additive child
         * creation began. Some canonical children may therefore exist already.
         * Preserve them and direct the creator to ordinary Repair, whose
         * authority starts from an existing configured root.
         */
        console.error(
          "Made Up Words: recreated language root but could not establish all canonical child folders:",
          result.error,
        );
        new Notice(
          "Made Up Words: the language root was recreated, but not all standard folders could be established. Existing folders were preserved; use Repair language root to finish restoring the structure.",
        );
        this.rerender();
        return;

      case "reload-blocked":
        /*
         * Physical recreation succeeded, but H3 source preflight refused to
         * replace the active runtime. Settings never changed and the previous
         * runtime remains authoritative.
         */
        new Notice(
          "Made Up Words: the language root and standard folders were recreated, but the active language data could not be safely reloaded. The previous runtime remains in use.",
        );
        this.rerender();
        return;

      case "reload-failed":
        console.error(
          "Made Up Words: recreated language root but active runtime reload failed:",
          result.error,
        );
        new Notice(
          "Made Up Words: the language root and standard folders were recreated, but language data failed to reload. The previous runtime remains in use. Check the developer console.",
        );
        this.rerender();
        return;

      case "applied":
        /*
         * Active recreation also established replacement runtime inventories.
         * Inactive languages intentionally stop after physical structure is
         * recreated and will load normally if activated later.
         */
        if (wasActive) {
          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
        }

        this.rerender();

        new Notice(
          wasActive
            ? `Made Up Words: recreated "${result.name}" and reloaded ${result.dictionaryCount ?? 0} dictionary entries across active languages.`
            : `Made Up Words: recreated the language root for "${result.name}". It remains inactive.`,
        );
        return;
    }
  }

  // ===== Behaviour sections =====

  private renderHoverSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Hover tooltips").setHeading();
    new Setting(containerEl)
      .setName("Hover modifier key")
      .setDesc(
        "Hold this key while hovering to see translation tooltips. " +
          "'None' shows a tooltip on any hover. Hover can also be turned off " +
          "per language in each card below.",
      )
      .addDropdown((dd) => {
        dd.addOption("none", "None (always show)");
        dd.addOption("shift", "Shift");
        dd.addOption("alt", "Alt / Option");
        dd.addOption("ctrl", "Ctrl / Cmd");
        dd.setValue(this.plugin.settings.hoverModifier);
        dd.onChange(async (value) => {
          const requested = value as ConlangSettings["hoverModifier"];
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.hoverModifier,
            (next) => {
              this.plugin.settings.hoverModifier = next;
            },
            requested,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save hover modifier preference",
              result.error,
            );
            new Notice("Made Up Words: could not save the hover modifier.");
            this.rerender();
          }
        });
      });

    new Setting(containerEl)
      .setName("Show your words' meanings")
      .setDesc(
        "Hovering one of your made-up words shows its dictionary entry. Covers " +
          "headwords, phrases, declared forms, and inflected forms.",
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.hoverConlang).onChange(async (v) => {
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.hoverConlang,
            (next) => {
              this.plugin.settings.hoverConlang = next;
            },
            v,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save conlang-hover preference",
              result.error,
            );
            new Notice("Made Up Words: could not save the hover change.");
            this.rerender();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Show English to conlang translations")
      .setDesc(
        "Hovering an English word shows the conlang words that mean it. Turn " +
          "this off if your made-up words are being mistaken for English. It " +
          "also switches off the cypher preview below, which transforms hovered " +
          "text the same way. A word that's already one of your headwords is " +
          "never treated as English, whichever way this is set.",
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.hoverEnglish).onChange(async (v) => {
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.hoverEnglish,
            (next) => {
              this.plugin.settings.hoverEnglish = next;
            },
            v,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save English-hover preference",
              result.error,
            );
            new Notice("Made Up Words: could not save the hover change.");
          }

          /*
           * Redraw after either outcome. On success this updates the fallback
           * control's enabled state; on failure it restores the visible toggle
           * to the previous authoritative setting.
           */
          this.rerender();
        }),
      );

    new Setting(containerEl)
      .setName("Fallback for unknown words")
      .setDesc(
        "What to show when you hover a word that isn't in the dictionary. " +
          "'Cypher preview' shows a phonological placeholder; 'Nothing' shows no tooltip. " +
          "The cypher preview is an English to conlang transformation, so this " +
          "only applies while that direction is on.",
      )
      .addDropdown((dd) => {
        dd.addOption("cypher", "Cypher preview");
        dd.addOption("nothing", "Nothing");
        dd.setValue(this.plugin.settings.hoverFallback);
        dd.setDisabled(!this.plugin.settings.hoverEnglish);
        dd.onChange(async (value) => {
          const requested = value as ConlangSettings["hoverFallback"];
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.hoverFallback,
            (next) => {
              this.plugin.settings.hoverFallback = next;
            },
            requested,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save hover fallback preference",
              result.error,
            );
            new Notice("Made Up Words: could not save the hover fallback.");
            this.rerender();
          }
        });
      });
  }

  private renderHighlightSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Highlighting").setHeading();
    new Setting(containerEl)
      .setName("Highlight known words in notes")
      .setDesc(
        "Visually mark recognised words in both the editor and Reading view.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.highlightKnownWords)
          .onChange(async (v) => {
            const result = await this.plugin.setPersistedSettingState(
              () => this.plugin.settings.highlightKnownWords,
              (next) => {
                this.plugin.settings.highlightKnownWords = next;
              },
              v,
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to save highlighting preference",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the highlighting change.",
              );
            }

            /*
             * The master toggle controls whether the subordinate highlight
             * settings are rendered, so redraw after both success and rollback.
             */
            this.rerender();
          }),
      );

    if (!this.plugin.settings.highlightKnownWords) return;

    new Setting(containerEl)
      .setName("Highlight style")
      .setDesc(
        "How highlighted words look. Themeable via the .conlang-known-word CSS class.",
      )
      .addDropdown((dd) => {
        dd.addOption("underline", "Dotted underline + colour");
        dd.addOption("italic", "Italics");
        dd.addOption("background", "Background highlight");
        dd.setValue(this.plugin.settings.highlightStyle);
        dd.onChange(async (value) => {
          const requested = value as ConlangSettings["highlightStyle"];
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.highlightStyle,
            (next) => {
              this.plugin.settings.highlightStyle = next;
            },
            requested,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save highlight style preference",
              result.error,
            );
            new Notice("Made Up Words: could not save the highlight style.");
            this.rerender();
          }
        });
      });

    new Setting(containerEl)
      .setName("Highlight conlang words")
      .setDesc(
        "Mark words that exist as dictionary entries (including inflected forms and phrases).",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.highlightConlang)
          .onChange(async (v) => {
            const result = await this.plugin.setPersistedSettingState(
              () => this.plugin.settings.highlightConlang,
              (next) => {
                this.plugin.settings.highlightConlang = next;
              },
              v,
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to save conlang-highlighting preference",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the highlighting change.",
              );
              this.rerender();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Highlight translatable English words")
      .setDesc(
        "Mark English words the dictionary can translate. Handy for spotting " +
          "coverage, but noisier in English-heavy notes.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.highlightEnglish)
          .onChange(async (v) => {
            const result = await this.plugin.setPersistedSettingState(
              () => this.plugin.settings.highlightEnglish,
              (next) => {
                this.plugin.settings.highlightEnglish = next;
              },
              v,
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to save English-highlighting preference",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the highlighting change.",
              );
              this.rerender();
            }
          }),
      );
  }

  private renderMatchingSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Word matching").setHeading();
    new Setting(containerEl)
      .setName("Case-sensitive matching")
      .setDesc(
        "Treat capitalized and lowercase conlang words as different entries " +
          "(e.g. a proper noun 'Sol' vs a common noun 'sol'). Affects dictionary " +
          "headwords, aliases, and phrase matching. English-side lookups stay " +
          "case-insensitive. Changing this reloads the dictionary.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.caseSensitiveMatching)
          .onChange(async (v) => {
            /*
             * Case sensitivity controls how the dictionary and phrase indexes
             * are built, so this cannot be treated like an ordinary persisted
             * display preference. The plugin-level authority transaction keeps
             * persistence and runtime-index establishment synchronized.
             */
            const result = await this.plugin.setCaseSensitiveMatchingState(v);

            if (result.status === "applied") {
              /*
               * The replacement dictionary is now established under the new
               * policy. Refresh consumers only after that authority succeeds.
               */
              this.plugin.refreshPanel();
              this.plugin.refreshHighlights();
              return;
            }

            if (result.status === "unchanged") {
              return;
            }

            if (result.status === "save-failed") {
              new Notice(
                "Conlang workbench: could not save the case-matching change.",
              );
              this.rerender();
              return;
            }

            if (result.status === "blocked") {
              new Notice(
                "Conlang workbench: case-matching change was blocked because " +
                  "the active language sources are not currently safe to reload.",
              );
              this.rerender();
              return;
            }

            if (result.status === "rollback-save-failed") {
              new Notice(
                "Conlang workbench: the previous case-matching setting was restored " +
                  "in memory, but the rollback could not be saved.",
              );
              this.rerender();
              return;
            }

            /*
             * Detached dictionary preparation failed before runtime commit. The
             * transaction restored and re-persisted the previous matching policy,
             * so the existing dictionary and visible consumers remain authoritative.
             */
            console.error(
              "[Conlang] Case-sensitive matching reload failed; previous setting was restored:",
              result.error,
            );
            new Notice(
              "Conlang workbench: case-matching reload failed; the previous setting was restored. " +
                "See the developer console.",
            );
            this.rerender();
          }),
      );

    new Setting(containerEl)
      .setName("Show declared forms in hover tooltip")
      .setDesc(
        "Include an entry's hardcoded `forms:` (its declension or conjugation table) " +
          "in the hover tooltip. The side panel always shows them. Turn this off to " +
          "keep tooltips compact when your entries carry long form tables.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.showFormsInTooltip)
          .onChange(async (v) => {
            const result = await this.plugin.setPersistedSettingState(
              () => this.plugin.settings.showFormsInTooltip,
              (next) => {
                this.plugin.settings.showFormsInTooltip = next;
              },
              v,
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to save tooltip-forms preference",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the tooltip forms change.",
              );
              this.rerender();
            }
          }),
      );
  }

  private renderTranslationSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Translation").setHeading();
    new Setting(containerEl)
      .setName("Commit wrapper")
      .setDesc(
        "How committed translations are stored in the note. HTML tooltip is recommended (uses native <abbr> tags).",
      )
      .addDropdown((dd) => {
        dd.addOption("html-tooltip", "HTML tooltip (<abbr>)");
        dd.addOption("footnote-style", "Footnote with original");
        dd.addOption("wikilink", "Wikilink to dictionary entry");
        dd.setValue(this.plugin.settings.commitWrapper);
        dd.onChange(async (value) => {
          const requested = value as ConlangSettings["commitWrapper"];
          const result = await this.plugin.setPersistedSettingState(
            () => this.plugin.settings.commitWrapper,
            (next) => {
              this.plugin.settings.commitWrapper = next;
            },
            requested,
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save translation wrapper preference",
              result.error,
            );
            new Notice(
              "Made Up Words: could not save the translation wrapper.",
            );
            this.rerender();
          }
        });
      });
  }

  // ===== Reorder helper =====

  /**
   * Move an array item from one index to another, in place. No-ops if the
   * destination is out of bounds (e.g. moving the first item up). Used by the
   * up/down reorder buttons on inflection rules and cypher sheets, where list
   * order is functionally significant.
   */
  private moveItem<T>(arr: T[], from: number, to: number): void {
    if (to < 0 || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
  }

  // ===== Collapsible helper =====

  private collapsible(
    parent: HTMLElement,
    opts: { title: string; key: string; store: Set<string>; badge?: string },
  ): HTMLElement {
    const details = parent.createEl("details", { cls: "conlang-subcollapse" });
    if (opts.store.has(opts.key)) details.open = true;
    details.addEventListener("toggle", () => {
      if (details.open) opts.store.add(opts.key);
      else opts.store.delete(opts.key);
    });
    const summary = details.createEl("summary", {
      cls: "conlang-subcollapse-summary",
    });
    summary.createSpan({ cls: "conlang-subcollapse-title", text: opts.title });
    if (opts.badge != null) {
      summary.createSpan({ cls: "conlang-badge", text: opts.badge });
    }
    return details.createDiv({ cls: "conlang-subcollapse-body" });
  }

  // ===== Per-language card =====

  private renderLanguageCard(parent: HTMLElement, lang: LanguageConfig): void {
    const isActive = this.plugin.settings.activeLanguages.includes(lang.name);
    const isPrimary = this.plugin.settings.primaryLanguage === lang.name;

    const card = parent.createEl("details", { cls: "conlang-card" });
    if (this.openCards.has(lang.name)) card.open = true;
    card.addEventListener("toggle", () => {
      if (card.open) this.openCards.add(lang.name);
      else this.openCards.delete(lang.name);
    });

    const summary = card.createEl("summary", { cls: "conlang-card-summary" });
    summary.createSpan({ cls: "conlang-card-title", text: lang.name });
    if (isPrimary) {
      summary.createSpan({
        cls: "conlang-badge conlang-badge-primary",
        text: "primary",
      });
    } else if (isActive) {
      summary.createSpan({
        cls: "conlang-badge conlang-badge-active",
        text: "active",
      });
    } else {
      summary.createSpan({ cls: "conlang-badge", text: "inactive" });
    }
    if (isActive) {
      const count = this.plugin.dictionary
        .allEntries()
        .filter((e) => e.language === lang.name).length;
      summary.createSpan({
        cls: "conlang-card-count",
        text: `${count} ${count === 1 ? "entry" : "entries"}`,
      });
    }

    const body = card.createDiv({ cls: "conlang-card-body" });

    new Setting(body)
      .setName("Name")
      .setDesc(
        "Language names must be unique. Renaming also renames this language's " +
          "existing owned root folder and updates configured paths beneath it. " +
          "Workbench does not rewrite creator-authored Markdown or YAML metadata.",
      )
      .addText((text) => {
        text.setValue(lang.name);

        const requestRename = async () => {
          const oldName = lang.name;

          const validation = validateLanguageRename(
            this.plugin.settings.languages,
            lang,
            text.getValue(),
          );

          if (!validation.ok) {
            text.setValue(oldName);

            if (validation.reason === "blank") {
              showLanguageRenameBlocked(
                this.app,
                "A language name cannot be blank.",
              );
            } else if (validation.reason === "duplicate") {
              showLanguageRenameBlocked(
                this.app,
                "Every configured language must have a unique name.",
              );
            }

            return;
          }

          const newName = validation.name;

          // Prevent a second edit while the confirmation modal is deciding
          // whether this exact old-name -> new-name transition is authorized.
          text.inputEl.disabled = true;

          const confirmed = await confirmLanguageRename(
            this.app,
            oldName,
            newName,
          );

          text.inputEl.disabled = false;

          if (!confirmed) {
            text.setValue(oldName);
            return;
          }

          /*
           * Confirmation is asynchronous. Ensure it still applies to this exact
           * source identity before handing authority to the plugin transaction.
           *
           * Destination/name/root validation is deliberately NOT repeated in
           * the UI. renameLanguage() recalculates the complete pure plan
           * immediately before mutation, so that fresh planner is the single
           * authoritative validation boundary.
           */
          if (lang.name !== oldName) {
            text.setValue(lang.name);
            showLanguageRenameBlocked(
              this.app,
              "The language changed while rename confirmation was open. No rename was performed.",
            );
            return;
          }

          /*
           * Expansion state is UI-only, so it stays outside the persistence
           * transaction. Capture whether this language's sections were open,
           * then key them to whichever identity the authority transaction
           * actually leaves in memory.
           *
           * That distinction matters for unusual failure states. A safe
           * rollback restores oldName, while a failed compensating filesystem
           * rename deliberately leaves newName in memory so configured paths
           * remain aligned with the root's actual physical location.
           */
          const cardWasOpen = this.openCards.has(oldName);
          const sheetsWereOpen = this.openSheets.has(oldName);
          const inflectionsWereOpen = this.openInflections.has(oldName);

          const result = await this.plugin.renameLanguage(lang, newName);
          const authoritativeName = lang.name;

          this.openCards.delete(oldName);
          this.openCards.delete(newName);
          this.openSheets.delete(oldName);
          this.openSheets.delete(newName);
          this.openInflections.delete(oldName);
          this.openInflections.delete(newName);

          if (cardWasOpen) this.openCards.add(authoritativeName);
          if (sheetsWereOpen) this.openSheets.add(authoritativeName);
          if (inflectionsWereOpen) {
            this.openInflections.add(authoritativeName);
          }

          // Reflect the transaction's actual final in-memory authority rather
          // than assuming that success means newName or failure means oldName.
          text.setValue(authoritativeName);

          if (result.status === "blocked") {
            /*
             * Planner-level rejection is just as actionable as the earlier
             * duplicate/blank-name checks. Keep the explanation visible until
             * the creator acknowledges it instead of losing an authority
             * failure in a short-lived Notice.
             */
            showLanguageRenameBlocked(this.app, result.detail);
            this.rerender();
            return;
          }

          if (result.status === "rename-failed") {
            console.error(
              "Made Up Words: failed to rename language root",
              result.error,
            );
            new Notice(
              "Made Up Words: the language root could not be renamed. No settings were changed.",
            );
            this.rerender();
            return;
          }

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to save language rename",
              result.error,
            );
            new Notice(
              "Made Up Words: the rename could not be saved, so the language root and settings were restored.",
            );
            this.rerender();
            return;
          }

          if (result.status === "save-failed-rollback-rename-failed") {
            console.error(
              "Made Up Words: language rename save and filesystem rollback failed",
              result.error,
              result.rollbackError,
            );
            new Notice(
              "Made Up Words: settings could not be saved and the renamed root could not be moved back. " +
                "The current session kept the new paths to match the vault, but persisted settings may still be old. " +
                "Review the language configuration before restarting Obsidian.",
              12000,
            );
            this.rerender();
            return;
          }

          if (result.status === "reload-blocked") {
            new Notice(
              "Made Up Words: the language rename was restored because runtime source validation blocked the renamed configuration.",
            );
            this.rerender();
            return;
          }

          if (result.status === "reload-blocked-rollback-rename-failed") {
            console.error(
              "Made Up Words: blocked language reload and filesystem rollback failed",
              result.rollbackError,
            );
            new Notice(
              "Made Up Words: runtime reload was blocked and the renamed root could not be moved back. " +
                "The new root and settings remain in place, while the previous runtime data is still loaded. " +
                "Review the language configuration before continuing.",
              12000,
            );
            this.rerender();
            return;
          }

          if (result.status === "rollback-save-failed") {
            console.error(
              "Made Up Words: failed to save restored language rename state",
              result.error,
            );
            new Notice(
              "Made Up Words: the language root and in-memory settings were restored, but that rollback could not be saved. " +
                "Persisted settings may still contain the renamed paths. Review settings before restarting Obsidian.",
              12000,
            );
            this.rerender();
            return;
          }

          if (result.status === "reload-failed-rollback-rename-failed") {
            console.error(
              "Made Up Words: language reload failed and filesystem rollback failed",
              result.error,
              result.rollbackError,
            );
            new Notice(
              "Made Up Words: language data failed to reload and the renamed root could not be moved back. " +
                "The new root and settings remain in place, while the previous runtime data is still loaded. " +
                "Review the language configuration before continuing.",
              12000,
            );
            this.rerender();
            return;
          }

          if (result.status === "reload-failed") {
            console.error(
              "Made Up Words: language rename reload failed; rename was restored",
              result.error,
            );
            new Notice(
              "Made Up Words: language data failed to reload, so the language root and settings were restored. " +
                "Check the developer console.",
              12000,
            );
            this.rerender();
            return;
          }

          /*
           * Applied means the root/configuration transaction succeeded. For an
           * active language, runtime inventories were also re-established under
           * the new identity; for an inactive language there was intentionally
           * no reload.
           */
          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
          this.rerender();
        };

        // Obsidian's TextComponent.onChange fires for every keystroke. Native
        // "change" fires when the edit is committed, normally when focus leaves
        // the field, so one intended rename produces one confirmation request.
        text.inputEl.addEventListener("change", () => {
          void requestRename();
        });

        // Enter commits the field by moving focus out of it.
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;

          event.preventDefault();
          text.inputEl.blur();
        });
      });

    /*
     * Canonical source paths are authority-bearing configuration, not ordinary
     * cosmetic settings. Let the creator type freely, but commit only when the
     * field itself is committed rather than saving and reloading on every
     * keystroke.
     *
     * After every transaction, read the displayed value back from LanguageConfig
     * instead of assuming whether rollback happened. Source preflight blocking
     * and detached candidate-preparation failure both restore the previous path
     * when the transaction can safely persist that rollback.
     */
    const addSourceFolderText = (
      row: Setting,
      sourceSetting: CanonicalFolderSetting,
      currentValue: () => string,
      optional: boolean,
    ): void => {
      row.addText((text) => {
        text.setValue(currentValue());

        const commit = async (): Promise<void> => {
          const trimmed = text.getValue().trim();
          const requested = optional ? trimmed || undefined : trimmed;

          await this.commitLanguageSource(lang, sourceSetting, requested);

          // The transaction, not the UI, decides which source value is now
          // authoritative. Reflect that decision even when the commit failed.
          text.setValue(currentValue());
        };

        // TextComponent.onChange fires for each keystroke. Native "change"
        // waits until the edit is committed, normally by leaving the field.
        text.inputEl.addEventListener("change", () => {
          void commit();
        });

        // Enter provides an explicit keyboard commit by moving focus out of the
        // field. That blur then produces the same native change event.
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;

          event.preventDefault();
          text.inputEl.blur();
        });
      });
    };

    const dictionarySetting = new Setting(body)
      .setName("Dictionary folder")
      .setDesc(
        "Folder of one .md file per word, each with frontmatter `definition:` set.",
      );
    addSourceFolderText(
      dictionarySetting,
      "dictionaryFolder",
      () => lang.dictionaryFolder,
      false,
    );

    const morphemeSetting = new Setting(body)
      .setName("Morpheme folder")
      .setDesc(
        "Optional folder of canonical morpheme notes. Morphemes are loaded separately from dictionary entries and do not automatically become translation candidates.",
      );
    addSourceFolderText(
      morphemeSetting,
      "morphemeFolder",
      () => lang.morphemeFolder ?? "",
      true,
    );

    // Standalone linguistic examples have their own optional canonical folder.
    // Keeping this separate from the dictionary and morpheme folders lets the
    // examples feature load documented language use without treating every note
    // that happens to contain an example as a standalone example.
    const exampleSetting = new Setting(body)
      .setName("Examples folder")
      .setDesc(
        "Optional folder of standalone linguistic example notes. Only notes explicitly marked as linguistic examples are loaded.",
      );
    addSourceFolderText(
      exampleSetting,
      "exampleFolder",
      () => lang.exampleFolder ?? "",
      true,
    );

    // Canonical phonological units have their own source folder rather than
    // sharing the dictionary or morphology folders. Keeping this boundary
    // explicit lets later phonology features build on the same inventory
    // without treating every language-documentation note as a phonological unit.
    const phonologySetting = new Setting(body)
      .setName("Phonology folder")
      .setDesc(
        "Optional folder of canonical phonological-unit notes. Only notes explicitly marked as phonological units are loaded.",
      );
    addSourceFolderText(
      phonologySetting,
      "phonologyFolder",
      () => lang.phonologyFolder ?? "",
      true,
    );

    new Setting(body)
      .setName("Language profile")
      .setDesc(
        "Optional vault path to this language's canonical language profile note.",
      )
      .addText((t) =>
        t.setValue(lang.profilePath ?? "").onChange(async (v) => {
          await this.commitLanguageProfile(lang, v.trim() || undefined);
          this.rerender();
        }),
      );

    // Use the plugin accessor rather than depending on how profiles are
    // currently keyed internally. This keeps the settings UI insulated from
    // future migration from display names to stable language IDs.
    const profile = this.plugin.getLanguageProfile(lang);
    new Setting(body)
      .setName("Profile status")
      .setDesc(
        !lang.profilePath
          ? "No language profile configured."
          : profile
            ? `Loaded: ${profile.name} (${profile.id})`
            : "Profile not found or invalid.",
      );

    new Setting(body)
      .setName("Active")
      .setDesc(
        "Include this language in hover, lookup, browsing, and highlighting.",
      )
      .addToggle((tg) =>
        tg.setValue(isActive).onChange(async (v) => {
          await this.toggleActive(lang.name, v);
          this.rerender();
        }),
      );

    if (isActive && !isPrimary) {
      new Setting(body)
        .setName("Primary language")
        .setDesc(
          "Target for English-to-conlang translation and default save folder for new entries.",
        )
        .addButton((b) =>
          b.setButtonText("Make primary").onClick(async () => {
            const result = await this.plugin.setPrimaryLanguageState(lang.name);

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

            this.rerender();
          }),
        );
    }

    new Setting(body)
      .setName("Enable hover tooltips")
      .setDesc("Show translation tooltips when hovering this language's words.")
      .addToggle((tg) =>
        tg.setValue(lang.hoverEnabled).onChange(async (v) => {
          const result = await this.plugin.setPersistedSettingState(
            () => lang.hoverEnabled,
            (next) => {
              lang.hoverEnabled = next;
            },
            v,
          );

          if (result.status === "save-failed") {
            console.error(
              `Made Up Words: failed to save hover preference for "${lang.name}"`,
              result.error,
            );
            new Notice(
              `Made Up Words: could not save hover settings for "${lang.name}".`,
            );
            this.rerender();
          }
        }),
      );

    new Setting(body)
      .setName("Portable linguistic IDs")
      .setDesc(
        "Include stable portable IDs in future notes generated for this language. Existing notes are never changed automatically.",
      )
      .addToggle((tg) =>
        tg.setValue(lang.includePortableIds ?? false).onChange(async (v) => {
          // This is an ordinary persisted preference. Use the same guarded
          // settings transaction as the neighboring language preferences so a
          // failed save cannot leave provisional in-memory state authoritative.
          const result = await this.plugin.setPersistedSettingState(
            () => lang.includePortableIds ?? false,
            (next) => {
              lang.includePortableIds = next;
            },
            v,
          );

          if (result.status === "save-failed") {
            console.error(
              `Made Up Words: failed to save portable-ID preference for "${lang.name}"`,
              result.error,
            );
            new Notice(
              `Made Up Words: could not save portable-ID settings for "${lang.name}".`,
            );
            this.rerender();
          }
        }),
      );

    new Setting(body)
      .addButton((b) =>
        b.setButtonText("Reload language data").onClick(async () => {
          const result = await this.plugin.reloadSettledLanguageState();
          if (result.status === "blocked") return;

          this.plugin.refreshPanel();
          this.plugin.refreshHighlights();
          new Notice(
            isActive
              ? `Reloaded — ${result.dictionaryCount} dictionary entries across active languages`
              : `${lang.name} is inactive; activate it to load its language data.`,
          );
        }),
      )
      .addButton((b) => {
        /*
         * Translate the current Obsidian vault snapshot into the small abstract
         * path-state vocabulary owned by the presentation helper.
         *
         * This is still presentation only. Repair and Recreate independently
         * recalculate their authoritative planners when the creator invokes
         * them, so a filesystem change after this card renders cannot grant
         * mutation authority.
         */
        const action = chooseLanguageRootAction(lang.rootFolder, (root) => {
          const existing = this.app.vault.getAbstractFileByPath(root);

          if (!existing) return "missing";
          return existing instanceof TFolder ? "folder" : "other";
        });

        switch (action.status) {
          case "unavailable":
            b.setButtonText("Language root unavailable")
              .setTooltip(action.detail)
              .setDisabled(true);
            return;

          case "repair":
            b.setButtonText("Repair language root")
              .setTooltip(
                "Restore this language's standard folders and canonical source paths inside its existing owned root.",
              )
              .onClick(async () => {
                await this.repairLanguageRoot(lang);
              });
            return;

          case "recreate":
            b.setButtonText("Recreate language root")
              .setTooltip(
                "Create a new standard root at this language's already-configured location. This does not search for or adopt a moved root.",
              )
              .onClick(async () => {
                await this.recreateLanguageRoot(lang);
              });
            return;

          case "blocked":
            b.setButtonText("Language root blocked")
              .setTooltip(action.detail)
              .setDisabled(true);
            return;
        }
      })
      .addButton((b) => {
        b.setButtonText("Remove language").onClick(async () => {
          await this.removeLanguage(lang);
        });
        // Obsidian 1.13.0 renamed `setWarning()` to `setDestructive()`, but
        // `setDestructive()` does not exist on 1.7.2, this plugin's
        // minAppVersion. Resolve the method through a local type so whichever
        // one the running app provides is the one that gets called.
        const destructive = b as unknown as {
          setDestructive?: () => unknown;
          setWarning?: () => unknown;
        };
        const applyStyle = destructive.setDestructive ?? destructive.setWarning;
        applyStyle?.call(destructive);
      });

    // --- Cypher sheets (nested collapsible) ---
    const sheetsBody = this.collapsible(body, {
      title: "Cypher sheets",
      key: lang.name,
      store: this.openSheets,
      badge: String(lang.sheets.length),
    });
    sheetsBody.createEl("p", {
      cls: "conlang-help",
      text:
        "Sheets run top to bottom; each sheet's output feeds the next. " +
        "Rule types: word (whole word), prefix, suffix, default (anywhere).",
    });
    const sheetsListEl = sheetsBody.createDiv({ cls: "conlang-sheets-list" });
    const rebuildSheets = () => {
      sheetsListEl.empty();
      for (let s = 0; s < lang.sheets.length; s++) {
        this.renderSheet(sheetsListEl, lang, s, rebuildSheets);
      }
    };
    rebuildSheets();
    new Setting(sheetsBody).addButton((b) =>
      b
        .setButtonText("Add sheet")
        .setCta()
        .onClick(async () => {
          const result = await this.plugin.setLinguisticRuleState(
            lang,
            (candidate) => {
              candidate.sheets.push({
                name: `Sheet ${candidate.sheets.length + 1}`,
                enabled: true,
                rules: [],
              });
            },
          );

          if (result.status === "save-failed") {
            console.error(
              "Made Up Words: failed to add cypher sheet:",
              result.error,
            );
            new Notice(
              "Made Up Words: could not save the new cypher sheet; it was not added.",
            );
            this.rerender();
            return;
          }

          /*
           * Add-sheet has no pre-existing object that can disappear while the
           * request waits in the queue, so target-missing is not expected here.
           * Still fail closed if a future transaction change ever produces it.
           */
          if (result.status === "target-missing") {
            new Notice(
              "Made Up Words: the cypher-sheet change could not be applied because its target changed.",
            );
            this.rerender();
            return;
          }

          this.openSheets.add(lang.name);
          this.rerender();
        }),
    );

    // --- Inflection rules (nested collapsible) ---
    const inflBody = this.collapsible(body, {
      title: "Inflection rules",
      key: lang.name,
      store: this.openInflections,
      badge: String(lang.inflections?.length ?? 0),
    });
    inflBody.createEl("p", {
      cls: "conlang-help",
      text:
        "When a word isn't in the dictionary, these rules try to find its lemma. " +
        "Strip removes characters from the end (suffix) or start (prefix); add then " +
        "attaches characters to reconstruct the lemma. Most rules just chop a suffix " +
        "off — leave add empty for that. Use add for respellings (strip 'ies', add 'y'). " +
        "Optional POS filter: comma-separated, e.g. 'noun' or 'noun,proper-noun'. " +
        "Rules are tried in order; the first whose reconstructed stem exists wins.",
    });

    let pendingPresetId = "";
    new Setting(inflBody)
      .setName("Apply preset")
      .setDesc(
        "Load a curated starter set. Replaces existing inflection rules for this language.",
      )
      .addDropdown((dd) => {
        dd.addOption("", "— pick a preset —");
        for (const preset of INFLECTION_PRESETS) {
          dd.addOption(preset.id, preset.name);
        }
        dd.onChange((v) => {
          pendingPresetId = v;
        });
      })
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(async () => {
            if (!pendingPresetId) {
              new Notice("Made Up Words: pick a preset first");
              return;
            }
            const preset = findPreset(pendingPresetId);
            if (!preset) return;
            const approvedRules = lang.inflections
              ? [...lang.inflections]
              : undefined;
            const existingCount = approvedRules?.length ?? 0;
            const confirmed = await this.confirmPreset(preset, existingCount);
            if (!confirmed) return;

            const result = await this.plugin.setLinguisticRuleState(
              lang,
              (candidate) => {
                const currentRules = lang.inflections;

                /*
                 * Preserve the distinction between an absent inflection array
                 * and an explicitly present empty array. If that authority
                 * changed while confirmation was open, the old confirmation no
                 * longer authorizes replacing the new state.
                 */
                if (approvedRules === undefined) {
                  if (currentRules !== undefined) {
                    throw new LinguisticRuleTargetMissingError();
                  }
                } else {
                  if (
                    currentRules === undefined ||
                    currentRules.length !== approvedRules.length ||
                    currentRules.some(
                      (currentRule, index) =>
                        currentRule !== approvedRules[index],
                    )
                  ) {
                    throw new LinguisticRuleTargetMissingError();
                  }
                }

                candidate.inflections = preset.rules.map((rule) => ({
                  ...rule,
                }));
              },
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to apply inflection preset:",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the inflection preset; the previous rules were restored.",
              );
              this.rerender();
              return;
            }

            if (result.status === "target-missing") {
              new Notice(
                "Made Up Words: the inflection rules changed while preset replacement was pending; the preset was not applied.",
              );
              this.rerender();
              return;
            }

            this.openInflections.add(lang.name);
            this.rerender();
            new Notice(`Made Up Words: applied preset "${preset.name}"`);
          }),
      );

    this.renderInflectionTable(inflBody, lang);

    new Setting(inflBody).addButton((b) =>
      b.setButtonText("Add inflection rule").onClick(async () => {
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            candidate.inflections ??= [];
            candidate.inflections.push({
              label: "plural",
              pattern: "",
              position: "suffix",
              strip: "",
              add: "",
              enabled: true,
            });
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to add inflection rule:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the new inflection rule; it was not added.",
          );
          this.rerender();
          return;
        }

        /*
         * Add-rule has no existing rule target, so target-missing is defensive.
         * Keeping the branch fail-closed makes this caller safe if the queue's
         * transaction contract grows stricter in the future.
         */
        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: the inflection-rule change could not be applied because its target changed.",
          );
          this.rerender();
          return;
        }

        this.openInflections.add(lang.name);
        this.rerender();
      }),
    );
  }

  /**
   * Request removal of one configured language.
   *
   * The plugin owns the complete H13 authority transaction. In particular, it
   * acquires the common settings queue before reading the authoritative name
   * and keeps that queue held while this confirmation modal is open.
   *
   * This settings-layer method therefore owns only presentation: constructing
   * the confirmation UI, reporting transaction results, and updating the
   * expansion-state sets after a removal remains authoritative.
   */
  private async removeLanguage(lang: LanguageConfig): Promise<void> {
    const result = await this.plugin.removeLanguageState(lang, (approvedName) =>
      confirmDeletion(this.app, {
        title: "Remove language?",
        message:
          `Remove the language configuration "${approvedName}" from Conlang Workbench? ` +
          "Its configured vault folders and files will not be deleted.",
        confirmText: "Remove language",
      }),
    );

    if (result.status === "cancelled") {
      return;
    }

    if (result.status === "target-missing") {
      new Notice(
        "Made Up Words: the language is no longer configured, so nothing was removed.",
      );
      this.rerender();
      return;
    }

    if (result.status === "target-changed") {
      new Notice(
        "Made Up Words: the language changed while removal confirmation was open.",
      );
      this.rerender();
      return;
    }

    if (result.status === "save-failed") {
      console.error("Made Up Words: failed to remove language:", result.error);
      new Notice(
        "Made Up Words: could not save the language removal; the language was restored.",
      );
      this.rerender();
      return;
    }

    if (result.status === "blocked") {
      new Notice(
        "Made Up Words: language removal was cancelled because the remaining language data could not be safely reloaded.",
      );
      this.rerender();
      return;
    }

    if (result.status === "rollback-save-failed") {
      console.error(
        "Made Up Words: failed to persist language-removal rollback:",
        result.error,
      );
      new Notice(
        "Made Up Words: language removal was rolled back in memory, but the rollback could not be saved. Review settings before restarting the app.",
      );
      this.rerender();
      return;
    }

    if (result.status === "reload-failed") {
      /*
       * Detached runtime preparation failed, so the removal transaction restored
       * and re-persisted the complete previous language configuration. Keep its
       * presentation state as well; from the creator's perspective the removal
       * did not become authoritative.
       */
      console.error(
        "Made Up Words: language removal reload failed; removal was restored:",
        result.error,
      );
      new Notice(
        "Made Up Words: language data failed to reload; the language removal was restored. Check the developer console.",
      );
      this.rerender();
      return;
    }

    /*
     * Only "applied" leaves the removal authoritative. Presentation keys belong
     * to that successful removal and must not be discarded on rollback paths.
     */
    this.openCards.delete(result.name);
    this.openSheets.delete(result.name);
    this.openInflections.delete(result.name);

    this.plugin.refreshPanel();
    this.plugin.refreshHighlights();
    this.rerender();
  }

  /**
   * Show a small modal confirming a preset replacement.
   * Returns true if confirmed. Skips the prompt when there are no existing rules.
   */
  private async confirmPreset(
    preset: { name: string; description: string },
    existingCount: number,
  ): Promise<boolean> {
    if (existingCount === 0) return true;
    return new Promise<boolean>((resolve) => {
      const modal = new PresetConfirmModal(
        this.app,
        preset.name,
        preset.description,
        existingCount,
        resolve,
      );
      modal.open();
    });
  }

  private renderSheet(
    parent: HTMLElement,
    lang: LanguageConfig,
    sheetIndex: number,
    rebuildSheets: () => void,
  ): void {
    const sheet = lang.sheets[sheetIndex];
    const box = parent.createDiv({ cls: "conlang-sheet" });

    new Setting(box)
      .setName(sheet.name)
      .addExtraButton((b) =>
        b
          .setIcon("arrow-up")
          .setTooltip("Move sheet up")
          .setDisabled(sheetIndex === 0)
          .onClick(async () => {
            const result = await this.plugin.setLinguisticRuleState(
              lang,
              (candidate) => {
                const currentIndex = lang.sheets.indexOf(sheet);
                if (currentIndex < 0) {
                  throw new LinguisticRuleTargetMissingError();
                }

                this.moveItem(candidate.sheets, currentIndex, currentIndex - 1);
              },
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to move cypher sheet:",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the cypher-sheet reorder; the previous order was restored.",
              );
              this.rerender();
              return;
            }

            if (result.status === "target-missing") {
              new Notice(
                "Made Up Words: that cypher sheet no longer exists; it was not moved.",
              );
              this.rerender();
              return;
            }

            rebuildSheets();
          }),
      )
      .addExtraButton((b) =>
        b
          .setIcon("arrow-down")
          .setTooltip("Move sheet down")
          .setDisabled(sheetIndex === lang.sheets.length - 1)
          .onClick(async () => {
            const result = await this.plugin.setLinguisticRuleState(
              lang,
              (candidate) => {
                const currentIndex = lang.sheets.indexOf(sheet);
                if (currentIndex < 0) {
                  throw new LinguisticRuleTargetMissingError();
                }

                this.moveItem(candidate.sheets, currentIndex, currentIndex + 1);
              },
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to move cypher sheet:",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the cypher-sheet reorder; the previous order was restored.",
              );
              this.rerender();
              return;
            }

            if (result.status === "target-missing") {
              new Notice(
                "Made Up Words: that cypher sheet no longer exists; it was not moved.",
              );
              this.rerender();
              return;
            }

            rebuildSheets();
          }),
      )
      .addToggle((t) =>
        t
          .setTooltip("Enable sheet")
          .setValue(sheet.enabled)
          .onChange(async (v) => {
            const result = await this.plugin.setLinguisticRuleState(
              lang,
              (candidate) => {
                const currentIndex = lang.sheets.indexOf(sheet);
                if (currentIndex < 0) {
                  throw new LinguisticRuleTargetMissingError();
                }

                candidate.sheets[currentIndex].enabled = v;
              },
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to change cypher-sheet enabled state:",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the cypher-sheet setting; the previous setting was restored.",
              );
              this.rerender();
              return;
            }

            if (result.status === "target-missing") {
              new Notice(
                "Made Up Words: that cypher sheet no longer exists; the setting was not changed.",
              );
              this.rerender();
            }
          }),
      )
      .addButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Delete sheet")
          .onClick(async () => {
            const sheetName = sheet.name.trim() || "Untitled sheet";
            const confirmed = await confirmDeletion(this.app, {
              title: "Delete cypher sheet?",
              message:
                `Delete the cypher sheet "${sheetName}" and its ${sheet.rules.length} ` +
                `rule${sheet.rules.length === 1 ? "" : "s"} from this language's settings?`,
              confirmText: "Delete sheet",
            });

            if (!confirmed) return;

            const result = await this.plugin.setLinguisticRuleState(
              lang,
              (candidate) => {
                /*
                 * Re-find the exact object approved by the user only when this
                 * queued edit begins. A stale rendered index must never
                 * authorize deletion of whichever sheet later occupies it.
                 */
                const currentIndex = lang.sheets.indexOf(sheet);
                if (currentIndex < 0) {
                  throw new LinguisticRuleTargetMissingError();
                }

                candidate.sheets.splice(currentIndex, 1);
              },
            );

            if (result.status === "save-failed") {
              console.error(
                "Made Up Words: failed to delete cypher sheet:",
                result.error,
              );
              new Notice(
                "Made Up Words: could not save the cypher-sheet deletion; the sheet was not deleted.",
              );
              this.rerender();
              return;
            }

            if (result.status === "target-missing") {
              new Notice(
                "Made Up Words: that cypher sheet no longer exists; nothing was deleted.",
              );
              this.rerender();
              return;
            }

            this.rerender();
          }),
      );

    new Setting(box).setName("Sheet name").addText((t) =>
      t.setValue(sheet.name).onChange(async (v) => {
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentIndex = lang.sheets.indexOf(sheet);
            if (currentIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentIndex].name = v;
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to rename cypher sheet:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-sheet name; the previous name was restored.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher sheet no longer exists; its name was not changed.",
          );
          this.rerender();
        }
      }),
    );

    const tableWrap = box.createDiv({ cls: "conlang-rules-wrap" });
    const table = tableWrap.createEl("table", { cls: "conlang-rules-table" });
    const thead = table.createEl("thead").createEl("tr");
    ["Input", "Output", "Type", "On", ""].forEach((h) =>
      thead.createEl("th", { text: h }),
    );
    const tbody = table.createEl("tbody");
    for (let r = 0; r < sheet.rules.length; r++) {
      this.renderRuleRow(tbody, lang, sheet, r);
    }

    new Setting(box).addButton((b) =>
      b.setButtonText("Add rule").onClick(async () => {
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules.push({
              input: "",
              output: "",
              type: "default",
              enabled: true,
            });
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to add cypher rule:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the new cypher rule; it was not added.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher sheet no longer exists; no rule was added.",
          );
          this.rerender();
          return;
        }

        this.rerender();
      }),
    );
  }

  private renderRuleRow(
    tbody: HTMLElement,
    lang: LanguageConfig,
    sheet: CypherSheet,
    ruleIndex: number,
  ): void {
    const rule = sheet.rules[ruleIndex];
    const tr = tbody.createEl("tr");

    const inputTd = tr.createEl("td");
    const inputEl = inputTd.createEl("input", {
      type: "text",
      value: rule.input,
    });
    inputEl.addEventListener("change", () => {
      void (async () => {
        const requestedInput = inputEl.value;
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            const currentRuleIndex = sheet.rules.indexOf(rule);
            if (currentRuleIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules[currentRuleIndex].input =
              requestedInput;
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to change cypher-rule input:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-rule input; the previous value was restored.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher rule no longer exists; its input was not changed.",
          );
          this.rerender();
        }
      })();
    });

    const outputTd = tr.createEl("td");
    const outputEl = outputTd.createEl("input", {
      type: "text",
      value: rule.output,
    });
    outputEl.addEventListener("change", () => {
      void (async () => {
        const requestedOutput = outputEl.value;
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            const currentRuleIndex = sheet.rules.indexOf(rule);
            if (currentRuleIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules[currentRuleIndex].output =
              requestedOutput;
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to change cypher-rule output:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-rule output; the previous value was restored.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher rule no longer exists; its output was not changed.",
          );
          this.rerender();
        }
      })();
    });

    const typeTd = tr.createEl("td");
    const typeEl = typeTd.createEl("select");
    (["word", "prefix", "suffix", "default"] as HashType[]).forEach((t) => {
      const opt = typeEl.createEl("option", { text: t, value: t });
      if (t === rule.type) opt.selected = true;
    });
    typeEl.addEventListener("change", () => {
      void (async () => {
        const requestedType = typeEl.value as HashType;
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            const currentRuleIndex = sheet.rules.indexOf(rule);
            if (currentRuleIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules[currentRuleIndex].type =
              requestedType;
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to change cypher-rule type:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-rule type; the previous value was restored.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher rule no longer exists; its type was not changed.",
          );
          this.rerender();
        }
      })();
    });

    const enabledTd = tr.createEl("td");
    const enabledEl = enabledTd.createEl("input", { type: "checkbox" });
    enabledEl.checked = rule.enabled;
    enabledEl.addEventListener("change", () => {
      void (async () => {
        const requestedEnabled = enabledEl.checked;
        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            const currentRuleIndex = sheet.rules.indexOf(rule);
            if (currentRuleIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules[
              currentRuleIndex
            ].enabled = requestedEnabled;
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to change cypher-rule enabled state:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-rule setting; the previous setting was restored.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher rule no longer exists; the setting was not changed.",
          );
          this.rerender();
        }
      })();
    });

    const deleteTd = tr.createEl("td");
    const deleteBtn = deleteTd.createEl("button", { text: "×" });
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        const ruleDescription =
          rule.input || rule.output
            ? `"${rule.input || "(empty)"}" → "${rule.output || "(empty)"}"`
            : "this cypher rule";

        const confirmed = await confirmDeletion(this.app, {
          title: "Delete cypher rule?",
          message: `Delete ${ruleDescription} from this cypher sheet?`,
          confirmText: "Delete rule",
        });

        if (!confirmed) return;

        const result = await this.plugin.setLinguisticRuleState(
          lang,
          (candidate) => {
            const currentSheetIndex = lang.sheets.indexOf(sheet);
            if (currentSheetIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            const currentRuleIndex = sheet.rules.indexOf(rule);
            if (currentRuleIndex < 0) {
              throw new LinguisticRuleTargetMissingError();
            }

            candidate.sheets[currentSheetIndex].rules.splice(
              currentRuleIndex,
              1,
            );
          },
        );

        if (result.status === "save-failed") {
          console.error(
            "Made Up Words: failed to delete cypher rule:",
            result.error,
          );
          new Notice(
            "Made Up Words: could not save the cypher-rule deletion; the rule was not deleted.",
          );
          this.rerender();
          return;
        }

        if (result.status === "target-missing") {
          new Notice(
            "Made Up Words: that cypher rule no longer exists; nothing was deleted.",
          );
          this.rerender();
          return;
        }

        this.rerender();
      })();
    });
  }

  private renderInflectionTable(
    parent: HTMLElement,
    lang: LanguageConfig,
  ): void {
    const tableWrap = parent.createDiv({ cls: "conlang-rules-wrap" });
    // Rebuild only this table (not the whole settings tab) when a rule moves,
    // so reordering doesn't reset scroll position or collapse open sections.
    const rebuild = () => {
      tableWrap.empty();
      const rules = lang.inflections ?? [];
      const table = tableWrap.createEl("table", { cls: "conlang-rules-table" });
      const thead = table.createEl("thead").createEl("tr");
      [
        "",
        "Label",
        "Position",
        "Pattern",
        "Strip",
        "Add",
        "POS filter",
        "Description",
        "On",
        "",
      ].forEach((h) => thead.createEl("th", { text: h }));
      const tbody = table.createEl("tbody");
      for (let i = 0; i < rules.length; i++) {
        this.renderInflectionRow(tbody, lang, i, rebuild);
      }
    };
    rebuild();
  }

  private renderInflectionRow(
    tbody: HTMLElement,
    lang: LanguageConfig,
    ruleIndex: number,
    rebuild: () => void,
  ): void {
    const rules = lang.inflections!;
    const rule = rules[ruleIndex];
    const tr = tbody.createEl("tr");

    // Reorder controls live in the leftmost column so they stay visible without
    // scrolling the wide rules table sideways. Order matters: first match wins.
    const orderTd = tr.createEl("td");
    const orderWrap = orderTd.createDiv({ cls: "conlang-reorder" });
    const upBtn = orderWrap.createEl("button", {
      cls: "conlang-reorder-btn",
      text: "▲",
      attr: { "aria-label": "Move rule up", title: "Move up" },
    });
    upBtn.disabled = ruleIndex === 0;
    upBtn.addEventListener("click", () => {
      void (async () => {
        const applied = await applyRuleEdit((candidateRules, currentIndex) => {
          this.moveItem(candidateRules, currentIndex, currentIndex - 1);
        }, "reorder inflection rule");

        /*
         * Rebuild from authoritative state whether persistence succeeded or
         * failed. This updates button positions after success and restores the
         * displayed order after rollback.
         */
        rebuild();

        if (!applied) return;
      })();
    });
    const downBtn = orderWrap.createEl("button", {
      cls: "conlang-reorder-btn",
      text: "▼",
      attr: { "aria-label": "Move rule down", title: "Move down" },
    });
    downBtn.disabled = ruleIndex === rules.length - 1;
    downBtn.addEventListener("click", () => {
      void (async () => {
        const applied = await applyRuleEdit((candidateRules, currentIndex) => {
          this.moveItem(candidateRules, currentIndex, currentIndex + 1);
        }, "reorder inflection rule");

        rebuild();

        if (!applied) return;
      })();
    });

    const applyRuleEdit = async (
      edit: (
        candidateRules: NonNullable<LanguageConfig["inflections"]>,
        currentIndex: number,
      ) => void,
      description: string,
    ): Promise<boolean> => {
      const result = await this.plugin.setLinguisticRuleState(
        lang,
        (candidate) => {
          const currentRules = lang.inflections;
          if (!currentRules) {
            throw new LinguisticRuleTargetMissingError();
          }

          const currentIndex = currentRules.indexOf(rule);
          if (currentIndex < 0) {
            throw new LinguisticRuleTargetMissingError();
          }

          const candidateRules = candidate.inflections;
          if (!candidateRules || !candidateRules[currentIndex]) {
            throw new LinguisticRuleTargetMissingError();
          }

          edit(candidateRules, currentIndex);
        },
      );

      if (result.status === "save-failed") {
        console.error(`Made Up Words: failed to ${description}:`, result.error);
        new Notice(
          "Made Up Words: could not save the inflection-rule change; the previous value was restored.",
        );
        return false;
      }

      if (result.status === "target-missing") {
        new Notice(
          "Made Up Words: that inflection rule no longer exists; the change was not applied.",
        );
        return false;
      }

      return true;
    };

    const mkText = (
      value: string,
      applyValue: (
        candidateRule: NonNullable<LanguageConfig["inflections"]>[number],
        value: string,
      ) => void,
    ) => {
      const td = tr.createEl("td");
      const el = td.createEl("input", { type: "text", value });
      el.addEventListener("change", () => {
        void (async () => {
          /*
           * Capture the DOM value before awaiting the queue. A later edit may
           * change this same input while this request is waiting its turn.
           */
          const requestedValue = el.value;
          const applied = await applyRuleEdit(
            (candidateRules, currentIndex) => {
              applyValue(candidateRules[currentIndex], requestedValue);
            },
            "change inflection rule",
          );

          if (!applied) rebuild();
        })();
      });
    };

    mkText(rule.label, (candidateRule, value) => {
      candidateRule.label = value;
    });

    const posTd = tr.createEl("td");
    const posEl = posTd.createEl("select");
    (["suffix", "prefix"] as const).forEach((p) => {
      const opt = posEl.createEl("option", { text: p, value: p });
      if (p === rule.position) opt.selected = true;
    });
    posEl.addEventListener("change", () => {
      void (async () => {
        const requestedPosition = posEl.value as "suffix" | "prefix";
        const applied = await applyRuleEdit((candidateRules, currentIndex) => {
          candidateRules[currentIndex].position = requestedPosition;
        }, "change inflection-rule position");

        if (!applied) rebuild();
      })();
    });

    mkText(rule.pattern, (candidateRule, value) => {
      candidateRule.pattern = value;

      /*
       * Preserve the existing convenience behavior: when Strip is still empty,
       * a newly entered Pattern also initializes Strip. The decision is now made
       * against the latest queued candidate rather than prematurely mutating the
       * live authoritative rule.
       */
      if (!candidateRule.strip) candidateRule.strip = value;
    });
    mkText(rule.strip, (candidateRule, value) => {
      candidateRule.strip = value;
    });
    mkText(rule.add, (candidateRule, value) => {
      candidateRule.add = value;
    });
    mkText(rule.pos ?? "", (candidateRule, value) => {
      candidateRule.pos = value.trim() === "" ? undefined : value;
    });
    mkText(rule.description ?? "", (candidateRule, value) => {
      candidateRule.description = value.trim() === "" ? undefined : value;
    });

    const enabledTd = tr.createEl("td");
    const enabledEl = enabledTd.createEl("input", { type: "checkbox" });
    enabledEl.checked = rule.enabled;
    enabledEl.addEventListener("change", () => {
      void (async () => {
        const requestedEnabled = enabledEl.checked;
        const applied = await applyRuleEdit((candidateRules, currentIndex) => {
          candidateRules[currentIndex].enabled = requestedEnabled;
        }, "change inflection-rule enabled state");

        if (!applied) rebuild();
      })();
    });

    const deleteTd = tr.createEl("td");
    const deleteBtn = deleteTd.createEl("button", { text: "×" });
    deleteBtn.addEventListener("click", () => {
      void (async () => {
        const label = rule.label.trim();
        const ruleDescription = label
          ? `the inflection rule "${label}"`
          : "this inflection rule";

        const confirmed = await confirmDeletion(this.app, {
          title: "Delete inflection rule?",
          message: `Delete ${ruleDescription} from this language's settings?`,
          confirmText: "Delete rule",
        });

        if (!confirmed) return;

        const applied = await applyRuleEdit((candidateRules, currentIndex) => {
          candidateRules.splice(currentIndex, 1);
        }, "delete inflection rule");

        if (!applied) {
          this.rerender();
          return;
        }

        this.rerender();
      })();
    });
  }
}

/**
 * Small confirmation modal shown before applying a preset that would replace
 * existing inflection rules.
 */
class PresetConfirmModal extends Modal {
  private presetName: string;
  private description: string;
  private existingCount: number;
  private resolve: (confirmed: boolean) => void;
  private decided = false;

  constructor(
    app: App,
    presetName: string,
    description: string,
    existingCount: number,
    resolve: (confirmed: boolean) => void,
  ) {
    super(app);
    this.presetName = presetName;
    this.description = description;
    this.existingCount = existingCount;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `Apply preset "${this.presetName}"?` });
    contentEl.createEl("p", { text: this.description });
    contentEl.createEl("p", {
      cls: "mod-warning",
      text: `This will replace your ${this.existingCount} existing inflection rule${
        this.existingCount === 1 ? "" : "s"
      } for this language. This cannot be undone from inside the settings.`,
    });
    const btnRow = contentEl.createDiv({ cls: "conlang-modal-buttons" });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.decided = true;
      this.resolve(false);
      this.close();
    });
    const ok = btnRow.createEl("button", {
      text: "Replace rules",
      cls: "mod-warning",
    });
    ok.addEventListener("click", () => {
      this.decided = true;
      this.resolve(true);
      this.close();
    });
  }

  onClose() {
    if (!this.decided) this.resolve(false);
    this.contentEl.empty();
  }
}
