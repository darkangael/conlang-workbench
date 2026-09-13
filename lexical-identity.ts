import type { DictionaryEntry } from "./types";

export type LexicalIdentityResolution<T extends DictionaryEntry> =
  | {
      status: "unresolved";
      targets: readonly [];
    }
  | {
      status: "unique";
      targets: readonly [T];
    }
  | {
      status: "ambiguous";
      targets: readonly T[];
    };

export type LexicalEquivalence = "same" | "different" | "indeterminate";

function normalizeLexemeId(id: string): string {
  return id.trim().toLowerCase();
}

function sharesLexicalLanguageScope(
  candidate: DictionaryEntry,
  languageId?: string,
  language?: string,
): boolean {
  if (languageId && candidate.languageId !== languageId) return false;
  if (language && candidate.language !== language) return false;

  return true;
}

export class LexicalIdentityIndex {
  private byId = new Map<string, DictionaryEntry[]>();

  clear(): void {
    this.byId.clear();
  }

  add(entry: DictionaryEntry): void {
    const key = entry.lexemeId ? normalizeLexemeId(entry.lexemeId) : "";
    if (!key) return;

    const entries = this.byId.get(key) ?? [];
    entries.push(entry);
    this.byId.set(key, entries);
  }

  resolve(
    lexemeId: string,
    languageId?: string,
    language?: string,
  ): LexicalIdentityResolution<DictionaryEntry> {
    const key = normalizeLexemeId(lexemeId);

    if (!key) {
      return { status: "unresolved", targets: [] };
    }

    const targets = (this.byId.get(key) ?? []).filter((candidate) =>
      sharesLexicalLanguageScope(candidate, languageId, language),
    );

    if (targets.length === 0) {
      return { status: "unresolved", targets: [] };
    }

    if (targets.length === 1) {
      return { status: "unique", targets: [targets[0]] };
    }

    return { status: "ambiguous", targets };
  }

  compare(
    left: DictionaryEntry,
    right: DictionaryEntry,
  ): LexicalEquivalence {
    const leftId = left.lexemeId ? normalizeLexemeId(left.lexemeId) : "";
    const rightId = right.lexemeId ? normalizeLexemeId(right.lexemeId) : "";

    if (!leftId || !rightId) return "indeterminate";
    if (leftId !== rightId) return "different";

    const leftResolution = this.resolve(
      left.lexemeId!,
      left.languageId,
      left.language,
    );

    const rightResolution = this.resolve(
      right.lexemeId!,
      right.languageId,
      right.language,
    );

    if (
      leftResolution.status !== "unique" ||
      rightResolution.status !== "unique"
    ) {
      return "indeterminate";
    }

    return leftResolution.targets[0] === rightResolution.targets[0]
      ? "same"
      : "different";
  }
}
