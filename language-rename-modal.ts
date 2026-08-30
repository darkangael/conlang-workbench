import { App, Modal, Setting } from "obsidian";

/**
 * Require explicit authorization before changing a configured language's
 * runtime identity.
 *
 * Rename keeps the existing canonical folder paths and files. It does not
 * rewrite creator-authored Markdown or YAML metadata.
 */
class LanguageRenameConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly oldName: string,
    private readonly newName: string,
    private readonly resolveResult: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Rename language?");

    this.contentEl.createEl("p", {
      text: `Rename "${this.oldName}" to "${this.newName}"?`,
    });

    this.contentEl.createEl("p", {
      text:
        "This changes the configured language identity while keeping its " +
        "existing canonical folder paths and files. Creator-authored language " +
        "metadata inside those files is not rewritten.",
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
          this.close();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText("Rename")
          .setCta()
          .onClick(() => {
            this.finish(true);
            this.close();
          }),
      );
  }

  onClose(): void {
    // Escape, outside-click, and any other implicit close path fail closed.
    this.finish(false);
    this.contentEl.empty();
  }

  private finish(confirmed: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveResult(confirmed);
  }
}

export function confirmLanguageRename(
  app: App,
  oldName: string,
  newName: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    new LanguageRenameConfirmModal(app, oldName, newName, resolve).open();
  });
}
