import { TFile } from "obsidian";
import type ConlangPlugin from "./main";
import type { Morpheme } from "./types";

/**
 * UI controller for the Morpheme Inventory tab.
 *
 * Morphological data and indexing belong to MorphemeInventory in
 * morphemes.ts. This class is responsible only for presenting that data and
 * handling interactions within the Morphemes tab.
 *
 * Keeping the UI separate from TranslationPanelView prevents panel.ts from
 * becoming the owner of every feature-specific interface.
 */
export class MorphemeTab {
  private rootEl: HTMLElement | null = null;
  private searchQuery = "";
  private typeFilter = "";
  private distributionFilter = "";
  private summaryEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;

  constructor(private plugin: ConlangPlugin) {}

  /**
   * Attach the tab to its parent container.
   *
   * The parent panel owns the container and tab switching. MorphemeTab owns
   * everything rendered inside that container.
   */
  mount(container: HTMLElement): void {
    this.rootEl = container;
    this.render();
  }

  /**
   * Rebuild the Morphemes tab from the current MorphemeInventory.
   *
   * A full render recreates the persistent search/filter controls and the
   * result containers. Routine searching and filtering should instead call
   * renderResults() so those controls are not destroyed and recreated.
   */
  render(): void {
    if (!this.rootEl) return;

    this.rootEl.empty();

    this.renderSearch();

    this.summaryEl = this.rootEl.createDiv({
      cls: "conlang-morpheme-summary-container",
    });

    this.listEl = this.rootEl.createDiv({
      cls: "conlang-morpheme-list",
    });

    this.renderResults();
  }

  /**
   * Refresh only the displayed morpheme results.
   *
   * This function gets the current morpheme inventory, applies the active
   * search and filter settings, clears the old result summary and rows, and
   * then displays the newly filtered results.
   *
   * It also handles two different empty states:
   * - no morphemes have been documented at all;
   * - morphemes exist, but none match the current search or filters.
   *
   * Unlike render(), this does not rebuild the search box or filter controls.
   * Keeping those controls mounted prevents the search field from losing
   * keyboard focus every time the user types.
   */
  private renderResults(): void {
    if (!this.summaryEl || !this.listEl) return;

    const morphemes = this.plugin.morphemes.allMorphemes();
    const filtered = this.filterMorphemes(morphemes);

    this.summaryEl.empty();
    this.listEl.empty();

    if (morphemes.length === 0) {
      this.summaryEl.createDiv({
        cls: "conlang-morpheme-empty",
        text: "No morphemes are documented for the active language(s).",
      });
      return;
    }

    this.renderSummary(filtered, morphemes.length);

    if (filtered.length === 0) {
      this.listEl.createDiv({
        cls: "conlang-morpheme-empty",
        text: "No matching morphemes.",
      });
      return;
    }

    this.renderList(filtered);
  }

  /**
   * Render the current set of morphemes as clickable rows.
   *
   * A copy of the result list is sorted alphabetically by morpheme form before
   * rendering. Using slice() prevents the display sort from changing the order
   * of the underlying MorphemeInventory data.
   */
  private renderList(morphemes: Morpheme[]): void {
    if (!this.listEl) return;

    const list = this.listEl;

    const sorted = morphemes
      .slice()
      .sort((a, b) => a.form.localeCompare(b.form));

    for (const morpheme of sorted) {
      this.renderRow(list, morpheme);
    }
  }

  /**
   * Render one morpheme as a clickable inventory row.
   *
   * The morpheme form and gloss are the main visible information. Type and
   * distribution are shown as supporting metadata. When multiple languages are
   * active, the morpheme's language is also displayed.
   *
   * Clicking the row opens the canonical Markdown note for that morpheme.
   */
  private renderRow(parent: HTMLElement, morpheme: Morpheme): void {
    const row = parent.createDiv({
      cls: "conlang-morpheme-row",
    });

    // Known morpheme types can receive type-specific visual treatment in CSS.
    // Custom types remain valid; they simply have no special styling unless a
    // matching CSS class is defined for them.
    if (morpheme.type) {
      const typeClass = morpheme.type
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");

      if (typeClass) {
        row.addClass(`type-${typeClass}`);
      }
    }

    const head = row.createDiv({
      cls: "conlang-morpheme-row-head",
    });

    head.createSpan({
      cls: "conlang-morpheme-form",
      text: morpheme.form,
    });

    const metadata = [morpheme.type, morpheme.distribution].filter(
      (value): value is string => Boolean(value),
    );

    if (metadata.length > 0) {
      head.createSpan({
        cls: "conlang-morpheme-meta",
        text: metadata.join(" · "),
      });
    }

    row.createDiv({
      cls: "conlang-morpheme-gloss",
      text: morpheme.gloss,
    });

    if (this.plugin.getActiveLanguages().length > 1 && morpheme.language) {
      row.createDiv({
        cls: "conlang-morpheme-language",
        text: morpheme.language,
      });
    }

    row.addClass("conlang-clickable");
    row.title = "Open morpheme note";

    row.addEventListener("click", () => {
      void this.openMorpheme(morpheme);
    });
  }

  /**
   * Build the persistent search and filter controls for the Morphemes tab.
   *
   * These controls are created during a full render() and remain mounted while
   * the user searches or changes filters. Their event handlers update the saved
   * filter state and call renderResults() rather than rebuilding the whole tab.
   */
  private renderSearch(): void {
    if (!this.rootEl) return;

    const toolbar = this.rootEl.createDiv({
      cls: "conlang-browser-toolbar",
    });

    const searchInput = toolbar.createEl("input", {
      type: "search",
      cls: "conlang-browser-search",
      placeholder: "Search forms or glosses…",
    });

    searchInput.value = this.searchQuery;

    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderResults();
    });

    const controlsRow = this.rootEl.createDiv({
      cls: "conlang-browser-controls",
    });

    const typeLabel = controlsRow.createSpan({
      cls: "conlang-browser-control-label",
    });
    typeLabel.setText("Type");

    const typeSelect = controlsRow.createEl("select", {
      cls: "conlang-browser-select",
    });

    typeSelect.createEl("option", {
      text: "All",
      value: "",
    });

    const morphemes = this.plugin.morphemes.allMorphemes();

    for (const type of this.getAvailableTypes(morphemes)) {
      typeSelect.createEl("option", {
        text: type,
        value: type,
      });
    }

    typeSelect.value = this.typeFilter;

    typeSelect.addEventListener("change", () => {
      this.typeFilter = typeSelect.value;
      this.renderResults();
    });

    const distributionLabel = controlsRow.createSpan({
      cls: "conlang-browser-control-label",
    });

    distributionLabel.setText("Distribution");

    const distributionSelect = controlsRow.createEl("select", {
      cls: "conlang-browser-select",
    });

    distributionSelect.createEl("option", {
      text: "All",
      value: "",
    });

    for (const distribution of ["free", "bound", "both"]) {
      distributionSelect.createEl("option", {
        text: distribution,
        value: distribution,
      });
    }

    distributionSelect.value = this.distributionFilter;

    distributionSelect.addEventListener("change", () => {
      this.distributionFilter = distributionSelect.value;
      this.renderResults();
    });
  }

  /**
   * Apply the current Type, Distribution, and text-search filters.
   *
   * Type and Distribution are rejection filters: a morpheme must satisfy every
   * selected filter to remain in the result set. The text query is then matched
   * against form, gloss, type, and distribution.
   *
   * In other words, active filters combine with AND semantics rather than one
   * filter replacing another.
   */
  private filterMorphemes(morphemes: Morpheme[]): Morpheme[] {
    const query = this.searchQuery.trim().toLowerCase();

    return morphemes.filter((morpheme) => {
      if (
        this.typeFilter &&
        morpheme.type?.trim().toLowerCase() !== this.typeFilter.toLowerCase()
      ) {
        return false;
      }

      if (
        this.distributionFilter &&
        morpheme.distribution !== this.distributionFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      if (morpheme.form.toLowerCase().includes(query)) return true;
      if (morpheme.gloss.toLowerCase().includes(query)) return true;
      if (morpheme.type?.toLowerCase().includes(query)) return true;
      if (morpheme.distribution?.toLowerCase().includes(query)) return true;

      return false;
    });
  }

  /**
   * Return the morpheme types available to the filter.
   *
   * Common types are always available so the UI remains predictable, while
   * creator-defined types found in the loaded inventory are added dynamically.
   */
  private getAvailableTypes(morphemes: Morpheme[]): string[] {
    const known = [
      "root",
      "stem",
      "prefix",
      "suffix",
      "infix",
      "circumfix",
      "clitic",
    ];

    const types = new Set<string>(known);

    for (const morpheme of morphemes) {
      const type = morpheme.type?.trim().toLowerCase();
      if (type) {
        types.add(type);
      }
    }

    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Display the size of the current result set.
   *
   * When no filtering is hiding results, this shows the total inventory size,
   * such as "2 morphemes". When search or filters reduce the result set, it
   * shows both values, such as "1 of 2 shown".
   */
  private renderSummary(morphemes: Morpheme[], total: number): void {
    if (!this.summaryEl) return;

    const shown = morphemes.length;

    this.summaryEl.createDiv({
      cls: "conlang-morpheme-summary",
      text:
        shown === total
          ? `${total} ${total === 1 ? "morpheme" : "morphemes"}`
          : `${shown} of ${total} shown`,
    });
  }

  /**
   * Open the canonical Markdown note belonging to a morpheme.
   *
   * The stored morpheme path is resolved through the Obsidian vault. If it
   * points to a Markdown file, that file is opened in the current workspace.
   *
   * Navigation stays inside MorphemeTab so panel.ts does not need to know how
   * individual Morpheme Inventory rows behave.
   */
  private async openMorpheme(morpheme: Morpheme): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(morpheme.path);

    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
