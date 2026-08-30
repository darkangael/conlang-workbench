import type { DictionaryEntryWriteResult } from "./dictionary-entry-writer";
import type { TranslationCommitUnresolved } from "./translation-commit-plan";
import type { LanguageConfig } from "./types";
import type { WordCreationResult } from "./word-modal";

/**
 * Operations supplied by the plugin host to the vocabulary-repair workflow.
 *
 * Keeping these as callbacks gives this module only the authority it actually
 * needs: ask for lexical data and persist an explicitly approved entry.
 *
 * In particular, this interface intentionally contains no Editor,
 * MarkdownView, selection range, or replaceRange callback. Completing
 * vocabulary repair must never itself authorize modification of the note that
 * triggered the translation command.
 */
export interface TranslationVocabularyRepairDependencies {
  promptForWord: (
    source: string,
    targetLanguage: LanguageConfig,
  ) => Promise<WordCreationResult | null>;

  writeWord: (
    targetLanguage: LanguageConfig,
    result: WordCreationResult,
  ) => Promise<DictionaryEntryWriteResult>;
}

/**
 * A completed repair means every item that was actually eligible for automatic
 * vocabulary creation was handled. It does NOT mean that the translation is
 * now safe to commit: the caller must reload lexical data, build a fresh
 * translation plan, and obtain separate replacement authorization.
 */
export interface TranslationVocabularyRepairCompleted {
  status: "completed";
  createdCount: number;
  existingCount: number;
}

/**
 * Cancellation is terminal for the current translation workflow.
 *
 * Entries created before cancellation are deliberately not rolled back. Each
 * was separately submitted and authorized by the creator. The counts let the
 * UI report truthfully how much persisted work remains after the operation
 * stops.
 */
export interface TranslationVocabularyRepairCancelled {
  status: "cancelled";
  createdCount: number;
  existingCount: number;
}

/**
 * A persistence failure also stops the queue immediately.
 *
 * As with cancellation, previously completed lexical writes remain valid and
 * are not rolled back. The caller should report the error and must not proceed
 * to translation replacement.
 */
export interface TranslationVocabularyRepairFailed {
  status: "failed";
  createdCount: number;
  existingCount: number;
  error: string;
}

export type TranslationVocabularyRepairResult =
  | TranslationVocabularyRepairCompleted
  | TranslationVocabularyRepairCancelled
  | TranslationVocabularyRepairFailed;

/**
 * Walk the missing-vocabulary portion of a blocked translation plan.
 *
 * Only `reason: "missing"` items belong in this workflow. Ambiguous and
 * unsupported source material require a different kind of creator decision,
 * so silently treating them as word-creation requests would broaden the
 * authority granted by "Create missing words".
 *
 * The queue is deliberately sequential. Each modal must finish before the next
 * begins, keeping the repair operation as one uninterrupted modal workflow.
 */
export async function repairMissingTranslationVocabulary(
  unresolved: readonly TranslationCommitUnresolved[],
  targetLanguage: LanguageConfig,
  dependencies: TranslationVocabularyRepairDependencies,
): Promise<TranslationVocabularyRepairResult> {
  const missing = unresolved.filter((item) => item.reason === "missing");

  let createdCount = 0;
  let existingCount = 0;

  for (const item of missing) {
    // The source word is prefilled as the English/documentation-language
    // definition, but the creator still chooses and submits the conlang form.
    const word = await dependencies.promptForWord(item.source, targetLanguage);

    // Closing, clicking outside, pressing Escape, or choosing Cancel in the
    // word modal all resolve to null. Cancellation ends the ENTIRE remaining
    // repair queue; entries already submitted remain persisted.
    if (!word) {
      return {
        status: "cancelled",
        createdCount,
        existingCount,
      };
    }

    const writeResult = await dependencies.writeWord(targetLanguage, word);

    if (writeResult.status === "created") {
      createdCount += 1;
      continue;
    }

    // The hardened writer can discover that an equivalent lexical entry
    // already exists by the time this individual item reaches persistence.
    // That satisfies this creation step without manufacturing a duplicate.
    if (writeResult.status === "existing") {
      existingCount += 1;
      continue;
    }

    // "blocked" and "failed" both mean the lexical write was not completed.
    // Stop immediately rather than skipping the item and pretending the repair
    // queue succeeded.
    return {
      status: "failed",
      createdCount,
      existingCount,
      error: writeResult.error,
    };
  }

  return {
    status: "completed",
    createdCount,
    existingCount,
  };
}
