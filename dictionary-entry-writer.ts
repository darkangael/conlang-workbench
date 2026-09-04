import { App, TFile, TFolder } from "obsidian";
import {
  classifyDictionarySourceAuthority,
  compareDictionaryDefinition,
} from "./dictionary-source";
import { joinVaultPath } from "./vault-paths";
import { createPortableLinguisticId } from "./portable-id";

/**
 * Information supplied to the entry-specific Markdown builder.
 *
 * The persistence layer decides whether a homograph is required. The caller
 * still owns the actual linguistic/document template and can therefore retain
 * legitimate differences between ordinary words, names, and other lexical
 * entry types.
 */
export interface DictionaryEntryContentContext {
  wordOverride: boolean;

  /**
   * Newly generated portable lexical identity for this exact creation.
   *
   * This is undefined when portable IDs are disabled. The writer generates it
   * only after fresh destination analysis has authorized a new persistent
   * lexical source, so inspection, blocked writes, and reused existing entries
   * never consume or manufacture linguistic identity.
   */
  lexemeId?: string;
}

/**
 * Inputs required to persist one lexical entry safely.
 *
 * `buildContent` is deliberately a callback rather than a pre-built string.
 * The writer must first establish whether the entry is a homograph because
 * that decision determines whether the generated note needs an explicit
 * `word:` override.
 */
export interface DictionaryEntryWriteRequest {
  app: App;
  form: string;
  definition: string;
  partOfSpeech?: string;
  dictionaryFolder: string;

  /**
   * Whether this language wants Workbench to generate portable linguistic IDs
   * for newly created lexical notes. This never authorizes editing an existing
   * note or backfilling an older one.
   */
  includePortableIds?: boolean;

  buildContent: (context: DictionaryEntryContentContext) => string;
}

/**
 * Read-only result used when a command needs to know whether creation is
 * necessary before it asks the user for additional information.
 *
 * Inspection never creates folders or files. "available" means only that no
 * same-spelling source currently blocks creation; it is not itself permission
 * to mutate the vault.
 */
export type DictionaryEntryInspectionResult =
  | {
      status: "available";
      path: string;
    }
  | {
      status: "existing";
      path: string;
      file: TFile;
    }
  | {
      status: "different";
      path: string;
      file: TFile;
    }
  | {
      status: "blocked";
      error: string;
    };

export type DictionaryEntryWriteResult =
  | {
      status: "created";
      path: string;
      file: TFile;
      wordOverride: boolean;

      /**
       * True only when this language requested portable IDs but the current
       * runtime did not provide the UUID capability needed to generate one.
       *
       * The lexical note was still created successfully. This flag lets the
       * UI tell the creator that the optional ID can be backfilled later
       * without making the persistence layer responsible for notifications.
       */
      portableIdOmitted: boolean;
    }
  | {
      status: "existing";
      path: string;
      file: TFile;
    }
  | {
      status: "blocked";
      error: string;
    }
  | {
      status: "failed";
      error: string;
    };

/**
 * Replace characters that cannot safely participate in the generated filename.
 *
 * This preserves the existing Workbench filename behavior during the
 * extraction. Broader filename policy is intentionally outside this security
 * refactor.
 */
function safeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Find a free path for a genuine homograph.
 *
 * A different persistent file is authorized only after source authority and
 * definition comparison have established that the same-spelling lexical entry
 * represents a different meaning.
 */
function freeHomographPath(
  app: App,
  folder: string,
  safeName: string,
  partOfSpeech?: string,
): string {
  const pos = safeFilenamePart((partOfSpeech ?? "").trim());

  if (pos) {
    const candidate = joinVaultPath(folder, `${safeName} (${pos}).md`);
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }

  for (let n = 2; n < 100; n++) {
    const candidate = joinVaultPath(folder, `${safeName} (${n}).md`);
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }

  // Preserve the existing fallback behavior for exceptionally large homograph
  // sets. Date.now() is used only after all ordinary numbered slots are full.
  return joinVaultPath(folder, `${safeName} (${Date.now()}).md`);
}

function unknownDefinitionMessage(file: TFile): string {
  return (
    `couldn't safely determine whether existing entry "${file.path}" ` +
    "already contains this meaning because its frontmatter is unavailable " +
    "or unusable"
  );
}

function nonLexicalSourceMessage(file: TFile): string {
  return (
    `existing file "${file.path}" is not established as a lexical entry. ` +
    "It was preserved unchanged and no new entry was created"
  );
}

/**
 * Internal result of analyzing one exact same-spelling destination.
 *
 * This is the single source of truth for the security-sensitive read decision.
 * Both preview/inspection and final writing call this helper independently.
 * That means the writer still re-checks current vault state after a modal or
 * other asynchronous UI gap rather than trusting an earlier observation.
 */
type DictionaryDestinationAnalysis =
  | {
      status: "available";
      path: string;
      safeName: string;
    }
  | {
      status: "existing";
      path: string;
      safeName: string;
      file: TFile;
    }
  | {
      status: "different";
      path: string;
      safeName: string;
      file: TFile;
    }
  | {
      status: "blocked";
      error: string;
    };

/**
 * Analyze whether the exact lexical destination is available, already
 * represents this meaning, represents a confirmed different meaning, or must
 * block safely.
 *
 * This helper is deliberately read-only. It does not create folders, allocate
 * persistent files, or treat an earlier inspection as permission to mutate.
 */
function analyzeDictionaryDestination(
  app: App,
  dictionaryFolder: string,
  form: string,
  definition: string,
): DictionaryDestinationAnalysis {
  const trimmedForm = form.trim();

  if (!trimmedForm) {
    return {
      status: "blocked",
      error: "empty conlang form",
    };
  }

  const safeName = safeFilenamePart(trimmedForm);

  let path: string;
  try {
    path = joinVaultPath(dictionaryFolder, `${safeName}.md`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      status: "blocked",
      error: `invalid dictionary folder "${dictionaryFolder}": ${message}`,
    };
  }

  const existing = app.vault.getAbstractFileByPath(path);

  if (!existing) {
    return {
      status: "available",
      path,
      safeName,
    };
  }

  if (!(existing instanceof TFile)) {
    return {
      status: "blocked",
      error:
        `existing vault object "${path}" is not a file. ` +
        "It was preserved unchanged and no new entry was created",
    };
  }

  const cache = app.metadataCache.getFileCache(existing);
  const authority = classifyDictionarySourceAuthority(cache?.frontmatter);

  if (authority === "unknown") {
    return {
      status: "blocked",
      error: unknownDefinitionMessage(existing),
    };
  }

  if (authority !== "lexical") {
    return {
      status: "blocked",
      error: nonLexicalSourceMessage(existing),
    };
  }

  const comparison = compareDictionaryDefinition(
    cache?.frontmatter,
    definition,
  );

  if (comparison === "same") {
    return {
      status: "existing",
      path,
      safeName,
      file: existing,
    };
  }

  if (comparison === "unknown") {
    return {
      status: "blocked",
      error: unknownDefinitionMessage(existing),
    };
  }

  return {
    status: "different",
    path,
    safeName,
    file: existing,
  };
}

/**
 * Inspect the same-spelling lexical destination without mutating the vault.
 *
 * Some UI flows need this before showing another modal: if the requested word
 * and meaning already exist, they can open that entry immediately instead of
 * asking the creator for information that will never be used.
 *
 * This public function intentionally performs a fresh call to the shared
 * analyzer. Its result is information for the UI, not later write authority.
 */
export function inspectDictionaryEntry(
  app: App,
  dictionaryFolder: string,
  form: string,
  definition: string,
): DictionaryEntryInspectionResult {
  const analysis = analyzeDictionaryDestination(
    app,
    dictionaryFolder,
    form,
    definition,
  );

  if (analysis.status === "blocked") {
    return analysis;
  }

  if (analysis.status === "existing") {
    return {
      status: "existing",
      path: analysis.path,
      file: analysis.file,
    };
  }

  if (analysis.status === "different") {
    return {
      status: "different",
      path: analysis.path,
      file: analysis.file,
    };
  }

  return {
    status: "available",
    path: analysis.path,
  };
}

/**
 * Persist one lexical entry through a single reusable safety boundary.
 *
 * Safety order matters:
 *
 * 1. Re-analyze the current destination immediately for this write attempt.
 * 2. Stop on unknown, nonlexical, or otherwise unsafe collisions.
 * 3. Allocate a homograph only for a confirmed different meaning.
 * 4. Require the configured dictionary folder to already exist as a folder.
 * 5. Build the intended content before performing any vault mutation.
 * 6. Re-check that folder immediately before the actual file creation.
 * 7. Use vault.create(), which creates a new source rather than overwriting an
 *    existing creator-authored note.
 *
 * Keeping these decisions together prevents individual creation commands from
 * gradually developing different mutation-authority rules.
 */
export async function writeDictionaryEntry(
  request: DictionaryEntryWriteRequest,
): Promise<DictionaryEntryWriteResult> {
  // This is a fresh analysis even if the caller inspected earlier. UI can
  // remain open while the vault changes, so an old inspection must never act
  // as authorization for a later persistent write.
  const analysis = analyzeDictionaryDestination(
    request.app,
    request.dictionaryFolder,
    request.form,
    request.definition,
  );

  if (analysis.status === "blocked") {
    return analysis;
  }

  if (analysis.status === "existing") {
    return {
      status: "existing",
      path: analysis.path,
      file: analysis.file,
    };
  }

  let path = analysis.path;
  let wordOverride = false;

  if (analysis.status === "different") {
    // "different" is the only analysis result that authorizes another
    // persistent lexical source for this spelling.
    path = freeHomographPath(
      request.app,
      request.dictionaryFolder,
      analysis.safeName,
      request.partOfSpeech,
    );
    wordOverride = true;
  }

  /*
   * Ordinary lexical creation may create a note inside an established
   * dictionary folder, but it may not establish or resurrect that structural
   * source boundary. Missing structure requires explicit creator reconciliation
   * through Repair before lexical creation can continue.
   */
  const dictionaryFolder = request.app.vault.getAbstractFileByPath(
    request.dictionaryFolder,
  );

  if (!(dictionaryFolder instanceof TFolder)) {
    return {
      status: "blocked",
      error: dictionaryFolder
        ? `configured dictionary path "${request.dictionaryFolder}" is not a folder. ` +
          "It was preserved unchanged; repair the language structure before creating lexical entries"
        : `configured dictionary folder "${request.dictionaryFolder}" is missing. ` +
          "Repair the language root before creating lexical entries",
    };
  }

  /*
   * Portable linguistic identity is attempted only after the fresh destination
   * analysis above has established that this operation may create a new source
   * and the configured dictionary folder has been confirmed to exist.
   *
   * In particular, an existing same-meaning entry returns before reaching this
   * point, and an unsafe collision also returns before reaching it. Generating
   * here therefore keeps identity allocation coupled to an authorized creation
   * attempt without performing any vault mutation.
   *
   * Portable identity remains optional infrastructure. If this runtime lacks
   * randomUUID(), creation continues without lexeme_id and the successful
   * result records that omission for the UI. An unexpected exception from an
   * available generator is different: it fails closed before vault mutation.
   */
  let content: string;
  let portableIdOmitted = false;

  try {
    let lexemeId: string | undefined;

    if (request.includePortableIds) {
      const portableId = createPortableLinguisticId("lex");

      if (portableId.status === "created") {
        lexemeId = portableId.id;
      } else {
        portableIdOmitted = true;
      }
    }

    // Build before the vault mutation. A template/programming failure or an
    // unexpected ID-generation failure must not leave a partial lexical note.
    content = request.buildContent({ wordOverride, lexemeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      status: "failed",
      error: `couldn't prepare dictionary entry content: ${message}`,
    };
  }

  /*
   * Re-check immediately before mutation rather than trusting the earlier
   * folder observation. A creator may move, rename, or remove the configured
   * source while UI work is in progress; that change must revoke this write.
   */
  const currentDictionaryFolder = request.app.vault.getAbstractFileByPath(
    request.dictionaryFolder,
  );

  if (!(currentDictionaryFolder instanceof TFolder)) {
    return {
      status: "blocked",
      error: currentDictionaryFolder
        ? `configured dictionary path "${request.dictionaryFolder}" is no longer a folder. ` +
          "It was preserved unchanged; repair the language structure before creating lexical entries"
        : `configured dictionary folder "${request.dictionaryFolder}" is no longer present. ` +
          "Repair the language root before creating lexical entries",
    };
  }

  try {
    const file = await request.app.vault.create(path, content);

    return {
      status: "created",
      path,
      file,
      wordOverride,
      portableIdOmitted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      status: "failed",
      error: `couldn't create "${path}": ${message}`,
    };
  }
}
