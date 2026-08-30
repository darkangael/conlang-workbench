import { App, Modal, Setting } from "obsidian";
import type { CanonicalSourceIssue } from "./language-source-preflight";

function inventoryLabel(inventory: CanonicalSourceIssue["inventory"]): string {
  switch (inventory) {
    case "lexicon":
      return "Lexicon";
    case "morphemes":
      return "Morphemes";
    case "examples":
      return "Examples";
    case "phonology":
      return "Phonology";
    default:
      return "Language source";
  }
}

function issueText(issue: CanonicalSourceIssue): string {
  switch (issue.kind) {
    case "blank-language-name":
      return "A configured language has a blank name.";

    case "duplicate-language-name":
      return `Language identity "${issue.language}" is configured more than once.`;

    case "unknown-active-language":
      return (
        `Active language "${issue.language}" is no longer present in the ` +
        "configured language list."
      );

    case "invalid-path":
      return (
        `${issue.language}: ${inventoryLabel(issue.inventory)} path ` +
        `"${issue.path}" is invalid. ${issue.detail ?? ""}`
      ).trim();

    case "missing-folder":
      return (
        `${issue.language}: ${inventoryLabel(issue.inventory)} folder ` +
        `"${issue.path}" does not exist.`
      );

    case "not-folder":
      return (
        `${issue.language}: ${inventoryLabel(issue.inventory)} path ` +
        `"${issue.path}" exists, but it is not a folder.`
      );

    case "overlap":
      return (
        `${inventoryLabel(issue.inventory)} source overlap: ` +
        `${issue.language} uses "${issue.path}" while ` +
        `${issue.otherLanguage} uses "${issue.otherPath}".`
      );
  }
}

/**
 * Explain why a language-data reload was refused.
 *
 * This modal is diagnostic only. Closing it cannot authorize a reload, repair
 * settings, create folders, or otherwise mutate creator data.
 */
class LanguageSourceDiagnosticsModal extends Modal {
  constructor(
    app: App,
    private readonly issues: CanonicalSourceIssue[],
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.setTitle("Language data reload blocked");

    contentEl.createEl("p", {
      text:
        "Conlang Workbench kept the currently loaded language data unchanged " +
        "because one or more configured canonical sources are unsafe to reload.",
    });

    const list = contentEl.createEl("ul");
    for (const issue of this.issues) {
      list.createEl("li", { text: issueText(issue) });
    }

    contentEl.createEl("p", {
      text:
        "Correct the configuration or folder conflict, then reload again. " +
        "Workbench did not move, rename, create, or delete any vault files.",
    });

    new Setting(contentEl).addButton((button) => {
      button.setButtonText("Close").onClick(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function showLanguageSourceDiagnostics(
  app: App,
  issues: CanonicalSourceIssue[],
): void {
  new LanguageSourceDiagnosticsModal(app, issues).open();
}
