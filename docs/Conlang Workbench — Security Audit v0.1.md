# Conlang Workbench — Security Audit v0.1

## Purpose

This audit evaluates Conlang Workbench for security risks that could cause
unexpected execution, unauthorized access, unsafe handling of vault content,
information exposure, or other behavior outside the user's reasonable
expectations.

The audit is intended to be worked through section by section. Findings should
be grounded in the current repository, with relevant files, functions, runtime
tests, and corrective commits recorded as evidence.

## Audit Scope

This audit covers the Conlang Workbench Obsidian plugin, including:

- plugin lifecycle and registration
- settings and persisted plugin state
- vault file access
- path handling
- Markdown and frontmatter parsing
- DOM rendering
- commands and mutating operations
- imports and exports
- external links and integrations
- network access
- dependencies
- build and release behavior
- resource exhaustion
- privacy and information exposure
- adversarial runtime behavior

Security issues introduced after the recorded baseline commit are not
automatically covered by this audit.

## Baseline

- **Branch:** `develop`
- **Baseline commit:** `cb64dbd`
- **Audit version:** `0.1`
- **Initial status:** Not Reviewed

## Severity Model

### Critical

A vulnerability that can directly cause severe compromise, arbitrary code
execution, broad unauthorized access, or similarly catastrophic behavior.

### High

A vulnerability with substantial security impact that may expose, alter, or
misuse sensitive resources or plugin authority.

### Medium

A meaningful security weakness requiring mitigation but with narrower impact,
additional prerequisites, or limited reach.

### Low

A minor vulnerability or security weakness with limited practical impact.

### Hardening

Not currently exploitable as a known vulnerability, but improving the behavior
would meaningfully reduce future risk.

### Informational

A noteworthy implementation detail, design assumption, or security-relevant
observation that does not currently require remediation.

## Audit Status Legend

- **Not Reviewed** — section has not yet been examined.
- **Reviewing** — examination is in progress.
- **Pass** — reviewed with no actionable finding at the current baseline.
- **Finding** — one or more actionable issues were identified.
- **Needs Test** — source review is insufficient and runtime/adversarial testing
  is required.
- **Not Applicable** — the risk category does not apply to the current plugin.
- **Deferred** — relevant but intentionally postponed with rationale recorded.

## Security Principles

> **Treat vault content as untrusted input, and minimize authority wherever
> practical.**

- Do not execute or interpret user-authored content as code.
- Do not render untrusted content through unsafe HTML paths.
- Validate paths before performing operations that rely on them.
- Keep network and external-service behavior explicit.
- Avoid unnecessary filesystem, process, or system-level authority.
- Prefer narrow scopes over broad authority.
- Fail safely when security-relevant assumptions are violated.
- Do not silently expand the plugin's authority as features are added.
- Security-sensitive behavior should be understandable from the UI and
  documentation.

## Forward Security Posture

Security review is continuous rather than limited to formal audit passes.

When a feature is designed or substantially changed, consider:

- what new input or trust boundary it introduces
- whether plugin authority expands
- whether new filesystem, rendering, network, or external-service behavior is
  added
- whether untrusted data reaches a more privileged operation
- whether failure could expose or alter information outside the feature's
  intended scope

New features should prefer the least authority and narrowest trust boundary that
still accomplishes their purpose.

A completed audit section does not permanently certify future implementations.
Material changes require targeted re-review.

### AI and Generated-Content Boundary

AI-assisted and generative features should use a dedicated Workbench-controlled
staging location rather than writing directly into canonical language data by
default.

Generated content should be treated as untrusted input even when it originates
from a Workbench feature.

The intended authority boundary is:

1. AI or procedural generation produces material inside the dedicated
   Workbench staging area.
2. Generated drafts, suggestions, intermediate state, and AI memory remain
   separate from authoritative language records.
3. The user reviews the generated material.
4. Promotion into canonical language data occurs only through an explicit user
   action.

The staging area may retain AI memory or generation state needed for continuity,
but that state does not become canonical linguistic data merely because
Workbench generated or remembered it.

Future generation features should therefore receive write authority to their
dedicated staging area by default, not unrestricted authority across canonical
language folders.

Any feature that introduces AI generation, automated generation, or promotion
from staged material into canonical data requires targeted Security and Data
Safety review.

> **A feature is not complete merely because it works on valid input. It should
> also fail safely, preserve user work, and stay within its intended authority.**

---

## 1. Trust Boundaries

### Inputs Considered Untrusted

The current plugin accepts or derives behavior from several kinds of data that
must not be assumed to be intrinsically safe merely because they are local.

**Vault-authored data**

- Markdown notes in configured dictionary, morphology, example, phonology, and
  language-profile locations.
- YAML/frontmatter values obtained through Obsidian's metadata cache.
- Markdown body content read from lexical notes for body previews and structured
  lexical senses.
- Filenames and note paths associated with loaded records.
- Language names and language identifiers declared in source notes.

These inputs are normally authored by the vault owner, but they may also have
been copied, synchronized, downloaded, generated by another tool, or imported
from another vault. The security model should therefore treat their contents as
data rather than trusted program instructions.

**Interactive user input**

- editor selections and words under the cursor
- translator input
- word and name creation forms
- multi-language entry creation forms
- search and filter text
- settings edited through the Workbench settings UI

Interactive input becomes security-relevant when it is later rendered, inserted
into Markdown, used to construct paths, or written into a note.

**Persisted plugin settings**

Workbench loads persisted settings through Obsidian's plugin-data API and merges
them with `DEFAULT_SETTINGS`.

Persisted settings influence configured language folders, active-language
selection, cypher behavior, hover behavior, inflection rules, and other plugin
state. They therefore cross an important trust boundary even though they are
normally produced by Workbench itself.

The current load path does not by itself establish that every persisted value
has been runtime-validated. Detailed validation of stored settings belongs to
§7, **Settings and Persisted Plugin State**.

**External/imported data**

No general external-format importer has yet been established as part of the
canonical Workbench architecture. When import adapters are introduced, imported
content must enter the same untrusted-input boundary as vault-authored content.

Network and external-service inputs are reviewed separately in §8.

### Privileged Operations

The current plugin has authority, through Obsidian APIs, to perform operations
that go beyond passive calculation.

**Vault reads**

Workbench resolves configured folders through the vault, traverses Markdown
files, reads frontmatter through Obsidian's metadata cache, and in some features
reads note bodies.

These reads populate in-memory indexes used by dictionary lookup, morphology,
linguistic examples, phonology, highlighting, and related UI.

**Vault writes**

Dictionary-entry creation can create new Markdown notes with
`app.vault.create()`.

Because this crosses from user-controlled or derived values into persistent
vault content, path construction and generated note content require dedicated
review in later sections.

**Editor mutation**

The explicit translation commit command can replace the current editor
selection with generated text by using the editor API.

This is a user-invoked mutating boundary and is distinct from preview-only
translation behavior.

**Plugin-data writes**

Workbench persists settings through Obsidian's `saveData()` API.

**UI and workspace behavior**

The plugin:

- registers commands
- registers a side-panel view
- installs editor and Markdown rendering integrations
- responds to metadata, delete, and rename events
- installs hover and click behavior
- opens or navigates to Workbench source notes through workspace behavior

These operations receive information derived from vault content and therefore
must keep rendering and navigation boundaries explicit.

### Boundary Crossings

The important current crossings are:

1. **Configured setting → vault path resolution**

   Folder paths stored in language configuration are supplied to Obsidian's
   vault APIs to locate dictionary and linguistic-data sources.

   Path validation and traversal behavior are reviewed in §3.

2. **Frontmatter / Markdown → canonical Workbench models**

   Vault metadata and, where applicable, Markdown body content are parsed into
   dictionary entries, lexical senses, morphemes, examples, phonological units,
   realizations, and language profiles.

   Parser validation is reviewed in §4.

3. **Canonical models → UI / highlighting / lookup**

   User-authored strings become visible in panel rows, tooltips, search results,
   lookup displays, and related interfaces.

   Rendering and injection safety are reviewed in §5.

4. **Editor selection → generated replacement text**

   Translation commit derives output from editor text and Workbench language
   configuration, then writes the result back into the editor.

   Mutation behavior is reviewed in §6 and the Data Safety Audit.

5. **User/modal input → generated Markdown → vault file**

   Dictionary creation takes interactive input, constructs note content and a
   destination path, and passes those values to `app.vault.create()`.

   This is one of the most important current write boundaries. Path safety,
   Markdown construction, collision behavior, and preservation consequences are
   reviewed in §§2, 3, 4, and 6 and in the Data Safety Audit.

6. **Persisted plugin data → runtime behavior**

   `loadData()` output is merged into current settings and then affects paths,
   language selection, parsing context, translation behavior, and UI behavior.

   Runtime validation is reviewed in §7.

7. **Vault events → index reload behavior**

   Metadata changes, file deletions, and renames can trigger Workbench reload
   behavior. Event input comes from Obsidian, while the affected paths originate
   in vault state.

   Scope, failure isolation, and resource behavior are reviewed later in this
   audit.

### Assumptions

The following assumptions require explicit verification in later sections and
must not be treated as already proven by this trust-boundary review:

- configured folder paths remain within the intended vault scope
- malformed persisted settings cannot acquire unexpected behavior
- every parser rejects or safely ignores unexpected runtime types
- user-authored text is rendered through safe text-oriented DOM APIs
- generated Markdown cannot create unintended rendering or navigation effects
- new-entry filenames cannot escape or redirect the configured destination
- file creation handles collisions without replacing unrelated user data
- source-note navigation cannot be redirected outside its intended scope
- event-driven reloads cannot create disproportionate resource use
- the repository contains no separate network, process-execution, dynamic-code,
  or direct-filesystem path that bypasses the boundaries identified here

Those questions are intentionally assigned to their dedicated audit sections
rather than being silently assumed safe here.

### Findings

No section-specific vulnerability was identified during the trust-boundary
mapping.

The review identified several **required follow-up checks**, especially settings
validation, path handling, rendering, generated Markdown, and file creation.
They are not recorded as findings in §1 because their safety has not yet been
tested in the sections responsible for those behaviors.

### Status

**Pass**

The plugin's current trust boundaries and privileged operations have been
identified sufficiently to support the remaining security audit. A Pass here
does not imply that the individual boundary implementations have passed their
dedicated reviews.

---

## 2. Vault File Access

### Read Operations

Current linguistic-data loading is scoped through configured source locations
rather than by indiscriminately scanning every Markdown file in the vault.

**Dictionary**

`Dictionary.loadFromFolders()` resolves each configured dictionary folder with
Obsidian's vault API. If the path does not resolve to a `TFolder`, that source
is skipped.

The dictionary recursively collects Markdown files beneath each resolved source
folder. Files outside those folder trees are not included by that loader.

For qualifying lexical entries, Workbench also uses `vault.cachedRead()` to
read the Markdown body. The body is currently used for:

- proper-noun body previews
- structured lexical senses

The body-read step occurs only for files that already qualified as dictionary
entries from the configured source.

**Morpheme inventory**

`MorphemeInventory.loadFromFolders()` resolves each configured morpheme folder
and recursively examines Markdown files beneath it.

It does not perform a whole-vault Markdown scan.

**Linguistic examples**

`LinguisticExampleInventory.loadFromFolders()` follows the same configured
folder pattern and recursively examines Markdown beneath those source folders.

**Phonology**

`PhonologyInventory.loadFromFolders()` resolves configured phonology folders and
recursively examines Markdown beneath them for canonical units and realization
records.

**Language Profiles**

`loadLanguageProfile()` does not scan a folder. It resolves the single
configured profile path and accepts it only when it resolves to a Markdown
`TFile`.

**Metadata access**

The loaders primarily obtain frontmatter through Obsidian's metadata cache.
Metadata access is therefore limited to files already reached through the
configured source path or explicit profile path.

### Write Operations

The current reviewed source has a substantially narrower write surface than its
read surface.

**Dictionary and name creation**

Current entry-creation workflows construct Markdown and persist new notes using
`app.vault.create()`.

This includes:

- entries created from selected text
- multi-language entry creation
- words created from the panel
- proper-noun/name creation

The destination begins with the configured language dictionary folder.

**Folder creation**

Entry creation may create missing components of the configured dictionary
folder through `app.vault.createFolder()`.

Both best-effort and strict folder-creation helpers currently exist in
`main.ts`.

**No reviewed note modification/deletion/rename operation**

No current `app.vault.modify()`, `app.vault.delete()`, or
`app.vault.rename()` call was identified in the reviewed main plugin source.

Workbench does register listeners for Obsidian vault `delete` and `rename`
events. Those listeners react to changes made elsewhere so indexes can reload;
they do not themselves delete or rename user files.

Editor replacement and plugin-settings persistence are separate mutation
surfaces and are reviewed in their dedicated sections.

### Scope Enforcement

Current inventory loading establishes a useful first scope boundary:

1. a configured source path is resolved through the Obsidian vault;
2. the source must resolve to the expected file/folder type;
3. recursive inventory traversal begins from that resolved folder rather than
   from the vault root;
4. feature parsers then decide whether Markdown inside that source belongs to
   the relevant inventory.

Language-aware inventories additionally reject records explicitly assigned to a
different configured language when both sides provide language identity.

This reduces accidental cross-language indexing when configured folders
overlap.

The scope boundary is nevertheless only as trustworthy as the configured path
that establishes it. Whether unusual, malformed, absolute, or traversal-like
configured paths can resolve or create unintended locations is deliberately
deferred to §3, **Path Handling and Traversal**.

### Authority Minimization

The current architecture generally uses the narrower Obsidian APIs required for
the task:

- configured folders are resolved through the vault
- inventory traversal begins from those folders
- Markdown bodies are read with `cachedRead()` where body content is needed
- frontmatter is obtained from the metadata cache
- new persistent notes are created with the vault API
- missing destination folders are created with the vault API

No direct Node filesystem adapter or shell/process access was identified as
part of the reviewed vault-access paths.

The linguistic inventories are currently read-only. They build in-memory
representations without rewriting their source notes.

This is especially important for the newer morphology, examples, and phonology
foundations: loading or searching those inventories does not currently grant
them write authority.

### Unexpected Access

No current loader reviewed in this section intentionally enumerates all
Markdown files in the vault.

The principal remaining access-scope question is path validation rather than
whole-vault enumeration.

A configured dictionary folder controls both:

- what dictionary tree may be read; and
- where entry-creation code may create folders and Markdown files.

Consequently, a malformed or unexpectedly interpreted configured path could
potentially broaden both read and write scope. This is a required §3 review
item.

The recursive loaders also intentionally include Markdown in subfolders beneath
their configured source. That is expected behavior, but users should therefore
understand a configured source folder as a recursive boundary rather than a
single-directory boundary.

### Findings

No section-specific vulnerability was identified in the current vault-access
architecture.

The reviewed linguistic loaders are scoped to configured folders or explicit
files rather than using an unrestricted whole-vault Markdown scan, and the
newer linguistic inventories are read-only.

The current persistent vault-write surface is primarily entry creation and
creation of missing dictionary-folder components.

**Required follow-up:** §3 must verify that configured paths cannot cause
unintended read or write scope through traversal-like, absolute, malformed, or
otherwise unexpected path values. Until that review is complete, this section's
Pass should not be interpreted as certifying path safety.

### Status

**Pass**

Current vault access is appropriately scoped at the API and loader level.
Path interpretation, destination validation, and traversal resistance remain
explicit dependencies of §3 rather than assumptions made by this section.

---

## 3. Path Handling and Traversal

### Path Construction

Current Workbench source paths primarily originate in per-language
configuration.

Examples include:

- dictionary folders
- morpheme folders
- linguistic-example folders
- phonology folders
- language-profile paths

Inventory loaders pass configured paths to Obsidian's vault APIs to resolve the
source file or folder.

Entry-creation workflows also use the configured dictionary folder as the base
destination for newly created notes.

Current filename sanitization removes or replaces common filename-invalid
characters from generated entry names. Filename sanitization is useful, but it
is not equivalent to validating the configured parent path.

Folder-creation helpers in `main.ts` split configured folder paths into
components and progressively call Obsidian's vault folder APIs.

Workbench does not currently provide an independent canonical path-validation
layer that rejects `.` or `..` components before configured values reach
mutating Obsidian vault APIs.

### Read-Side Traversal Test

A non-mutating runtime test was performed in the disposable development/test
vault against `app.vault.getAbstractFileByPath()`.

The following values were tested:

```text
../
../../
/tmp
Languages/../
./
```

All five direct lookups returned `null`.

For direct lookup, these path strings therefore did not resolve to accessible
vault objects in the tested environment.

This result must not be generalized to mutating vault APIs. Subsequent testing
demonstrated materially different behavior during creation.

### Write-Side Traversal Test

A disposable test hierarchy was created:

```text
CW-Security-Audit-Probe/
└── sub/
```

The following folder-creation operation was then attempted:

```text
CW-Security-Audit-Probe/sub/../folder-traversal-probe
```

The call returned `null`.

The following file-creation operation was also attempted:

```text
CW-Security-Audit-Probe/sub/../file-traversal-probe.md
```

That call also returned `null`.

Despite both calls returning `null`, subsequent direct lookup established that
the following artifacts existed:

```text
CW-Security-Audit-Probe/folder-traversal-probe
CW-Security-Audit-Probe/file-traversal-probe.md
```

Neither artifact existed beneath `CW-Security-Audit-Probe/sub/`.

The observed behavior is therefore consistent with the `..` component being
normalized during the mutating operation:

```text
CW-Security-Audit-Probe/sub/../folder-traversal-probe
                           ↓
CW-Security-Audit-Probe/folder-traversal-probe
```

and equivalently for the Markdown file.

A particularly important observation is that the mutating calls returned
`null` even though persistent artifacts were created.

Code must therefore not interpret a null-like result from these tested
operations as proof that no write occurred.

### Vault Boundary

The test does **not** establish that Obsidian permits writes outside the physical
vault.

It does establish that traversal-like path components can change the logical
destination of a mutating vault operation inside the vault.

Two boundaries must therefore remain distinct:

1. **Physical vault boundary**

   Obsidian is responsible for constraining its vault APIs to the vault's
   filesystem authority.

2. **Workbench logical authority boundary**

   Workbench is responsible for ensuring that an operation writes only within
   the location that feature is intended to control.

The second boundary cannot safely be delegated to Obsidian path interpretation.

For example:

- dictionary-entry creation should remain inside its validated dictionary
  destination;
- future generated content should remain inside its dedicated staging area
  until explicitly promoted;
- future bulk operations should remain inside their explicitly selected scope.

### Required Workbench Path Validation

Before a Workbench mutating operation uses a configured or derived path, the
plugin should eventually enforce a canonical logical-path policy.

At minimum, the policy should consider:

- rejecting `.` path components
- rejecting `..` path components
- rejecting absolute-looking paths
- normalizing separators in a controlled manner
- verifying that the final destination is beneath the feature's authorized base
  folder
- distinguishing exact folder membership from raw string-prefix matching

Validation should occur **before** any folder or file is created.

This is defense in depth against both unexpected Obsidian path semantics and
future changes in how Workbench obtains path values.

### Symlinks

Symlink behavior has not yet been tested as part of this audit.

The development workflow's use of symlinks does not establish how user-content
symlinks interact with Obsidian's vault boundary.

Before Workbench intentionally supports or depends on symlinked user-content
locations, their interaction with both physical and logical authority boundaries
requires explicit review.

### Invalid Paths

The runtime tests demonstrate that read and write APIs must not be assumed to
have identical observable path behavior.

Direct lookup of the tested traversal-like paths returned `null`.

Mutating calls containing an internal `..` also returned `null`, but persistent
artifacts were nevertheless created at the normalized parent location.

Consequently:

- Workbench must validate mutating paths before use;
- return value alone must not be treated as proof that a write did not happen;
- cleanup and recovery logic must account for the actual destination of any
  attempted write.

### Prefix-Matching Observation

Reload logic currently includes path-prefix checks such as a path beginning with
a configured dictionary-folder string.

A simple string prefix is not identical to a folder-boundary comparison. For
example, a configured path ending in a name such as `Mer` could also
prefix-match a sibling name beginning with the same characters.

The currently reviewed consequence appears to be unnecessary reload behavior
rather than unauthorized mutation.

This remains a Hardening observation.

### Findings

**SEC-003-M1 — Mutating paths can be normalized across `..` components**

- **Severity:** Medium
- **Affected boundary:** Workbench logical write scope
- **Observed behavior:** `createFolder()` and `create()` calls containing an
  internal `..` component created persistent artifacts at the normalized parent
  destination.
- **Return-value concern:** Both tested mutating calls returned `null` despite
  creating persistent artifacts.
- **Physical vault escape demonstrated:** No.
- **Logical destination change demonstrated:** Yes.
- **Remediation:** Implemented `vault-paths.ts` as a Workbench-controlled path
  authority boundary. Mutating dictionary destinations now reject empty paths,
  leading or trailing whitespace, backslashes, absolute-looking paths, repeated
  separators, and `.` / `..` path components rather than normalizing them.
  Dictionary filename construction now uses `joinVaultPath()`, which also
  requires generated filenames to remain a single child path component.
- **Defense in depth:** Interactive entry-creation flows validate configured
  dictionary folders before mutation and surface a user-facing diagnostic.
  `ensureFolder()` and `ensureFolderStrict()` independently validate again at
  the folder-mutation boundary so future callers cannot bypass the protection.
- **Runtime verification:** A normal Test Language dictionary entry was
  successfully created in `Languages/Test Language/Lexicon`, confirming valid
  paths still work. A configured test destination of
  `CW-Security-Audit-Probe/sub/../escaped` was then rejected by Workbench before
  mutation. A filesystem check confirmed that neither the probe folder nor the
  blocked test note was created.
- **Regression coverage:** `scripts/test-vault-paths.mjs` exercises the real
  TypeScript implementation through esbuild and verifies rejection of traversal
  and ambiguous path forms.
- **Data Safety relevance:** Yes. The remediation prevents a configured or
  derived write path from being silently redirected to a different logical
  destination inside the vault.
- **Disposition:** Remediated and verified.

**SEC-003-H1 — Path-boundary comparison uses string-prefix semantics**

- **Severity:** Hardening
- **Original impact:** Possible unnecessary reload of Workbench indexes when an
  unrelated sibling path shares the configured folder's string prefix.
- **Security impact demonstrated:** None.
- **Remediation:** Replaced raw `startsWith()` folder checks with
  `isPathWithinFolder()`, which requires exact folder equality or a real `/`
  descendant boundary.
- **Regression coverage:** Automated tests verify that
  `Languages/Mer/Lexicon/varu.md` is inside `Languages/Mer`, while
  `Languages/Mermaid/Lexicon/song.md` is not.
- **Disposition:** Remediated and verified.

### Status

**Pass — remediated and verified**

The original controlled runtime test showed that Obsidian mutation APIs can
normalize traversal-like paths to a different logical destination while
returning `null`, so Workbench cannot rely on those APIs alone to enforce its
write authority.

Workbench now establishes its own logical path boundary before persistent
dictionary writes, rejects traversal rather than normalizing it, validates again
at the folder-mutation boundary, and uses component-aware folder containment.
Normal-path behavior, adversarial traversal rejection, absence of unintended
artifacts, and automated regression coverage have all been verified.

---

## 4. Frontmatter and Markdown Input

### Parsers

The initial parser inventory identified the following current input surfaces:

- `language-profile.ts` — configured Language Profile frontmatter
- `word-tokens.ts` — shared parsing for string-list and declared-form
  frontmatter fields
- `morphemes.ts` — canonical morpheme-note frontmatter
- `linguistic-examples.ts` — linguistic-example frontmatter
- `phonology.ts` — phonological-unit and phonological-realization frontmatter
- `dictionary.ts` — dictionary-entry frontmatter and Markdown-body metadata
- `lexical-senses.ts` — structured lexical-sense metadata parsed from note bodies
- `body-preview.ts` — Markdown-body preview extraction
- `main.ts` — metadata-cache coordination around dictionary creation/reload

The Language Profile parser, shared `word-tokens.ts` helpers, morpheme,
phonology, dictionary, standalone linguistic-example source/frontmatter
handling, Markdown body-preview extraction, and structured lexical-sense
Markdown parsing have now been reviewed in this pass. The remaining parsers
still require individual review before §4 can be completed.

Morpheme parsing is now separated from inventory storage. Raw Obsidian
frontmatter is interpreted by `morpheme-source.ts`, which produces a
source-facing Workbench record containing independent Workbench, source, and
linguistic identities, diagnostics, and either a clean `Morpheme` value or
`null` when the recognized source cannot yet be safely represented as a
complete morpheme.

### Type Validation

`loadLanguageProfile()` is read-only and fails safely when its configured path
is absent, does not resolve to a Markdown file, has no metadata cache, is not a
`language-profile`, or lacks required identity fields.

The profile parser deliberately tolerates simple YAML scalar values by
interpreting numbers and booleans as text where a textual value is required.
This supports importing or reading valid but non-canonical YAML without
rewriting the user's source note.

Identity-bearing values such as `language_id` and `language` therefore may be
interpreted from simple scalar YAML during passive reads. Any future
normalization, promotion, or canonical-writing workflow must present such an
interpreted identity to the user and require explicit confirmation before
rewriting it as canonical textual YAML.

Shared list/form parsing previously had a broader boundary: unsupported
structured values could reach `String(value)` and become implementation-created
text such as `[object Object]`. This was not a source-file mutation, but it could
cause Workbench's in-memory interpretation to differ from what the user
actually supplied.

The shared parser now distinguishes simple YAML scalars from structured data.
Strings, numbers, and booleans remain tolerantly interpretable where the parser
supports scalar values. Unsupported objects and nested arrays are left
uninterpreted rather than silently stringified.

### Malformed Input

Regression coverage in `test:frontmatter` now verifies that:

- canonical YAML lists of text remain supported
- comma-separated string lists remain supported
- simple numeric and boolean list members remain tolerantly interpretable
- supported YAML-map forms remain supported
- supported list-of-single-key-map forms remain supported
- unsupported object values are skipped rather than stringified
- unsupported nested arrays are skipped rather than stringified
- neighboring usable values are preserved when one item is malformed
- a field containing only unsupported structures produces no interpreted data
- malformed preferred morpheme aliases do not suppress valid fallback aliases
- blank preferred morpheme aliases do not suppress valid fallback aliases
- a recognized morpheme source with no usable linguistic ID remains retained
  under its Workbench/source identity with `value: null`
- a recognized morpheme source with no usable required gloss remains retained
  with diagnostics rather than disappearing
- malformed explicit morpheme form data may use the already-supported filename
  fallback while reporting the unusable source field
- unsupported morpheme distribution values remain uninterpreted and produce a
  diagnostic without invalidating an otherwise usable morpheme
- supporting Markdown and other explicit document types inside configured
  morpheme folders are not misclassified as malformed morphemes

Malformed YAML itself, duplicate/unusual-key behavior, and malformed values in
the remaining feature parsers still require review.

### Tolerant Aliases

Workbench intentionally supports multiple reasonable frontmatter
representations where doing so improves interoperability and does not change the
source note.

Tolerance does not grant permission to invent a textual meaning for structured
data. Alternate supported representations may be interpreted in memory, but
unsupported structures remain untouched in the source and are ignored by the
specific parser.

Canonicalization or normalization remains a separate explicit operation. The
reader does not rewrite tolerated input into Workbench's preferred YAML form.

For reviewed morpheme aliases, Workbench now selects the first value that can
actually be interpreted rather than the first merely present value. A malformed
or blank preferred alias therefore cannot suppress a valid supported fallback.

Rejected preferred aliases are retained as diagnostics. If required morpheme
data cannot be safely interpreted at all, the source is still retained as a
Workbench source record with its independent `workbenchID` and `sourceID`; its
`linguisticID` may remain absent and its feature-facing value is `null`.
Workbench does not substitute its own identity for missing linguistic identity.

### Unexpected Content

No execution behavior was identified in the Language Profile or shared
string-list/form parsing reviewed so far. Full Markdown-to-UI and body-content
handling remains to be reviewed here and in §5 DOM Rendering and Injection.

### Findings

#### SEC-004-H1 — Unsupported structured frontmatter values could be silently stringified

- **Severity:** Hardening
- **Primary impact:** Data integrity
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

Shared frontmatter helpers previously used broad `String(value)` conversion in
places where a YAML list or declared-form structure was expected. Unsupported
nested structures could therefore become implementation-generated strings such
as `[object Object]`.

The source Markdown was not modified, but Workbench could silently construct an
in-memory value the user had never supplied as text. That interpretation could
later influence display, lookup, export, normalization, or other downstream
features.

The remediation adds a scalar-only conversion boundary. Supported strings,
numbers, and booleans remain tolerantly readable. Unsupported objects or nested
arrays are skipped unless the parser explicitly supports that structure.

No automatic normalization or writeback is performed.

Regression coverage is provided by:

`npm run test:frontmatter`

#### SEC-004-H2 — Invalid preferred aliases could suppress usable fallback data

- **Severity:** Hardening
- **Primary impact:** Data integrity
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

Several frontmatter readers selected compatibility aliases with nullish
coalescing before validating whether the preferred field could actually be
interpreted. A malformed but non-null preferred value could therefore suppress
a valid supported fallback.

For example, a structured `morpheme_id` value could prevent a valid legacy
`id` field from being considered, causing an otherwise recoverable morpheme
note to disappear from the loaded inventory. Blank preferred values could
produce the same result when validation occurred only after alias selection.

The source Markdown was not modified, but Workbench could silently lose usable
information or omit a recognized source from feature-facing state.

The morpheme remediation introduces first-usable alias selection through shared
frontmatter helpers. Structurally incompatible or blank preferred aliases are
rejected for interpretation, recorded for diagnostics, and do not prevent later
supported aliases from being considered.

Morpheme source interpretation is now separated into `morpheme-source.ts`.
Once a source is positively identified as `type: morpheme`, Workbench retains a
source record even when required linguistic data cannot be interpreted. That
record keeps independent:

- `workbenchID` — Workbench's internal handle
- `sourceID` — identity of the source-side object as represented by its adapter
- `linguisticID` — user/source-authored linguistic identity when available

A malformed recognized source therefore remains addressable with `value: null`
and diagnostics rather than being silently discarded. Workbench does not invent
a linguistic ID from its own internal identity.

`MorphemeInventory` now stores source records separately from valid
feature-facing `Morpheme` objects. Existing `allMorphemes()` and `lookupId()`
behavior remains limited to valid morphemes, while source-facing APIs retain
recognized malformed sources for diagnosis and later reparse.

Regression coverage verifies valid parsing, malformed and blank preferred
aliases, missing required ID/gloss values, safe filename fallback, unsupported
distribution values, retained Workbench identity, and non-morpheme Markdown
classification boundaries.

Phonology parsing now uses the same first-usable alias principle while
preserving its deliberately stricter string-only interpretation policy.
`phonology-source.ts` classifies each recognized phonology document exactly
once, so a malformed `phonological-unit` cannot fall through and be interpreted
as a realization or unrelated document type.

Recognized malformed phonological units and realizations are retained as source
records with `value: null`, independent Workbench/source identity, and
diagnostics. They do not enter the clean unit or realization indexes.
Creator-authored unit IDs, realization IDs, and realization-to-unit
relationships remain separate from Workbench identity.

`PhonologyInventory` now consumes the source adapter rather than interpreting
raw frontmatter itself. Existing language filtering and source-level language
inheritance remain inventory coordination behavior, and unresolved realization
relationships continue to load without destructive normalization.

Regression coverage verifies strict-string alias recovery, blank and malformed
preferred aliases, required unit/realization fields, retained malformed source
records, Workbench identity, document classification boundaries, and safe
language-ID alias recovery.

Dictionary alias handling is now also remediated through
`dictionary-source.ts`. Compatibility families such as
`definition` → `gloss` → `translation` → `meaning`,
`word` → `lemma`, `forms` → `inflections`,
`partOfSpeech` → `pos`, and `nameCategory` → `category`
select the first supported value that can actually be interpreted rather than
the first merely non-null value.

Dictionary source interpretation now also separates recognized source records
from valid feature-facing `DictionaryEntry` objects. A recognized malformed
lexical source is retained with independent Workbench/source identity,
diagnostics, and `value: null`, while valid entries alone enter dictionary
indexes and body-metadata processing.

Dictionary source authority is deliberately bounded. An explicit
`type: lexeme` identifies a dictionary-owned source; an explicit usable foreign
document type remains outside dictionary authority even if it reuses fields such
as `gloss`. Untyped legacy lexicon notes remain supported through strong lexical
signals such as `lemma`, `word`, `gloss`, or `definition`, so existing lexicons
do not require migration merely to become readable.

Regression coverage verifies dictionary alias recovery, filename fallback,
structured-form alias recovery, malformed recognized-source retention,
Workbench identity, supporting-document exclusion, and explicit foreign-type
exclusion.

SEC-004-H2 is therefore complete for the alias-suppression pattern identified
during this review.

#### SEC-004-H3 — Recognized malformed linguistic-example sources could disappear from inventory state

- **Severity:** Hardening
- **Primary impact:** Data integrity and diagnosability
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

Standalone linguistic examples were previously parsed directly into
feature-facing `LinguisticExample` values. A note explicitly identified as
`type: linguistic-example` returned `null` when its required `text` field was
missing, blank, or structurally incompatible.

That `null` result was indistinguishable from an unrelated Markdown document.
Consequently, a source Workbench had positively recognized as belonging to the
linguistic-example feature could disappear from inventory state merely because
its required linguistic content could not currently be interpreted.

The source Markdown was not modified or deleted, but the omission weakened
diagnosability and could make malformed user-authored data appear absent from
Workbench.

The remediation introduces `linguistic-example-source.ts` as a pure source
adapter. Source authority remains deliberately narrow: only an interpretable
`type: linguistic-example` is claimed by this adapter. Foreign, untyped, or
otherwise unrecognized Markdown remains outside its authority.

Once a source is positively recognized, Workbench now retains a
`WorkbenchSourceRecord<LinguisticExample>` even when the required `text` value
cannot safely be interpreted. Such a record retains independent Workbench and
source identity, preserves a creator-authored `example_id` as linguistic
identity when one is usable, carries an error diagnostic, and uses
`value: null` rather than pretending that an incomplete example is valid.

Linguistic-example fields deliberately preserve their strict-string policy.
Numbers, booleans, arrays, and objects are not silently converted into
creator-authored linguistic text. Malformed optional fields do not invalidate an
otherwise usable example; the unusable field is omitted from the clean model
and a warning diagnostic identifies the affected frontmatter field. Blank
optional strings remain ordinary absent/template values and do not generate
warning noise.

`LinguisticExampleInventory` now stores recognized source records separately
from valid feature-facing examples. `allExamples()` continues to expose only
usable linguistic examples, while source-facing state retains recognized
malformed notes for diagnosis and later reparse. Existing language filtering
and source-level language inheritance remain inventory coordination behavior.

The adapter does not mutate source Markdown and does not display transient UI
notices itself. Diagnostics are durable source-state information. Presentation
of those diagnostics remains a separate UI/lifecycle responsibility.

Regression coverage in `npm run test:frontmatter` verifies:

- valid canonical linguistic-example parsing
- foreign and untyped document exclusion
- malformed document-type exclusion
- retention of recognized sources with missing, blank, or structured required
  `text`
- independent Workbench/source identity when no linguistic ID exists
- preservation of a valid creator-authored `example_id`
- omission and warning diagnostics for structurally incompatible optional fields
- strict rejection rather than scalar coercion for linguistic-example text
  fields
- blank optional template fields without unnecessary diagnostics
- malformed optional `example_id` without invented linguistic identity

`npm run test:vault-paths`, `npm run test:frontmatter`, the production build,
and `git diff --check` also passed for the remediation checkpoint.

#### SEC-004-H4 — Body-preview frontmatter stripping used prefix matching rather than exact fence recognition

- **Severity:** Hardening
- **Primary impact:** Data integrity and preview fidelity
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

`body-preview.ts` extracts the first meaningful body paragraph used for
proper-noun hover context. The extractor is read-only and does not determine
dictionary source authority, but its original frontmatter removal logic treated
a document as beginning with YAML whenever its content merely started with
`---`. It then searched for the first later occurrence of `\n---` rather than
requiring an exact closing fence line.

Controlled adversarial tests demonstrated that this prefix matching could
misidentify ordinary Markdown as frontmatter boundaries. A line containing
`----` could be accepted as a closing fence, `---not-a-fence` could be treated
as a closing fence while leaking its suffix into the preview, and a document
beginning with `----` could be mistaken for a frontmatter-bearing note and lose
its actual first body paragraph.

An apparent opening frontmatter fence with no exact closing fence could also
allow metadata-looking text to be interpreted as preview prose.

The source Markdown was never modified. The failure was confined to the
derived preview, but it could cause Workbench to omit creator-authored body text
or display text from the wrong logical region of the note.

The remediation now recognizes frontmatter only when the first line is exactly
`---` and accepts a closing boundary only when a later line is also exactly
`---`. If an exact opening fence exists without an exact closing fence, the
extractor returns no preview rather than inventing a boundary between ambiguous
metadata-looking content and body prose.

Regression coverage in `npm run test:body-preview` verifies normal frontmatter,
four-hyphen pseudo-fences, three-hyphen prefixes followed by text, unclosed
apparent frontmatter, and ordinary Markdown beginning with four hyphens.

#### SEC-004-H5 — Body-preview cleanup deleted potentially meaningful creator-authored characters

- **Severity:** Hardening
- **Primary impact:** Data integrity and preview fidelity
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

After extracting a paragraph, `body-preview.ts` previously removed every `*`,
`_`, and backtick with a blanket character-replacement expression. That
operation did not determine whether a character was actually functioning as
Markdown presentation syntax.

Controlled tests confirmed that the cleanup changed creator-authored text.
Examples included `foo_bar` becoming `foobar`, `foo*bar` becoming `foobar`,
backticks disappearing from literal or inline-code-like text, and a leading
asterisk being removed from linguistic notation such as a reconstructed form.

These characters can carry literal, identifier, transcription, annotation, or
linguistic meaning. Treating every occurrence as disposable Markdown formatting
therefore caused the derived preview to represent text the creator did not
actually write.

The source Markdown was never rewritten, so this finding did not cause
persistent source corruption. It did, however, violate preview fidelity by
destructively transforming user-authored content during extraction.

The remediation removes the blanket punctuation deletion. Body-preview
extraction may still normalize layout by joining the selected paragraph and
truncating the resulting preview, but it no longer guesses that `*`, `_`, or
backticks are presentation-only characters.

If Workbench later renders Markdown formatting in previews, that interpretation
belongs in the presentation layer, where rendering can be deliberate and
reviewed separately, rather than in destructive source-text extraction.

Regression coverage in `npm run test:body-preview` verifies preservation of
underscores, asterisks, backticks, inline-code-like text, mixed Markdown-like
notation, and a leading linguistic reconstruction marker.

`npm run test:body-preview`, `npm run test:frontmatter`,
`npm run test:vault-paths`, the production build, and `git diff --check` passed
for the combined body-preview remediation checkpoint.

#### SEC-004-H6 — Markdown fenced-code examples could be interpreted as structured lexical-sense data

- **Severity:** Hardening
- **Primary impact:** Semantic integrity and lookup correctness
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

`lexical-senses.ts` parses optional structured semantic information from a
dictionary note's `## Senses` section. Before remediation, its heading and field
recognition operated directly on raw Markdown with regular expressions and did
not distinguish active Markdown from literal examples inside fenced code
blocks.

Controlled adversarial tests demonstrated that a complete `## Senses` example
inside a fenced code block could be parsed as real lexical-sense data. A
`### Sense` heading inside fenced code within a real Senses section could also
create a sense, and `**Gloss:**` or `**Lookup:**` fields shown inside fenced
documentation could be interpreted as semantic fields of a real sense.

This crossed an authority boundary rather than merely affecting presentation.
Structured sense glosses and lookup terms are intentionally added to the
dictionary's central English lookup index. Consequently, documentation text
such as `should-not-be-semantic`, `accidental`, or `example` could become real
lookup vocabulary even though the creator supplied it only as literal Markdown
syntax inside a code example.

The source Markdown was never modified. The failure affected Workbench's
derived semantic interpretation and lookup behavior.

The remediation introduces `markdown-fences.ts`, a small pure helper that
creates an in-memory parsing view with fenced code content masked before
lexical-sense structure is recognized. The helper handles backtick and tilde
code fences, preserves the opening delimiter type and length while locating a
valid closing fence, and does not alter the creator's source note.

The code-fence helper deliberately does not interpret `---`. YAML frontmatter
boundaries and ordinary Markdown thematic breaks are separate parsing concerns;
in particular, an ordinary `---` thematic break inside a Senses section must
not disable otherwise valid lexical-sense parsing.

Backtick-fence info strings are also checked according to their distinct
Markdown boundary: an apparent backtick opener whose info string itself
contains a backtick is treated as ordinary Markdown rather than being allowed
to hide later semantic content. Valid closing fences may contain permitted
trailing whitespace, and a shorter or different delimiter does not prematurely
close an active fence.

Regression coverage in `npm run test:lexical-senses` verifies:

- normal structured lexical-sense parsing remains unchanged
- complete Senses examples inside backtick fences remain semantically inert
- sense headings and semantic fields inside fenced code remain inert
- tilde fences receive the same protection
- shorter delimiters do not close longer fences
- tilde delimiters do not close backtick fences
- active Markdown after a valid closing fence is parsed normally
- invalid backtick info strings do not hide later semantic content
- valid closing fences with trailing tab whitespace are recognized
- ordinary `---` thematic breaks do not behave like code-fence boundaries

`npm run test:lexical-senses`, `npm run test:body-preview`,
`npm run test:frontmatter`, `npm run test:vault-paths`, the production build,
and `git diff --check` passed for the remediation checkpoint.

#### SEC-004-H7 — Whole-selection cleanup could manufacture a different dictionary lookup token

- **Severity:** Hardening
- **Primary impact:** Semantic integrity and lookup correctness
- **Data-safety relevance:** Yes
- **Status:** Remediated and regression-tested

`previewToEnglish()` previously passed the editor's current selection through
`cleanWord()` before dictionary lookup. That cleanup removes characters outside
the Workbench word-character set wherever they occur, rather than only
recognizing safe lexical boundaries.

For a whole explicit selection, this could manufacture a different lookup token
from text the user did not actually select as one contiguous word. For example,
`foo.bar`, `one/two`, or `foo bar` could become `foobar`, `onetwo`, or `foobar`
before dictionary lookup. If the manufactured form existed in the dictionary,
Preview to English could report that entry even though the selected source text
did not contain that lexical token.

The source note was never modified. The failure affected derived semantic
interpretation and lookup behavior.

The remediation introduces `selection-lookup.ts`, a pure classifier for
explicit selection intent. It distinguishes:

- a safe single lexical token
- a whitespace-separated multi-word phrase candidate
- an invalid selection that must not gain lookup authority

Safe single-word classification may exclude outer punctuation or whitespace,
but it does not discard arbitrary boundary characters such as digits or
currency symbols. Internal punctuation and other separators are not deleted to
manufacture a different token. Existing Workbench word semantics for
apostrophes and hyphens remain unchanged rather than imposing
English-specific spelling assumptions.

Explicit multi-word selections are treated as phrase candidates rather than
silently collapsed into one token. `phrase-confirm-modal.ts` requires explicit
user confirmation before the selected span is translated as a phrase.
Cancelling, pressing Escape, clicking outside the modal, or otherwise closing
without confirmation performs no phrase translation.

Confirmed phrase operations are resolved through `glossConlangToEnglish()` and
rendered with the direction-specific `renderConlangToEnglishString()`.
Dictionary and phrase matches therefore produce their documentation-language
definitions, while inflection, cypher fallback, separators, and unmatched text
retain their established behaviors. The older directionally ambiguous
`renderTransliterationString()` remains unchanged pending the separately
recorded future gloss-model direction and language-identity review.

The remediation is deliberately scoped to explicit selections in
`previewToEnglish()`. The existing cursor-under-word path is already bounded by
`getSelectionOrWord()` and `isWordChar()` and retains its established behavior.
Other commands that legitimately accept arbitrary selections were not globally
restricted.

Regression coverage in `npm run test:selection-lookup` verifies safe
single-word boundaries, Unicode lexical content, existing apostrophe/hyphen
semantics, phrase classification, preservation of internal phrase whitespace,
rejection of unsafe outer material, and rejection of internal punctuation that
could otherwise manufacture a different lookup token.

Regression coverage in `npm run test:gloss-rendering` verifies
conlang-to-documentation-language rendering for dictionary and phrase matches,
inflected forms, separators, cypher fallbacks, unmatched text, and conservative
fallback behavior for incomplete renderer input.

Obsidian runtime testing additionally verified that:

- an ordinary explicit single-word selection still performs normal dictionary
  lookup
- a whitespace-separated multi-word selection opens the phrase-confirmation
  modal before translation
- confirming the phrase performs the translation
- cancelling the modal performs no translation
- an invalid punctuation-separated explicit selection is rejected rather than
  translated or collapsed into a different token

`npm run test:selection-lookup`, `npm run test:gloss-rendering`,
`npm run test:frontmatter`, `npm run test:lexical-senses`,
`npm run test:body-preview`, `npm run test:vault-paths`, the production build,
and `git diff --check` passed for the runtime-remediation checkpoint.

### Status

**In Progress — Language Profile, shared frontmatter helpers, morpheme source
parsing, phonology source parsing, dictionary source parsing, standalone
linguistic-example source parsing, Markdown body-preview extraction, structured
lexical-sense Markdown parsing, and explicit-selection lookup semantics
reviewed; SEC-004-H1 through SEC-004-H7 are remediated and regression-tested.
The remaining frontmatter and Markdown input surfaces still require review.**

---

## 5. DOM Rendering and Injection

### Rendering Methods in Use

Inventory DOM APIs used by the plugin.

### User-Controlled Content

Identify every place where vault or imported content reaches the UI.

### HTML and DOM APIs

Search for potentially dangerous rendering patterns such as:

- `innerHTML`
- raw HTML insertion
- direct attribute construction
- unsanitized URL insertion

### Escaping and Sanitization

Verify that user-authored strings are rendered as text unless HTML rendering is
deliberate and safely handled.

### Link and Attribute Handling

Review user-controlled links, titles, classes, IDs, and data attributes.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 6. Commands and Mutating Operations

### Command Inventory

List all registered commands and identify which ones mutate state or files.

### Preconditions

Review whether commands validate the state they depend on before operating.

### Scope

Verify that mutation scope matches what the user reasonably selected.

### User Intent

Check that destructive or security-relevant commands require explicit user
action.

### Re-Entrancy and Repetition

Determine whether repeated execution can produce unsafe or unexpected effects.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 7. Settings and Persisted Plugin State

### Stored Settings

Inventory persisted settings and their expected types.

### Validation

Check behavior when settings contain:

- stale values
- malformed values
- unexpected types
- paths that no longer exist

### Trust Boundary

Determine whether settings can influence privileged behavior.

### Migration

Review settings-schema changes for unsafe assumptions.

### Secrets

Confirm that credentials, tokens, or sensitive secrets are not stored unless a
future feature explicitly requires them and handles them appropriately.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 8. External Links, Network Access, and Integrations

### Current Network Behavior

Determine whether the current plugin makes network requests.

### External URLs

Review how external links are constructed and opened.

### Future Integrations

Identify planned integration points that could introduce new trust boundaries.

#### Future review — Gloss model direction and language identity

The current gloss representation does not explicitly identify the source
language, target language, or translation direction. Some interpretation is
therefore supplied implicitly by callers and renderers. This became visible
during the §4 review when the existing flat gloss renderer was found to embody
direction-specific assumptions for dictionary and phrase results.

Before translation expands beyond the current documentation-language ↔ conlang
assumptions, review whether source and target language identity should belong to
the overall gloss operation, individual tokens, or a richer translation-result
model.

The review should include:

- explicit source-language identity
- explicit target-language identity
- documentation-language identity rather than assuming English
- direction-aware rendering
- preservation of structured lexical-sense identity
- phrase and inflection behavior across language pairs
- fallback behavior across language pairs
- eventual conlang-to-conlang translation

This is a deferred architectural review requirement, not SEC-004-H7 itself. It
does not authorize source mutation or require a wholesale gloss-model redesign
during the H7 remediation.

### Explicit User Awareness

Network or external-service behavior should not occur unexpectedly.

### Remote Content

If introduced later, review remote responses as untrusted input.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 9. Import and Export Boundaries

### Supported Formats

Inventory current import/export behavior.

### Imported Input

Treat imported files and serialized data as untrusted.

### Parsing

Review validation before imported values enter canonical Workbench models.

### Export Destinations

Verify that exports cannot unexpectedly overwrite unrelated files or escape
expected destinations.

### Format Adapters

Ensure external formats do not gain authority over Workbench internal behavior.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 10. Dynamic Code and Dangerous APIs

### Dynamic Execution

Search for:

- `eval`
- `Function`
- dynamic script injection
- runtime module loading from user-controlled paths

### Shell and Process Access

Search for:

- child processes
- shell execution
- system commands

### Filesystem APIs

Determine whether direct Node filesystem access is used where Obsidian's vault
API would provide a narrower authority boundary.

### Unsafe Deserialization

Review any future serialized object loading that could construct executable or
privileged behavior.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 11. Dependency and Supply-Chain Risk

### Direct Dependencies

Inventory production dependencies and explain why each is required.

### Development Dependencies

Review build and development dependencies for unusual authority or install
behavior.

### Vulnerability Audit

Run appropriate package vulnerability checks and record results.

### Lockfile

Verify dependency versions are reproducibly constrained.

### Package Scripts

Review lifecycle scripts and build commands for unexpected execution.

### Dependency Minimization

Identify dependencies that could reasonably be removed or replaced with
platform APIs.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 12. Resource Exhaustion and Denial of Service

### Large Vaults

Consider behavior with:

- very large dictionaries
- many languages
- many phonological units
- large example corpora
- deeply nested folders

### Pathological Input

Review loops, recursion, regexes, sorting, and indexing for disproportionate
cost.

### UI Blocking

Identify operations that could freeze Obsidian's main thread.

### Repeated Reloads

Check whether repeated loading leaks listeners, DOM nodes, or cached state.

### Memory Growth

Review indexes and caches for unbounded accumulation.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 13. Error Handling and Failure Isolation

### Parser Failures

Review whether one malformed note can disrupt loading of unrelated data.

### Runtime Exceptions

Identify places where uncaught errors could disable the plugin.

### Logging

Ensure diagnostic logs do not expose information unnecessarily.

### Partial State

Check whether failed operations leave security-relevant state inconsistent.

### Failure Boundaries

Prefer isolating failures to the smallest practical unit.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 14. Build and Release Integrity

### Build Inputs

Review what source files and generated assets enter the release bundle.

### Generated `main.js`

Confirm generated output corresponds to reviewed TypeScript source.

### Release Artifacts

Verify that releases contain only intended files.

### Source Maps and Debug Data

Check whether releases expose unnecessary internal or local information.

### Version Consistency

Verify package, manifest, and release versions are consistent where required.

### Repository Hygiene

Check that secrets, local paths, temporary files, and test-only materials are
not accidentally shipped.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 15. Privacy and Information Exposure

### Vault Content

Determine whether vault content can leave the local environment.

### Logs

Review console output and error reports for sensitive or excessive data.

### External Services

Document any feature that sends language data outside the vault.

### Metadata

Consider whether filenames, language names, note paths, or frontmatter could be
exposed unintentionally.

### User Expectations

Local-first behavior should remain local unless the user knowingly enables an
external feature.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 16. Runtime Adversarial Tests

### Malformed Frontmatter

Test deliberately invalid or unexpected values.

### Hostile Text Content

Test strings containing:

- HTML
- script-like text
- unusual Unicode
- quotes
- angle brackets
- very long values

### Path Tests

Test unusual and traversal-like paths where applicable.

### Scale Tests

Test large numbers of notes and unusually large individual fields.

### Repeated Actions

Exercise reloads, settings changes, searches, and commands repeatedly.

### Failure Tests

Intentionally trigger parser and loader failures to confirm isolation.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 17. Findings Register

Use this register as an index. Detailed evidence should remain in the relevant
audit section.

| ID | Section | Status | Severity | Summary | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-003-M1 | §3 Path Handling and Traversal | Remediated and verified | Medium | Mutating paths containing `..` can be normalized to a different logical destination by Obsidian mutation APIs. | Controlled raw-API test; Workbench adversarial runtime test; `test:vault-paths` regression coverage | Workbench now validates logical write paths before mutation and rejects traversal rather than normalizing it. |
| SEC-003-H1 | §3 Path Handling and Traversal | Remediated and verified | Hardening | Raw string-prefix folder comparison can match unrelated sibling paths. | Code review; `Mer` / `Mermaid` regression coverage in `test:vault-paths` | Replaced raw prefix comparison with component-aware `isPathWithinFolder()`. |
| SEC-004-H1 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Unsupported structured frontmatter values could be silently stringified into values the user did not supply as text. | Code review; scalar/structure boundary regression coverage in `test:frontmatter` | Shared parsing now tolerates simple scalars but leaves unsupported structures uninterpreted; no automatic writeback or normalization occurs. |
| SEC-004-H2 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Malformed or blank preferred frontmatter aliases could suppress valid supported fallback values and cause recoverable sources to disappear from feature-facing inventories. | Code review; first-usable alias tests; morpheme, phonology, and dictionary source-record regression coverage in `test:frontmatter` | Morpheme, phonology, and dictionary parsing now select the first interpretable supported alias, retain recognized malformed sources under independent Workbench/source identity where applicable, report diagnostics, and avoid silently inventing replacement data. Phonology preserves its strict-string policy and single-classification boundary. Dictionary preserves legacy untyped lexicon compatibility while respecting explicit foreign document types as outside dictionary authority. |
| SEC-004-H3 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Recognized malformed standalone linguistic-example sources could disappear from inventory state when required `text` could not be safely interpreted. | Code review; `linguistic-example-source.ts`; malformed-source and optional-field regression coverage in `test:frontmatter` | Standalone examples now use a source adapter and durable source records. Recognized malformed sources remain addressable with diagnostics and `value: null`; strict-string semantics are preserved; malformed optional fields are diagnosed without invalidating otherwise usable examples; source Markdown is not rewritten. |
| SEC-004-H4 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Body-preview frontmatter stripping used prefix matching instead of exact fence recognition, allowing ordinary Markdown or malformed frontmatter boundaries to produce incorrect previews. | Code review; controlled adversarial body-preview tests; `test:body-preview` regression coverage | Body-preview extraction now requires exact `---` opening and closing fence lines and returns no preview for an exact opener without an exact closer rather than inventing a body boundary. Source Markdown is not rewritten. |
| SEC-004-H5 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Body-preview cleanup indiscriminately deleted `*`, `_`, and backticks, altering potentially meaningful creator-authored text in derived previews. | Code review; controlled punctuation-fidelity tests; `test:body-preview` regression coverage | Body-preview extraction now preserves creator-authored punctuation. Layout normalization remains allowed, while any future Markdown rendering is left to the presentation layer rather than destructive source-text cleanup. |
| SEC-004-H6 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Markdown fenced-code examples could be interpreted as structured lexical-sense data, allowing literal documentation text to become real semantic data and English lookup vocabulary. | Code review; controlled fenced-code adversarial tests; downstream English-index review; `test:lexical-senses` regression coverage | Lexical-sense parsing now masks backtick- and tilde-fenced code in an in-memory parsing view before recognizing semantic structure. Source Markdown is unchanged; delimiter type/length boundaries are preserved; `---` remains a separate frontmatter/thematic-break concern. |
| SEC-004-H7 | §4 Frontmatter and Markdown Input | Remediated and regression-tested | Hardening | Whole-selection cleanup could delete separators and manufacture a different dictionary lookup token from the text the user explicitly selected. | Code review; `test:selection-lookup`; `test:gloss-rendering`; Obsidian runtime verification of single-word lookup, phrase confirmation, cancellation, confirmed phrase translation, and punctuation-separated rejection | Preview-to-English now classifies explicit selection intent before lookup. Safe single words may shed only harmless outer punctuation/whitespace; whitespace-separated multi-word selections require phrase confirmation; unsafe internal separators are rejected rather than deleted. Source text is not modified. |

---

## 18. Deferred / Not Applicable Items

Record items deliberately deferred or determined not to apply, including the
reason.

| Section | Item | Status | Rationale | Revisit Trigger |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

---

## 19. Re-Audit Triggers

A new security review should be considered when any of the following occurs:

- a new mutating command is added
- direct file-writing behavior changes
- network access is introduced
- an external service or API is integrated
- import/export support is added or expanded
- AI-assisted or procedural generation is introduced
- generated-content staging or promotion behavior changes
- a new parser accepts substantially different input
- HTML or rich rendering behavior changes
- new Node or system-level APIs are introduced
- dependencies change materially
- plugin permissions or authority expand
- a security finding is fixed in a way that changes architecture
- a release is being prepared for substantially wider distribution

## Audit Completion Record

- **Completed:** No
- **Completion commit:** —
- **Reviewer notes:** —
