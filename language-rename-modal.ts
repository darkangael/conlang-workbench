import { App, Modal, Setting } from "obsidian";

/**
 * Require explicit authorization before changing a configured language's
 * runtime identity and renaming its already-owned structural root.
 *
 * Workbench itself does not rewrite creator-authored Markdown or YAML metadata.
 * The physical folder move uses Obsidian's normal safe rename behavior, so
 * Obsidian may update links according to the creator's link-update preference.
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
        "This renames the language's existing owned root folder and updates " +
        "configured paths beneath that root. Workbench does not rewrite " +
        "creator-authored Markdown or YAML metadata. Obsidian may update links " +
        "according to your normal link-update preference.",
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

/**
 * Keep an actionable rename rejection visible until the creator acknowledges it.
 *
 * Notices are useful for transient status, but rename validation failures stop
 * an explicit requested operation and may contain information the creator needs
 * to read before correcting the request. A small acknowledgement modal avoids
 * losing that explanation after only a few seconds.
 */
class LanguageRenameBlockedModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("Rename blocked");

    this.contentEl.createEl("p", {
      text: this.message,
    });

    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("OK")
        .setCta()
        .onClick(() => {
          this.close();
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function showLanguageRenameBlocked(app: App, message: string): void {
  new LanguageRenameBlockedModal(app, message).open();
}
