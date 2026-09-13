# Stable Lexical Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose creator-authored stable lexical identity throughout the runtime dictionary, add ambiguity-safe language-scoped lexical-ID resolution and equivalence, and use that identity for confirmed lexical-ownership decisions without breaking legacy ID-less dictionaries.

**Architecture:** `dictionary-source.ts` will project the already-parsed `lexeme_id` onto `DictionaryEntry.lexemeId`. A new focused `lexical-identity.ts` module will own normalized stable-ID indexing, language-scoped resolution, and lexical-equivalence decisions. `Dictionary` remains the public façade and lifecycle owner, delegates stable-identity operations to that module, and converts only confirmed identity-sensitive consumers such as declared-form lemma recovery while retaining paths for source-location work.

**Tech Stack:** TypeScript, Obsidian plugin APIs, Node.js, esbuild-based test harnesses, existing repository regression scripts.

**Spec:** `docs/superpowers/specs/2026-09-12-stable-lexical-identity-design.md`

## Global Constraints

- Preserve first; diagnose second; mutate only with explicit intent.
- Existing lexical notes without `lexeme_id` must remain fully usable.
- Do not perform portable-ID backfill or rewrite creator-authored Markdown.
- Arbitrary nonblank creator-authored lexical IDs remain valid; generated `lex-UUID` shape is not a parser requirement.
- Stable lexical-ID lookup must preserve every match and must not assume global uniqueness.
- Stable lexical-ID resolution must remain language-scoped and explicit about `unresolved`, `unique`, and `ambiguous`.
- Lexical equivalence must preserve `same`, `different`, and `indeterminate`.
- Do not silently fall back to path when supplied stable identity is ambiguous, unresolved, or contradictory.
- Path remains authoritative for source location, file opening, vault events, and source diagnostics.
- Existing textual `parts:` relationships remain unchanged.
- `LexicalSense.id` remains separate and lexeme-local.
- Source records remain conceptually separate from lexical runtime entries and are not physically extracted in this phase.
- Do not edit generated `main.js` manually.
- Use exact staging allowlists; never use `git add .`.
- Preserve protected untracked files outside the index.

---

## File Structure

### Create

`lexical-identity.ts`

Owns only lexical identity:
- stable lexical-ID normalization;
- stable-ID indexing;
- language-scoped lookup;
- explicit cardinality resolution;
- lexical-equivalence decisions.

It must not own word lookup, forms, English lookup, sense parsing, phrase indexing, source parsing, file I/O, writers, or diagnostics UI.

### Modify

`types.ts`

Adds:

```ts
lexemeId?: string;
```

to `DictionaryEntry`.

`dictionary-source.ts`

Projects the already-parsed normalized `lexeme_id` into the returned `DictionaryEntry`.

`dictionary.ts`

Adds one `LexicalIdentityIndex` instance, clears and populates it alongside existing dictionary indexes, delegates identity lookup/equivalence through narrow façade methods, and updates declared-form lemma recovery to use stable lexical identity when available.

`scripts/test-frontmatter-parsing.mjs`

Extends existing lexical source parsing coverage to verify that `lexeme_id` is visible on `DictionaryEntry.lexemeId` and survives respelling independently from the visible lemma.

`scripts/test-dictionary-language-scope.mjs`

Extends the existing real-`Dictionary` harness to verify stable-ID lookup, duplicate-ID ambiguity, cross-language local-ID reuse, legacy ID-less compatibility, mixed-identity behavior, and stable-ID declared-form ownership.

### Do Not Modify Unless a Later Task Proves It Necessary

- `lexical-part-relationships.ts`
- `lexical-senses.ts`
- `dictionary-entry-writer.ts`
- `workbench-id.ts`
- source-diagnostics modules
- generated `main.js`

---

### Task 1: Project Stable Lexical Identity onto `DictionaryEntry`

**Files:**
- Modify: `types.ts:117-184`
- Modify: `dictionary-source.ts:292-316`
- Modify: `dictionary-source.ts:392-421`
- Test: `scripts/test-frontmatter-parsing.mjs:789-867`

**Interfaces:**
- Consumes: `WorkbenchSourceRecord.identity.linguisticID`, already populated by `parseDictionarySource()`.
- Produces: `DictionaryEntry.lexemeId?: string`.

- [ ] **Step 1: Extend the existing lexical-ID parser test with a failing runtime-projection assertion**

In `scripts/test-frontmatter-parsing.mjs`, extend the existing `explicitLexemeIdSource` assertions:

```js
assert.equal(
  explicitLexemeIdSource.value?.lexemeId,
  "lex-river-001",
  "the accepted runtime DictionaryEntry must expose creator-authored lexical identity",
);
```

Extend the respelling case:

```js
assert.equal(
  respelledLexemeSource.value?.lexemeId,
  "lex-river-001",
  "respelling must not change the runtime lexeme identity",
);
```

Add explicit legacy/malformed guards:

```js
assert.equal(
  lemmaGlossSource.value?.lexemeId,
  undefined,
  "legacy lexical notes must not receive manufactured stable identity",
);

assert.equal(
  malformedLexemeIdSource.value?.lexemeId,
  undefined,
  "malformed lexeme_id must not leak into runtime lexical identity",
);

assert.equal(
  blankLexemeIdSource.value?.lexemeId,
  undefined,
  "blank lexeme_id must not become runtime lexical identity",
);
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```bash
npm run test:frontmatter
```

Expected: FAIL because `DictionaryEntry` values do not yet expose `lexemeId`.

- [ ] **Step 3: Add the optional runtime identity field**

In `types.ts`, add immediately after `languageId?: string;`:

```ts
  // Stable creator-authored identity of this lexical object when available.
  //
  // This is distinct from source path, Workbench identity, and Language
  // Profile identity. Legacy entries may omit it and remain fully valid.
  lexemeId?: string;
```

- [ ] **Step 4: Project the already-normalized source identity into the runtime entry**

In the `DictionaryEntry` object created by `parseDictionarySource()`, add:

```ts
    lexemeId: normalizedLexemeId,
```

Do not reparse `fm.lexeme_id` and do not generate an ID here. Reuse the same normalized value that was already supplied to `createObsidianWorkbenchIdentity()`.

- [ ] **Step 5: Run the focused parser test**

Run:

```bash
npm run test:frontmatter
```

Expected: PASS.

- [ ] **Step 6: Run type/lint checks relevant to the small projection change**

Run:

```bash
npm run lint
```

Expected: 0 errors. Existing warning baseline may remain.

- [ ] **Step 7: Inspect the exact diff**

Run:

```bash
git diff -- types.ts dictionary-source.ts scripts/test-frontmatter-parsing.mjs
git diff --check
```

Confirm:
- only the runtime projection was added;
- no parser authority changed;
- no ID generation/backfill appeared.

- [ ] **Step 8: Commit the projection task**

```bash
git add -- \
  types.ts \
  dictionary-source.ts \
  scripts/test-frontmatter-parsing.mjs

git diff --cached --check
git diff --cached --name-status
git commit -m "Expose stable lexical identity on dictionary entries"
```

---

### Task 2: Add the Focused Lexical Identity Component

**Files:**
- Create: `lexical-identity.ts`
- Create: `scripts/test-lexical-identity.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes:

```ts
DictionaryEntry.lexemeId?: string;
DictionaryEntry.languageId?: string;
DictionaryEntry.language?: string;
```

- Produces:

```ts
export type LexicalIdentityResolution<T extends DictionaryEntry> =
  | { status: "unresolved"; targets: readonly [] }
  | { status: "unique"; targets: readonly [T] }
  | { status: "ambiguous"; targets: readonly T[] };

export type LexicalEquivalence =
  | "same"
  | "different"
  | "indeterminate";

export class LexicalIdentityIndex {
  clear(): void;
  add(entry: DictionaryEntry): void;
  resolve(
    lexemeId: string,
    languageId?: string,
    language?: string,
  ): LexicalIdentityResolution<DictionaryEntry>;
  compare(
    left: DictionaryEntry,
    right: DictionaryEntry,
  ): LexicalEquivalence;
}
```

- [ ] **Step 1: Add a focused test script for identity behavior**

Create `scripts/test-lexical-identity.mjs`.

Bundle the production TypeScript module with esbuild, following the repository's existing focused-test pattern.

The test must construct plain `DictionaryEntry`-compatible objects and verify all of these cases:

```js
const merRiver = {
  word: "talu",
  definition: "river",
  path: "Languages/Mer/Lexicon/talu.md",
  language: "Mer",
  languageId: "mer",
  lexemeId: "River-001",
};

const merRiverDuplicate = {
  word: "talu-old",
  definition: "river",
  path: "Languages/Mer/Lexicon/talu-old.md",
  language: "Mer",
  languageId: "mer",
  lexemeId: "river-001",
};

const testRiver = {
  word: "talu",
  definition: "river",
  path: "Languages/Test Language/Lexicon/talu.md",
  language: "Test Language",
  languageId: "test-language",
  lexemeId: "river-001",
};

const merLegacy = {
  word: "legacy",
  definition: "legacy",
  path: "Languages/Mer/Lexicon/legacy.md",
  language: "Mer",
  languageId: "mer",
};
```

Required assertions:

```js
assert.equal(index.resolve("missing", "mer", "Mer").status, "unresolved");

assert.equal(
  index.resolve("RIVER-001", "test-language", "Test Language").status,
  "unique",
);

assert.equal(
  index.resolve("river-001", "mer", "Mer").status,
  "ambiguous",
);

assert.equal(
  index.resolve("   ", "mer", "Mer").status,
  "unresolved",
);
```

Also verify:
- ID matching is trimmed and case-insensitive;
- identical local IDs in another language do not collide with the requested scope;
- `clear()` removes all indexed identity state;
- ID-less entries are ignored by the stable-ID index.

For `compare()` verify:
- two uniquely identified entries with the same stable ID and scope → `"same"`;
- two entries with different usable stable IDs → `"different"`;
- duplicate-ID ambiguity → `"indeterminate"`;
- one ID-bearing and one ID-less entry → `"indeterminate"`;
- two ID-less entries → `"indeterminate"` at this pure identity layer, because legacy path fallback belongs to the consuming operation, not to global stable-identity inference.

- [ ] **Step 2: Register the focused test script**

Add to `package.json`:

```json
"test:lexical-identity": "node scripts/test-lexical-identity.mjs"
```

Place it alongside the other lexical focused-test scripts.

- [ ] **Step 3: Run the new test and verify it fails**

Run:

```bash
npm run test:lexical-identity
```

Expected: FAIL because `lexical-identity.ts` does not exist yet.

- [ ] **Step 4: Implement `lexical-identity.ts` minimally**

Use this structure:

```ts
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
```

During implementation, preserve the approved semantics rather than mechanically copying this sketch if the exact type checker reveals a narrower equivalent implementation.

- [ ] **Step 5: Run the focused identity test**

Run:

```bash
npm run test:lexical-identity
```

Expected: PASS.

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Inspect the exact diff**

Run:

```bash
git diff -- lexical-identity.ts scripts/test-lexical-identity.mjs package.json
git diff --check
```

Confirm:
- no Obsidian/file-system dependency entered `lexical-identity.ts`;
- duplicates are retained;
- ambiguity is explicit;
- ID-less entries are not assigned identity;
- language scope remains explicit.

- [ ] **Step 8: Commit the identity component**

```bash
git add -- \
  lexical-identity.ts \
  scripts/test-lexical-identity.mjs \
  package.json

git diff --cached --check
git diff --cached --name-status
git commit -m "Add lexical identity index"
```

---

### Task 3: Integrate Stable Identity into the `Dictionary` Façade

**Files:**
- Modify: `dictionary.ts:61-149`
- Modify: `dictionary.ts:318-332`
- Modify: `dictionary.ts:647-711`
- Test: `scripts/test-dictionary-language-scope.mjs`

**Interfaces:**
- Consumes:

```ts
LexicalIdentityIndex
LexicalIdentityResolution<DictionaryEntry>
LexicalEquivalence
```

- Produces Dictionary façade methods:

```ts
resolveLexemeId(
  lexemeId: string,
  languageId?: string,
  language?: string,
): LexicalIdentityResolution<DictionaryEntry>;

compareLexicalIdentity(
  left: DictionaryEntry,
  right: DictionaryEntry,
): LexicalEquivalence;
```

- [ ] **Step 1: Extend the real Dictionary language-scope harness with failing identity assertions**

Add stable IDs to selected existing fixture frontmatter.

For the Mer `shared.md` fixture:

```js
lexeme_id: "shared-local",
```

For the Test Language `shared.md` fixture:

```js
lexeme_id: "shared-local",
```

This deliberately proves that the same local ID may exist independently in two languages.

Add two additional Mer lexical fixtures whose frontmatter both use:

```js
lexeme_id: "duplicate-mer-id",
```

with distinct filenames and usable definitions.

After dictionary load, assert:

```js
const merSharedId = dictionary.resolveLexemeId(
  "shared-local",
  "mer",
  "Mer",
);

assert.equal(merSharedId.status, "unique");
assert.equal(merSharedId.targets[0], merShared);

const testSharedId = dictionary.resolveLexemeId(
  "shared-local",
  "test-language",
  "Test Language",
);

assert.equal(testSharedId.status, "unique");
assert.equal(testSharedId.targets[0], testShared);

assert.equal(
  dictionary.resolveLexemeId("shared-local").status,
  "ambiguous",
  "an unscoped lookup must not pretend identical local IDs are globally unique",
);

assert.equal(
  dictionary.resolveLexemeId(
    "duplicate-mer-id",
    "mer",
    "Mer",
  ).status,
  "ambiguous",
);
```

Also verify an ID-less existing entry remains available through ordinary `lookup()`.

- [ ] **Step 2: Run the focused Dictionary test and verify failure**

Run:

```bash
npm run test:dictionary-language-scope
```

Expected: FAIL because the Dictionary façade has no stable-ID resolution method yet.

- [ ] **Step 3: Add the identity index to Dictionary lifecycle**

Import:

```ts
import {
  LexicalIdentityIndex,
  type LexicalEquivalence,
  type LexicalIdentityResolution,
} from "./lexical-identity";
```

Add a field near the other indexes:

```ts
private lexicalIdentity = new LexicalIdentityIndex();
```

In `clear()` add:

```ts
this.lexicalIdentity.clear();
```

In `addEntry()` after accepting the real runtime entry into `this.all`, add:

```ts
this.lexicalIdentity.add(entry);
```

Do not add synthetic alias/form phrase copies to the identity index. Only accepted real dictionary entries enter through `addEntry()`.

- [ ] **Step 4: Add narrow façade methods**

Near `lookupWorkbenchID()` add:

```ts
resolveLexemeId(
  lexemeId: string,
  languageId?: string,
  language?: string,
): LexicalIdentityResolution<DictionaryEntry> {
  return this.lexicalIdentity.resolve(lexemeId, languageId, language);
}

compareLexicalIdentity(
  left: DictionaryEntry,
  right: DictionaryEntry,
): LexicalEquivalence {
  return this.lexicalIdentity.compare(left, right);
}
```

The façade exposes capability without moving unrelated Dictionary responsibilities into the identity component.

- [ ] **Step 5: Run the focused Dictionary test**

Run:

```bash
npm run test:dictionary-language-scope
```

Expected: PASS for the new ID-resolution assertions and all existing language-scope behavior.

- [ ] **Step 6: Run the pure identity test again**

Run:

```bash
npm run test:lexical-identity
```

Expected: PASS.

- [ ] **Step 7: Run parser regression again**

Run:

```bash
npm run test:frontmatter
```

Expected: PASS.

- [ ] **Step 8: Run lint**

Run:

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 9: Inspect the exact integration diff**

Run:

```bash
git diff -- dictionary.ts scripts/test-dictionary-language-scope.mjs
git diff --check
```

Confirm:
- only accepted real entries populate the identity index;
- source records still have their own lifecycle;
- synthetic phrase entries do not become independent lexemes;
- unscoped stable-ID lookup preserves ambiguity.

- [ ] **Step 10: Commit Dictionary integration**

```bash
git add -- \
  dictionary.ts \
  scripts/test-dictionary-language-scope.mjs

git diff --cached --check
git diff --cached --name-status
git commit -m "Integrate lexical identity with dictionary"
```

---

### Task 4: Convert Declared-Form Ownership to Stable Identity

**Files:**
- Modify: `dictionary.ts:192-206`
- Modify: `scripts/test-dictionary-language-scope.mjs:469-511`

**Interfaces:**
- Consumes:

```ts
DictionaryEntry.lexemeId?: string;
Dictionary.resolveLexemeId(...);
```

- Produces updated behavior:

```ts
lemmaForDeclaredPhrase(
  entry: DictionaryEntry,
): DictionaryEntry | undefined;
```

with:
- stable identity preferred when available;
- ambiguous/unresolved stable identity failing closed;
- path fallback only when stable identity is absent.

- [ ] **Step 1: Extend declared-form tests so path can no longer prove ownership for ID-bearing entries**

The existing synthetic phrase copies inherit the lemma path and, after Task 1, inherit `lexemeId`.

For an ID-bearing fixture, create a test synthetic candidate based on the existing phrase-index entry but deliberately change only the synthetic path:

```js
const movedMerDeclaredPhrase = {
  ...merDeclaredPhrase.entry,
  path: "Languages/Mer/Lexicon/old-location.md",
};
```

Assert:

```js
assert.equal(
  dictionary.lemmaForDeclaredPhrase(movedMerDeclaredPhrase),
  merShared,
  "stable lexical identity must recover the owner even when the synthetic path is stale",
);
```

Add a duplicate-ID ownership case. Construct an ID-bearing synthetic declared-form candidate using a lexeme ID that resolves ambiguously within Mer and assert:

```js
assert.equal(
  dictionary.lemmaForDeclaredPhrase(ambiguousDeclaredPhrase),
  undefined,
  "ambiguous supplied lexical identity must fail closed rather than fall back to path",
);
```

Retain or add an ID-less declared-form fixture and verify:

```js
assert.equal(
  dictionary.lemmaForDeclaredPhrase(legacyDeclaredPhrase),
  legacyLemma,
  "ID-less declared forms must retain legacy path ownership",
);
```

- [ ] **Step 2: Run the focused test and verify the stable-ID behavior fails**

Run:

```bash
npm run test:dictionary-language-scope
```

Expected: FAIL because the current implementation still relies exclusively on `entry.path`.

- [ ] **Step 3: Replace path-only ownership with stable-first ownership**

Refactor `lemmaForDeclaredPhrase()` to this semantic shape:

```ts
lemmaForDeclaredPhrase(entry: DictionaryEntry): DictionaryEntry | undefined {
  if (!entry.viaFormLabel || !entry.viaFormLemma) return undefined;

  if (entry.lexemeId) {
    const resolution = this.resolveLexemeId(
      entry.lexemeId,
      entry.languageId,
      entry.language,
    );

    return resolution.status === "unique"
      ? resolution.targets[0]
      : undefined;
  }

  return this.lookupAll(entry.viaFormLemma).find(
    (candidate) => candidate.path === entry.path,
  );
}
```

Important behavior:
- supplied stable identity is authoritative when present;
- unresolved or ambiguous stable identity returns `undefined`;
- no path rescue occurs in those cases;
- legacy ID-less behavior retains path ownership;
- legacy ID-less ownership preserves the existing lemma/path fallback without adding a new language-scoping rule.

- [ ] **Step 4: Run declared-form regression**

Run:

```bash
npm run test:dictionary-language-scope
```

Expected: PASS.

- [ ] **Step 5: Run identity and lexical relationship regressions**

Run:

```bash
npm run test:lexical-identity
npm run test:lexical-part-relationships
npm run test:frontmatter
```

Expected: PASS.

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Inspect exact diff**

Run:

```bash
git diff -- dictionary.ts scripts/test-dictionary-language-scope.mjs
git diff --check
```

Confirm:
- path fallback occurs only for ID-less entries;
- duplicate/unresolved stable IDs fail closed;
- no change was made to textual `parts:` relationships.

- [ ] **Step 8: Commit declared-form ownership conversion**

```bash
git add -- \
  dictionary.ts \
  scripts/test-dictionary-language-scope.mjs

git diff --cached --check
git diff --cached --name-status
git commit -m "Use stable identity for declared form ownership"
```

---

### Task 5: Classify Remaining Path-Based Lexical Comparisons

**Files:**
- Inspect first: `main.ts`
- Modify only if exact inspection proves a comparison represents lexical-object identity rather than source-file identity.
- Test: existing focused test corresponding to each changed consumer.

**Interfaces:**
- Consumes:

```ts
Dictionary.compareLexicalIdentity(...)
Dictionary.resolveLexemeId(...)
```

- Produces: no new general-purpose abstraction unless a concrete confirmed consumer requires one.

- [ ] **Step 1: Re-inspect every previously identified path comparison**

Run:

```bash
grep -nE \
  '\.path ===|\.path !==|candidate\.path|lemma\.path|entry\.path' \
  main.ts highlight-core.ts lookup-modal.ts panel.ts dictionary.ts
```

For each match, classify it in notes as exactly one of:

```text
SOURCE LOCATION
LEXICAL IDENTITY
RESULT/SOURCE DEDUPLICATION
UNRELATED
```

Do not edit during classification.

- [ ] **Step 2: Preserve all confirmed source-location comparisons**

No code change is permitted for:
- opening files;
- navigating to notes;
- vault-change handling;
- source diagnostics;
- source-file deduplication where one result per Markdown source is intended.

- [ ] **Step 3: For each confirmed lexical-identity comparison, write one failing focused regression before editing**

Use the consumer's existing focused test harness.

The regression must specifically demonstrate why path is the wrong semantic key, such as:
- the same stable lexeme represented after a path move;
- two different lexical objects whose file/source paths must not be conflated;
- ambiguity that must remain unresolved rather than selecting a first match.

If no remaining comparison can be proven to be lexical identity, make **no production changes** in this task.

- [ ] **Step 4: Make only the minimal confirmed conversions**

Use the Dictionary identity façade rather than importing the underlying identity index into UI/host modules.

Do not create a general “replace all path comparisons” helper.

- [ ] **Step 5: Run each changed consumer's focused regression**

Run only the relevant scripts established by the exact changed consumer, then run:

```bash
npm run test:dictionary-language-scope
npm run test:lexical-identity
```

Expected: PASS.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 7: Inspect semantic boundary**

Run:

```bash
git diff --check
git diff
```

Verify every changed path comparison has an explicit lexical-identity reason. If none were changed, document that the inspection found no additional Phase 1 conversions and do not create an empty commit.

- [ ] **Step 8: Commit only if production behavior changed**

Stage only exact changed files and their focused tests.

Example:

```bash
git add -- exact-production-file.ts scripts/exact-focused-test.mjs
git diff --cached --check
git diff --cached --name-status
git commit -m "Use lexical identity in confirmed runtime consumers"
```

Skip this commit entirely if inspection produces no justified changes.

---

### Task 6: Full Phase 1 Regression and Build Verification

**Files:**
- No intentional source changes.
- Generated `main.js` may change only through the established build process and only if repository policy expects committed build output.

**Interfaces:**
- Verifies all prior task outputs together.

- [ ] **Step 1: Run focused lexical regressions**

```bash
npm run test:frontmatter
npm run test:lexical-identity
npm run test:lexical-senses
npm run test:lexical-normalization
npm run test:lexical-part-relationships
npm run test:lookup-query
npm run test:dictionary-entry-writer
npm run test:dictionary-language-scope
npm run test:source-diagnostics
```

Expected: all PASS.

- [ ] **Step 2: Run closely related runtime/source regressions**

```bash
npm run test:source-language-authority
npm run test:language-runtime
npm run test:language-source-watch
npm run test:hover-direction-compatibility
npm run test:selection-lookup
```

Expected: all PASS.

- [ ] **Step 3: Run lint and formatting checks**

```bash
npm run lint
npm run format:check
```

Expected:
- lint: 0 errors;
- formatting check: PASS.

If lint retains the repository's pre-existing warning baseline, verify no new warning is introduced by this phase.

- [ ] **Step 4: Build production output through the official build command**

```bash
npm run build
```

Expected: successful deterministic production build.

Do not edit `main.js` manually.

- [ ] **Step 5: Inspect repository state after build**

```bash
git status -sb
git diff --check
git diff --stat
```

If `main.js` is tracked and the official build changes it, inspect the generated diff and include it only if that matches the repository's established production-build policy.

- [ ] **Step 6: Verify protected files remain outside the index**

```bash
git diff --cached --name-only

for protected in \
  'docs/Conlang Workbench — Workbench Root and Crash Recovery Architecture.md' \
  'source-frontmatter-writer.ts' \
  'test-vault/Languages/Arcadian' \
  'test-vault/Languages/Test Language 2' \
  'test-vault/Languages/Test Language/Future — Conlang Workbench Architecture and Functionality.md' \
  'test-vault/Languages/Test Language/Future — Vault-Informed Translation and Generation.md'
do
  if git diff --cached --name-only -- "$protected" | grep -q .; then
    printf 'ABORT: protected material is staged: %s\n' "$protected" >&2
    exit 1
  fi
done
```

Expected: protected material remains unstaged.

- [ ] **Step 7: Review Phase 1 against the design success criteria**

Confirm explicitly:

```text
[ ] DictionaryEntry exposes lexemeId
[ ] lexical IDs resolve with unresolved/unique/ambiguous cardinality
[ ] duplicate IDs do not select arbitrary targets
[ ] identical local IDs can coexist across language scopes
[ ] lexical equivalence supports same/different/indeterminate
[ ] ID-less legacy entries still work
[ ] declared-form ownership prefers stable lexical identity
[ ] ambiguous/unresolved supplied identity does not fall back to path
[ ] path remains source-location authority
[ ] textual parts: behavior is unchanged
[ ] no backfill or creator-data rewrite exists
[ ] source records remain separate from valid lexical entries
```

- [ ] **Step 8: Commit any legitimate generated build artifact**

Only if `npm run build` legitimately changed tracked generated output:

```bash
git add -- main.js
git diff --cached --check
git diff --cached --name-status
git commit -m "Rebuild plugin after lexical identity changes"
```

Do not commit anything if the deterministic build leaves the tracked output unchanged.

---

## Plan Self-Review

Before execution, verify:

1. Every requirement in `docs/superpowers/specs/2026-09-12-stable-lexical-identity-design.md` maps to a task above.
2. No task performs automatic backfill, source rewriting, or arbitrary ambiguity resolution.
3. `lexemeId`, `resolveLexemeId`, `compareLexicalIdentity`, `LexicalIdentityResolution`, and `LexicalEquivalence` are named consistently across tasks.
4. Source identity, language identity, lexical identity, and path location remain separate.
5. Stable identity is preferred only for lexical sameness/ownership questions.
6. Legacy fallback occurs because identity is absent, never because creator-supplied identity is inconvenient.
7. `parts:` and sense identity remain outside Phase 1.
8. The new module is focused enough that later Dictionary decomposition can proceed by real responsibility rather than cosmetic splitting.
