import { App, Modal } from "obsidian";

/**
 * Text shown by the shared deletion-confirmation boundary.
 *
 * This module owns authorization only. It never removes settings, vault files,
 * or other creator data itself. The caller must revalidate the exact target
 * after confirmation before performing the deletion.
 */
export interface DeleteConfirmationOptions {
  title: string;
  message: string;
  confirmText: string;
}

/**
 * Fail-closed confirmation modal for plugin-initiated deletion.
 *
 * Only the explicit destructive button resolves true. Cancel, Escape, clicking
 * outside the modal, or any other implicit close resolves false.
 *
 * All caller-supplied strings are rendered with text APIs rather than HTML so
 * creator-authored names and rule text cannot become markup or DOM injection.
 */
class DeleteConfirmModal extends Modal {
  private decided = false;

  constructor(
    app: App,
    private readonly options: DeleteConfirmationOptions,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.message });

    const buttonRow = contentEl.createDiv({
      cls: "conlang-modal-buttons",
    });

    const cancel = buttonRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.finish(false);
    });

    const confirm = buttonRow.createEl("button", {
      text: this.options.confirmText,
      cls: "mod-warning",
    });
    confirm.addEventListener("click", () => {
      this.finish(true);
    });
  }

  private finish(confirmed: boolean): void {
    if (this.decided) return;

    this.decided = true;
    this.resolve(confirmed);
    this.close();
  }

  onClose(): void {
    if (!this.decided) {
      this.decided = true;
      this.resolve(false);
    }

    this.contentEl.empty();
  }
}

/**
 * Ask the user to authorize one exact deletion operation.
 *
 * A true result grants only permission to proceed with the target represented
 * by the supplied text. Callers must still confirm that their captured object
 * is the same object present in current settings before mutating anything.
 */
export function confirmDeletion(
  app: App,
  options: DeleteConfirmationOptions,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    new DeleteConfirmModal(app, options, resolve).open();
  });
}
