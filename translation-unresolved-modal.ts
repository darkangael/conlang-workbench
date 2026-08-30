import { App, Modal } from "obsidian";
import type { TranslationCommitUnresolved } from "./translation-commit-plan";

/**
 * Actions the creator can explicitly choose when an authoritative translation
 * is blocked.
 *
 * A named string union is safer than boolean here because "create missing"
 * authorizes only a vocabulary-repair step. It is NOT permission to replace
 * creator-authored note text.
 */
export type TranslationUnresolvedAction = "cancel" | "create-missing";

/**
 * Explain every blocker and ask what the creator wants to do next.
 *
 * The modal itself never mutates the vault or editor. Even after choosing
 * "create-missing", the caller must separately create vocabulary, reload and
 * re-resolve the translation, show a fresh exact preview, and obtain explicit
 * Replace confirmation.
 */
export function promptTranslationUnresolved(
  app: App,
  unresolved: TranslationCommitUnresolved[],
  postRepair = false,
): Promise<TranslationUnresolvedAction> {
  return new Promise<TranslationUnresolvedAction>((resolve) => {
    const modal = new TranslationUnresolvedModal(
      app,
      unresolved,
      resolve,
      postRepair,
    );
    modal.open();
  });
}

/**
 * Blocked-state translation UI.
 *
 * Creator-authored lexical forms and generated suggestions are rendered only
 * through text APIs. None of these values are interpreted as HTML or Markdown.
 */
class TranslationUnresolvedModal extends Modal {
  private readonly unresolved: TranslationCommitUnresolved[];
  private readonly resolve: (action: TranslationUnresolvedAction) => void;
  private readonly postRepair: boolean;
  private decided = false;

  constructor(
    app: App,
    unresolved: TranslationCommitUnresolved[],
    resolve: (action: TranslationUnresolvedAction) => void,
    postRepair: boolean,
  ) {
    super(app);
    this.unresolved = unresolved;
    this.resolve = resolve;
    this.postRepair = postRepair;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h3", {
      text: "Translation cannot be replaced yet",
    });

    contentEl.createEl("p", {
      text: this.postRepair
        ? "Vocabulary repair finished, but some parts of the translation still " +
          "cannot be resolved safely. The remaining problems are shown below. " +
          "Nothing in the original note has been replaced."
        : "Some parts of the selected text do not yet have enough lexical " +
          "authority for a safe replacement. Nothing has been changed.",
    });

    const list = contentEl.createEl("ul");

    for (const item of this.unresolved) {
      const row = list.createEl("li");

      row.createEl("strong", {
        text: item.source,
      });

      row.appendText(` — ${this.describeReason(item)}`);

      if (item.suggestion) {
        row.createDiv({
          text:
            `Cypher suggestion: ${item.suggestion}. ` +
            "This is only a suggestion, not established vocabulary.",
        });
      }

      if (item.reason === "ambiguous" && item.candidates?.length) {
        const candidateWords = Array.from(
          new Set(item.candidates.map((candidate) => candidate.word)),
        );

        row.createDiv({
          text: `Matching lexical forms: ${candidateWords.join(", ")}`,
        });
      }
    }

    const missingCount = this.unresolved.filter(
      (item) => item.reason === "missing",
    ).length;

    const remainingCount = this.unresolved.length - missingCount;

    if (missingCount > 0) {
      contentEl.createEl("p", {
        text:
          `${missingCount} missing ${missingCount === 1 ? "word can" : "words can"} ` +
          "be added to the target lexicon from here.",
      });

      if (remainingCount > 0) {
        contentEl.createEl("p", {
          text:
            "Missing vocabulary can be repaired here. Other blockers are " +
            "explained above and will still need to be resolved separately.",
        });
      }

      contentEl.createEl("p", {
        text:
          "If you cancel or close this workflow after starting, any vocabulary " +
          "entries you already created will remain saved. Anything still " +
          "unfinished, including the translation replacement, will be cancelled.",
      });
    }

    const buttonRow = contentEl.createDiv({
      cls: "conlang-modal-buttons",
    });

    const cancelButton = buttonRow.createEl("button", {
      text: "Cancel",
    });

    cancelButton.addEventListener("click", () => {
      this.finish("cancel");
    });

    // Only missing vocabulary can be repaired by creating new words.
    // Ambiguity and unsupported structures need different resolution paths, so
    // do not show a creation action when it cannot actually solve anything.
    if (missingCount > 0 && !this.postRepair) {
      const createButton = buttonRow.createEl("button", {
        text:
          missingCount === 1 ? "Create missing word" : "Create missing words",
      });

      createButton.addEventListener("click", () => {
        this.finish("create-missing");
      });
    }
  }

  /**
   * Give the creator the most useful explanation available for each planner
   * classification without pretending the plugin knows more than it does.
   */
  private describeReason(item: TranslationCommitUnresolved): string {
    switch (item.reason) {
      case "missing":
        return (
          "no established target-language entry matches this source text. " +
          "Create or add the intended vocabulary before replacing the note."
        );

      case "ambiguous":
        return (
          "more than one established target-language entry matches. " +
          "Review the matching lexical entries or senses so the intended " +
          "translation can be distinguished instead of choosing one silently."
        );

      case "unsupported":
        return (
          "the current commit workflow cannot safely authorize this form. " +
          "Check whether it is an inflected form, phrase, or another structure " +
          "that needs a more specific translation rule or future support."
        );
    }
  }

  /**
   * Resolve exactly once before closing.
   *
   * close() invokes onClose(), so setting `decided` first prevents an explicit
   * action from being mistaken for an implicit cancellation.
   */
  private finish(action: TranslationUnresolvedAction) {
    if (this.decided) return;

    this.decided = true;
    this.resolve(action);
    this.close();
  }

  onClose() {
    // Escape, outside click, X, or any other implicit close is always Cancel.
    if (!this.decided) {
      this.decided = true;
      this.resolve("cancel");
    }

    this.contentEl.empty();
  }
}
