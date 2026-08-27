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
   * Re-render the tab from the current MorphemeInventory.
   *
   * The search controls and results containers are mounted once per full tab
   * render. Filtering then refreshes only the results so the search field keeps
   * keyboard focus while the user types.
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
   * Refresh only the morpheme results.
   *
   * The search control remains mounted so typing does not lose focus whenever
   * the filtered results change.
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
    this.renderList(filtered);
  }

  /**
   * Render the current morpheme inventory as clickable rows.
   *
   * Sorting is intentionally simple for the first visible inventory: citation
   * form first, using ordinary locale-aware alphabetical order.
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
   * Render one documented morpheme.
   *
   * The visible form and gloss are primary. Type and distribution are
   * descriptive metadata rather than lexical categories.
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
   * Render the initial empty state.
   *
   * A configured language may legitimately have no documented morphemes, so
   * an empty inventory is ordinary data rather than an error condition.
   */
  private renderEmptyState(): void {
    if (!this.rootEl) return;

    this.rootEl.createDiv({
      cls: "conlang-morpheme-empty",
      text: "No morphemes are documented for the active language(s).",
    });
  }

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
   * Render a small inventory summary.
   *
   * Browsing, searching, filters, and individual rows will be added on top of
   * this foundation once the tab is successfully hosted by panel.ts.
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
   * This is defined now because row rendering will need it shortly. Keeping
   * navigation here means panel.ts does not need to know how MorphemeTab rows
   * behave.
   */
  private async openMorpheme(morpheme: Morpheme): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(morpheme.path);

    if (file instanceof TFile) {
      await this.plugin.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
