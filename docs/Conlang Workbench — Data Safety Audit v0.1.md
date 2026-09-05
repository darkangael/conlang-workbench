# Conlang Workbench — Data Safety Audit v0.1

## Purpose

This audit evaluates whether Conlang Workbench preserves the user's linguistic
work safely during normal use, malformed input, migrations, imports, rewrites,
failures, interruptions, and future feature expansion.

A language project may represent months or years of work. Data loss,
unintentional normalization, destructive rewriting, or silent omission can be
severe even when no conventional security vulnerability exists.

This audit is therefore intentionally separate from the Security Audit.

## Audit Scope

This audit covers behavior that can affect the integrity, preservation,
recoverability, identity, meaning, organization, or long-term readability of
user-authored language data.

Particular attention should be given to:

- file creation and modification
- frontmatter changes
- normalization
- migrations
- imports
- exports
- ID relationships
- moves and renames
- malformed notes
- partial operations
- interruption recovery
- broad-scope commands
- unknown metadata
- future schema changes

Data-safety guarantees added after the recorded baseline commit are not
automatically covered by this audit.

## Baseline

- **Branch:** `develop`
- **Baseline commit:** `cb64dbd`
- **Audit version:** `0.1`
- **Initial status:** Not Reviewed

## Severity Model

### Critical

A failure capable of destroying, corrupting, or irreversibly rewriting a large
body of user-authored work.

### High

A failure capable of substantial data loss, broad corruption, destructive
rewriting, or difficult recovery.

### Medium

A meaningful preservation or integrity problem with narrower scope or practical
recovery options.

### Low

A limited data-integrity problem with small scope and straightforward recovery.

### Hardening

A change that would materially improve preservation, recoverability, or user
confidence even though no current destructive failure is known.

### Informational

A preservation-relevant behavior or design assumption that does not currently
require corrective action.

## Impact Radius

Record impact radius separately from severity.

- **Field** — one value or metadata field.
- **Note** — one Markdown note.
- **Folder / Language** — one configured corpus or language.
- **Multiple Languages** — several language corpora.
- **Vault-wide** — potentially affects the entire vault or all supported data.

Severity and impact radius should not be treated as interchangeable. A
relatively simple bug may still deserve urgent attention if its possible blast
radius is vault-wide.

## Audit Status Legend

- **Not Reviewed** — section has not yet been examined.
- **Reviewing** — examination is in progress.
- **Pass** — reviewed with no actionable finding at the current baseline.
- **Finding** — one or more actionable issues were identified.
- **Needs Test** — source review is insufficient and runtime testing is required.
- **Not Applicable** — the category does not apply to current behavior.
- **Deferred** — relevant but intentionally postponed with rationale recorded.

## Data Preservation Principles

> **Preserve first. Diagnose second. Mutate only with explicit intent.**

- Never silently discard user-authored linguistic data.
- Prefer diagnostics over automatic correction when intent is uncertain.
- Make destructive or broad-scope operations explicit.
- Default normalization and rewriting to the narrowest practical scope.
- Preserve unknown metadata unless there is a documented reason not to.
- Make lossy conversions visible to the user.
- Prefer repeatable and recoverable operations.
- Preserve questionable data rather than inventing certainty.
- Avoid using folder placement as an excuse to silently rewrite explicit
  metadata.
- Treat the user's Markdown notes as authoritative user documents, not disposable
  database rows.
- A failed operation should damage as little as practically possible.
- Recovery should be considered part of feature design for any mutating
  operation.

## Forward Data-Safety Posture

Data preservation is a continuing design requirement rather than a final
validation step.

When a feature is designed or substantially changed, consider:

- whether it reads or mutates user-authored data
- the maximum amount of data that a mistake could affect
- whether unknown or future metadata is preserved
- whether the operation can be previewed, reversed, or safely repeated
- what happens if parsing, writing, or execution fails midway
- whether questionable data can be diagnosed instead of silently changed
- whether the safest practical behavior is the default

Features that begin as read-only should be re-reviewed when editing,
normalization, migration, import, or bulk behavior is added.

A completed audit section does not permanently certify future implementations.
Material changes require targeted re-review.

### Generated-Content Staging

AI output, procedural generation, draft lexical material, and other
machine-produced content should default to a dedicated Workbench staging area
rather than being written directly into canonical language notes.

The staging area exists so generated material can be:

- inspected
- edited
- rejected
- compared
- regenerated
- retained for AI memory or provenance
- explicitly promoted into canonical language data

Generation should not silently overwrite, normalize, merge into, or otherwise
alter authoritative language records.

Promotion from staged material should be an explicit user action. Before a
promotion writes canonical data, Workbench should make the intended destination
and scope clear.

Generated material may remain incomplete, speculative, contradictory, or
unresolved while it is staged. Workbench should not require such material to
pretend to be canonical merely so that an AI or generator can remember it.

Future AI memory or generation state should remain distinguishable from the
user's authoritative linguistic records even when both are stored within the
same Obsidian vault.

Any feature that introduces AI generation, automated generation, or promotion
from staged material into canonical data requires targeted Security and Data
Safety review.

> **A feature is not complete merely because it works on valid input. It should
> also fail safely, preserve user work, and stay within its intended authority.**

---

## 1. Read-Only vs Mutating Behavior

### Read-Only Features

The audit inventoried the primary passive data paths used by Conlang Workbench.

Read-only behavior includes:

- dictionary, morpheme, linguistic-example, phonology, and language-profile
  loading;
- cached frontmatter and Markdown-body reads used to build runtime indexes;
- source parsing and malformed-source diagnostics;
- translation preview;
- dictionary lookup;
- hover tooltips;
- known-word classification and highlighting;
- panel display and refresh behavior;
- metadata/vault event handling that schedules runtime reloads; and
- manual dictionary reload.

These paths read creator-authored Markdown, cached metadata, or in-memory
settings and rebuild runtime/UI state without rewriting the source material
being inspected.

### Mutating Features

The audit identified separate, intentional mutation boundaries for:

- creating missing configured folders through `ensureVaultFolderStrict()`;
- creating new lexical-entry Markdown notes through `writeDictionaryEntry()`;
- renaming an explicitly authorized language root through
  `FileManager.renameFile()`;
- replacing an explicitly approved editor selection through
  `Editor.replaceRange()`; and
- persisting plugin configuration through `saveData()` / the settings-authority
  transaction helpers.

In-memory `Map`, `Set`, cache, inventory, and UI-state mutations were
distinguished from creator-file or plugin-settings persistence.

### Boundary Clarity

The source and command/UI structure make the principal distinction between
read-only and mutating behavior clear.

Commands intended only to inspect or preview data are named and routed
separately from commands that create entries or replace editor text. Persistent
dictionary creation, folder creation, language-root rename, editor replacement,
and settings persistence each pass through recognizable mutation boundaries
rather than being embedded inside ordinary parsing or display routines.

### Accidental Mutation

No accidental creator-data mutation was found in the inspected passive paths.

Dictionary, morpheme, linguistic-example, and phonology loaders rebuild
in-memory inventories from configured vault sources. Dictionary body metadata
uses `Vault.cachedRead()` where body content is needed; other source adapters
use Obsidian's metadata cache. Runtime language-membership inheritance changes
only parsed in-memory objects and does not rewrite creator-authored YAML.

Metadata-cache changes and vault delete/rename events may schedule a debounced
runtime reload. That reload waits for settled settings authority, preflights
configured sources, rebuilds runtime inventories, and refreshes UI/highlighting.
The passive reload chain does not call settings persistence, creator-file
creation, file rename, frontmatter processing, or editor replacement APIs.

No `processFrontMatter()` use and no low-level vault-adapter/filesystem write
path were found in the TypeScript source during this review.

### Future Mutation Points

Read-only features such as lookup, hover, highlighting, diagnostics, source
adapters, and inventory views must be re-audited if they later gain direct
editing or repair behavior.

In particular, any future feature that turns diagnostics or source views into
an automatic fixer must preserve the current distinction between observation
and explicit creator-authorized mutation.

### Findings

None.

### Status

**Pass**

---

## 2. File Creation and Overwrite Safety

### File Creation

The production TypeScript source was reviewed for Obsidian vault/file mutation
APIs and generated-note construction.

Current file-creation authority is narrow:

- `ensureVaultFolderStrict()` creates missing folders required by an explicitly
  authorized destination hierarchy;
- `writeDictionaryEntry()` performs lexical-entry file creation through
  `Vault.create()` after destination and source-authority checks; and
- the four current dictionary-entry creation flows supply their own
  independently authorized metadata and Markdown body to that shared
  persistence boundary.

No second creator-note creation path, low-level adapter write, `Vault.modify()`,
append, copy, delete/trash, or general-purpose overwrite mechanism was found in
the reviewed TypeScript source.

The four entry-generation flows remain separate semantic authorities:
multi-language entry creation, translation vocabulary repair, ordinary word
creation, and Name creation each decide the fields and document body they are
allowed to generate. Only low-level YAML/Markdown representation mechanics are
shared.

### Existing Destination

`writeDictionaryEntry()` performs a fresh destination analysis before the final
create operation.

An absent exact destination may proceed. An occupied destination is interpreted
conservatively:

- a non-file object blocks creation;
- unavailable or uninterpretable source authority blocks creation;
- an explicitly non-lexical source blocks lexical creation;
- a confirmed same-definition lexical entry is returned as the existing entry;
  and
- only a confirmed different lexical meaning may authorize allocation of a
  homograph filename.

Uncertainty is therefore not treated as permission to create beside or through
an existing source.

### Overwrite Protection

New lexical notes are persisted with `Vault.create()` rather than an API that
rewrites an existing creator file.

The writer rechecks the destination immediately before creation. If the target
becomes occupied after earlier inspection, Obsidian's create operation fails
rather than replacing the existing file, and the writer reports failure.

Content generation also occurs before folder creation, so an exception while
building the new note cannot leave newly created destination folders behind.

Existing creator-authored lexical and non-lexical notes are not rewritten as
part of collision handling.

### Naming Collisions

The exact lexical destination is checked before creation.

When a confirmed different lexical meaning requires a homograph, the writer
allocates a separate filename using the creation flow's supplied
part-of-speech/category disambiguator. Occupied homograph candidates advance to
another candidate rather than being reused as overwrite targets.

The ordinary numbered fallback candidates are checked for occupancy. A final
timestamp fallback is still created through `Vault.create()`, so a coincidental
collision fails rather than overwriting an existing object.

Filename-invalid characters are replaced only for the generated filename
component. This filename sanitization does not rewrite the lexical form stored
inside the creator note.

### Destination Scope

Generated lexical paths are constructed beneath the configured dictionary
folder and validated as vault-relative paths.

Folder establishment uses `ensureVaultFolderStrict()`, which walks the intended
hierarchy conservatively, reuses existing folders, and stops if a required path
component is occupied by a non-folder object.

The reviewed entry-creation flows do not have authority to write generated
lexical notes outside their supplied configured dictionary destination.

### Generated Frontmatter Integrity

During this review, the four generated dictionary-note templates were found to
interpolate creator/workflow strings directly into YAML source.

Ordinary text accepted by Workbench can contain syntax that YAML interprets
specially. Runtime characterization demonstrated, for example, that direct
interpolation of a definition such as `river: flowing water` produces invalid
YAML, while strings such as `true`, `null`, `123`, list-like text, aliases, and
quoted text can be assigned a different YAML type or meaning.

The required invariant is:

> A creator-supplied string accepted by Workbench and written to generated
> frontmatter must parse back as the same string.

The four creation flows now pass their already-authorized semantic frontmatter
values to a representation-only `renderMarkdownNote()` helper. That helper uses
Obsidian's public `stringifyYaml()` API rather than constructing dynamic
`key: value` YAML lines.

Runtime characterization in the supported Obsidian API confirmed that
`stringifyYaml()` preserves YAML-looking creator values as strings while
retaining deliberately supplied booleans, numbers, arrays, and other semantic
types as those types.

Intentionally blank template prompts such as `ipa:`, `etymology:`,
`partOfSpeech:`, and `nameCategory:` remain separate from serialized semantic
values, preserving the existing generated-note convention when those optional
creator values are absent.

The renderer has representation authority only. It does not decide which
linguistic fields exist, infer values, merge creation policies, choose
destinations, or authorize persistence.

### Findings

#### DS-002-H1 — Generated frontmatter did not safely serialize creator strings

- **Severity:** Medium
- **Impact radius:** Note
- **Status:** Remediated and verified

Generated dictionary-entry templates directly interpolated creator/workflow
strings into YAML frontmatter. Accepted linguistic text containing
YAML-significant syntax could therefore become malformed, truncated, or parsed
as the wrong data type in the newly created note.

The remediation introduced the representation-only `renderMarkdownNote()`
boundary using Obsidian's `stringifyYaml()` API. The four creation flows retain
their separate semantic authority and supply only the metadata/body each is
authorized to create.

Verification included:

- real Obsidian `stringifyYaml()` / `parseYaml()` runtime characterization with
  YAML-significant strings and deliberately typed values;
- `test:markdown-note-renderer`;
- `test:dictionary-entry-writer`;
- `test:translation-vocabulary-repair`;
- `test:frontmatter`;
- the relevant lexical, lookup, gloss, body-preview, and vault-path regression
  suites;
- production build;
- lint at the established baseline of 0 errors and 14 warnings;
- broad source searches confirming no remaining generated creator-note
  frontmatter interpolation path; and
- clean `git diff --check`.

### Status

**Pass**

---

## 3. Frontmatter Preservation

### Read Behavior

Existing creator-authored frontmatter is read through Obsidian's metadata cache
and passed to feature-specific source adapters. Dictionary, morpheme,
phonology, linguistic-example, and Language Profile adapters interpret that
cached representation into runtime objects without modifying the source note.

Those adapters may normalize values for runtime use, select the first usable
supported compatibility alias, derive a fallback such as a lexical headword or
morpheme form from the filename, or retain a recognized malformed source with
diagnostics. These are interpretation decisions only. The normalized runtime
representation is not serialized back over the creator's existing
frontmatter.

Unsupported or malformed values therefore remain in the Markdown as authored
even when Workbench cannot use them. Depending on the feature and field,
Workbench may leave the value uninterpreted, report a diagnostic, reject the
source from a clean feature index, or continue to a documented compatibility
fallback.

### Write Behavior

The production TypeScript source was searched for existing-note frontmatter
mutation APIs and equivalent vault mutation paths. No current production path
uses `processFrontMatter()`, `Vault.modify()`, `Vault.append()`, or another
read-modify-write operation to replace existing frontmatter.

The representation-only `renderMarkdownNote()` boundary reviewed in Data
Safety §2 is used when constructing new dictionary-entry notes. It is not an
existing-note frontmatter rewrite mechanism.

Other current mutation authorities do not create a hidden frontmatter
round-trip. Dictionary persistence creates a new file through the dedicated
writer, folder establishment creates folders, language-root movement uses
Obsidian's file rename operation, and translation commit replaces an explicitly
authorized editor range. None reads cached frontmatter into a normalized object
and then writes that object back over the existing YAML block.

### Existing Keys

Because Workbench does not currently serialize parsed frontmatter back over an
existing note, unrelated existing keys are not removed merely because a source
adapter does not understand or expose them in its runtime model.

This is preservation by non-mutation, not a claim that Workbench has a generic
lossless YAML round-trip serializer. A field may be absent from a
feature-facing runtime object while remaining intact in the creator-authored
Markdown.

Detailed review of unknown, future, and third-party metadata is retained for
Data Safety §4 rather than treating runtime-model coverage as ownership of
those fields.

### Ordering and Formatting

Current Workbench frontmatter reads do not rewrite the original YAML text.
Consequently, Workbench does not currently reorder existing keys, normalize
their quoting, remove YAML comments, or reformat existing frontmatter as a
side effect of interpreting it.

This conclusion depends on the absence of an existing-frontmatter rewrite
path. It does not assume that Obsidian's parsed metadata-cache representation
retains comments, original quoting, whitespace, or key-layout information.
Future template editing or other frontmatter mutation features will require a
new preservation review before they may rely on parse-and-reserialize behavior.

### Explicit Values

Language membership has two deliberate runtime authority policies.

The default and recommended `folder` policy treats each configured canonical
source folder as the authority for runtime language membership. If a note has
no usable `language:` value, the configured language can therefore supply the
runtime membership without writing inferred metadata into the note. If an
existing `language:` value disagrees with the configured folder, folder mode
uses the configured language at runtime while leaving the contradictory
creator-authored value unchanged on disk. The settings UI describes this
policy explicitly.

The `respect-explicit` compatibility policy preserves the older behavior. When
both the configured language and an explicit `language:` value exist and
disagree, the source is rejected from that configured language rather than
silently relabeled.

Morpheme, phonology, and linguistic-example inventories also receive the stable
Language Profile ID associated with their configured source when available.
A missing `language_id` may inherit that ID in the runtime object. If both the
configured source and the note provide nonblank IDs and they disagree, the
source is rejected rather than having its explicit ID replaced.

Language Profile loading itself is read-only. Profile validation requires the
configured path to resolve to a readable Markdown `language-profile` with
nonblank `language_id` and `language` fields, but does not rewrite those fields
or require the profile's display-language value to equal the settings display
name.

Regression verification included the shared language-membership policy,
dictionary language scoping, frontmatter parsing, and persisted-settings
decoder behavior. The closed-choice persisted membership setting normalizes an
unsupported value to the known `folder` default rather than introducing an
undefined third authority policy.

### Findings

None.

### Status

**Pass**

---

## 4. Unknown and Future Metadata Preservation

### Unknown Keys

Current Workbench source adapters interpret only the frontmatter fields needed
by their feature-facing runtime models. Fields that an adapter does not
recognize are not thereby claimed, removed, normalized, or written back to the
creator's source note.

The production mutation inventory contains no existing-note frontmatter
read-modify-write operation. In particular, current production code does not
use `processFrontMatter()`, `Vault.modify()`, or another mechanism that would
reconstruct an existing note from Workbench's known-field model. An unknown key
can therefore be absent from the current runtime representation while remaining
intact in the creator-authored Markdown.

Dictionary persistence follows the same preservation boundary from the opposite
direction. `writeDictionaryEntry()` uses `vault.create()` for a newly authorized
destination. A same-meaning existing lexical source is reused, uncertain or
nonlexical collisions block creation, and a confirmed homograph receives a new
free path. Existing creator-authored notes are not overwritten in order to
create or repair vocabulary.

### Third-Party Metadata

Workbench does not treat all metadata inside a configured linguistic source as
Workbench-owned metadata. Frontmatter used by another Obsidian plugin or by the
creator's own workflow remains outside Workbench's mutation authority when the
current feature does not understand that field.

Language-root rename preserves this boundary structurally. Workbench resolves
and revalidates the existing language root, then passes that existing
`TFolder` to Obsidian's `FileManager.renameFile()`. It does not enumerate the
contained notes, parse their known fields, and generate replacement files at
the destination. Third-party metadata, creator Markdown, and other unmodeled
note content therefore are not reconstructed as part of the move.

Translation commit is an exact-range text mutation rather than a metadata
rewrite. Immediately before `editor.replaceRange()`, Workbench revalidates the
captured language, file identity and path, target range, and exact original
text. The creator can deliberately select text anywhere the editor permits,
including text that may be inside frontmatter, but that authorization applies
only to the exact reviewed range. Workbench receives no authority to rewrite
unrelated metadata elsewhere in the note.

### Future Workbench Fields

Under the current architecture, a field introduced by a newer Workbench version
can remain in a creator note even when an older version does not recognize it.
The older runtime may be unable to interpret or expose that field, but its
feature adapters do not serialize their reduced known-field representation
back over the source note.

This is forward preservation by non-mutation, not a promise of forward semantic
compatibility. An older Workbench version is not expected to understand the
meaning or behavior of a field introduced later; the current data-safety
guarantee is that lack of understanding does not itself authorize deletion or
replacement of that creator data.

### Round-Trip Behavior

There is currently no production existing-note frontmatter
read-modify-write serialization cycle for unknown fields to traverse. A
traditional unknown-field round-trip test would therefore test an operation
that Workbench does not presently perform.

The `renderMarkdownNote()` serializer reviewed in Data Safety §2 is a new-note
representation boundary. Its callers decide the metadata for a newly created
source, and the renderer safely serializes those authorized values. It does not
parse an existing creator note and therefore does not claim to round-trip
preexisting unknown metadata.

Regression verification for this section included the language-rename planner
and transaction suites, dictionary-entry writer, Markdown-note renderer,
translation-commit planner, and translation-vocabulary repair. The production
mutation inventory was also repeated after those tests and remained limited to
strict folder creation, existing-root rename, exact authorized editor-range
replacement, and new-file creation.

A future feature that edits templates, migrates metadata, modifies existing
frontmatter, or otherwise reconstructs an existing creator note must receive a
new preservation review. This section's Pass does not authorize a future
implementation to deserialize a note into only known Workbench fields and then
overwrite unknown, third-party, or newer-version metadata.

### Findings

None.

### Status

**Pass**

---

## 5. Malformed Data Handling

### Malformed YAML

Runtime characterization has been completed for the current Obsidian
metadata-cache boundary used by dictionary loading and creation.

Because Obsidian is closed-source software, this audit treats the metadata
cache as an external trust boundary and records observed behavior rather than
assuming details of Obsidian's internal YAML parser.

The permanent Test Language fixtures demonstrate that duplicate-key and
syntactically malformed frontmatter do not become usable dictionary entries.
Lookup falls back without inventing lexical data. When `+ Word` was used
against the occupied `malformedprobe.md` path, Workbench could not safely
establish the existing metadata/authority and refused the mutation; the source
remained unchanged and no homograph file was created.

A valid control fixture containing unusual unrelated keys remained readable as
a normal lexical entry, showing that Workbench does not require creator
frontmatter to contain only Workbench-owned fields.

### Wrong Types

Malformed-value regression coverage exercises strings, arrays, objects,
numbers, booleans, and null values at source fields whose parsers require more
specific representations.

Dictionary scalar fields now retain warnings when a present array or object
cannot safely be interpreted as the expected scalar value. Phonology status
parsing likewise distinguishes supported status strings from unsupported
strings and non-string values. These diagnostics describe the unusable field
without coercing it into invented linguistic data or rewriting the source note.

### Missing Required Fields

Recognized Workbench sources retain source identity even when malformed or
incomplete data prevents them from becoming clean feature objects.

Dictionary, morpheme, phonology, and linguistic-example inventories retain
`WorkbenchSourceRecord` entries for recognized malformed sources. A parser may
therefore return `value: null` together with structured diagnostics while the
creator-authored Markdown remains untouched and the malformed object stays out
of clean feature indexes.

Usable sources rejected by language authority are retained similarly: their
parsed value remains available for diagnostic interpretation, an authority
diagnostic is appended, and the source is excluded from the clean inventory.
The shared source-language authority boundary preserves legacy readable
language behavior while rejecting conflicting stable `language_id` authority.

### Invalid Relationships

Relationship validation is separated from single-source parsing where the
relationship cannot be known from one note alone.

The persistent diagnostic aggregator validates structurally usable phonological
realization `unit_id` references against the currently loaded canonical unit
records using the same language-scoping rules as phonology lookup. An
unresolved reference is attached to the realization source as a warning.
Malformed realizations that cannot establish a trustworthy relationship are
not given speculative secondary relationship diagnostics.

Portable lexical identity was also corrected during this review so dictionary
source identity no longer promotes a word/headword into `linguisticID`.
Portable lexical identity comes only from an explicit `lexeme_id`; when absent,
the source remains operationally identifiable through its Workbench/source
identity without manufacturing creator-facing linguistic identity.

### Preservation

Malformed or contextually rejected creator sources are preserved on disk and
remain identifiable for repair and later reparsing.

The diagnostic path is observational. Parser diagnostics, language-authority
diagnostics, and supported semantic relationship diagnostics do not grant
authority to repair, normalize, or rewrite the creator's Markdown. Clean
feature indexes consume only accepted usable objects, while recognized rejected
sources remain represented by their `WorkbenchSourceRecord`.

This preserves the distinction between source recognition and feature
acceptance: Workbench can explain why a recognized source is unusable without
pretending that the source became valid and without making the source disappear
from diagnostic accounting.

### Diagnostics

Current retained source diagnostics are aggregated into a persistent
creator-facing Diagnostics workspace in the Workbench panel.

Diagnostic groups are keyed internally by Workbench source identity and display
the affected source path, highest severity, issue count, field when available,
and individual diagnostic messages. Error-bearing groups sort before
warning-only groups, and each card can be expanded without granting the UI any
source-mutation authority. The creator may open the exact source note directly
from its diagnostic card.

The header reports the number of affected source notes rather than the number
of individual issues. Diagnostics remain visible for as long as they remain in
the currently loaded source model and naturally disappear after the creator
repairs the source and it is successfully reparsed.

A registered workspace `file-open` observer also provides the planned brief
contextual resurfacing. Meaningfully switching to a currently diagnosed source
shows an approximately two-second Notice with that note's diagnostic count.
Repeated workspace activity while remaining on the same diagnosed note is
suppressed; moving to an unaffected note resets that suppression so a later
return may notify again. This observer reads the current diagnostic model and
does not poll, reload, or mutate creator data.

Runtime verification confirmed that the Diagnostics workspace displayed the
expected three affected Test Language source notes, including a two-error
malformed lexical fixture and warning-only fixtures; expandable details and
Open note navigation resolved to the expected source. Diagnostics remained the
visible top-level workspace while an ordinary selected editor range was
translated through the Workbench panel, demonstrating that diagnostic
presentation does not acquire or disable unrelated translation authority.
Contextual Notice testing also confirmed initial notification, same-note
suppression, no notification on an unaffected note, renewed notification after
return, and correct singular/plural issue counts.

Automatic event-driven refresh for every non-dictionary linguistic source
folder is a separate reload/watch boundary and is not claimed as part of this
finding's remediation. The persistent diagnostic model reviewed here describes
the currently loaded inventory state; broader source-change watching is tracked
for separate correction after this finding is closed.

### Findings

#### DS-005-H1 — Retained source diagnostics are not persistently exposed to the creator

- **Severity:** Medium
- **Impact radius:** Note
- **Status:** Remediated and verified

Workbench now preserves recognized malformed and contextually rejected
linguistic sources in diagnostic accounting while excluding them from clean
feature indexes. Parser diagnostics and shared language-authority diagnostics
are retained with the recognized source, and cross-record phonology validation
adds an unresolved-reference diagnostic when a structurally usable
realization-to-unit relationship cannot resolve.

`buildSourceDiagnosticGroups()` provides a pure aggregation boundary over the
retained source records. `DiagnosticsTab` presents those groups persistently in
the Workbench panel with source navigation but no generic writer or repair
authority. A separate `file-open` observer briefly resurfaces the current issue
count when the creator meaningfully switches to an affected note and suppresses
duplicate same-note notifications.

Regression coverage verifies source-diagnostic aggregation, shared
source-language authority, dictionary/morpheme/phonology/linguistic-example
retention behavior, malformed frontmatter handling, and production build
compatibility. Runtime testing verified the persistent Diagnostics workspace,
source-card expansion and navigation, continued unrelated translation behavior,
and contextual affected-note notifications.

The remediation remains non-destructive: it explains malformed, rejected, and
supported unresolved source relationships without rewriting creator-authored
source data.

### Status

**Pass**

---

## 6. Normalization and Rewrite Operations

### Current Normalization

Current production behavior separates derived/runtime normalization, Workbench
configuration migration, structural path changes, and creator-authored source
mutation rather than treating them as one generic rewrite mechanism.

Lexical normalization is derived-only. `normalizeLexicalKey()` applies the
current case policy and Unicode NFC normalization when producing comparison and
index keys. Morpheme and phonology ID lookups similarly trim and lowercase
derived lookup keys. These operations do not replace the creator-authored
spelling, frontmatter value, selected text, or displayed linguistic form.

Persisted Workbench settings have a narrower automatic normalization and
migration boundary. `decodePersistedSettings()` first structurally validates
untrusted persisted data and clones the accepted representation before
`normalizeClosedChoiceSettings()` restores invalid closed-choice preferences to
documented defaults. Free-form creator configuration such as language names,
folders, and linguistic rules is explicitly outside that normalization
authority.

After successful decoding, `migrateSettings()` performs compatibility migration
over Workbench configuration. It may infer a legacy `rootFolder` only when the
already-configured canonical source paths establish that root unambiguously,
migrate the legacy single `activeLanguage` representation into
`activeLanguages`, remove unknown active-language names, and establish a valid
primary language. Ambiguous legacy roots are left untouched for explicit
repair rather than guessed.

Those startup normalization and migration steps initially change the in-memory
Workbench settings representation rather than immediately writing the settings
file. Because later authorized settings persistence writes the complete
settings object, including the one-time welcome-state persistence path, the
migrated representation may subsequently become persisted as part of a normal
whole-settings save. This behavior concerns Workbench configuration and does
not grant authority to normalize creator linguistic Markdown.

Language rename also uses functions named `rewrite*`, but those functions
rewrite only configured vault-path strings that must follow an explicitly
authorized root move. Descendant suffixes are copied verbatim so custom
organization beneath the root is preserved. The physical operation passes the
existing `TFolder` to Obsidian's `FileManager.renameFile()` rather than
reconstructing contained notes.

The only current production operation identified that replaces content inside
an existing creator note is translation commit through `editor.replaceRange()`.
That is an explicitly requested semantic transformation of an exact editor
range, not an automatic formatting or normalization pass.

### Explicit Invocation

No production command automatically normalizes or reformats existing
creator-authored linguistic Markdown merely because Workbench reads, indexes,
diagnoses, or reloads it.

Derived lexical and ID normalization is automatic only within runtime
comparison keys and does not write back to the source. Settings compatibility
normalization occurs automatically at the validated configuration boundary but
is restricted to Workbench-owned configuration.

Operations that can change creator-visible structure or content require their
own explicit authority. Language-root rename requires creator confirmation of
the named language and destination identity before moving the established root.
Translation replacement is exposed separately from translation preview and
requires explicit confirmation of the proposed replacement before the exact
editor range is changed.

### Scope

Current normalization scopes remain narrower than a general creator-note
rewrite.

Derived lexical normalization is scoped to individual comparison/index keys.
Closed-choice normalization is scoped to the enumerated Workbench settings for
which the plugin defines a finite valid set. Legacy settings migration is
scoped to Workbench configuration fields and uses existing configured
authority rather than linguistic-source contents as permission to rewrite
notes.

Language rename is scoped to one explicitly established language root and the
configured paths that belong to that root. Paths outside the root are preserved
or cause the rename to block according to their authority rules.

Translation commit is scoped to the exact captured file, path, editor range,
original text, and proposed replacement. Those values are revalidated
immediately before mutation so authorization for one selection cannot silently
expand to another range or note.

There is no current folder-wide, language-wide, or vault-wide normalization
operation over creator-authored Markdown.

### Preview

There is no broad creator-source normalization operation for which Workbench
currently needs a bulk rewrite preview.

Language rename presents an explicit confirmation describing the old and new
language names, the existing owned root move, configured-path updates, and the
fact that Workbench itself does not rewrite the contained Markdown or YAML.
Unsafe or stale rename authority blocks the operation rather than falling back
to an inferred destination.

Translation provides a dedicated preview command, while the separate commit
path presents the proposed semantic replacement for authorization and then
revalidates the original file and exact source text before
`editor.replaceRange()`.

Automatic settings compatibility normalization does not present a creator
preview because it operates on Workbench-owned closed-choice/runtime
configuration rather than linguistic source content. Structural validation
failure blocks startup and preserves the rejected persisted representation
instead of partially normalizing malformed settings.

### Semantic Preservation

Creator-authored linguistic spelling remains authoritative. Unicode NFC and
case handling are applied only to derived lexical comparison keys; the
normalized key is not promoted into replacement authority over the original
word, frontmatter value, selection, or displayed form.

Likewise, ID lookup normalization affects lookup representation rather than
stored linguistic identity. This section does not establish new casing or ID
semantics; those remain subject to their existing compatibility rules and any
later dedicated review.

Language rename preserves the suffix of creator-chosen descendant paths
verbatim instead of rebuilding canonical sources from standard folder names.
Its structural rewrite therefore follows the physical root move without
normalizing the creator's organization underneath it.

Translation replacement is intentionally semantic rather than
format-normalizing: the creator explicitly authorizes the proposed transformed
text. Its separate mutation boundary prevents that transformation from being
treated as permission to normalize surrounding source content.

### Unknown Fields

The production mutation inventory contains no existing-note frontmatter
normalizer or generic source rewrite service. Current production code does not
use `processFrontMatter()`, `Vault.modify()`, `Vault.append()`, or an equivalent
read-modify-write operation that reconstructs a creator note from Workbench's
known-field model.

Unknown, third-party, or future frontmatter fields therefore cannot be dropped
as a side effect of a current normalization pass because no such existing-note
normalization pass exists. New-note serialization through
`renderMarkdownNote()` remains the separate creation boundary reviewed in Data
Safety §2.

Language-root rename moves existing vault objects rather than serializing their
contents, so unmodeled metadata is not filtered through Workbench's runtime
models during the rename. Exact-range translation replacement has authority
only over the creator-approved range and receives no authority over unrelated
frontmatter or body content elsewhere in the note.

The untracked `source-frontmatter-writer.ts` file present in the development
working tree is a comment-only architectural skeleton for a possible future
explicit portable-ID backfill operation. It is not production behavior, is not
part of the built mutation inventory, and was deliberately excluded from this
section's production writer searches. Any future implementation that begins
rewriting existing frontmatter must receive its own explicit preservation,
scope, preview, and revalidation review before this Pass can be carried
forward.

### Findings

None.

### Status

**Pass**

---

## 7. Scope of Mutating Commands

### Available Scopes

Current production mutation authority is divided among narrowly named
operations rather than exposed through a generic note, folder, language, or
vault writer.

Translation commit is the only identified production operation that replaces
content inside an existing creator-authored note. Its authority is limited to
one exact editor range in one identified note.

Dictionary persistence creates one new lexical source at an independently
authorized destination. It does not overwrite an existing creator-authored
note. Existing same-meaning entries are reused, uncertain or nonlexical
collisions block creation, and only a confirmed different meaning can authorize
allocation of a separate homograph path.

Canonical source-folder controls change one named Workbench configuration field
for one configured language. They change where Workbench reads a canonical
source collection; they do not thereby mutate the notes contained in that
folder.

Language-root repair operates on one already-established language root. Its
planner considers only the six expected standard direct-child folders, reuses
existing folders, may create missing folders additively, and preserves unrelated
or nested creator structure. It cannot adopt an unrelated existing language
root.

Language rename operates on one explicitly selected configured language and its
already-owned root. It moves that existing root and rewrites only configured
path strings that descend from it. It does not reconstruct or rewrite the
creator-authored notes contained in the root.

Language removal removes one exact Workbench language configuration. It does
not delete that language's configured vault folders or files.

Ordinary settings operations affect their corresponding Workbench
configuration fields through specialized settings transactions. No current
production command was identified that rewrites all notes in a folder, all
notes belonging to a language, multiple languages' source notes, or the entire
vault.

### Default Scope

Current mutation defaults favor the narrowest authority appropriate to the
operation.

Editor replacement starts from the creator's explicit selection or, when there
is no selection, the single lexical word under the cursor. The resulting
replacement authority is still captured as one exact range rather than
expanding to the surrounding note.

Lexical persistence re-analyzes one intended destination immediately before
creation and uses `vault.create()` rather than an overwrite operation.

Canonical source changes are committed per named source field. Root repair is
limited to the exact language's existing owned root and standard direct
children. Rename and removal each target one exact configured language rather
than applying implicitly to other languages.

No current creator-note mutation defaults to folder-wide, language-wide,
multi-language, or vault-wide scope.

### Scope Visibility

Creator-facing controls communicate the material scope of the current broader
operations before execution.

Translation replacement presents the original text, translated text, and exact
replacement string before the creator can choose Replace.

Language rename presents the old and new language names and explains that the
operation renames the existing owned root and updates configured paths beneath
it. The confirmation also states that Workbench does not rewrite
creator-authored Markdown or YAML metadata and that Obsidian may update links
according to the creator's normal link-update preference.

Language removal presents the exact language configuration being removed and
explicitly states that its configured vault folders and files will not be
deleted. Its destructive confirmation succeeds only through the explicit
Remove language button.

Language-root repair is exposed as a separately named Repair language root
control whose description states that it restores standard folders and
canonical source paths inside the language's existing owned root. Canonical
source-folder controls are individually labeled Dictionary folder, Morpheme
folder, Examples folder, and Phonology folder rather than presenting an
ambiguous general folder mutation.

### Selection Errors

Mutation boundaries fail closed when their required target cannot be
established or becomes stale.

Translation replacement stops when there is no explicit selection or lexical
word under the cursor, when the originating note cannot be identified, or when
there is no active target language. After confirmation it revalidates the
captured target language, file object, file path, editor range, and exact
original text. A changed target or unusable stale range therefore cancels the
replacement instead of searching for a similar target elsewhere.

Dictionary persistence performs a fresh destination analysis for the actual
write attempt. An earlier UI inspection is informational only and cannot
authorize a later write after vault state changes.

Language removal rejects a stale or missing `LanguageConfig` target and
revalidates the exact object/name relationship around confirmation. Language
rename similarly checks that the selected language still has the captured old
name after its asynchronous confirmation and then recalculates the authoritative
rename plan immediately before mutation.

Canonical source changes and language-root repair pass through their
specialized source/root authority planners and transactions. Invalid,
conflicting, missing, unrelated, or structurally unsafe source/root targets
block rather than broadening the requested scope.

### Broad Operations

No current production operation performs a broad rewrite of creator-authored
notes across a folder, language, multiple languages, or the entire vault.

The structurally broadest current creator-visible operation is language-root
rename, but its filesystem authority is restricted to moving one already-owned
root as an existing vault object. Workbench does not enumerate and regenerate
the notes beneath that root.

Language-root repair is likewise structural rather than a bulk content rewrite.
The complete repair plan is calculated before mutation, another configured
language may not reserve the target root, an unrelated existing root cannot be
silently adopted, and a non-folder object at any required standard direct-child
path blocks the repair before folder creation begins. Missing approved folders
are created additively; unrelated and nested creator folders are ignored and
preserved.

Removal is broader than an ordinary settings toggle because it removes one
language configuration, so it requires an explicit destructive confirmation.
That confirmation clearly distinguishes configuration removal from creator-file
deletion.

A future folder-wide, language-wide, multi-language, or vault-wide source
mutation would require a new scope review with safeguards proportionate to that
larger blast radius. This Pass does not authorize future bulk mutation merely
because current narrow operations have been reviewed.

### Findings

None.

### Status

**Pass**

---

## 8. Partial Failure and Atomicity

### Operations at Risk

Current mutation paths fall into three materially different atomicity classes:

1. **Single durable mutations.** Dictionary-entry persistence performs one final
   `vault.create()` after destination authority, content generation, and strict
   folder establishment have succeeded. Translation commit performs one
   synchronous `editor.replaceRange()` only after the exact file, range, source
   text, target language, and replacement have been revalidated.
2. **Settings/runtime transactions.** Ordinary persisted settings and
   language-affecting settings may temporarily install candidate configuration
   in memory, persist the complete settings object, rebuild runtime linguistic
   state when required, and perform a compensating settings save when the
   requested state cannot safely become authoritative.
3. **Filesystem-plus-settings transactions.** New-language creation,
   language-root repair, and language rename cross Obsidian filesystem state
   and persisted Workbench configuration. These operations cannot truthfully
   provide database-style all-or-nothing rollback because creator or concurrent
   filesystem activity may occur between awaited vault operations.

The plugin-wide `SettingsAuthorityQueue` serializes complete settings-authority
transactions before authority-sensitive reads, snapshots, candidate
construction, or provisional mutation. Specialized transaction modules retain
ownership of their individual persistence, reload, filesystem, and rollback
semantics.

### Write Sequence

The ordinary persisted-setting sequence is:

1. read the previously authoritative value;
2. return without writing when the requested value is unchanged;
3. install the requested value in memory;
4. persist the complete settings object;
5. restore the previous in-memory value if persistence fails.

Reload-aware language-setting transactions extend that sequence:

1. validate the requested configuration and snapshot settled prior authority;
2. install and persist the requested settings;
3. prepare the complete linguistic runtime in detached candidate objects;
4. synchronously commit that candidate only after all fallible/asynchronous
   preparation succeeds;
5. if source preflight blocks the request or detached candidate preparation
   throws, restore the previous settings snapshot and perform a compensating
   save.

Language-root repair first establishes missing folders additively, then changes
and persists configuration, and reloads only when the repaired language is
active. Rollback restores configuration but deliberately preserves folders
already created by the authorized additive operation.

Language rename first moves the proven owned root from the old path to the new
path, then applies and persists rewritten configuration, then reloads when
needed. A failed active reload attempts the exact reverse filesystem rename
before restoring old settings. If that reverse rename fails, the new
configuration is retained so in-memory settings continue to describe the
physical root that actually exists.

New-language creation preflights the complete standard folder hierarchy before
mutation, creates folders additively, registers the returned language
configuration, and then persists settings. A failed settings save removes only
the exact configuration object inserted by that transaction; established
folders are preserved.

### Failure Points

Before the first write, validation, source preflight, destination checks,
candidate construction where applicable, and exact-target revalidation fail
closed without creator-data mutation.

During or between additive folder writes, already-created folders may remain.
They are understandable residue of the authorized operation and are not
automatically deleted because creator or concurrent data may have appeared
inside them while an awaited vault operation was in progress.

A dictionary-entry content-generation failure occurs before folder creation.
A final `vault.create()` failure does not authorize replacement or cleanup of an
existing creator source. Translation commit performs one synchronous exact-range
replacement only after its asynchronous confirmation gap has been revalidated.

A settings-save failure restores the previous in-memory authority. Where a
requested configuration was already persisted before a later runtime failure,
the transaction restores the previous configuration and attempts a compensating
save.

A compensating save can itself fail. Those cases are reported distinctly as
rollback-persistence failures: memory/runtime/filesystem state is kept aligned
with the safest state the transaction can prove, while the UI warns that
persisted settings may still require review before restart.

For language rename, rollback of configuration is conditional on successful
physical root restoration. Workbench does not claim that the old configuration
was restored when the reverse filesystem rename failed.

### State After Interruption

The runtime linguistic inventories are no longer progressively cleared and
rebuilt in live objects. `prepareLanguageRuntime()` builds detached Language
Profile, dictionary, morpheme, linguistic-example, and phonology state. A
preflight refusal or exception during candidate preparation therefore leaves
the previously committed runtime authoritative. Successful preparation is
installed by a synchronous commit with no awaited work inside the replacement
boundary.

This guarantee permits reload-aware settings transactions to restore their
previous configuration after either an explicit preflight block or a thrown
candidate-preparation error. It does not imply that unrelated filesystem
operations can always be reversed safely.

Filesystem transactions preserve truthful physical state:

- additive language creation and root repair do not delete folders created
  before a later failure;
- language rename restores old settings only after the root has actually moved
  back;
- if reverse rename fails, the new settings remain in memory because they still
  describe the physical renamed root;
- if reverse rename succeeds but compensating persistence fails, old
  memory/runtime/root state remains aligned while durable settings are reported
  as uncertain.

No current multi-note source-rewrite operation exists. Translation vocabulary
repair may create several independently authorized lexical notes before a later
item is cancelled or fails; those completed notes remain valid durable creator
actions rather than being deleted as rollback.

### Atomicity

Atomicity is applied at the strongest boundary that does not create a new
creator-data risk.

Runtime linguistic reload now follows **build first, commit only when
complete**. All fallible/asynchronous inventory loading occurs against detached
candidate objects. The live runtime replacement is synchronous and therefore
observationally atomic with respect to other plugin callbacks.

Settings operations use compensating transactions rather than assuming that one
`saveData()` call can cover persistence plus runtime work. The common
`SettingsAuthorityQueue` prevents another settings transaction from treating
provisional state as settled rollback authority.

Filesystem operations deliberately do not promise destructive rollback.
Automatically deleting folders after partial additive creation could exceed
Workbench's authority and destroy creator or concurrent data. Rename rollback
is attempted only through the exact proven old/new root pair, and settings
rollback follows the filesystem result rather than assuming that reversal
succeeded.

### Recovery

Most rejected or failed operations recover automatically to a known-good live
state:

- pre-write validation failures leave prior state untouched;
- failed ordinary settings persistence restores the prior in-memory value;
- blocked or failed detached runtime preparation leaves the prior runtime
  untouched and triggers configuration rollback;
- successful compensating persistence restores agreement between durable
  settings and the prior runtime;
- successful reverse language rename restores the prior root and configuration.

When compensating persistence fails, Workbench keeps the safest proven
in-memory/runtime/filesystem state and presents an explicit warning that
persisted settings may require review before Obsidian is restarted.

When additive language creation or root repair fails after establishing some
folders, those folders are intentionally preserved. The creator can inspect
them normally in the vault; Workbench does not delete them automatically.

When reverse language rename fails, the renamed root and matching new in-memory
configuration are retained and the UI reports that the previous root could not
be restored. Recovery therefore starts from the filesystem state that actually
exists rather than from a falsely reconstructed configuration.

External vault recovery facilities such as Obsidian File Recovery, Git, or
filesystem/versioned backups remain useful general safeguards, but current
Workbench rollback logic does not assume that ordinary users have any
particular external recovery system.

### Findings

#### DS-008-H1 — Runtime linguistic reload progressively mutated live inventories

**Severity:** Medium
**Impact radius:** Runtime linguistic state for the active language set; no
direct creator-Markdown corruption or deletion.

Before remediation, `reloadActiveLanguage()` cleared/rebuilt live Language
Profile and linguistic inventory state progressively. Individual inventory
loaders also cleared their live indexes before asynchronous source loading
completed. An unexpected failure after one or more loaders had begun could
therefore leave a mixed or incomplete runtime until another successful reload
or plugin restart.

**Remediation:** Runtime preparation now occurs through a detached
`LanguageRuntimeCandidate`. Language Profiles, dictionary, morphemes,
linguistic examples, and phonology are fully prepared before
`commitLanguageRuntime()` synchronously installs the completed candidate.
Long-lived UI components retain the plugin/runtime owner rather than a
replaceable inventory instance. Future canonical linguistic runtime modules
must join this same detached prepare/commit lifecycle rather than introducing
progressive mutation of live runtime state.

The stronger runtime guarantee was then propagated through reload-aware
settings, language removal, root repair, and rename transactions. A thrown
candidate-preparation failure now has the same old-runtime-preservation
guarantee needed for safe settings rollback, while filesystem rollback remains
conditional on what the transaction can prove about actual vault state.

**Verification:** `scripts/test-language-runtime.mjs` verifies complete
candidate construction, empty candidates, inventory arguments, dictionary
count, case policy, and a forced late phonology failure after earlier detached
loaders have run. Focused transaction regressions verify successful rollback,
rollback-save failure, root-repair folder preservation, and all three
rename-recovery outcomes. The complete remediated transaction regression set
and production build pass. Commits `f447726` and `78d02bf` contain the runtime
and transaction remediations respectively.

**Status:** Remediated and verified.

### Status

**Pass — DS-008-H1 remediated and verified.**

---

## 9. Duplicate IDs and Identity Collisions

### Stable ID Domains

Current production behavior keeps three broad identity layers separate.

`WorkbenchIdentity.workbenchID` and `sourceID` identify the known Obsidian
source. They are derived from the complete vault-relative source path and are
not substituted for creator-authored linguistic identity. Same-inventory
configured-folder overlap is rejected before runtime loading, preventing one
physical source tree from being scanned as the canonical inventory of two
active languages.

`language_id` identifies a canonical Language Profile. Distinct configured
languages must not silently acquire the same stable language identity merely
because their unique settings names differ.

Top-level linguistic object IDs are scoped by stable language identity and
object type. The current fields are:

- `lexeme_id`
- `morpheme_id`
- `example_id`
- phonological `unit_id`
- phonological `realization_id`

The practical portable identity is therefore `language_id + document type +
object ID`. Reuse of an object ID by another language or another document type
does not itself establish a collision.

`LexicalSense.id` is a nested identity parsed from a structured sense block
inside one lexical entry. Its domain is the owning lexical entry, not the whole
language. Different lexemes may therefore reuse a sense ID, while repeated
nonblank sense IDs inside one lexeme are ambiguous.

Generated portable object IDs use a type prefix and Web Crypto UUID, but source
parsers deliberately honor arbitrary nonblank creator-authored IDs. The
generator's shape is a collision-avoidance convention, not parser authority to
rewrite or reject other creator IDs.

### Duplicate Detection

Morpheme, phonological-unit, and phonological-realization indexes are
multimaps. Their normalized ID keys retain every matching object in an array
instead of silently replacing an earlier object. Lookup methods return arrays
and may optionally filter by stable language ID and readable language name.

Lexical entries and standalone linguistic examples retain their optional
portable ID through the source record's `linguisticID`, but currently have no
portable-ID lookup index. Structured lexical senses retain their optional
nested IDs but likewise have no ID index.

These preservation choices keep colliding creator objects observable.
`linguistic-identity-diagnostics.ts` now compares only complete accepted
runtime values and reports every source participating in a collision. Separate
document-type collections prevent false collisions between lexemes, morphemes,
examples, units, and realizations. Top-level object IDs are compared within
their language scope, lexical-sense IDs within their owning lexeme, and loaded
Language Profile IDs across distinct profile paths.

### Ambiguous Lookup

Current morpheme and phonology ID APIs return all matches rather than choosing
the first match. No production mutation-capable operation consumes those
lookup APIs.

The current realization-to-unit relationship is also retained by ID rather
than resolved to one arbitrary unit object. Diagnostics now evaluates target
cardinality explicitly: zero same-language matches is unresolved, one is
uniquely resolved, and more than one is ambiguous. An ambiguous realization
names every candidate unit path without selecting or rewriting any target.

The phonology UI is the only current production consumer of a linguistic
relationship lookup. It is read-only and supplies both the unit's stable
language ID and readable language name.

### Mutation Risk

Current production mutation operations do not select creator sources through a
portable linguistic-object or lexical-sense ID. Duplicate IDs therefore do not
currently authorize arbitrary note mutation, deletion, or overwrite.

Future editing, relationship, import, backfill, or synchronization commands
must require a unique identity in the correct language and document-type
domain. An array with more than one same-domain match must remain ambiguous and
must never be collapsed to its first element as mutation authority.

### Diagnostics

`buildSourceDiagnosticGroups()` remains an observational cross-record
boundary. `getSourceDiagnostics()` supplies loaded Language Profiles and each
identity-bearing inventory as separate collections to
`buildLinguisticIdentityDiagnostics()`. Derived collision and relationship
warnings then pass through the existing per-source grouping and de-duplication
path without mutating source records or creator Markdown.

Every affected source receives its own navigable Diagnostics card. Messages
name the other colliding paths or ambiguous candidate targets so the creator
can inspect the notes and decide whether objects should remain separate,
receive distinct IDs, be merged, or be deleted.

### Findings

#### DS-009-H1 — Duplicate stable linguistic identities are preserved but not diagnosed

- **Severity:** Low
- **Impact radius:** Active linguistic runtime and Diagnostics; no current
  direct creator-Markdown mutation
- **Status:** Remediated and verified

Workbench continues to preserve distinct sources with the same linguistic ID
and current multimap lookup APIs continue to return every match. The new
observational identity-diagnostics module reports distinct loaded Language
Profiles sharing one `language_id`, same-language same-type portable object
IDs, repeated lexical-sense IDs within one lexical entry, and ambiguous
realization-to-unit relationships.

Automated regressions verify independent document-type and language domains,
case-insensitive top-level object-ID comparison, lexeme-local sense identity,
profile-path de-duplication, warnings on every colliding source, and explicit
zero/one/many phonological target handling. All package regression suites and
the production build passed.

Runtime verification used the permanent DS-009 duplicate-unit fixture. Both
unit notes received reciprocal warnings, the realization warning named both
candidate paths, and every Open note action navigated to the correct source.
Pre- and post-runtime SHA-256 hashes of all three notes matched exactly,
confirming that aggregation and navigation did not rewrite creator data.

### Status

**Pass — DS-009-H1 remediated and verified.**

---

## 10. Broken References and Missing Targets

### Implemented Relationship Types

Current production has two creator-authored relationship forms.

A lexical entry's optional `parts` list describes its compound decomposition
using conlang surface forms. `parseStringList()` preserves usable scalar values,
and the Dictionary details view resolves each part through the ordinary
`byWord` index. That index contains headwords and aliases but deliberately
excludes declared inflected forms. A part is therefore a readable lexical
reference rather than a stable portable-ID relationship.

A phonological realization's required `unit_id` refers to a canonical
phonological unit in the same language scope. Both records remain independent
creator sources; the relationship is interpreted observationally and does not
replace either object with an embedded copy.

Lexical-sense, morpheme, example, realization, and Language Profile IDs are
currently identities rather than implemented cross-document references. The
other relationship categories retained in this audit template remain future
possibilities and must not be described as present production behavior.

### Missing Targets

A realization whose `unit_id` has no same-language unit remains loaded.
Persistent Diagnostics gives its source a
`phonology.realization.unresolved-unit` warning without editing or discarding
the realization.

A lexical entry whose `parts` value has no matching dictionary headword or
alias also remains loaded with the original part text intact. The Dictionary
details view renders that part as a grey unknown chip with the tooltip
`This part isn't in the dictionary.` It does not create a replacement entry or
rewrite the compound note.

Unlike the phonological relationship, an unresolved lexical part is not
included in persistent Diagnostics. The creator sees it only after opening the
owning lexical entry's details.

### Ambiguous Targets

Phonological relationship diagnostics use explicit cardinality. Zero matching
units is unresolved, one is uniquely resolved, and more than one is ambiguous.
An ambiguous realization names every same-language candidate path rather than
silently selecting one.

Lexical-part rendering instead calls the singular `Dictionary.lookup(part)`
without the owning entry's language. That API deliberately returns the first
globally loaded match. When several languages are active, a missing local part
can therefore appear resolved by a same-spelled entry from another language.
When same-language homographs or aliases share the surface form, the first
match is likewise presented and made clickable while the remaining candidates
are hidden.

The selected dictionary entry already retains its source language, and
`lookupAll(part, language)` can preserve all same-language candidates. The
current caller does not pass or use that authority.

### Repairs and Mutation Authority

Neither relationship display performs automatic repair. Unknown part chips are
not clickable, resolved part chips only open an existing note, and phonological
relationship diagnostics only navigate to creator sources. No missing or
ambiguous target authorizes creation, replacement, deletion, or rewrite.

A future repair command must require explicit creator intent and prove one
exact target in the correct relationship domain. It must not borrow a
same-spelled object from another language or collapse several candidates to
their first array element.

### Renamed Targets

Neither current relationship stores a target file path. Renaming or moving a
target note therefore does not by itself break the relationship after the
inventories reload, provided its referenced headword, alias, or phonological
unit ID remains unchanged.

Changing or removing the referenced headword, alias, or `unit_id` can make the
relationship unresolved. Adding another matching target can make it ambiguous.
Diagnostics and UI resolution must always derive again from the current loaded
sources rather than retaining a stale chosen target.

### Findings

#### DS-010-H1 — Lexical compound parts can resolve outside their language or hide ambiguity

- **Severity:** Low
- **Impact radius:** Dictionary details display and Open note navigation; no
  creator-Markdown mutation
- **Status:** Remediated and verified

The original compound-parts renderer used an unscoped singular dictionary
lookup. With multiple active languages, a part absent from the owning lexicon
could be shown as resolved by another language. Multiple same-language
headword or alias matches were reduced to the first result, so the UI concealed
ambiguity and its click action could open an arbitrarily ordered candidate.

Lexical-part resolution now uses the owning entry as language authority and
preserves explicit unresolved, unique, and ambiguous cardinality. Only one
proven same-language target becomes clickable. Missing and ambiguous parts
remain visible but inert, and both conditions flow through the existing
observational source-diagnostics boundary without acquiring source-rewrite
authority.

The Dictionary now exposes the shared read-only entry-details presentation
through explicit list/details navigation. It defaults to entries owned by the
current primary language and can deliberately broaden to all active languages.
Type choices, entry totals, result filtering, and selected-detail rediscovery
derive from the same language-scoped entry set. Entry-specific inflection
display uses the entry's owning language rather than borrowing rules from the
primary language.

Verification included the lexical-part relationship, source-diagnostics,
dictionary-language-scope, selection-lookup, and lexical-senses regression
suites; repeated production builds; persistent Diagnostics and Dictionary
runtime checks; explicit unique, missing, and ambiguous interaction checks;
and matching pre/post SHA-256 hashes for all four permanent DS-010 fixture
sources. Relevant commits are `07c7d91`, `1d45a1a`, and `8cc53ac`.

### Status

**Pass — DS-010-H1 remediated and verified.**

---

## 11. Moves, Renames, and Path Changes

### Source Paths

Workbench retains vault-relative source paths as observational source identity
and configured source authority. Linguistic source records derive their local
Workbench source identity from the complete current vault-relative path, while
configured language roots and canonical child folders define which filesystem
locations a language is currently authorized to load.

Portable linguistic IDs and Workbench IDs are separate identity domains and do
not make a stale configured path authoritative. Path-based source identity is
therefore allowed to change when a note moves, while stable configured-language
identity remains associated with the language configuration.

### File Renames

Ordinary linguistic note renames do not require Workbench to rewrite stored
relationship targets because current implemented linguistic relationships do
not persist target note paths. Reload reconstructs indexes and source records
from the current vault state.

Language-root rename is a separate mutating transaction. It proves ownership of
the existing configured root, moves that established root as one vault object,
rewrites only configured paths that descend from it, persists the new
configuration, and reloads active runtime state. Failure handling follows the
physical state that can still be proven rather than assuming a requested rename
completed.

### Folder Moves

Moving a configured canonical source folder outside Workbench can make the
configured path stale. Workbench must not infer that an arbitrarily discovered
folder is the same creator source merely because its contents or name appear
similar.

A missing canonical child folder under an existing language root is handled by
the explicit **Repair language root** workflow. A missing configured language
root is handled separately by **Recreate language root**, which requires
confirmation and may create only the exact configured ownership boundary when
the shared `Languages/` container still exists as a folder.

Recreate does not search for, move, adopt, or delete an alternate folder. If a
folder appears at the configured root before final mutation authority is
established, Recreate stops and directs the creator toward Repair instead.

### Language Reassignment

Explicit creator-authored `language:` metadata remains authoritative where the
source type supports it. Canonical folder membership and configured language
identity are validated separately so that a moved source is not silently
reassigned merely because it now appears under another language's configured
tree.

Language configuration identity is carried by its Workbench ID rather than by
the display name alone. Rename and root-repair operations preserve that stable
configuration identity while changing only the paths or names their explicit
operation owns.

### Stale References

Configured paths are treated as authority claims, not instructions to recreate
whatever structure happens to be missing.

Lexical persistence performs destination and collision checks through the
shared dictionary writer, but an ordinary lexical write may create only the
new note itself inside an already-established canonical dictionary folder. It
does not acquire structural-repair authority merely because the configured
folder is absent.

The writer checks that the configured dictionary destination is still a folder
before content generation and rechecks it immediately before the final
`vault.create()`. Missing or replaced structure blocks creation and returns
creator-facing guidance to repair the language structure instead.

This preserves the architectural role of `writeDictionaryEntry()` as the
single lexical persistence boundary while keeping canonical structure
establishment under the explicit Repair/Recreate workflows.

### Findings

#### DS-011-H1 — Ordinary lexical creation could resurrect a stale canonical dictionary folder

- **Severity:** Low
- **Impact radius:** Configured dictionary structure and newly created lexical
  notes; existing creator-authored sources are preserved
- **Status:** Remediated and verified

The dictionary-entry writer previously used the shared strict folder helper
before creating a lexical note. If a creator moved the configured canonical
dictionary folder outside Workbench, the stale configured path could therefore
be recreated automatically by an otherwise ordinary lexical creation request.
The new note would then be written into that resurrected path even though the
creator's existing vocabulary remained at the moved location.

That behavior did not overwrite or delete the moved creator sources, but it
could establish a second stale canonical structure and later cause Workbench to
interpret the recreated path as the configured source.

Lexical creation now requires the configured dictionary folder to already
exist as a folder. A missing path or non-folder collision is preserved and
blocks the write with Repair guidance. The destination is checked again
immediately before the final lexical note creation so that a concurrent
move/removal cannot silently transfer structural authority to the writer.

All production lexical creation flows already surface the writer's structured
blocked/failed error to the creator, so no separate UI mutation path was
required. Names inherit the same protection because they use the same
dictionary-entry persistence boundary.

Verification included the dictionary-entry-writer security regression;
language-root Repair presentation/state regressions; Recreate planner,
presentation, state, and writer regressions; language creator and membership
regressions; persisted-settings and frontmatter parsing regressions; repeated
production builds; `git diff --check`; and implementation commit `86cbf88`.

### Status

**Pass — DS-011-H1 remediated and verified.**

---

## 12. Import Safety

### Current Imports

No user-facing language-import, file-import, external-format import, or
existing-root adoption pathway is implemented in the current Workbench.

The implemented language actions are Add Language, Reload Language Data, Repair
Language Root, Recreate Language Root, Rename, and Remove. Add Language creates
a new structural root and deliberately refuses to adopt an already-existing
unconfigured root. Repair, Recreate, and Rename likewise do not gain authority
to adopt such a root.

Production comments explicitly reserve adoption of an existing unconfigured
language root for a separate future Import Language authority path. The current
plain-data source adapters are designed so that future import adapters may
reuse them, but that architectural seam is not itself an import operation.

Configured creator-authored Markdown is instead read in place as canonical
source data. Dictionary, morpheme, phonology, and linguistic-example loaders
build runtime and diagnostic state from existing notes beneath configured
source folders rather than copying those notes into a new import destination.

### Destination

Not applicable to the current implementation because there is no import
operation and therefore no import destination.

Ordinary canonical-source loading reads notes where they already exist.
Language creation and structural reconciliation have separately audited
destination authority and do not serve as implicit import or adoption paths.

### Collision Handling

Not applicable to a current import pathway.

Existing unconfigured language roots are treated as ownership boundaries rather
than opportunities for implicit adoption. Add Language blocks when the proposed
root already exists, and the other structural operations do not convert that
collision into Import Language authority.

Identity and duplicate-source behavior for canonical Workbench data is covered
by the duplicate-ID and source-authority audits. A future importer must not
assume that matching filenames, lemmas, source IDs, Workbench IDs, or portable
linguistic IDs authorize overwrite, merge, replacement, or arbitrary target
selection.

### Preview

No import preview exists because no import operation exists.

A future broad import or adoption workflow must review whether its mutation
scope requires a creator-visible preview of intended additions, destination
choices, conflicts, unsupported data, and any other material consequences
before mutation.

### Preservation

Current canonical-source ingestion is observational. The inspected dictionary,
morpheme, phonology, and linguistic-example loader/source-adapter modules
contain no vault create, modify, process, rename, delete, trash, folder-create,
or frontmatter-processing mutation API.

Recognized malformed or context-rejected sources are retained for source-facing
state and diagnostics rather than rewritten merely to make them load cleanly.
Runtime language resolution changes in-memory interpretation only and does not
authorize rewriting creator Markdown or backfilling metadata.

Existing creator-authored unconfigured language roots are likewise preserved
rather than silently claimed by Add Language or structural repair operations.

### Validation

Current canonical Markdown parsing and source-authority validation belong to
the existing input, source-authority, identity, and path-safety boundaries
rather than to an import parser.

No external import format is currently accepted, so malformed or partially
unsupported import behavior cannot yet be exercised. Any future Import Language
or external-format importer must reopen this section and establish explicit
validation, destination authority, collision behavior, preservation rules, and
failure handling before release.

### Findings

None. No implemented import pathway currently exercises import mutation
authority.

### Status

**Not Applicable — no import pathway is implemented in the current Workbench.**

---

## 13. Export Fidelity and Lossiness

### Exported Fields

No full-language, file-based, or external-format exporter is implemented in the
current Workbench.

The implemented outward-data operation in scope is Translator clipboard Copy.
Copy is available only in Transliterate mode and exports the rendered flat
transliteration text shown inside the `.conlang-translit` output element.

Gloss mode is intentionally not copied as plain text because its representation
contains materially richer information than the flat transliteration form.

### Unsupported Data

The current clipboard operation does not provide a faithful plain-text
representation of Gloss mode.

Gloss may expose ambiguity, multiple dictionary candidates, matched senses,
inflection information, cypher-fallback warnings, no-match warnings, and other
explanatory metadata. Flattening that representation through the Transliterate
renderer would discard or obscure those distinctions.

No external linguistic interchange format is currently implemented, so there
is no present claim that Workbench lexical, morphological, phonological, or
example data can be represented losslessly outside its canonical Markdown
sources.

### Lossiness Disclosure

Transliterate mode is explicitly presented as a flat approximation rather than
a fluent or grammatically complete translation. Its UI explains that dictionary
words are substituted directly and unmatched words may use cypher placeholders
that preserve sound rather than conlang grammar.

Clipboard Copy now follows that same representation boundary. It is available
only while Transliterate mode is active. Gloss mode disables Copy and explains
that no faithful plain-text copy format exists yet.

The copy implementation also reads only the rendered `.conlang-translit`
content rather than the surrounding output container, so explanatory UI footer
text is not included in the creator's copied translation.

### Source Safety

Translator clipboard Copy is observational with respect to canonical Workbench
data. It reads existing runtime/rendered translation state and writes text only
to the system clipboard.

The inspected operation does not create, modify, rename, delete, normalize, or
rewrite creator-authored Markdown or persisted Workbench configuration merely
to produce clipboard output.

### Round-Trip Expectations

No import/export round trip is currently implemented.

Workbench therefore makes no claim that clipboard output can reconstruct
canonical lexical sources or that any external format can round-trip all
Workbench information without loss.

Any future Gloss copy representation, full-language exporter, or external-format
adapter must reopen this section and document represented fields, unsupported
data, transformations, lossiness disclosure, source-safety boundaries, and
tested round-trip expectations before being described as lossless.

### Findings

**DS-013-L1 — Gloss-mode Copy silently substituted lossy Transliterate output
(Low). Remediated and verified.**

Before remediation, invoking Copy while the Translator displayed Gloss mode
did not copy the richer Gloss representation or refuse the unsupported
operation. It regenerated a flat string through the Transliterate renderer,
silently discarding ambiguity, candidate, sense, warning, and explanatory
information represented by Gloss.

Copy is now disabled in Gloss mode with an explicit explanation, and
`copyTranslation()` independently fails closed unless Transliterate mode is
active. The flat transliteration renderer remains intact for its legitimate
translation role and is no longer used by `panel.ts` as a Gloss-copy shortcut.

**DS-013-L2 — Transliterate Copy included explanatory UI footer text (Low).
Remediated and verified.**

Before remediation, Transliterate Copy read `textContent` from the complete
translator output container. That container holds both the rendered
transliteration and explanatory UI text, so clipboard output could include text
that was not part of the requested translation.

Copy now reads only the rendered `.conlang-translit` child. Production-bundle
inspection verified the selector and mode-aware Copy boundary after build.

### Status

**Pass — two Low clipboard-fidelity findings were remediated and verified; no
full external-format export pathway is currently implemented.**

---

## 14. Migration Safety and Idempotency

### Migration Inventory

The current startup migration path is limited to persisted plugin settings. Startup
loads `data.json`, decodes the persisted representation, applies compatibility
migration, and then validates configured-language identity before runtime
registration proceeds.

The current settings migrations are:

- infer a missing legacy language `rootFolder` from established canonical source
  paths when the evidence resolves to one unambiguous root;
- establish a missing `workbenchID` from the configured language name and
  authority path using a deterministic compatibility identifier; and
- migrate the legacy single `activeLanguage` representation into the current
  `activeLanguages` / `primaryLanguage` representation.

No creator-authored Markdown/frontmatter migration was identified. Current source
compatibility readers interpret existing notes observationally rather than
rewriting them as an upgrade side effect.

### Backward Compatibility

Compatibility state is distinguished from malformed current state rather than
treating every missing or unusual value as migration permission.

A genuinely absent legacy `rootFolder` may be inferred conservatively. A
persisted `rootFolder` that is present but blank is malformed and is blocked
before migration. Likewise, a missing `workbenchID` is compatibility state, while
an explicitly persisted blank identifier is invalid.

Legacy `activeLanguage` may seed the modern selection only when the persisted
data did not contain the modern `activeLanguages` field. If the modern field was
persisted, its presence establishes the representation authority even when its
value is empty. A stale legacy field therefore cannot override an explicitly
persisted modern representation.

### Idempotency

Migration behavior is deterministic and representation-aware.

Legacy root inference requires the available canonical source paths to resolve
to the same root. Workbench compatibility IDs are deterministically derived from
the same migration seed. Language-selection migration records modern
`activeLanguages`; once that modern representation is persisted and decoded
again, a stale legacy `activeLanguage` cannot regain authority.

The dedicated settings-migration regression performs migration, simulates
persistence of the modern representation, decodes it again, and verifies that a
second migration leaves the selected active and primary language unchanged.

### Failure Recovery

Persisted settings are decoded before migration. Malformed persisted settings
block startup before migration is installed as runtime authority.

Migration itself operates on the decoded in-memory settings representation.
There is no `saveData()` or `saveSettings()` call inside `loadSettings()` or
`migrateSettings()`. Configured-language identity validation follows migration;
if decoding, migration, or identity validation throws, plugin startup does not
advance to later layout-ready startup work.

The welcome-notice lifecycle flag previously performed an unrelated whole-settings
`saveData(this.settings)` write after startup. That created an accidental
persistence point for in-memory compatibility migration. Welcome state is now
stored separately through Obsidian's vault-local storage API when that API is
available. The historical `hasSeenWelcome` settings field is read-only
compatibility evidence and no longer grants the welcome path authority to save
or mutate the complete settings object.

For Obsidian versions predating the vault-local storage API, an existing legacy
welcome flag is honored. If no legacy flag exists, the cosmetic notice may repeat
rather than restoring whole-settings persistence authority merely to suppress
the notice.

### Version Detection

Migration decisions use structural representation evidence rather than sentinel
default values or guessed content.

The persisted-settings decoder records whether `activeLanguages` was actually an
own field of the persisted object before defaults are overlaid. Migration uses
that field-presence evidence to distinguish legacy single-language state from
modern state.

Missing legacy structural fields are distinguished from present malformed
fields. Root inference accepts only canonical source evidence that resolves
unambiguously to one root; conflicting or unresolved evidence fails closed.

### Unknown Metadata

The persisted-settings decoder clones persisted JSON-compatible data before
default overlay and normalization. Unknown top-level and nested metadata remains
attached to its owning persisted object rather than being discarded merely
because the current Workbench does not interpret it.

Migration mutates only the settings fields it owns. Regression coverage verifies
that unknown nested language metadata and unknown top-level metadata survive
decode, migration, and a JSON persistence round trip unchanged.

Unknown metadata therefore receives preservation, not authority: its existence
does not authorize current runtime interpretation or mutation.

### Findings

#### DS-014-L1 — Default overlay masked legacy active-language migration state

**Severity:** Low

The decoder previously overlaid current defaults before migration without
preserving whether `activeLanguages` actually existed in persisted data. An old
configuration containing only legacy `activeLanguage` could therefore receive
the default modern `activeLanguages` value first. Migration could mistake that
default for persisted modern authority, discard the legacy selection, and fall
back to the first configured language.

This affected plugin configuration/runtime selection only; no creator-authored
Markdown was deleted or rewritten.

**Remediation:** The decoder now records persisted `activeLanguages` field
presence before default overlay. Language-selection migration uses that evidence:
persisted modern representation wins when present, and legacy `activeLanguage`
may seed modern state only when the modern field was absent. Regression coverage
includes legacy migration, modern-over-legacy precedence, explicit modern empty
state, and repeat-migration idempotency.

#### DS-014-L2 — Blank persisted language root was accepted as legacy migration state

**Severity:** Low

`rootFolder` compatibility migration is defined for older configurations where
the field is absent. The persisted-settings boundary previously also accepted an
explicit empty or whitespace-only string. That allowed malformed structural
authority to enter the same migration path as legitimate legacy absence.

This affected settings/structural authority interpretation; it did not authorize
rewriting creator-authored Markdown.

**Remediation:** A present `rootFolder` must now be nonblank. Missing
`rootFolder` remains valid legacy compatibility state, while present-but-blank
values are blocked by the persisted-settings decoder before migration.
Regression coverage verifies both empty and whitespace-only values are rejected
without mutating the raw persisted input.

#### DS-014-L3 — Welcome UI lifecycle state shared whole-settings persistence authority

**Severity:** Low

The one-time welcome flag was stored inside `ConlangSettings`. Its startup path
called `saveData(this.settings)`, so cosmetic UI lifecycle state could persist
the entire in-memory settings object. A successfully decoded and migrated
settings representation could therefore become durable through an unrelated
welcome-state write rather than through its own settings authority path.

This affected plugin settings persistence only; it did not modify
creator-authored Markdown.

**Remediation:** Welcome state no longer mutates `ConlangSettings` or calls
`saveData()` / `saveSettings()`. On Obsidian versions providing the official
vault-local storage API, the marker uses the isolated
`conlang-workbench:welcome-seen` key. The legacy `hasSeenWelcome` field is retained
only as read-only compatibility evidence. Older supported Obsidian versions fail
toward a potentially repeated cosmetic notice rather than granting that notice
whole-settings persistence authority.

### Status

**Pass — three Low migration-safety findings were remediated and verified.**

---

## 15. Backup and Recovery Expectations

### Current Recovery Story

Workbench currently relies on narrowly scoped transaction compensation rather
than a general backup or undo subsystem.

The failure-recovery behavior verified in Section 8 remains the controlling
internal model:

- pre-write validation failures leave the prior state untouched;
- failed settings persistence restores the prior in-memory authority where that
  authority is still provable;
- blocked or failed detached runtime preparation leaves the prior runtime
  untouched and rolls configuration back;
- successful compensating persistence restores agreement between durable
  settings and the prior live state;
- language-root rename attempts exact reverse rename only through the proven
  old/new root pair.

Filesystem operations deliberately do not promise destructive rollback.
Partially established additive folders are preserved rather than automatically
deleted because creator or concurrent data may already exist within them.
Recovery follows the filesystem state that can actually be proven instead of
reconstructing an assumed prior state.

This is failure-time compensation, not post-success history. Workbench does not
currently maintain snapshots of previous successful creator configuration or a
general command-level undo stack.

### Obsidian and Filesystem Recovery

Workbench remains compatible with external vault recovery and versioning
systems, but its correctness does not depend on the creator having one.

Obsidian File Recovery can provide useful recovery for supported creator-authored
vault files, but it is not treated as a complete Workbench recovery mechanism.
Workbench settings persistence and folder topology are separate authority
domains and must not be assumed recoverable merely because note snapshots are
available.

Git, filesystem backups, and cloud or other versioned storage remain useful
general safeguards when they cover the relevant vault and configuration data.
Workbench does not inspect, require, or infer recovery authority from any such
external system.

### Pre-Mutation Backup

No current Workbench operation justifies an automatic pre-mutation backup
requirement.

Current filesystem mutations are either additive creation or the explicit rename
of one already-owned language root. Additive failure preserves established
content rather than deleting it. Language rename is confirmed explicitly,
revalidates authority immediately before mutation, and has exact compensating
rename behavior while the old/new root pair remains provable.

Inflection preset replacement can replace an entire configured rule set for one
language, but it affects settings-backed linguistic configuration rather than
creator-authored Markdown. The confirmation reports the number of rules that
will be replaced and explicitly warns that a successful replacement cannot be
undone from inside Settings.

This conclusion must be revisited before introducing operations such as bulk
creator-Markdown rewriting, destructive migration, import with replacement,
mass metadata normalization, creator-file deletion, or other transformations
whose impact can span many creator-authored files.

### Undo

Workbench has no general post-success undo system.

A successfully renamed language can be renamed again through the same fresh
validation and confirmation path, providing a semantic inverse without treating
the earlier transaction snapshot as durable undo history.

Successful inflection preset replacement does not retain the previous rule set
for later restoration. This limitation is communicated before authorization,
and failed persistence still restores the previously settled rule state.

A general undo stack is not required by the current mutation surface. Any future
operation that destroys or rewrites substantial creator-authored data must
reopen that conclusion.

### Documentation

The current README does not contain a general backup or recovery section.

For the present mutation surface, operation-specific UI communicates the most
important recovery boundaries:

- language rename identifies the old and new names, states that the existing
  owned root folder will be renamed, explains that configured child paths
  change, and warns that Obsidian may update links according to the creator's
  normal link-update preference;
- inflection preset replacement states that existing rules will be replaced,
  reports the affected rule count, requires explicit confirmation, and warns
  that successful replacement cannot be undone from inside Settings;
- failure notices distinguish restored state from unusual cases where persisted
  settings or filesystem state require creator review.

A broader backup/recovery section should be added to user documentation if
future Workbench operations begin rewriting, replacing, or deleting substantial
creator-authored vault content.

### Findings

None.

### Status

**Pass — current recovery boundaries are explicit, external backups remain
supplementary rather than assumed, and no present operation requires an
automatic backup or general undo subsystem.**

---

## 16. Large-Scale Operations and Blast Radius

### Folder-Wide Operations

The current Workbench mutation surface contains no Workbench-owned recursive
many-note rewrite.

Language creation, root repair, and root recreation can create several folders,
but their persistent scope is structurally bounded. Creation preflights and
establishes the canonical language structure. Repair establishes only the
missing canonical children of one already-owned configured root. Recreation
establishes one explicitly authorized missing configured root and its canonical
children. These operations do not recursively rewrite or delete notes.

Language-root rename has the largest current filesystem blast radius because one
Obsidian folder rename can move an owned root containing an arbitrary number of
descendants. Workbench does not enumerate or rewrite those descendants itself.
The rename planner proves the current owned source root and unoccupied
destination, and the confirmation modal identifies the exact old and new
language names before mutation. It also tells the creator that the existing
owned root will be renamed, configured paths beneath it will be updated,
Workbench will not rewrite creator-authored Markdown or YAML, and Obsidian may
update links according to the creator's normal link-update preference. Implicit
modal close paths fail closed.

The multi-language dictionary command is the only current operation found that
can create multiple notes in one user workflow. It performs at most one
dictionary-entry attempt per explicitly selected configured language. Each
attempt passes independently through the ordinary hardened dictionary writer;
the command does not gain a separate bulk-write authority.

### Vault-Wide Operations

No current production path performs a Workbench-owned vault-wide rewrite,
recursive write, mass metadata normalization, or bulk deletion.

Dictionary, morpheme, linguistic-example, and phonology loaders do recursively
read Markdown beneath configured source folders. Those traversals are
observational runtime loading, not persistent mutation.

A successful entry write can also trigger rebuilding the settled active-language
runtime and refreshing open Markdown views/highlights. That work can scale with
the active linguistic corpus and open workspace, but it remains read/runtime/UI
work and does not enlarge the set of creator files authorized for mutation.

Language-root rename may indirectly cause Obsidian-managed link updates outside
the renamed subtree when the creator's normal Obsidian link-update preference
allows them. Workbench discloses that possibility before authorization rather
than representing the rename as an isolated path-string change.

### Dry Run

No additional dry-run mode is required for the current mutation surface.

The multi-language dictionary modal already acts as a concrete no-write preview:
it shows every configured language as an individual row with its destination
folder and proposed editable form, only the primary language begins selected,
and the creator explicitly chooses which nonblank targets will be submitted.
There is no select-all action.

Language-root rename is an exact old-name to new-name operation against one
already-owned root. Its explicit confirmation describes the structural move and
possible Obsidian link-update behavior before the single host-managed rename is
attempted. A descendant-by-descendant Workbench dry run would not describe an
additional Workbench-controlled rewrite.

The fixed-size Add/Repair/Recreate folder operations likewise have sufficiently
narrow structural scope that a separate dry-run mechanism would not currently
add a meaningful data-safety boundary.

### Progress and Interruption

No current Workbench-owned persistent operation performs a long-running
vault-wide or recursive write pass that requires per-item progress reporting.

The multi-language dictionary flow processes selected targets sequentially,
records individual successes and failures, and reports the final saved/failed
counts. Its post-write runtime reload can become more expensive as active
language corpora grow, but that phase prepares detached observational runtime
state rather than progressively mutating creator files.

The fixed canonical-folder operations perform only a small predetermined number
of structural creations, while language-root rename delegates one awaited folder
rename to Obsidian.

The consequences of interruption or failure after only part of an authorized
operation has completed are assessed separately in §17.

### Limits

Current persistent operations are limited by authority and target structure
rather than by an arbitrary numerical cap:

- Add/Repair/Recreate operate on one language and a fixed canonical folder set.
- Dictionary creation writes one lexical note per independently authorized
  target.
- Multi-language dictionary creation is limited to explicitly selected
  configured languages and at most one entry attempt per selected language.
- Rename operates on exactly one established owned language root and one
  validated unoccupied destination.

No explicit maximum number of configured languages or multi-entry targets was
found. That absence is not currently a data-safety finding because the
multi-entry UI does not implicitly authorize the whole configured set: only the
primary starts selected, every additional target is individually visible and
selected, and every resulting write retains the ordinary per-entry authority
checks.

Any future bulk Markdown/frontmatter rewrite, import that replaces or transforms
many notes, portable-ID backfill, mass metadata normalization, recursive
mutator, broad deletion, or whole-vault transformation must reopen this
analysis. Such a feature should establish explicit scope limits and evaluate a
dry run/preview, progress reporting, interruption behavior, and the backup and
recovery requirements from §15 before gaining broad mutation authority.

### Findings

None.

### Status

**Pass**

---

## 17. Crash and Interruption Recovery

### Plugin Crash

Ordinary Workbench linguistic loading is observational. Dictionary, morpheme,
linguistic-example, phonology, profile, and related source loaders read and
index configured creator sources but do not rewrite those sources as part of
loading.

A plugin exception or process termination during those read/index phases can
therefore leave runtime state unavailable or incomplete for that process, but
the loader itself does not acquire persistent mutation authority over the
creator's Markdown.

Runtime linguistic replacement is also prepared in detached candidate state
before commit, as established in §8. A loader failure therefore does not
progressively replace the settled live linguistic runtime with a partially
rebuilt candidate.

Persistent settings and filesystem mutations are separate authority boundaries
and are assessed below rather than being treated as effects of ordinary
reading.

### Mid-Write Crash

The current persistent mutation surface consists primarily of bounded folder
creation, settings persistence, one owned language-root rename, isolated
lifecycle storage, and create-only dictionary-note writes. No production path
was found that progressively rewrites, appends to, or deletes an arbitrary set
of existing creator-authored notes.

Application-level rollback can handle awaited failures while the plugin process
remains alive, but it cannot run after abrupt process termination. A hard stop
can therefore occur after one durable stage of a multi-step operation and
before its later persistence or reload stages.

The most important current example is language-root rename. The physical
Obsidian folder rename occurs before the corresponding settings transition is
persisted. Process termination in that interval can leave the creator's files
safely present at the new root while persisted Workbench configuration still
names the old root.

Startup validation does not silently adopt the new location or guess that the
moved folder should replace configured authority. The resulting mismatch is
therefore fail-closed and diagnosable rather than silently reconciled, but the
in-memory intent needed to finish the original rename transaction is lost.

Add Language has a related interruption boundary. Folder establishment occurs
before the new language configuration is durably saved. A hard stop can leave
some or all of the newly established canonical folders present without the
intended configured-language record or Workbench identity. A later ordinary
Add attempt treats the existing unconfigured root as reserved rather than
silently adopting it.

The multi-language dictionary command creates selected entries sequentially
through the ordinary hardened writer. Interruption can therefore leave a valid
completed prefix of independently authorized entry creations while the
remaining in-memory selection and continuation intent are lost. Completed
notes are not rolled back or deleted merely to simulate all-or-nothing batch
semantics.

### Obsidian Shutdown

An orderly Obsidian shutdown normally allows awaited operations already in
progress to resolve according to their existing success or failure handling,
but Workbench does not currently persist a separate operation journal or
pending-operation record that survives process exit.

A restart therefore reconstructs authority from durable filesystem state,
persisted plugin state, and ordinary source validation rather than from a
remembered in-progress transaction.

Operations that are naturally additive and state-derived remain comparatively
easy to resume. Language-root Repair can re-plan the still-missing canonical
children from the actual configured root, and Recreate can re-evaluate the
configured missing root and current filesystem state rather than relying on a
stale in-memory plan.

By contrast, operations whose intent is not fully represented by settled
durable state cannot necessarily resume as the same transaction after restart.
The rename intent, an interrupted Add Language identity/configuration intent,
and the remaining target set of a multi-language entry workflow are current
examples.

### System Interruption

Abrupt process termination, operating-system failure, or power loss has the
same application-level limitation: Workbench rollback code cannot execute after
the process has stopped.

The audit does not establish filesystem-level or host-level atomicity
guarantees for Obsidian's underlying `saveData()`, folder rename, or vault file
creation operations. Workbench should therefore not claim stronger crash
atomicity than the host APIs actually provide.

At startup, persisted settings still pass through the established decoding,
migration, identity, path, and source-authority validation boundaries. A
malformed or inconsistent persisted representation is blocked rather than
silently promoted to runtime authority.

Similarly, filesystem state that no longer matches configured structural
authority is preserved for diagnosis. Missing metadata, a plausible moved
folder, or the existence of an unconfigured root does not by itself grant
authority to adopt, rename, delete, or rewrite that state.

Filesystem failure itself may of course occur below Workbench's control.
Current Workbench behavior is designed to avoid compounding uncertainty with
automatic destructive repair when exact mutation authority cannot be proven.

### Recovery State

Current operations generally fail toward a preserved and diagnosable partial
state rather than attempting speculative cleanup.

In particular:

- completed creator-note creations remain ordinary valid notes;
- additive canonical folders are not deleted merely because a later stage did
  not complete;
- a physically renamed language root is not automatically moved again or
  adopted under guessed settings authority;
- an unconfigured root left by interrupted Add Language is preserved rather
  than silently claimed;
- malformed or inconsistent persisted settings are blocked rather than treated
  as permission to repair;
- and Repair/Recreate derive their next action from the currently proven
  filesystem and configuration state.

This behavior protects creator data, but it is not equivalent to durable
transaction resumption.

Workbench currently has no persistent recovery journal, operation identifier,
pending-transition record, or staged recovery namespace that preserves the
creator's original multi-step intent across process termination.

That omission is acceptable for the current narrow mutation surface only in the
sense that partial states remain bounded, preserved, and fail-closed. It still
creates a recoverability limitation where the creator may need to explicitly
re-establish intent after restart.

Any future recovery mechanism must itself be treated as a new persistence and
authority surface. Recovery records should be operation-specific, validated as
untrusted persisted data, bounded to proven Workbench-owned targets, and must
not turn stale intent into broad authority to move, adopt, overwrite, or delete
creator data.

### Findings

#### DS-017-L1 — Interrupted multi-step operations do not persist recovery intent across process termination

**Severity:** Low

Several current multi-step operations depend on in-memory transaction state that
does not survive abrupt process termination. The durable partial state remains
bounded and is generally preserved and diagnosable, but Workbench may no longer
have enough information after restart to resume the creator's original
operation exactly.

Current examples are language-root rename after the physical move but before
settings persistence, Add Language after canonical folder establishment but
before the new configured-language record is durable, and sequential
multi-language dictionary creation after some selected targets have completed
but before the remaining targets are processed.

The observed impact is loss of continuation intent or temporary disagreement
between durable filesystem and configuration state. No current path was found
that uses interruption as authority to delete creator data, overwrite an
existing source, silently adopt an unconfigured root, guess a moved language
identity, or arbitrarily complete an ambiguous operation.

**Remediation:** Deferred. A durable recovery journal or pending-operation model
would introduce a new persisted-data format plus new identity, cleanup,
validation, and mutation-authority boundaries. Adding that mechanism during this
audit would create a larger data-safety surface than the current Low-severity
limitation warrants.

Future recovery work should be designed and reviewed as a dedicated capability.
Recovery records should preserve only the minimum operation-specific intent
needed to diagnose or safely continue an interrupted transaction, be validated
as untrusted persisted input, and never grant broader mutation authority than
the creator originally authorized.

### Status

**Deferred — one Low crash-recovery finding is recorded. Current partial states
remain bounded, creator data is preserved, and uncertain recovery fails closed;
durable transaction-resumption intent is intentionally deferred for separate
implementation design and review.**

---

## 18. Diagnostics vs Automatic Repair

### Current Diagnostics

Workbench separates source diagnosis from the clean linguistic indexes that
power ordinary features.

Recognized malformed dictionary, morpheme, linguistic-example, and phonology
sources are retained as `WorkbenchSourceRecord` values even when they cannot
safely become complete feature objects. Contextually rejected but otherwise
parseable sources are likewise retained with source-language authority
diagnostics rather than disappearing from accounting.

`source-diagnostics.ts` derives creator-facing diagnostic groups from those
retained records plus cross-record identity and relationship checks. The
aggregation boundary is observational: it does not rewrite creator Markdown,
replace source records with repaired values, or decide that rejected data may
enter a clean feature index.

The Diagnostics workspace renders a fresh derived snapshot rather than owning a
second mutable diagnostic authority. Diagnostics remain grouped by Workbench
source identity and path, so malformed linguistic data that lacks a usable
creator-facing linguistic ID can still remain visible and navigable.

Transient Obsidian Notices are therefore supplementary presentation rather than
the sole representation of source-data problems. Current-source diagnostics are
briefly resurfaced when meaningful navigation reaches an affected source, while
the Diagnostics workspace remains available for the complete current snapshot.
Background parsing and unrelated navigation do not repeatedly interrupt the
creator.

Diagnostics are derived from current retained source state rather than stored in
a separate persisted diagnostic database. In this context their durability
comes from reproducibility: an unresolved source problem remains observable
after reloading and reparsing the same unchanged creator source.

### Silent Skips

The principal recognized-source adapters preserve their established
fail-closed pattern:

- recognized malformed sources remain retained with `value: null` and
  diagnostics while staying out of clean runtime indexes;
- usable sources rejected by language authority remain retained with the
  rejection diagnostic rather than silently entering another language;
- unresolved and ambiguous relationships remain represented diagnostically
  rather than selecting an arbitrary target;
- and unresolved phonology relationships may remain loaded as creator data so
  relationship diagnostics can describe the unresolved target later.

One gap was found in optional structured lexical senses. Structured semantic
material in a lexical note body was parsed after the ordinary lexical source
record had already entered the dictionary. The legacy
`parseLexicalSenses()` API returned only successfully interpreted senses and had
no diagnostic channel, so recognizable structured-sense material that
Workbench could not safely interpret could be omitted from semantic indexing
without becoming part of the retained source diagnostic state.

That gap is recorded as DS-018-L1 and was remediated during this audit.

The remediation deliberately does not turn the structured-sense parser into a
general Markdown linter. An empty `## Senses` section, an unfinished Sense
heading, an ID-only sense, blank supported fields, ordinary prose, and unknown
field names remain non-diagnostic because those states can legitimately
represent incomplete or unconventional creator work.

Diagnostics are added only where Workbench has positive evidence of supported
structured semantic input that it cannot safely use. Current examples are a
nonblank supported semantic field with no recognized owning Sense heading and a
nonblank Lookup field that contains no usable lookup terms.

Regression work also exposed a same-line parsing defect in the existing field
reader. Its whitespace expression could cross a newline, allowing an empty
field such as `**Gloss:**` to consume the following structured field as its
value. The parser now permits only horizontal whitespace between a supported
field marker and its same-line value, enforcing the format it already
documented rather than expanding interpretation authority.

### Repair Behavior

Diagnosis and repair remain separate authority boundaries.

`language-source-watch.ts`, source parsers, retained source records,
`source-diagnostics.ts`, the Diagnostics tab, and contextual source Notices are
observational. Displaying or navigating to a diagnostic does not itself
authorize a source rewrite, settings mutation, folder creation, identity
backfill, semantic normalization, or other repair.

Language-root Repair and Recreate are explicit creator actions. Their planning
and validation stages diagnose current configured/filesystem state first, while
successful mutation authority is established separately for the exact
configured root and required canonical structure.

Translation vocabulary repair is similarly explicit. The unresolved-results
workflow may identify missing vocabulary, but the repair modal grants only the
narrow lexical-creation authority the creator selects. Translation replacement
is separately re-planned afterward rather than inheriting repair authority from
the earlier diagnostic state.

No reviewed path was found where merely observing a malformed, ambiguous,
missing, duplicate, or structurally inconsistent source silently becomes
authority to rewrite that creator source.

### Linguistic Uncertainty

Workbench currently preserves several forms of linguistic uncertainty rather
than collapsing them into one guessed interpretation.

Phonology explicitly supports `established`, `proposed`, and `unresolved`
status. Missing and ambiguous cross-record relationships remain distinct from a
uniquely proven target. Duplicate stable linguistic IDs remain creator-authored
sources with diagnostics rather than being automatically renumbered or merged.

Structured lexical senses likewise remain optional enrichment. Empty or
unfinished sense structures are not automatically classified as errors, and
the DS-018 remediation does not invent ownership for semantic fields whose
sense cannot be proven.

Translation planning preserves unresolved and ambiguous states as blockers
rather than selecting an arbitrary candidate. Where multiple analyses remain
possible, the current safety posture is to preserve that uncertainty until
creator intent establishes a stronger authority boundary.

### Repair Suggestions

Workbench may describe an available explicit next action without performing it
automatically.

Current examples include missing or replaced configured dictionary structure
blocking lexical creation and directing the creator toward the explicit
Repair/Recreate workflow, and diagnostics that navigate to the affected source
note so the creator can inspect the original material.

A suggestion, warning, diagnostic, or available repair command is not itself
mutation authority. Future repair helpers should preserve the same separation:
diagnose the current state, identify a bounded possible repair, then acquire
explicit and exact authority before mutating creator data.

### Findings

#### DS-018-L1 — Structured lexical-sense omissions were not retained in source diagnostics

**Severity:** Low

Structured lexical senses are supported creator-authored semantic data loaded
from the Markdown body after the ordinary lexical source record is accepted.
The previous parser returned only successfully interpreted senses, so
recognizable supported structured material that could not safely become a sense
could be omitted from semantic interpretation without entering the retained
source-diagnostic path.

The source Markdown itself remained preserved, and the containing lexical entry
remained valid. The impact was therefore observability and derived semantic
index fidelity rather than destructive data loss or unauthorized source
mutation.

During remediation, focused regression coverage also exposed that the
same-line field reader used newline-capable whitespace. An empty supported
field could therefore consume the following structured field as its apparent
value. This was corrected as part of the same structured-sense interpretation
boundary rather than recorded as a separate finding.

**Remediation:** Remediated and verified. Structured-sense interpretation now
returns successfully interpreted senses and observational diagnostics together.
The dictionary retains those diagnostics on the already-recognized lexical
source record without invalidating the entry, rewriting Markdown, inventing
semantic content, or acquiring repair authority. Both internal source-record
views are replaced coherently under the existing Workbench source identity.

Diagnostics are intentionally narrow: supported nonblank semantic material that
cannot be safely assigned or used is reported, while empty, unfinished,
ID-only, ordinary-prose, and otherwise uncertain creator states remain
representable without forced normalization.

Verification includes `test:lexical-senses`,
`test:dictionary-language-scope`, `test:source-diagnostics`,
`test:frontmatter`, production build verification, generated-bundle inspection,
Prettier verification of all hand-edited files, `git diff --check`, and the
established lint baseline of 0 errors and 14 warnings.

### Status

**Remediated and verified — one Low diagnostic-observability finding was found
and corrected. Recognized source problems remain observable without becoming
automatic repair authority, creator-authored linguistic uncertainty is
preserved, and diagnostic presentation remains separate from mutation.**

---

## 19. User Confirmation and Preview

### Destructive Actions

Workbench does not treat every creator-initiated write as destructive merely
because it changes plugin state or creates a new note.

Ordinary explicit creation actions such as saving a new dictionary entry,
creating a new name, adding a cypher rule, or adding an inflection rule already
express sufficiently specific creator intent for their bounded additive effect.
Adding a second generic confirmation to those actions would make destructive
prompts more routine without materially improving authorization quality.

Operations that remove, replace, rename, or establish a more consequential
authority boundary receive stronger treatment.

Current examples include:

- removing a configured language;
- deleting a cypher sheet and all rules it contains;
- deleting an individual cypher rule;
- deleting an individual inflection rule;
- replacing an existing inflection-rule collection with a preset;
- renaming a configured language and its already-owned root;
- recreating a missing configured language root;
- and committing an exact translation replacement into the editor.

The shared deletion confirmation boundary fails closed. Only the explicit
destructive button returns approval. Cancel, Escape, outside-click, and other
implicit modal closure return a no-write decision.

Language removal is configuration-only and its confirmation explicitly states
that configured vault folders and files will not be deleted.

Language-root Recreate has a stronger confirmation than ordinary Repair because
Recreate establishes a new filesystem ownership boundary at a currently missing
configured root. Its confirmation identifies the exact language and configured
root, explains the standard structure that will be created, states that
Workbench will not search for, move, or adopt a possibly relocated root, and
warns the creator to cancel if the original root may merely have been moved.

Language rename likewise names both the current and requested language names and
explains that the existing owned root and configured descendant paths will
change while creator-authored Markdown and YAML are not rewritten by Workbench.

### Broad Scope

Confirmation quality increases with impact radius rather than being applied
uniformly to every mutation.

A cypher-sheet deletion identifies the sheet and the number of contained rules
that will be removed. Individual cypher and inflection deletion prompts identify
the specific current rule where creator-visible rule text is available.

Inflection preset replacement explains that the selected preset will replace the
existing rule collection, reports how many existing rules will be replaced, and
states that the replacement cannot be undone from inside settings.

Language removal identifies the exact configured language and explicitly limits
the operation to Workbench configuration.

Language rename and root recreation expose their broader structural
consequences before execution rather than reducing those actions to a generic
confirmation question.

No current reviewed operation performs a vault-wide destructive rewrite, bulk
creator-file deletion, or similarly broad mutation requiring a larger preview
surface. If such operations are introduced later, their confirmation and
preview requirements must be reassessed according to their larger impact
radius.

### Preview

Workbench uses an exact preview where the mutation itself is a concrete textual
replacement whose meaning cannot be communicated adequately by an action label
alone.

The English-to-conlang translation commit workflow displays the Original text,
the proposed Translation, and the exact text that Will insert. The replacement
is rendered in whitespace-preserving presentation, and the same planned
replacement is later passed to the editor mutation after current target state is
revalidated.

Missing-vocabulary repair does not inherit authorization to perform that final
translation replacement. After any explicitly approved vocabulary creation,
Workbench rebuilds the translation plan and requires the separate exact
replacement preview before modifying the editor.

Not every bounded mutation needs a full before/after preview. For example,
deleting one identified rule or applying a named preset with an explicit
replacement warning communicates its complete practical effect without
requiring a second synthetic diff view.

Language-root Repair also does not require a second confirmation or artificial
filesystem preview. The creator explicitly invokes `Repair language root`, and
the action is described as restoring the standard folders and canonical source
paths inside that language's already-existing owned root. The authoritative
planner then independently re-evaluates current filesystem and configuration
state before additive mutation.

This differs from Recreate, which establishes a missing ownership boundary and
therefore receives explicit confirmation before creation.

### Default Choice

Current confirmation boundaries default to no write when creator intent is not
affirmatively established.

The shared deletion modal resolves false on Cancel or implicit close and guards
against multiple resolution.

Language rename and root-recreation confirmation likewise fail closed on
Escape, outside-click, or other implicit closure.

Portable-ID choice treats cancellation separately from a legitimate explicit
choice not to generate portable IDs.

Translation replacement requires the creator to choose the explicit Replace
action after reviewing the current plan. Closing or cancelling the workflow does
not grant editor mutation authority.

Stale rendered controls also do not authorize whichever object later occupies a
previous array index. Cypher sheets, cypher rules, inflection rules, language
configuration, rename targets, root-recreation targets, and removal targets are
revalidated against current authority before mutation.

During this audit one additional stale-confirmation weakness was found for
linguistic-rule deletion and replacement. That finding is recorded as
DS-019-L1 and was remediated during this section.

### Confirmation Quality

Confirmation text describes the proposed consequence rather than merely asking
a generic "Are you sure?"

Creator-controlled names and rule text in the shared deletion modal are rendered
through text APIs rather than interpreted as HTML.

The reviewed confirmation surfaces distinguish important ownership and
preservation boundaries:

- language removal says creator vault folders and files remain;
- root recreation says it creates only the configured missing root and standard
  children and does not search for or adopt a moved root;
- rename explains the owned-root move, configured-path update, Markdown/YAML
  non-rewrite boundary, and possible Obsidian link updates;
- preset replacement names the preset, describes it, counts the rules being
  replaced, and states the lack of an in-settings undo;
- sheet deletion reports that contained rules are deleted with the sheet;
- and translation commit shows the exact proposed editor replacement.

A confirmation must also remain bound to the semantic state the creator actually
reviewed. Object identity alone is not always sufficient for that purpose.

H10 intentionally preserves the identities of surviving cypher sheets, cypher
rules, and inflection rules after successful persistence so rendered Settings
controls remain valid. Reconciliation copies successfully persisted primitive
values back into those existing authoritative objects.

Before DS-019-L1 was remediated, destructive linguistic-rule confirmations were
opened before entering the common settings-authority queue. A previously queued
linguistic-rule transaction could therefore finish while the confirmation was
open, update the semantic values of the same object through successful
reconciliation, and preserve its object identity. The later deletion or preset
replacement could then pass an identity-based target check even though the
creator had approved different displayed contents.

The remediation does not weaken H10's deliberate identity-preservation model.
Instead, consequential linguistic-rule operations now acquire the common
settings-authority queue before reading the target or constructing confirmation
text and keep that authority boundary held through the creator's decision and
the confirmed H10 mutation.

The resulting lock order remains:

`settingsAuthorityQueue -> linguisticRuleStateQueue`

Earlier authority transactions therefore settle before confirmation text is
constructed, while later settings transactions remain excluded until the
creator confirms or cancels and the current operation settles.

The operation still revalidates its exact sheet or rule immediately before
editing the detached candidate as defense in depth. A stale language card is
also rejected before confirmation unless its exact `LanguageConfig` object is
still configured.

### Findings

#### DS-019-L1 — Linguistic-rule confirmations could authorize changed semantic content while target object identity remained stable

**Severity:** Low

Cypher-sheet deletion, cypher-rule deletion, inflection-rule deletion, and
inflection preset replacement previously obtained creator confirmation before
entering the plugin-wide settings-authority queue.

Those operations retained exact-object checks after confirmation, but H10
deliberately preserves the object identity of surviving linguistic-rule objects
after a successful queued edit. Successful reconciliation copies newly persisted
primitive values back into the same existing sheet and rule objects so rendered
Settings controls remain usable.

An earlier queued linguistic-rule operation could therefore settle while a
destructive confirmation was open, change the name, rule contents, label, or
other semantic values that defined what the creator had reviewed, and still
leave the same object identity in authority.

For preset replacement, the previous shallow snapshot of the inflection array
had the same limitation: it proved membership, order, and object identity but
could not prove that the surviving rule objects still contained the semantic
values present when the replacement warning was shown.

The impact was bounded to Workbench linguistic-rule settings and required a
narrow stale-confirmation timing condition. No creator Markdown or vault file
deletion was involved, and the behavior did not broaden filesystem authority.
The finding is therefore Low severity, but it violated the requirement that
approval remain attached to the exact consequential state the creator reviewed.

**Remediation:** Remediated and verified. Consequential linguistic-rule
operations now use a dedicated confirmation-aware H10 path. The plugin acquires
the common settings-authority queue before confirmation reads current authority
or constructs creator-facing text, then keeps that queue held through
confirmation and the resulting linguistic-rule transaction.

The inner operation continues to use `LinguisticRuleStateQueue` for detached
candidate construction, persistence rollback, and successful identity
reconciliation. The confirmed path does not recursively call the ordinary
`setLinguisticRuleState()` wrapper, avoiding re-entry of the non-reentrant
settings queue and preserving the established lock order.

Cancellation is represented as an explicit no-write result. A stale target
discovered while preparing confirmation returns `target-missing` without
editing or saving. Exact sheet/rule targets are re-found again immediately
before candidate mutation.

Verification includes focused regression coverage proving that:

- cancellation performs no edit and no persistence;
- a stale target discovered before confirmation fails closed;
- confirmation waits for an earlier settings/H10 transaction to settle and
  observes the newly settled semantic value even when object identity is
  preserved;
- a later unrelated settings transaction cannot enter while the confirmation is
  open;
- the confirmed linguistic deletion then persists normally after explicit
  approval;
- existing H10 identity/reconciliation behavior remains intact;
- shared deletion confirmation still fails closed;
- language removal, language-root recreation, and language rename regressions
  remain green;
- persisted-setting and common settings-authority regressions remain green;
- the production build contains the confirmation-aware path;
- Prettier verification passes for all hand-edited files;
- `git diff --check` is clean;
- and the established lint baseline remains 0 errors and 14 pre-existing
  warnings.

### Status

**Remediated and verified — one Low stale-confirmation finding was found and
corrected. Consequential confirmations now describe settled current authority
and remain protected from intervening settings mutations while the creator is
deciding; cancellation and stale targets fail closed, and bounded ordinary
creation/repair actions are not burdened with redundant confirmation.**

---

## 20. Runtime Destructive Tests

Runtime destructive testing was performed only against disposable fixtures.

The new physical-filesystem regression creates a fresh operating-system
temporary directory with `mkdtemp()`, treats a child directory as the disposable
vault, exercises production writer/planner/state modules through a
filesystem-backed Obsidian test double, and removes the complete temporary
directory in `finally`.

The repository's persistent `test-vault` is not used as the destructive-test
target. Creator-authored fixtures and private language material therefore remain
outside this test's mutation authority.

Existing focused regressions remain important supporting evidence. Most of those
tests intentionally model vault state in memory so they can exercise precise
failure, race, rollback, stale-target, and transaction-ordering conditions.
They complement rather than substitute for the new physical on-disk
preservation checks.

### Single-Note Mutation

The disposable-filesystem regression exercises `writeDictionaryEntry()` against
a real temporary dictionary directory.

A fresh lexical entry is created through the production writer's create-only
boundary, and the resulting file contents are read back from disk and compared
with the exact intended content.

The test then repeats an equivalent lexical creation after representing the
newly created note as indexed source authority. The writer returns the existing
entry before content generation, the existing file's SHA-256 hash remains
unchanged, and no additional homograph file is created.

This verifies both the expected single-note mutation and the bounded no-write
behavior of an already-established equivalent destination.

### Existing Destination

The physical regression establishes an existing exact-path creator note before
attempting lexical creation at the same destination.

Because the existing source cannot be safely established as a different lexical
meaning, creation is blocked rather than overwriting, truncating, or silently
reinterpreting the existing file. A pre/post SHA-256 comparison verifies that
the creator-visible bytes remain identical.

The filesystem-backed vault double also implements `vault.create()` with the
operating system's create-exclusive `wx` behavior. If the production writer
were to reach physical creation for an already-existing destination, the
filesystem operation itself would fail instead of replacing that file.

Stable-ID and identity-collision behavior is covered separately by the §9
identity regressions and established source-authority tests. Current production
code does not perform an ID-collision rewrite that would justify manufacturing
a new destructive on-disk ID mutation solely for this section.

### Malformed Notes

The existing-destination fixture deliberately contains malformed/unusable
frontmatter together with a creator sentinel in the note body.

The metadata-cache test double supplies no safely interpreted frontmatter
authority for that source. `writeDictionaryEntry()` therefore fails closed at
the existing destination.

The file is hashed before and after the attempted mutation. Matching SHA-256
values verify that malformed creator-authored bytes are preserved exactly on
disk while the attempted new lexical creation is refused.

This complements the parser and source-diagnostic regressions that verify
malformed or rejected recognized sources remain available for observation
rather than becoming mutation authority.

### Interrupted Operations

A disposable Add Language operation injects a physical `createFolder()` failure
at the `Inflections` step after the language root, `Lexicon`, and `Morphemes`
have already been established.

The operation returns failure. The previously created additive directories
remain present, while `Inflections`, `Cyphers`, `Examples`, and `Phonology` are
absent because execution does not continue past the injected failure.

An unrelated creator-sentinel file beneath the shared `Languages` container is
hashed before and after the interrupted operation and remains byte-identical.

This verifies the documented interruption boundary: additive structure already
made creator-visible is preserved rather than deleted speculatively, later
mutation stops after failure, and unrelated creator data is not rewritten in an
attempt to manufacture transaction-wide filesystem atomicity.

The established in-memory Add Language, Repair/Recreate, Rename, settings-state,
and translation-repair regressions provide additional failure and rollback
coverage for conditions that are more precisely controlled through injected
callbacks than through a physical filesystem.

Abrupt process termination remains the separate deferred DS-017-L1 concern.
This section does not treat an injected rejected operation as proof of durable
resume intent across process death.

### Large Scope

The physical regression exercises language-level directory establishment only
inside its fresh disposable vault.

Add Language is tested across its standard multi-folder hierarchy with an
injected mid-operation failure. Repair is tested against an already-owned
language root containing both canonical structure and unrelated noncanonical
creator material. Recreate is tested at the exact configured-root boundary.

No test is run against the repository's persistent `test-vault`, and no private
or creator language tree is used as disposable mutation material.

The broader §16 review remains applicable: current production code has no
vault-wide destructive rewrite, recursive write, mass normalization, bulk
creator-file deletion, or comparable operation whose destructive runtime scope
would require a vault-scale mutation fixture.

### Repetition

Repetition is evaluated according to each operation's intended authority
semantics rather than assuming every command should report repeated success.

Equivalent dictionary creation is idempotent: after the first source is
established and recognized, repeating the same semantic creation returns the
existing entry without rebuilding content, rewriting the file, or creating a
homograph.

Repair is also idempotent where expected. The first Repair establishes the
missing canonical children of an already-owned root while preserving an
unrelated creator note. A second Repair observes the complete structure and
performs no additional folder creation; the creator note remains byte-identical.

Recreate intentionally has different semantics. Its first exact-root
establishment succeeds when the configured root is missing. Repeating the
stronger Recreate operation after that root exists is blocked rather than
silently treating an existing folder as newly authorized ownership. Continued
maintenance of the established root belongs to Repair.

### Recovery

The disposable Repair fixture begins with an already-owned configured root,
one existing canonical child, missing canonical children, and unrelated
creator-authored material under a noncanonical `Notes` subtree.

The production repair planner identifies only the missing direct canonical
children. The state transaction establishes those folders through
`ensureVaultFolderStrict()`, leaves the existing canonical folder in place,
preserves the noncanonical creator note byte-for-byte, and succeeds without
requiring runtime reload for the inactive fixture.

Repeating Repair creates nothing further.

The stronger Recreate writer is separately exercised against both collision and
success cases. A non-folder at the exact configured root blocks recreation and
remains byte-identical. A genuinely missing configured root can be established,
while a second recreation attempt against that now-existing root is blocked
rather than adopting it again.

These physical checks agree with the established planner/state regressions for
Repair, Recreate, Rename, Add Language, dictionary persistence, linguistic-rule
state, and translation vocabulary repair. The focused §20 regression set was
run together after the physical test was registered, and every reviewed
mutation/recovery regression passed.

The physical regression is permanently exposed as:

`npm run test:runtime-destructive-safety`

It uses only a fresh temporary filesystem fixture and cleans that fixture in
`finally`.

### Findings

None.

The runtime destructive tests did not expose a new creator-data preservation,
overwrite, collision, interruption, repetition, or documented-recovery defect
at the current baseline.

DS-017-L1 remains the already-recorded Low deferred finding for durable recovery
intent across abrupt process termination. Its existence does not represent a
new §20 finding and is not silently reclassified by these tests.

### Status

**Pass — disposable physical-filesystem testing verifies create-only lexical
mutation, exact-byte preservation of malformed and colliding creator notes,
bounded partial Add Language behavior, idempotent Repair, and fail-closed
Recreate semantics. Established focused regressions for the related transaction
and recovery boundaries also remain green. No new finding was identified.**

---

## 21. Findings Register

Use this register as an index. Detailed evidence should remain in the relevant
audit section.

| ID          | Section                                                        | Status                  | Severity  | Impact Radius                                                                                                                            | Summary                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                            | Action                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------- | ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DS-019-L1   | Data Safety §19 / user confirmation and preview | Remediated and verified | Low | Consequential Cypher-sheet, Cypher-rule, inflection-rule, and inflection-preset settings mutations; no creator-Markdown or vault-file deletion | Linguistic-rule confirmation could remain attached to an object whose identity survived an earlier queued edit even though the semantic values shown to the creator had changed while confirmation was open. | Data Safety §19; focused confirmation-aware linguistic-rule regressions; shared deletion-confirmation regression; language removal, root recreation, and rename regressions; persisted-setting and settings-authority regressions; production build; Prettier verification; `git diff --check`; established 14-warning lint baseline | Consequential linguistic-rule operations now acquire the plugin-wide settings-authority queue before reading confirmation state and hold it through confirmation and the resulting H10 transaction. Cancellation and stale targets fail closed, exact targets are revalidated, and the established settings-to-linguistic-rule lock order is preserved. |
| DS-018-L1   | Data Safety §18 / diagnostics vs automatic repair | Remediated and verified | Low | Structured lexical-sense interpretation and creator-facing diagnostic visibility; no canonical source mutation | Supported structured lexical-sense material could be omitted from semantic interpretation without entering retained source diagnostics, and the same-line field reader could allow an empty field to consume the following structured field. | Data Safety §18; `lexical-senses.ts`; `dictionary.ts`; `test:lexical-senses`; `test:dictionary-language-scope`; `test:source-diagnostics`; `test:frontmatter`; production build; generated bundle inspection; Prettier verification; restored 14-warning lint baseline | Structured-sense interpretation now returns usable senses together with narrow observational warnings, retained on the already-recognized lexical source without invalidating the entry or rewriting creator Markdown. Same-line field parsing now rejects newline-crossing whitespace, while unfinished or uncertain creator structures remain non-diagnostic unless supported nonblank semantic input is positively present but unusable. |
| DS-017-L1   | Data Safety §17 / crash and interruption recovery | Deferred | Low | Multi-step operation continuity across process termination; creator-authored files remain preserved | Current multi-step operations can lose in-memory continuation intent after abrupt process termination, leaving bounded and diagnosable partial state that cannot necessarily resume the creator's original transaction exactly. | Data Safety §17; current language-root rename, Add Language, Repair/Recreate, multi-language dictionary creation, persisted-settings validation, and established runtime atomicity behavior | Defer durable recovery-journal or pending-operation architecture to a dedicated implementation review. Any future recovery record must be operation-specific, validated as untrusted persisted data, and must not grant broader mutation authority than the creator originally authorized. |
| DS-014-L1   | Data Safety §14 / migration safety and idempotency | Remediated and verified | Low | Persisted active/primary language configuration and resulting runtime selection; no creator-Markdown mutation | Default overlay could make a genuinely legacy settings object appear to contain persisted modern `activeLanguages` authority, causing legacy `activeLanguage` selection to be discarded during migration. | Data Safety §14; persisted-settings decode/migration review; dedicated settings-migration regression covering legacy migration, modern precedence, explicit modern empty state, and repeated migration | Persisted field-presence evidence is now captured before defaults are overlaid. Modern `activeLanguages` wins only when actually persisted, while legacy `activeLanguage` may seed modern state only when the modern field was absent. |
| DS-014-L2   | Data Safety §14 / migration safety and idempotency | Remediated and verified | Low | Persisted language-root structural authority; no creator-Markdown mutation | A present but blank `rootFolder` could enter the same compatibility-migration path as a legitimately absent legacy root and therefore be treated as migration authority instead of malformed current state. | Data Safety §14; persisted-settings boundary review; regression coverage for empty and whitespace-only roots and preservation of raw rejected input | Present `rootFolder` values must now be nonblank. Only true absence remains valid legacy compatibility state; explicit blank structural authority is rejected before migration. |
| DS-014-L3   | Data Safety §14 / migration safety and idempotency | Remediated and verified | Low | Whole persisted Workbench settings object; no creator-Markdown mutation | Cosmetic welcome lifecycle state shared `ConlangSettings` persistence authority, allowing an unrelated welcome-state write to make an in-memory compatibility migration durable. | Data Safety §14; welcome lifecycle persistence review; persisted-settings migration and compatibility verification; production behavior review | Welcome lifecycle state no longer mutates or saves the complete settings object. Supported Obsidian versions use isolated vault-local storage, while legacy `hasSeenWelcome` remains read-only compatibility evidence and older versions prefer a repeated cosmetic notice over restoring whole-settings persistence authority. |
| DS-013-L1   | Data Safety §13 / export fidelity and lossiness | Remediated and verified | Low | Translator clipboard output and creator interpretation; no canonical source mutation | Gloss-mode Copy could silently substitute the flatter Transliterate representation, discarding ambiguity, candidate, sense, warning, and explanatory information present in the displayed Gloss. | Data Safety §13; `panel.ts`; `gloss.ts`; `test:gloss-rendering`; production build; generated-bundle invariant inspection; restored 14-warning lint baseline | Copy is unavailable in Gloss mode until a faithful plain-text representation exists, and `copyTranslation()` independently fails closed outside Transliterate mode so richer Gloss information cannot be silently flattened for clipboard output. |
| DS-013-L2   | Data Safety §13 / export fidelity and lossiness | Remediated and verified | Low | Translator clipboard output only; no canonical source mutation | Transliterate Copy read the complete translator output container, allowing explanatory UI footer text to be copied together with the rendered transliteration. | Data Safety §13; `panel.ts`; `test:gloss-rendering`; production build; generated `.conlang-translit` selector verification; restored 14-warning lint baseline | Clipboard output now reads only the rendered `.conlang-translit` child, keeping explanatory interface text out of the creator's copied translation. |
| DS-011-H1   | Data Safety §11 / moves, renames, and path changes | Remediated and verified | Low | Configured dictionary structure and newly created lexical notes; existing creator-authored sources are preserved | Ordinary lexical creation could recreate a missing stale canonical dictionary folder and write new notes there after the creator had moved the original source elsewhere. | Data Safety §11; `dictionary-entry-writer.ts`; `scripts/test-dictionary-entry-writer.mjs`; language-root Repair/Recreate regressions; language creator and membership regressions; persisted-settings and frontmatter parsing regressions; production build; `git diff --check`; implementation commit `86cbf88` | Lexical persistence remains centralized in the dictionary writer, but ordinary note creation now requires an already-established canonical dictionary folder. Missing or replaced structure blocks creation and directs the creator to explicit Repair/Recreate authority instead of silently reconstructing the configured path. |
| DS-010-H1   | Data Safety §10 / broken references and missing targets | Remediated and verified | Low | Dictionary details display and Open note navigation; no creator-Markdown mutation | Lexical compound parts formerly used an unscoped singular lookup, allowing cross-language display or an arbitrarily first same-language target while missing relationships lacked persistent diagnostics. | Data Safety §10; `lexical-part-relationships.ts`; `source-diagnostics.ts`; `panel.ts`; `test:lexical-part-relationships`; `test:source-diagnostics`; `test:dictionary-language-scope`; Selection and lexical-senses regressions; production build; permanent DS-010 fixtures; runtime zero/one/many interaction verification; matching pre/post source hashes; commits `07c7d91`, `1d45a1a`, and `8cc53ac` | Resolution is now strict to the owning lexical language and preserves unresolved, unique, and ambiguous cardinality. Only one proven target can navigate; unresolved and ambiguous relationships remain visible, inert, and persistently diagnosed without rewriting creator sources. |
| DS-009-H1   | Data Safety §9 / duplicate IDs and identity collisions              | Remediated and verified | Low       | Active linguistic runtime and Diagnostics; no current direct creator-Markdown mutation                                                   | Distinct sources with duplicate stable linguistic identities remain preserved and now receive domain-aware warnings; phonological relationships distinguish missing, unique, and ambiguous targets without selecting or rewriting a source. | Data Safety §9; `linguistic-identity-diagnostics.ts`; `source-diagnostics.ts`; `scripts/test-source-diagnostics.mjs`; all package regression suites; production build; permanent DS-009 duplicate-unit fixture; runtime Diagnostics/Open note verification; matching pre/post source hashes; commits `7dcadcf` and `2a6553f` | Observational diagnostics now report every affected profile, top-level object source, owning lexical note, and ambiguous realization. Identity domains remain separate, every creator source is preserved, and future mutation must still prove one exact target before acquiring authority. |
| DS-008-H1   | Data Safety §8 / partial failure and runtime atomicity          | Remediated and verified | Medium    | Runtime linguistic state for the active language set; no direct creator-Markdown corruption or deletion                                 | Runtime linguistic reload progressively cleared and rebuilt live profiles and inventories, so an unexpected loader failure could leave mixed or incomplete runtime state until a later successful reload or restart. | Data Safety §8; `scripts/test-language-runtime.mjs`; focused active-language, case, membership, source, profile, removal, root-repair, and rename transaction regressions; production build; commits `f447726` and `78d02bf`             | Runtime reload now prepares complete detached candidate profiles and linguistic inventories before synchronous commit. Reload-aware settings transactions restore prior configuration after blocked or failed candidate preparation, while filesystem rollback follows proven physical state and never deletes additive folders merely to simulate atomicity. |
| DS-005-H1   | Data Safety §5 / malformed-source diagnostics                  | Remediated and verified | Medium    | Note; affected linguistic source and its Workbench interpretation                                      | Recognized malformed and contextually rejected linguistic sources remain in diagnostic accounting while excluded from clean feature indexes; retained parser/authority diagnostics and supported unresolved phonology relationships are now persistently exposed to the creator without source rewrite authority. | Data Safety §5; `WorkbenchSourceRecord`; `source-language-authority.ts`; `source-diagnostics.ts`; `diagnostics-tab.ts`; dictionary, morpheme, phonology, and linguistic-example language-scope regressions; `test:source-diagnostics`; `test:frontmatter`; production build; Diagnostics and affected-note Notice runtime verification | Remediated: retain rejected recognized sources, aggregate parser/authority/relationship diagnostics through a pure observational boundary, expose them in the persistent Diagnostics workspace, and briefly resurface current diagnostics on meaningful affected-note navigation without granting repair or rewrite authority. |
| DS-002-H1   | Data Safety §2 / generated dictionary frontmatter                 | Remediated and verified | Medium    | Note; newly generated lexical-entry frontmatter                                                        | Generated dictionary templates directly interpolated creator/workflow strings into YAML, so accepted YAML-significant linguistic text could become malformed or acquire the wrong parsed value/type. | Data Safety §2; real Obsidian `stringifyYaml()` / `parseYaml()` characterization; `test:markdown-note-renderer`; dictionary writer and translation-repair regressions; production build; lint baseline | Generated semantic frontmatter now passes through a representation-only renderer using Obsidian `stringifyYaml()`. The four creation flows retain separate semantic authority, intentionally blank fields remain blank placeholders, and existing destination/overwrite protections are unchanged. |
| SEC-004-H9  | Security §4 / query interpretation                             | Remediated and verified | Hardening | Explicit selected query only; no source mutation                                                                                         | Lookup-query cleanup could delete meaningful characters and manufacture a different lexical query, including loss of Unicode combining marks.                                                                        | Security Audit SEC-004-H9; `test:lookup-query`; runtime phrase, rejection, and Unicode-equivalence verification                                                                                                                     | Lookup now establishes lexical authority before searching and rejects unsafe internal material rather than deleting it. Creator-authored source text remains unchanged.                                                                                                                                                                                      |
| SEC-004-H10 | Security §4 / lexical range scanning                           | Remediated and verified | Hardening | Cursor/hover lexical range; indirect mutation relevance where cursor-derived ranges feed mutation-capable commands                       | UTF-16 code-unit scanning could split valid supplementary-plane Unicode letters and produce an incorrect lexical range.                                                                                              | Security Audit SEC-004-H10; `test:word-scan`; production build; runtime verification of complete `var𐐀u` cursor lookup and Reading View hover                                                                                       | Shared scanning now iterates complete Unicode code points while preserving UTF-16 coordinates required by editor and DOM APIs. Creator-authored text is not normalized or rewritten, and existing lexical-boundary semantics remain unchanged.                                                                                                               |
| SEC-004-H11 | Security §4 / dictionary mutation authority                    | Remediated and verified | Hardening | Existing same-spelling dictionary source and any new homograph source that creation logic might persist                                  | Unavailable or uninterpretable existing dictionary metadata could be collapsed with a confirmed different meaning and incorrectly authorize creation of a persistent homograph.                                      | Security Audit SEC-004-H11; `test:frontmatter`; production build; Obsidian `+ Word` runtime verification with malformed `h11test.md`                                                                                                | Existing-definition comparison is now tri-state. Uncertainty produces `"unknown"` and stops mutation; only a successfully interpreted and confirmed `"different"` meaning may authorize homograph creation. The existing source is not rewritten.                                                                                                            |
| SEC-004-H12 | Security §4 / dictionary source authority                      | Remediated and verified | Hardening | Existing exact-path source and any lexical source collision handling might otherwise create                                              | Creation-time collision handling could interpret shared fields from an explicitly non-lexical source as dictionary semantics even though canonical dictionary parsing excluded that source.                          | Security Audit SEC-004-H12; `test:frontmatter`; production build; Obsidian `+ Word` runtime verification with preserved `h12test.md`                                                                                                | Dictionary parsing and mutation checks now share source-authority classification. Untyped lexical compatibility is preserved, while other-source, unclaimed, and unavailable sources stop mutation without rewriting creator-authored data.                                                                                                                  |
| SEC-006-H1  | Security §6 / dictionary-entry persistence                     | Remediated and verified | Hardening | Intended dictionary destination and any existing colliding source                                                                        | Best-effort folder creation could allow lexical persistence to proceed without proving that the destination hierarchy and collision source had appropriate authority.                                                | Security Audit SEC-006-H1; dictionary-entry-writer regression coverage; production build; commit `d2c7428`                                                                                                                          | Dictionary creation now uses one strict persistence boundary that validates the path, establishes folders conservatively, rejects non-folder ancestors and unauthorized collisions, and rechecks the final destination before creation.                                                                                                                      |
| SEC-006-H2  | Security §6 / translation commit                               | Remediated and verified | Hardening | Exact creator-authored editor selection proposed for replacement                                                                         | Translation commit could replace creator-authored text without one final authorization boundary over the exact proposed replacement.                                                                                 | Security Audit SEC-006-H2; translation commit regression and runtime verification recorded in the Security Audit                                                                                                                    | Translation commit now separates exploratory translation from mutation authority and requires explicit authorization of the exact writable replacement before changing creator-authored text.                                                                                                                                                                |
| SEC-006-H3  | Security §6 / language identity and canonical source authority | Remediated and verified | Hardening | Folder / Language; potentially Multiple Languages when source trees conflict                                                             | Name-based language identity, stale active references, conflicting membership rules, or overlapping canonical source trees could silently omit or misroute creator-authored linguistic data during reload or rename. | Security Audit SEC-006-H3; `test-language-membership.mjs`; `test-language-source-preflight.mjs`; production build; commit `bcd4c83`                                                                                                 | Reload now preflights identity and canonical source ownership before clearing runtime state; ambiguous or stale configurations are diagnosed and fail closed; creator-authored `language:` metadata and source files are not rewritten; rename and membership-setting changes restore prior persisted state when the new configuration cannot safely reload. |
| SEC-006-H4  | Security §6 / plugin-initiated configuration deletion          | Remediated and verified | Hardening | Persisted Workbench language, cypher-sheet, cypher-rule, and inflection-rule configuration; language removal does not delete vault files | Plugin-initiated configuration deletion could occur without a shared explicit confirmation boundary, and rendered array positions could become stale authority for a different object.                               | Security Audit SEC-006-H4; `scripts/test-delete-confirmation.mjs`; `scripts/test-language-source-preflight.mjs`; production build; lint baseline; manual Obsidian Cancel/Confirm runtime verification for all four deletion classes | Deletion now requires fail-closed explicit authorization of the exact displayed object, callers revalidate object identity before mutation, save failures restore in-memory configuration, and blocked language reload restores persisted language configuration. Language removal has no vault-file deletion authority.                                     |
| SEC-006-H5  | Security §6 / new-language source onboarding                   | Remediated and verified | Hardening | New language configuration and its standard source-folder hierarchy                                                                      | New-language registration could persist canonical source claims before establishing that the corresponding vault folders were valid mutation destinations.                                                           | Security Audit SEC-006-H5; dictionary-entry-writer security regression; manual Add language runtime verification; production build                                                                                                  | Language onboarding now preflights required paths and establishes standard folders additively through the shared strict folder writer before persisting canonical source configuration. Existing non-folder objects are preserved and block mutation.                                                                                                        |
| SEC-006-H6  | Security §6 / active-language runtime authority                | Remediated and verified | Hardening | Persisted active/primary language configuration and corresponding runtime linguistic state                                               | Active-language changes could remain persisted after canonical-source preflight rejected the requested runtime state, leaving persisted and runtime authority inconsistent.                                          | Security Audit SEC-006-H6; active-language-state regression; manual runtime verification; production build                                                                                                                          | Active/primary changes now use a transaction that validates and snapshots prior authority, persists before reload, restores on save failure, and rolls back persisted configuration when reload is safely blocked before runtime replacement.                                                                                                                |
| SEC-006-H7  | Security §6 / language source and root mutation                | Remediated and verified | Hardening | Language root, configured source paths, filesystem structure, persisted configuration, and active runtime                                | Rename, repair, and source/root changes could cross filesystem and settings boundaries without one complete ownership and rollback authority model.                                                                  | Security Audit SEC-006-H7; full regression suite; manual rename/repair and collision runtime verification; production build; commit `bf1f00f`                                                                                       | Structural ownership, filesystem establishment, settings transition, reload, and safe rollback are now explicit transaction stages. Existing unconfigured roots are reserved rather than silently adopted or rewritten.                                                                                                                                      |
| SEC-006-H8  | Security §6 / primary-language persistence                     | Remediated and verified | Hardening | Persisted and live primary-language selection                                                                                            | A primary-language-only change could remain runtime-authoritative after its persistence attempt failed.                                                                                                              | Security Audit SEC-006-H8; primary-language-state regression; full regression suite; production build; commit `92bf124`                                                                                                             | Primary-language changes now validate exact authority, avoid unnecessary writes, persist transactionally, and restore the previous live primary language on save failure without unnecessarily rebuilding linguistic inventories.                                                                                                                            |
| SEC-006-H9  | Security §6 / case-sensitive matching authority                | Remediated and verified | Hardening | Persisted case policy and dictionary/phrase runtime indexes                                                                              | Case-sensitive matching could become unpersisted runtime authority, or persisted policy could disagree with indexes retained after a safely blocked reload.                                                          | Security Audit SEC-006-H9; case-sensitive transaction regression; production build; commit `dcde644`                                                                                                                                | Case-policy changes now persist transactionally, restore prior authority on save failure, reload only after persistence, and perform compensating persistence when source preflight safely blocks runtime replacement.                                                                                                                                       |
| SEC-006-H10 | Security §6 / linguistic-rule persistence                      | Remediated and verified | Hardening | Cypher sheets, cypher rules, inflection rules, and their live object identities                                                          | Live linguistic-rule objects could become authoritative before persistence succeeded, while overlapping edits could capture or restore provisional rule state.                                                       | Security Audit SEC-006-H10; linguistic-rule-state regression; complete established regression suite; production build                                                                                                               | Rule edits now use detached candidates, exact-target revalidation, failed-save restoration, identity-preserving reconciliation after success, and serialized transaction ordering.                                                                                                                                                                           |
| SEC-006-H11 | Security §6 / Language Profile path authority                  | Remediated and verified | Hardening | Persisted profile path and profile-derived runtime language identity                                                                     | A failed profile-path save could leave an unpersisted path live, while a successful save without corresponding reload could leave runtime identity derived from the previous profile.                                | Security Audit SEC-006-H11; language-profile transaction and validation regressions; established regression suites; production build                                                                                                | Profile paths are validated read-only against path and frontmatter authority, then changed through persistence/runtime transaction handling that preserves creator-authored profile Markdown and YAML.                                                                                                                                                       |
| SEC-006-H12 | Security §6 / ordinary persisted settings                      | Remediated and verified | Hardening | Ordinary settings-backed runtime values and later whole-settings persistence                                                             | Failed ordinary settings writes could remain authoritative in memory and later leak into an unrelated successful whole-settings save.                                                                                | Security Audit SEC-006-H12; persisted-setting-state regression; all package-listed regression scripts; production build                                                                                                             | Ordinary settings now use a shared persistence primitive that snapshots previous authority, installs the requested value only for persistence, restores it immediately on failure, and avoids unnecessary writes for unchanged values.                                                                                                                       |
| SEC-006-H13 | Security §6 / settings transaction concurrency                 | Remediated and verified | Hardening | Plugin-wide settings authority, persistence, rollback, reload ordering, and settings-backed configuration families                       | Overlapping settings transactions could derive rollback authority from another transaction's provisional state, allowing failed requests to remain authoritative or contaminate later persistence.                   | Security Audit SEC-006-H13; `Conlang Workbench — Settings Transaction Concurrency Remediation.md`; focused H13 regressions; production build                                                                                        | `SettingsAuthorityQueue` now serializes complete settings-authority transactions before authority-sensitive reads or provisional mutation, coordinates external reloads with settled settings state, preserves specialized rollback/filesystem semantics, and keeps welcome persistence inside the same authority boundary.                                  |

---

## 22. Deferred / Not Applicable Items

| Section                             | Item                                                                          | Status                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Revisit Trigger                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Import safety                        | User-facing language import, external-format import, or existing-root adoption pathway | Not Applicable        | No current Workbench operation imports external language data or adopts an existing unconfigured root as an import destination. Canonical Markdown is read in place, while Add Language and structural operations deliberately refuse to turn existing-root collisions into import authority. | Import Language, external-format import, existing-root adoption, or another user-facing import pathway is implemented or proposed for release. |
| Crash / interruption recovery       | Durable operation-specific recovery intent across process termination          | Deferred review       | Current bounded multi-step operations preserve creator data and generally fail closed after interruption, but some continuation intent exists only in memory. A durable recovery journal or pending-operation model would add a new persisted-data, identity, validation, cleanup, and mutation-authority surface, so it should not be introduced as an incidental audit patch. Any future design must preserve only the minimum proven operation-specific intent and must not let stale recovery state authorize broad adoption, movement, overwrite, deletion, or speculative repair of creator data. | Recovery/resume behavior is implemented; Add Language, language-root rename, multi-target creation, import, migration, bulk mutation, or another multi-step persistent workflow gains durable resumability requirements. |
| Translation / gloss architecture    | Explicit source-language, target-language, and translation-direction identity | Deferred review       | The current gloss model can carry lookup results without explicitly recording which language they came from or are being rendered into. A wholesale redesign is outside the current H7 remediation, but future multilingual translation must not rely on implicit English ↔ conlang direction assumptions.                                                                                                                                                                                                                                           | Translation expands to non-English documentation languages, conlang-to-conlang translation, or direction-aware/richer gloss rendering.                                                           |
| Lexical normalization / orthography | Orthographic punctuation policy and language-level punctuation configuration  | Deferred review       | H8 fixes confirmed Unicode combining-mark corruption without changing the established apostrophe/hyphen policy. Future punctuation semantics must preserve creator intent and should avoid silently treating unusual punctuation placement or language-specific orthographic characters as globally ordinary.                                                                                                                                                                                                                                        | Word-token grammar, language profiles, orthographic settings, punctuation handling, or configurable lexical-character support changes.                                                           |
| Lexical normalization / orthography | Language-aware lexical casing                                                 | Deferred review       | H8 retains the current boolean case policy while applying NFC only to derived lookup/index keys. Language-specific casing may require a richer policy, but changing that behavior is outside the confirmed combining-mark remediation.                                                                                                                                                                                                                                                                                                               | Language-specific casing is requested; case behavior becomes configurable; language profiles gain casing rules; or lookup expands to languages for which the current case model is insufficient. |
| Future add-on investigation         | Orthography / neography visual tooling                                        | Investigate in future | Research writing-system design, orthographic modeling, and neography practices before deciding whether a visual glyph/script builder belongs in Workbench. Any future tool must preserve creator-authored script data and define its own storage, editing, and promotion authority before implementation.                                                                                                                                                                                                                                            | Dedicated orthography/neography research begins or visual writing-system tooling is proposed for implementation.                                                                                 |
| Future architecture investigation   | Names as a distinct linguistic source type / inventory                        | Investigate in future | Names currently use dictionary-entry infrastructure as proper nouns, which is sufficient for current creation and lookup. Investigate whether names should eventually have their own source authority, inventory, and optional configured folder while retaining deliberate lexical lookup integration where useful. Naming systems may require referent identity, name categories, cultural or familial associations, historical variants, and other metadata beyond ordinary lexical entries. This is not an alpha blocker or part of SEC-004-H12. | Name-specific modeling expands, name creation is redesigned, or ordinary dictionary-entry semantics no longer adequately represent naming data.                                                  |

---

## 23. Re-Audit Triggers

A new data-safety review should be considered when any of the following occurs:

- a new command writes or rewrites user notes
- normalization is implemented or expanded
- frontmatter-writing behavior changes
- migrations are introduced or existing migration/compatibility behavior changes
- import support is added or expanded
- AI-assisted or procedural generation is introduced
- generated-content staging or promotion behavior changes
- export support changes fidelity or scope
- stable-ID behavior changes
- cross-document references are introduced or modified
- translation expands to new source/target language combinations or the gloss model gains explicit language/direction identity
- rename/move handling changes
- bulk editing is introduced
- an operation expands from note scope to folder, language, or vault scope
- new recovery or undo behavior is introduced
- diagnostics or repair behavior changes, especially if diagnostics gain mutation authority
- consequential confirmation or creator-preview semantics change
- settings persistence, settings authority, or settings transaction/concurrency behavior changes
- a data-safety finding is fixed through architectural change
- a release is being prepared for substantially wider distribution

## Audit Completion Record

- **Completed:** Yes
- **Completion commit:** `ba75e0f421612c9c445d01a231ae8b6e9a5cd87c`
- **Reviewer notes:** Upstream security and data-safety findings were reported to Made Up Words as issue #21, “Security and data-safety findings from the Conlang Workbench fork.”
