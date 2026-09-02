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

Identify whether commands operate on:

- field
- note
- folder
- language
- multiple languages
- entire vault

### Default Scope

Verify that defaults favor narrow changes.

### Scope Visibility

The user should understand the expected blast radius before execution.

### Selection Errors

Check behavior when no active note, wrong language, or wrong folder is selected.

### Broad Operations

Require stronger safeguards for folder-wide or vault-wide mutation.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 8. Partial Failure and Atomicity

### Operations at Risk

Identify operations requiring multiple writes or multi-step mutation.

### Write Sequence

Document the order in which state changes occur.

### Failure Points

Consider what happens if the operation fails:

- before first write
- during a write
- between writes
- after some notes succeed

### State After Interruption

Determine whether partially completed operations leave data understandable and
recoverable.

### Atomicity

Use atomic or replace-safe patterns where practical.

### Recovery

Document how a user can restore a known-good state.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 9. Duplicate IDs and Identity Collisions

### Stable ID Domains

Document which IDs are expected to be unique:

- globally
- per language
- per document type

### Duplicate Detection

Check whether duplicate IDs are detected or merely indexed together.

### Ambiguous Lookup

Determine whether callers can accidentally select the wrong object when
multiple matches exist.

### Mutation Risk

Ensure future editing or relationship commands do not modify an arbitrary
duplicate.

### Diagnostics

Prefer surfacing collisions rather than silently resolving them.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 10. Broken References and Missing Targets

### Relationship Types

Inventory references such as:

- lexical relationships
- senses
- morphemes
- phonological unit IDs
- realization unit IDs
- related examples
- future cross-document relationships

### Missing Targets

Preserve records that reference missing targets.

### Diagnostics

Report broken relationships rather than silently dropping the referring data.

### Repairs

Do not guess replacement targets without explicit user intent.

### Renamed Targets

Consider how references behave after IDs or files change.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 11. Moves, Renames, and Path Changes

### Source Paths

Identify models that retain source-note paths.

### File Renames

Test whether indexes refresh correctly after a note is renamed.

### Folder Moves

Test movement between language folders and configured source folders.

### Language Reassignment

Ensure explicit language metadata remains authoritative where intended.

### Stale References

Determine whether stored paths can become stale or point to unintended notes.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 12. Import Safety

### Current Imports

Inventory any implemented import pathways.

### Destination

Determine where imported data is written or stored.

### Collision Handling

Review behavior when imported IDs, filenames, or lemmas already exist.

### Preview

Broad imports should ideally show intended additions and conflicts first.

### Preservation

Do not overwrite existing canonical data merely because imported data contains
the same key.

### Validation

Malformed or partially unsupported imports should fail safely.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 13. Export Fidelity and Lossiness

### Exported Fields

Document which Workbench fields each external format can represent.

### Unsupported Data

Identify information that cannot be represented externally.

### Lossiness Disclosure

Warn or report when export necessarily omits or transforms information.

### Source Safety

Export must not alter canonical Workbench data merely to fit another format.

### Round-Trip Expectations

Do not imply lossless round trips unless they are actually supported and tested.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 14. Migration Safety and Idempotency

### Migration Inventory

Document schema migrations and upgrade-time transformations.

### Backward Compatibility

Determine how older notes and settings are interpreted.

### Idempotency

Running a migration twice should not repeatedly alter already-migrated data.

### Failure Recovery

Consider what happens if a migration stops midway.

### Version Detection

Avoid guessing migration state from ambiguous evidence.

### Unknown Metadata

Preserve fields not owned by the migration.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 15. Backup and Recovery Expectations

### Current Recovery Story

Document what recovery options currently exist.

### Obsidian and Filesystem Recovery

Consider compatibility with:

- Obsidian File Recovery
- Git
- filesystem backups
- cloud/versioned storage

### Pre-Mutation Backup

Determine which future operations may justify explicit backup recommendations or
automatic backup behavior.

### Undo

Review whether mutating commands can reasonably support undo.

### Documentation

Users should understand when an operation may alter many files.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 16. Large-Scale Operations and Blast Radius

### Folder-Wide Operations

Identify present or planned commands that can affect many notes.

### Vault-Wide Operations

Treat vault-wide rewrites as especially high-risk.

### Dry Run

Determine whether broad operations should provide a no-write preview.

### Progress and Interruption

Consider how progress is reported and what happens if the operation stops.

### Limits

Consider practical safeguards against accidentally targeting more data than
intended.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 17. Crash and Interruption Recovery

### Plugin Crash

Determine whether a crash during ordinary reading can affect persistent data.

### Mid-Write Crash

Test or reason through interruption during file mutation.

### Obsidian Shutdown

Consider shutdown or restart during operations.

### System Interruption

Consider power loss, process termination, or filesystem failure.

### Recovery State

Partially completed work should remain diagnosable rather than silently
corrupted.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 18. Diagnostics vs Automatic Repair

### Current Diagnostics

Inventory warnings, skipped-entry logging, and visible error reporting.

Review diagnostics as durable state separately from transient presentation.
A short-lived Obsidian notice should not be the only representation of a
source-data problem.

Contextual resurfacing should be tied to meaningful interaction with the
affected source file rather than background parsing or unrelated navigation.
This allows an unresolved warning to become visible again when it is relevant
without repeatedly interrupting the user while Workbench refreshes indexes.

### Silent Skips

Identify places where invalid data disappears from indexes without enough user
feedback.

### Repair Behavior

Avoid automatic semantic correction when the user's intent is uncertain.

### Linguistic Uncertainty

Preserve proposed, unresolved, unconventional, and competing analyses.

### Repair Suggestions

When possible, suggest a repair without applying it automatically.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 19. User Confirmation and Preview

### Destructive Actions

Identify operations that should require confirmation.

### Broad Scope

Require clearer confirmation as impact radius grows.

### Preview

Determine which mutations should show proposed changes before execution.

### Default Choice

Safe/no-write behavior should be the default when intent is ambiguous.

### Confirmation Quality

Confirmation text should explain what will change, not merely ask "Are you
sure?"

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 20. Runtime Destructive Tests

Use a disposable test vault only.

### Single-Note Mutation

Test expected and unexpected values around one-note operations.

### Existing Destination

Test filename and ID collisions.

### Malformed Notes

Confirm malformed notes are preserved on disk.

### Interrupted Operations

Simulate failure where practical.

### Large Scope

Test folder/language operations using disposable fixtures.

### Repetition

Run the same mutation repeatedly and confirm idempotent behavior where expected.

### Recovery

Verify that documented recovery paths actually work.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 21. Findings Register

Use this register as an index. Detailed evidence should remain in the relevant
audit section.

| ID          | Section                                                        | Status                  | Severity  | Impact Radius                                                                                                                            | Summary                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                            | Action                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------- | ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
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
- migrations are introduced
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
- a data-safety finding is fixed through architectural change
- a release is being prepared for substantially wider distribution

## Audit Completion Record

- **Completed:** No
- **Completion commit:** —
- **Reviewer notes:** Upstream security and data-safety findings were reported to Made Up Words as issue #21, “Security and data-safety findings from the Conlang Workbench fork.”
