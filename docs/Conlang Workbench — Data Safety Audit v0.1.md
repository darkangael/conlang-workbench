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

Inventory features that only inspect, index, search, or display data.

### Mutating Features

Inventory features capable of changing notes, settings, files, or metadata.

### Boundary Clarity

Check whether source code and UI make the difference between read-only and
mutating behavior clear.

### Accidental Mutation

Verify that parsing, searching, loading, and diagnostics do not rewrite source
material merely by reading it.

### Future Mutation Points

Identify read-only features that may later gain editing behavior and therefore
need re-audit.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 2. File Creation and Overwrite Safety

### File Creation

Review all code that creates new notes or files.

### Existing Destination

Determine behavior when the target already exists.

### Overwrite Protection

Check whether existing user files can be replaced unintentionally.

### Naming Collisions

Review collisions caused by identical lemmas, IDs, filenames, or generated
names.

### Destination Scope

Verify that generated files are written only to the intended location.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 3. Frontmatter Preservation

### Read Behavior

Determine how frontmatter is read and represented internally.

### Write Behavior

Inventory any code that writes or rewrites frontmatter.

### Existing Keys

Verify whether unrelated existing fields survive a rewrite.

### Ordering and Formatting

Document whether rewriting changes formatting, comments, quoting, or key order
and whether that matters to users.

### Explicit Values

Ensure explicit metadata is not silently replaced merely because folder or
profile defaults disagree.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 4. Unknown and Future Metadata Preservation

### Unknown Keys

Determine whether fields unknown to the current Workbench version survive
mutating operations.

### Third-Party Metadata

Consider frontmatter used by other Obsidian plugins or the user's own workflow.

### Future Workbench Fields

Ensure older operations do not accidentally erase fields introduced by newer
versions.

### Round-Trip Behavior

Where serialization exists, test whether unrecognized data survives a
read-modify-write cycle.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 5. Malformed Data Handling

### Malformed YAML

Determine behavior when frontmatter cannot be parsed normally.

### Wrong Types

Test strings, arrays, objects, numbers, booleans, and null values in unexpected
places.

### Missing Required Fields

Ensure incomplete records are skipped or diagnosed without damaging source
notes.

### Invalid Relationships

Check behavior for missing IDs, malformed references, and impossible values.

### Preservation

Malformed data should remain available for user repair rather than being
silently discarded from disk.

### Diagnostics

Record whether the user receives enough information to locate and repair the
problem.

A diagnostic must not depend solely on a short-lived transient notice.
Source-level diagnostics should remain available for as long as the underlying
malformed source remains unresolved.

When Workbench later provides contextual notice resurfacing, a diagnostic for a
malformed source should be resurfaced when the user meaningfully interacts with
the affected source note, such as opening or switching to that note. Background
indexing, metadata refresh, vault reload, or interaction with unrelated notes
should not repeatedly surface that warning.

Correcting and reparsing the source should naturally remove diagnostics that no
longer apply.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 6. Normalization and Rewrite Operations

### Current Normalization

Inventory any current automatic or manual normalization.

### Explicit Invocation

Normalization should be opt-in rather than silently triggered by reading data.

### Scope

Default to the narrowest practical scope, preferably the current note when
appropriate.

### Preview

Determine whether the user can inspect intended changes before broader
rewriting.

### Semantic Preservation

Formatting normalization must not change linguistic meaning or analytical
status.

### Unknown Fields

Ensure normalization does not remove unrelated metadata.

### Findings

None recorded yet.

### Status

**Not Reviewed**

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

| ID | Section | Status | Severity | Impact Radius | Summary | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-004-H9 | Security §4 / query interpretation | Remediated and verified | Hardening | Explicit selected query only; no source mutation | Lookup-query cleanup could delete meaningful characters and manufacture a different lexical query, including loss of Unicode combining marks. | Security Audit SEC-004-H9; `test:lookup-query`; runtime phrase, rejection, and Unicode-equivalence verification | Lookup now establishes lexical authority before searching and rejects unsafe internal material rather than deleting it. Creator-authored source text remains unchanged. |
| SEC-004-H10 | Security §4 / lexical range scanning | Remediated and verified | Hardening | Cursor/hover lexical range; indirect mutation relevance where cursor-derived ranges feed mutation-capable commands | UTF-16 code-unit scanning could split valid supplementary-plane Unicode letters and produce an incorrect lexical range. | Security Audit SEC-004-H10; `test:word-scan`; production build; runtime verification of complete `var𐐀u` cursor lookup and Reading View hover | Shared scanning now iterates complete Unicode code points while preserving UTF-16 coordinates required by editor and DOM APIs. Creator-authored text is not normalized or rewritten, and existing lexical-boundary semantics remain unchanged. |

---

## 22. Deferred / Not Applicable Items

| Section | Item | Status | Rationale | Revisit Trigger |
| --- | --- | --- | --- | --- |
| Translation / gloss architecture | Explicit source-language, target-language, and translation-direction identity | Deferred review | The current gloss model can carry lookup results without explicitly recording which language they came from or are being rendered into. A wholesale redesign is outside the current H7 remediation, but future multilingual translation must not rely on implicit English ↔ conlang direction assumptions. | Translation expands to non-English documentation languages, conlang-to-conlang translation, or direction-aware/richer gloss rendering. |
| Lexical normalization / orthography | Orthographic punctuation policy and language-level punctuation configuration | Deferred review | H8 fixes confirmed Unicode combining-mark corruption without changing the established apostrophe/hyphen policy. Future punctuation semantics must preserve creator intent and should avoid silently treating unusual punctuation placement or language-specific orthographic characters as globally ordinary. | Word-token grammar, language profiles, orthographic settings, punctuation handling, or configurable lexical-character support changes. |
| Lexical normalization / orthography | Language-aware lexical casing | Deferred review | H8 retains the current boolean case policy while applying NFC only to derived lookup/index keys. Language-specific casing may require a richer policy, but changing that behavior is outside the confirmed combining-mark remediation. | Language-specific casing is requested; case behavior becomes configurable; language profiles gain casing rules; or lookup expands to languages for which the current case model is insufficient. |
| Future add-on investigation | Orthography / neography visual tooling | Investigate in future | Research writing-system design, orthographic modeling, and neography practices before deciding whether a visual glyph/script builder belongs in Workbench. Any future tool must preserve creator-authored script data and define its own storage, editing, and promotion authority before implementation. | Dedicated orthography/neography research begins or visual writing-system tooling is proposed for implementation. |

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
- **Reviewer notes:** —
