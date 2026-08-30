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
Markdown parsing have now been reviewed in this pass.

A closure reconciliation against the current TypeScript source tree confirmed
that the inventory covers the plugin's current frontmatter and raw-Markdown
input surfaces. The only current raw lexical-note Markdown read is coordinated
by `dictionary.ts` and feeds the already-reviewed body-preview and structured
lexical-sense parsers. Direct metadata-cache reads used during dictionary
creation are covered by the existing-entry meaning and source-authority
reviews. `waitForFrontmatter()` is synchronization for Workbench-created notes
rather than a creator-data interpretation boundary.

Rendered-Markdown post-processing and highlighting begin at the DOM/rendering
boundary and are reviewed separately in §5 rather than treated as unfinished
§4 parsing.

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

Malformed YAML and duplicate/unusual-key behavior have now been characterized
at runtime at the Obsidian metadata-cache boundary. Because Obsidian is
closed-source software, this audit records only behavior observed by Workbench;
it does not assume which YAML implementation or parsing rules Obsidian uses
internally.

Permanent Test Language characterization fixtures establish the observed
boundary:

- `duplicateprobe.md` contains duplicate `definition` keys. Obsidian did not
  expose it to Workbench as a usable dictionary entry, and Lookup produced only
  the normal cypher fallback rather than an invented lexical interpretation.
- `malformedprobe.md` contains syntactically malformed YAML. It likewise did
  not become a dictionary entry. A subsequent `+ Word` request for
  `malformedprobe` was refused because Workbench could not safely establish the
  existing source's metadata/authority; no alternate lexical file was created
  and the malformed source remained unchanged.
- `unusualprobe.md` is valid YAML containing the normal lexical fields plus an
  unrelated quoted key containing a colon and a numeric key. Obsidian exposed
  the valid lexical metadata normally, Workbench loaded the entry as
  `unusualprobe` = `river`, and the unrelated keys did not alter lexical
  semantics.

This runtime characterization therefore found no additional security finding:
unparseable or ambiguous frontmatter failed closed at the Workbench boundary,
while valid unusual metadata remained compatible. Malformed values or other
frontmatter/Markdown surfaces not yet individually reviewed remain in scope for
the rest of §4.

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

No execution behavior was identified in the reviewed frontmatter or raw
Markdown input surfaces. Creator-controlled content that reaches rendered DOM,
highlighting, links, or other presentation APIs crosses into the separate §5
DOM Rendering and Injection review.

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

#### SEC-004-H8 — Unicode combining marks could be dropped or treated as token boundaries

- **Severity:** Hardening
- **Primary impact:** Semantic integrity and lookup correctness
- **Data-safety relevance:** Yes
- **Source mutation:** No — derived interpretation and indexing only
- **Status:** Remediated, regression-tested, build-verified, and runtime-verified

Workbench word-token recognition previously allowed Unicode letters (`\p{L}`) but
not Unicode combining marks (`\p{M}`). A creator-authored decomposed grapheme
could therefore be split or altered during derived lexical interpretation even
though the visually equivalent precomposed spelling remained intact.

Controlled testing confirmed that decomposed spellings could lose their combining
marks or be split into multiple tokens. For example, precomposed `šaru` remained
one valid word while the canonically equivalent decomposed spelling
`s` + COMBINING CARON + `aru` could be interpreted as separate material or
cleaned to `saru`. That manufactured a different lexical form from the text the
creator actually supplied.

Code review also confirmed that dictionary and phrase comparison keys performed
case handling without Unicode canonical normalization. Even after preserving
combining marks as lexical content, canonically equivalent precomposed and
decomposed spellings would therefore have remained distinct lookup keys.

The remediation introduces `lexical-normalization.ts` as the shared authority
for derived lexical comparison keys and Unicode lexical character primitives.
`normalizeLexicalKey()` applies NFC canonical normalization after the current
case policy. NFC is deliberately used rather than compatibility normalization
(NFKC), so canonically equivalent spellings compare consistently without
collapsing compatibility characters that may be linguistically distinct.

Creator-authored spelling remains authoritative. Unicode normalization is used
only for derived comparison and index keys; it does not rewrite dictionary
notes, frontmatter, selections, or displayed lexical forms.

Word-token recognition now permits Unicode combining marks as continuation
characters while still requiring a Unicode letter to begin a word. A
free-floating combining mark therefore does not gain standalone lexical
authority. The existing apostrophe and hyphen policy is deliberately unchanged
pending a separate orthographic-punctuation review.

Dictionary indexing/lookup and phrase indexing/comparison now use the same
derived lexical-normalization helper. Selection-panel phrase comparison also
uses the shared derived key, while single-word recognition uses the shared
anchored token grammar.

Cypher boundary recognition now treats a combining mark following a base letter
as continuing lexical material. This prevents a decomposed grapheme from
manufacturing a false word, prefix, or suffix boundary inside the grapheme.

Regression coverage in `npm run test:lexical-normalization` verifies:

- canonical equivalence between precomposed and decomposed lexical spellings
- preservation of the existing case-sensitive and case-insensitive policy
- preservation of creator-authored source strings
- distinction between Unicode letters and combining marks
- combining marks as lexical continuation rather than standalone word starters
- preservation of decomposed graphemes during tokenization and constrained
  cleanup
- preservation of the current apostrophe and hyphen behavior
- phrase matching across canonically equivalent Unicode representations
- production cypher behavior that rejects false boundaries inside decomposed
  graphemes while retaining genuine suffix and whole-word matches

Obsidian runtime testing additionally verified that a decomposed selected word
resolved to a dictionary entry stored with the canonically equivalent
precomposed spelling, and that a decomposed multi-word selection resolved to a
precomposed phrase entry. The creator-authored runtime text remained unchanged.

`npm run test:lexical-normalization`, `npm run test:selection-lookup`,
`npm run test:gloss-rendering`, `npm run test:vault-paths`,
`npm run test:frontmatter`, `npm run test:body-preview`,
`npm run test:lexical-senses`, and the production build passed for the H8
remediation checkpoint.

#### SEC-004-H9 — Lookup-query cleanup could delete meaningful characters and manufacture a different lexical query

- **Severity:** Hardening
- **Primary impact:** Semantic integrity and lookup correctness
- **Data-safety relevance:** Yes
- **Source mutation:** No — query interpretation only
- **Status:** Remediated, regression-tested, build-verified, and runtime-verified

The general **Look up word (all senses)** command previously performed a broad
character-deletion cleanup immediately before dictionary, inflection, English,
and cypher lookup. Characters outside its allowlist were removed rather than
causing the query to be rejected.

Controlled testing confirmed that this could manufacture a different lexical
query from the user's explicit selection. Examples included `foo/bar`,
`foo.bar`, `foo,bar`, and `foo123bar`, all of which could become `foobar`.
The same cleanup also removed Unicode combining marks, allowing decomposed
`s` + COMBINING CARON + `aru` to become `saru` despite the H8 lexical
normalization boundary.

The remediation introduces `lookup-query.ts` as the pure authority classifier
for the general Lookup command. It builds on the existing explicit-selection
grammar in `selection-lookup.ts` rather than defining a competing lexical
syntax.

The Lookup command now distinguishes between cursor-derived words and explicit
editor selections. Explicit selections must classify as either one lexical word
or a whitespace-separated lexical phrase before lookup authority is granted.
Harmless outer punctuation or whitespace may expose an otherwise intact lexical
expression, but internal material is never deleted to manufacture a different
query.

Phrase lookup intentionally does not require the H7 Preview-to-English
confirmation dialog. Invoking **Look up word (all senses)** is itself the
explicit request to search the selected expression; the command therefore
accepts a valid whitespace-separated phrase directly once its lexical authority
has been established.

`collectLookupMatches()` no longer performs destructive character cleanup. It
receives a query that has already crossed the command's authority boundary and
passes that intact query through dictionary, declared-form, inflection,
English-lookup, and cypher lookup behavior.

Regression coverage in `npm run test:lookup-query` verifies:

- ordinary single-word lookup authority
- whitespace-separated phrase authority
- preservation of harmless outer punctuation and whitespace behavior
- preservation of the currently established apostrophe and hyphen semantics
- preservation of precomposed Unicode lexical text
- exact preservation of decomposed combining-mark lexical text
- rejection of internal slash, period, comma, em-dash, digit, and mixed
  separator cases rather than deletion-based query manufacture
- rejection of empty or otherwise nonlexical selections

Neighboring `test:selection-lookup` and `test:lexical-normalization` coverage
also passes, confirming that the new Lookup-specific authority layer does not
replace the H7 Preview-to-English boundary or regress H8 Unicode handling.

Obsidian runtime testing additionally verified that:

- ordinary `varu` lookup continues to work
- `varu kira` is accepted directly by **Look up word (all senses)** and resolves
  through the permanent Test Language phrase fixture
- unsafe selections including `foo/bar`, `foo.bar`, and `foo123bar` are rejected
  rather than collapsed into another query
- a decomposed `s` + COMBINING CARON + `aru` selection resolves to the
  canonically equivalent precomposed `šaru` dictionary entry without rewriting
  the selected source text

The Test Language vault intentionally retains dedicated H9 lookup-authority,
phrase, and Unicode fixtures as permanent regression/example material rather
than treating successful runtime data as disposable.

#### SEC-004-H10 — Cursor and hover word scanning could split valid supplementary-plane Unicode letters

- **Severity:** Hardening
- **Primary impact:** Semantic integrity, lookup correctness, and lexical-range integrity
- **Data-safety relevance:** Yes
- **Source mutation:** Indirect relevance — the scanner does not itself mutate source text, but cursor-derived ranges can be consumed by mutation-capable commands
- **Status:** Remediated, regression-tested, build-verified, and runtime-verified

Cursor-derived word lookup and DOM hover scanning previously walked strings by
direct UTF-16 code-unit indexing. JavaScript strings expose supplementary-plane
Unicode characters as surrogate pairs through indexed access, so a valid
supplementary-plane letter could be presented to the lexical classifier as two
invalid surrogate halves rather than one complete Unicode code point.

Controlled reproduction with U+10400 DESERET CAPITAL LETTER LONG I confirmed
the boundary defect. The complete character is a Unicode letter and occupies
two UTF-16 code units, while each separately indexed surrogate half fails the
letter classifier. Under the previous scanners, a lexical form such as
`var𐐀u` could therefore fail or split around the supplementary-plane letter.

The remediation introduces `word-scan.ts` as the shared cursor/hover lexical
range scanner. It iterates complete Unicode code points while deliberately
returning UTF-16 start/end offsets, preserving compatibility with Obsidian
editor positions, DOM text offsets, and JavaScript substring operations.

The shared scanner now handles both editor cursor-derived words and DOM hover
words. It preserves the established lexical grammar and boundary behavior
rather than using this Unicode correction to redesign punctuation,
apostrophe/hyphen, casing, or language-specific orthographic policy. Those
broader design questions remain covered by the existing deferred work.

Regression coverage in `npm run test:word-scan` verifies:

- ordinary BMP lexical words
- precomposed Unicode letters
- decomposed base-plus-combining-mark lexical forms
- supplementary-plane letters at initial, medial, and final positions
- cursor offsets at both UTF-16 positions inside a supplementary-plane
  character
- UTF-16 range coordinates returned for complete supplementary-plane words
- preservation of established whitespace boundary behavior

Neighboring `test:lexical-normalization`, `test:lookup-query`, and
`test:selection-lookup` coverage also passes. The broader §4 regression suite
and production build pass at the H10 checkpoint.

Obsidian runtime testing additionally verified that the permanent Test Language
entry `var𐐀u` resolves as one complete lexical form through cursor lookup and
through Reading View hover. Neither runtime path split the entry around the
supplementary-plane letter.

The Test Language vault intentionally retains
`H10 Supplementary Unicode Runtime Test.md` and the `var𐐀u` dictionary entry as
permanent regression/example fixtures.

#### SEC-004-H11 — Unavailable or uninterpretable existing dictionary metadata could authorize false homograph creation

- **Severity:** Hardening
- **Primary impact:** Creator-data safety, dictionary source integrity, and mutation authority
- **Data-safety relevance:** Yes
- **Source mutation:** Direct relevance — the affected comparison decided whether Workbench could create another persistent dictionary source
- **Status:** Remediated, regression-tested, build-verified, and runtime-verified

Dictionary-entry creation previously used a boolean
`entryCoversDefinition()` check to decide whether a same-spelling file already
covered the requested meaning. The check read Obsidian metadata-cache
frontmatter directly and returned `false` both when it successfully established
a different meaning and when the existing metadata was unavailable or could
not be safely interpreted.

That collapsed two materially different states:

- the existing creator-authored entry has a usable, confirmed different meaning
- Workbench does not currently know what the existing creator-authored entry
  means

Because `false` allowed creation to continue through `freeHomographPath()`,
temporary metadata-cache absence, malformed structured definition data, or
other uninterpretable definition state could incorrectly authorize creation of
a persistent homograph source.

The remediation replaces that boolean authority boundary with the explicit
`DictionaryDefinitionComparison` result:

- `"same"` means the existing entry already covers the requested meaning
- `"different"` means a usable existing meaning was successfully interpreted
  and confirmed not to match
- `"unknown"` means Workbench cannot safely establish the existing meaning

Only `"different"` may now authorize homograph creation. `"unknown"` is a
stop condition: Workbench reports that it could not safely determine the
existing meaning and creates no new entry.

Definition interpretation is also shared through
`parseDictionaryDefinition()`, so ordinary dictionary-source parsing and the
mutation-authority comparison use the same supported definition aliases
(`definition`, `gloss`, `translation`, and `meaning`), the same first-usable
alias selection, and the same tolerant scalar-reading boundary. Unsupported
structured values remain uninterpreted rather than being converted into text.

All four current dictionary-creation paths that can encounter an existing
same-spelling source use the tri-state comparison before reaching
`freeHomographPath()`:

- selection-based dictionary creation
- translator/panel save-to-dictionary creation
- the `+ Word` / Add a word path
- the Add a name path

Regression coverage in `npm run test:frontmatter` verifies same, different, and
unknown outcomes, including unavailable frontmatter, empty frontmatter,
malformed structured definitions, usable fallback aliases, tolerant scalar
definitions, and the established comma/semicolon sense comparison behavior.
The production build and `git diff --check` also pass at the H11 checkpoint.

Obsidian runtime testing used the permanent Test Language entry `h11test.md`
with a deliberately structured, unusable `definition` value. Attempting to add
the same conlang form through `+ Word` produced the safety refusal that
Workbench could not safely determine whether the entry already contained the
meaning. After the attempt:

- the original `h11test.md` remained unchanged
- no disambiguated homograph file was created
- the creator-authored malformed definition was not repaired, normalized, or
  rewritten

The Test Language vault intentionally retains `h11test.md` as permanent
regression/example material for this mutation-authority boundary.

#### SEC-004-H12 — Dictionary creation-time collision handling could bypass established source authority

- **Severity:** Hardening
- **Primary impact:** Creator-data safety, dictionary source integrity, and mutation authority
- **Data-safety relevance:** Yes
- **Source mutation:** Direct relevance — collision handling could reuse an existing source as lexical data or authorize creation of another persistent lexical source
- **Status:** Remediated, regression-tested, build-verified, and runtime-verified

Canonical dictionary parsing already excluded a source with an explicit usable
non-lexical `type`, even when that source reused fields such as `gloss` or
`definition`. Creation-time collision handling did not apply the same authority
decision before comparing meanings.

As a result, if an explicitly non-lexical source occupied the exact filename
requested for a new dictionary entry, shared semantic fields could be
interpreted as dictionary data. A matching value could cause that source to be
reused as though it were the requested word; a different value could cause the
collision to be treated as lexical homography.

The remediation introduces a shared `DictionarySourceAuthority` classification
used by both canonical dictionary parsing and creation-time collision handling:

- `"lexical"` — Dictionary may interpret the source as lexical
- `"other-source"` — a usable explicit non-lexeme `type` assigns authority elsewhere
- `"unclaimed"` — metadata exists but does not establish lexical authority
- `"unknown"` — frontmatter itself is unavailable

This does **not** require `type: lexeme`. Untyped creator-authored and legacy
lexical notes remain intentionally supported when they contain strong lexical
signals such as `definition`, `gloss`, `translation`, `meaning`, `word`,
`lemma`, `forms`, or `inflections`. Existing Mer and older Workbench lexicons
therefore require no migration.

All four dictionary/name creation collision paths now establish lexical source
authority before interpreting definition aliases. Known other-source and
unclaimed files stop creation and remain unchanged. Unavailable metadata
remains the separate `"unknown"` stop condition established by SEC-004-H11.

`test:frontmatter` regression coverage verifies explicit lexical authority,
legacy untyped lexical sources, explicit other-source authority, unclaimed
supporting Markdown, unavailable metadata, and the existing malformed-`type`
compatibility behavior. The full current regression suite and production build
pass.

Runtime verification used the permanent Test Language fixture
`Languages/Test Language/Lexicon/h12test.md`, intentionally declared
`type: morpheme` with `gloss: river` inside the configured Lexicon folder.
A `+ Word` request for lexical form `h12test` was rejected as a non-lexical
collision. The fixture remained unchanged and no alternate lexical file was
created.

### Status

**Pass — The current frontmatter and raw-Markdown input surfaces have been
inventoried and reconciled against the current TypeScript source tree. Language
Profile, shared frontmatter helpers, morpheme, phonology, dictionary, standalone
linguistic-example, body-preview, structured lexical-sense, explicit-selection
and general lookup authority, Unicode lexical normalization/scanning,
existing-entry dictionary mutation authority, creation-time dictionary source
authority, and observed Obsidian malformed-YAML/duplicate/unusual-key behavior
have been reviewed. SEC-004-H1 through SEC-004-H12 are remediated and
regression-tested. The runtime YAML characterization produced no additional
finding. Rendered-Markdown and DOM presentation behavior proceeds to §5.**

---

## 5. DOM Rendering and Injection

### Rendering Methods in Use

The plugin primarily renders UI through Obsidian DOM helpers such as
`createEl()`, `createDiv()`, `createSpan()`, `setText()`, and `appendText()`.
The Reading View highlighter additionally uses standard DOM text-node,
`DocumentFragment`, and `createElement()` APIs.

The source inventory found no use of raw-HTML parsing or execution sinks such as
`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`,
`createContextualFragment`, `document.write`, `eval`, or `new Function`.
The plugin also does not pass creator content through `MarkdownRenderer` or an
equivalent Markdown-to-DOM rendering API.

### User-Controlled Content

Creator-authored dictionary words, definitions, senses, etymologies, language
names, morpheme data, phonological data, linguistic examples, translation
tokens, and related linguistic content reach the UI primarily through text
sinks including `setText()`, `appendText()`, `textContent`, text options on
Obsidian DOM helpers, form values, and title properties.

These APIs preserve the creator's strings as text rather than interpreting them
as HTML.

### HTML and DOM APIs

No dynamic `href` or `src` assignment was found in the TypeScript source, and
the audit found no external-navigation or script-execution sink receiving
creator-authored content.

Reading View highlighting walks existing text nodes, creates replacement text
nodes and spans, and assigns matched creator text through `textContent`.
Selectors used by highlighting, panels, modals, and filters are fixed
Workbench-authored selectors rather than selectors constructed from creator
content.

Clipboard writes use `navigator.clipboard.writeText()`. Structured translator
output is flattened to text before copying; no `text/html` clipboard payload is
constructed.

### Escaping and Sanitization

Creator-authored strings are rendered as text at the reviewed presentation
boundaries. No reviewed surface deliberately interprets creator-authored
linguistic content as HTML.

Creator-derived morpheme-type and phonology-category CSS classes are normalized
to restricted class-token characters before being passed to `addClass()`.
Highlight classes come from a closed internal highlight-kind mapping, while
highlight inline styles come from Workbench-authored fixed style declarations.
Persisted `highlightStyle` values are runtime-normalized to their documented
closed set before use.

### Link and Attribute Handling

Dictionary, morpheme, phonological-unit, lookup, and highlight navigation uses
vault file paths rather than external URLs. Stored paths are resolved through
`vault.getAbstractFileByPath()`, and navigation proceeds only when the result is
an Obsidian `TFile`.

The highlight `data-conlang-path` attribute carries the resolved dictionary
entry's vault path and is re-resolved to a `TFile` before opening. No dynamic
creator-controlled `href`, `src`, or DOM ID construction was found.

Other reviewed attributes, including accessibility labels and fixed UI titles,
are Workbench-authored constants. Creator-authored tooltip text is assigned
through the DOM `title` property and remains text.

### Findings

#### SEC-005-H1 — Persisted closed-choice settings lacked runtime validation

**Severity:** Hardening
**Status:** Remediated

Persisted plugin settings were merged with `DEFAULT_SETTINGS` and then trusted as
`ConlangSettings`. TypeScript union types constrain Workbench-authored code at
compile time, but they do not validate data loaded from disk at runtime.

Four persisted settings use closed sets of values:

- `commitWrapper`
- `hoverModifier`
- `hoverFallback`
- `highlightStyle`

This was relevant to the DOM boundary because `highlightStyle` participates in
the highlight class applied to the document, and it was also relevant to
behavioral safety because `commitWrapper` selects how translated material is
written back into notes.

The load boundary now calls `normalizeClosedChoiceSettings()` immediately after
persisted data is merged with the defaults. Invalid runtime values fall back to
their documented defaults before rendering or mutation behavior can consume
them.

The normalization is deliberately limited to closed-choice settings. Free-form
creator configuration, including language names, folders, and linguistic rules,
is not silently rewritten by this validation step.

A focused regression test exercises the production validation module and
confirms that:

- valid non-default choices are preserved;
- invalid strings are rejected;
- non-string runtime values are rejected;
- unrelated creator-defined data is left untouched.

The production build and established security/data-safety regression suite pass
with this remediation.

### Status

**Pass** — The current DOM rendering, creator-content presentation, attribute,
selector, clipboard, and navigation surfaces have been inventoried against the
TypeScript source. Creator-authored linguistic content is rendered through text
APIs rather than raw HTML interpretation; reviewed navigation is constrained to
resolved vault `TFile` objects; and no dynamic external URL or script-execution
sink was found. SEC-005-H1 is remediated and regression-tested.

---

## 6. Commands and Mutating Operations

### Review Scope and Progress

Review of command and mutation boundaries is in progress.

The review has so far concentrated on the two command paths with the clearest
authority to create or replace creator-authored vault content:

- dictionary-entry persistence
- translation commit into an existing Markdown note

Both paths exposed hardening findings. Dictionary-entry persistence has been
remediated and verified. Translation commit has had its original unsafe direct
replacement path removed and its authoritative ready path hardened, while the
missing-vocabulary repair workflow remains under construction.

The remainder of the command and settings-mutation inventory still requires
review before this section can be marked Pass.

### Command Inventory

Registered commands are being classified by whether they:

- read or derive information only
- change transient plugin/UI state
- change persisted plugin settings
- create vault files or folders
- modify existing creator-authored vault content

Mutation authority is reviewed at the narrowest shared boundary practical so
that future callers cannot bypass command-specific checks merely by reusing a
lower-level helper.

### Preconditions and Scope

Mutation must establish that the destination and source authority are still
valid at the point the operation is performed.

For lexical creation, this includes:

- validating the logical vault-relative path before mutation
- establishing the destination folder as a real folder rather than merely
  attempting best-effort creation
- classifying an existing destination through canonical lexical-source
  authority before interpreting shared metadata
- distinguishing confirmed same meaning, confirmed different meaning, and
  unknown/unavailable meaning
- permitting homograph creation only from a confirmed different lexical meaning
- rechecking the final destination before `vault.create()`

For translation commit, this currently includes:

- capturing the originating file, range, selected text, and target language
  context before authorization
- resolving English source text against the explicitly selected target
  language's lexicon
- treating cypher output as exploratory suggestion rather than established
  vocabulary
- refusing to choose silently among multiple distinct lexical destinations
- producing no writable replacement at all while any lexical item remains
  unresolved
- previewing the exact replacement string that would be passed to the editor
- requiring explicit Replace confirmation
- rechecking the originating file/path and exact selected text after the modal
  before mutation
- passing the already-previewed replacement to `replaceRange()` without
  regenerating or reinterpreting it

The target-language validity/staleness boundary and the vocabulary-repair queue
remain part of the continuing H2 review.

### User Intent

Creating vocabulary and replacing note text are separate authorities.

A request to create or repair missing vocabulary does not itself authorize
modification of the originating note. After lexical repair, the translation
must be resolved again and a fresh exact replacement must receive its own
explicit Replace confirmation.

Closing a translation confirmation or blocked-state modal through Escape, the
X button, outside click, or another undecided close is cancellation.

The blocked-state translation UI explains each unresolved item independently:

- **missing** — no established target-language lexical entry currently
  authorizes the translation; vocabulary creation can repair this class
- **ambiguous** — more than one established lexical destination matches; the
  plugin does not silently select one
- **unsupported** — the current authoritative commit workflow does not know how
  to authorize the form safely; the UI reports this conservatively rather than
  guessing

Cypher suggestions may be displayed for missing vocabulary, but are explicitly
identified as suggestions and do not acquire lexical authority merely by being
generated.

### Language Scope

The §6 review identified cross-language lexical contamination as part of the
translation authority boundary.

Dictionary lookup APIs now accept an optional generic language scope. When a
scope is supplied, dictionary headword, alias, declared-form, English meaning,
structured-sense, and phrase resolution are restricted to entries belonging to
that language. Omitted scope preserves intentional all-loaded-language
compatibility behavior.

Language membership inferred from a configured lexical source is runtime
authority only and is not written back into creator YAML.

Gloss/translation callers determine whether the language scope represents the
source or target lexicon. In the current English-to-conlang authoritative commit
path, the selected conlang is the target lexical scope. Conlang-to-English gloss
resolution uses the conlang as source lexical scope.

Inflection lookup likewise accepts the language whose morphology is being
interpreted, preventing a rule for one language from claiming an identically
spelled lemma that exists only in another loaded language.

This closes the immediate cross-language authority problem without superseding
the broader deferred review of explicit source-language, target-language,
documentation-language, direction-aware, and conlang-to-conlang translation
architecture recorded under §8.

### Re-Entrancy and Repetition

Dictionary-entry creation now centralizes persistent lexical writes through the
hardened dictionary-entry writer rather than relying on callers to reproduce
folder, collision, and source-authority checks.

Translation commit separates resolution, planning, confirmation, and mutation.
The planner is pure and produces either:

- a complete ready replacement whose lexical pieces are authorized, or
- a blocked result with unresolved diagnostics and no partial replacement.

This prevents repeated or partial command execution from turning unresolved
translation material into a partially authorized note mutation.

The vocabulary-repair queue still requires explicit review for cancellation,
re-planning, repeated/existing entries, target-language stability, and stale
originating-note state before H2 can be closed.

### Findings

#### SEC-006-H1 — Best-effort folder creation did not establish a valid lexical mutation destination

**Severity:** Hardening

Dictionary-entry creation paths could proceed after best-effort folder creation
without one shared boundary proving that the intended destination hierarchy was
valid and that an occupied destination carried lexical authority appropriate
for homograph decisions.

This created avoidable dependence on caller ordering and could allow later
mutation logic to operate on assumptions that had not been established at the
actual persistence boundary.

**Remediation:**

Persistent dictionary-entry creation is now centralized in
`dictionary-entry-writer.ts`.

The writer:

- validates the requested vault-relative destination
- verifies/creates the intended folder hierarchy conservatively
- rejects a file occupying a required folder position
- rechecks source authority and meaning state for collisions
- allows homograph creation only for a confirmed different lexical meaning
- rejects same, unknown, non-lexical, unsafe, or otherwise unauthorized
  collision states
- prepares entry content before folder mutation where practical
- performs a final destination check before `vault.create()`

UI/navigation behavior remains outside the writer so successful persistence does
not acquire unrelated authority.

**Verification:**

Regression coverage exercises ordinary creation, same-meaning collision,
confirmed homograph creation, missing/uninterpretable metadata, non-lexical
collision, unsafe path, ancestor-file collision, folder errors, occupied
homograph destinations, invalid destination-folder objects, and content
generation failure.

Production build and diff validation passed. The remediation was committed as
`d2c7428` (`Harden dictionary entry persistence`).

**Status:** Remediated and verified.

#### SEC-006-H2 — Translation commit could replace creator-authored text without an exact final authorization boundary

**Severity:** Hardening

The translation commit command previously derived translated output and directly
replaced the selected creator-authored text without presenting the exact
proposed replacement for final confirmation.

The review also exposed related authority hazards that had to be separated from
ordinary exploratory translation behavior:

- dictionary-resolved vocabulary could be passed through the cypher again
- cypher fallback could appear usable as though it were established vocabulary
- lexical lookup could draw authority from the wrong loaded language
- multiple lexical destinations could be reduced to a silent first choice
- unresolved source material lacked a fail-closed whole-replacement boundary

**Remediation completed so far:**

English-to-conlang translation now uses the shared gloss pipeline so established
dictionary and phrase results remain creator-authored lexical forms and only
unresolved exploratory output receives cypher fallback.

Dictionary and morphology resolution used by the translation path are
language-scoped.

`translation-commit-plan.ts` now provides a pure authoritative planning
boundary. It:

- preserves separators exactly
- accepts dictionary/phrase material only when it resolves to one distinct
  lexical destination
- treats multiple distinct destinations as ambiguous
- treats cypher fallback and no-match results as missing lexical authority
- fails conservatively on unsupported token kinds
- produces no replacement when any item remains unresolved
- emits directional Obsidian wikilinks only when both creator-authored sides are
  safe for wikilink syntax
- preserves an established target form as literal text rather than rewriting it
  when optional wikilink representation is unsafe

`translation-commit-modal.ts` previews the original text, translated text, and
exact Markdown replacement through text-only DOM APIs. Only the explicit
Replace button authorizes the ready-path mutation; implicit close cancels.

After confirmation, the command rechecks the originating file/path and exact
selected range text. The exact replacement shown in the preview is then passed
to `replaceRange()` without regeneration.

`translation-unresolved-modal.ts` now provides a separate blocked-state
decision boundary. It explains missing, ambiguous, and unsupported items,
identifies cypher output only as a suggestion, displays known ambiguity
candidates, and offers vocabulary creation only when at least one blocker is
actually missing. Choosing that action does not authorize note replacement.

Regression coverage currently includes the authoritative planner,
language-scoped dictionary resolution, language-scoped inflection resolution,
and gloss rendering. These tests and the production build pass.

**Remaining remediation before closure:**

- connect the explicit missing-vocabulary action to the hardened lexical writer
- keep that repair queue bound to the captured target language rather than a
  subsequently selected primary language
- reload and re-plan after vocabulary creation rather than assuming creation
  resolved the blocker
- stop safely on cancellation or lack of progress while retaining vocabulary
  already deliberately saved
- recheck originating note/range/text state across the repair workflow
- verify the captured target-language context is still valid before final
  authorization rather than silently switching languages
- show a fresh exact replacement preview after successful lexical repair
- preserve the rule that vocabulary creation never itself authorizes note
  mutation
- complete focused runtime/adversarial verification of the repaired blocked
  path

**Status:** Remediation in progress. The original direct-replacement authority
path has been removed and the ready-path authorization boundary is hardened and
regression-tested, but the missing-vocabulary repair workflow is not yet
complete.

### Status

**Reviewing**

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
| SEC-004-H8 | §4 Frontmatter and Markdown Input | Remediated and verified | Hardening | Unicode combining marks could be dropped or treated as token boundaries, changing creator-authored lexical forms and causing incorrect or failed lookup. | Controlled Unicode tests; `test:lexical-normalization`; production cypher regression coverage; production build; Obsidian runtime verification of canonically equivalent single-word and phrase lookup | Combining marks are preserved as lexical continuation content; NFC is applied only to derived comparison/index keys; dictionary, phrase, panel, and cypher behavior share Unicode-safe lexical semantics; creator-authored source/display spelling is not normalized or rewritten. |
| SEC-004-H9 | §4 Frontmatter and Markdown Input | Remediated and verified | Hardening | Lookup-query cleanup could delete meaningful characters and manufacture a different lexical query from the user's explicit selection. | Controlled destructive-cleanup tests; `test:lookup-query`; neighboring H7/H8 regression coverage; production build; Obsidian runtime verification of unsafe-selection rejection, phrase lookup, and decomposed-to-precomposed Unicode lookup | The general Lookup command now classifies explicit query authority before lookup; unsafe internal material is rejected rather than deleted; `collectLookupMatches()` no longer manufactures cleaned queries; permanent Test Language fixtures retain the phrase and Unicode runtime cases. |
| SEC-004-H10 | §4 Frontmatter and Markdown Input | Remediated and verified | Hardening | Cursor and hover word scanning could split valid supplementary-plane Unicode letters by indexing UTF-16 code units rather than complete Unicode code points. | Controlled supplementary-plane reproduction; `test:word-scan`; neighboring H8/H9 regression coverage; production build; Obsidian runtime verification of complete `var𐐀u` cursor lookup and Reading View hover | Shared `word-scan.ts` now scans complete Unicode code points while returning UTF-16-compatible ranges. Existing lexical-boundary semantics are preserved; permanent Test Language H10 fixtures retain the runtime case. |
| SEC-004-H11 | §4 Frontmatter and Markdown Input | Remediated and verified | Hardening | Existing dictionary-entry mutation decisions could treat unavailable or uninterpretable metadata as proof of a different meaning and incorrectly authorize persistent homograph creation. | Code review of all four dictionary-creation paths; tri-state comparison regression coverage in `test:frontmatter`; production build; Obsidian `+ Word` runtime verification with malformed `h11test.md` | Existing-definition comparison now distinguishes `"same"`, `"different"`, and `"unknown"`. Only a confirmed `"different"` result may authorize homograph creation; `"unknown"` stops without creating or rewriting creator-authored data. |
| SEC-004-H12 | §4 Frontmatter and Markdown Input | Remediated and verified | Hardening | Creation-time dictionary collision handling could interpret shared fields from an explicitly non-lexical source as dictionary semantics, bypassing canonical source authority. | Code review of all four creation paths; source-authority regression coverage in `test:frontmatter`; production build; Obsidian `+ Word` runtime verification with `h12test.md` | Dictionary parsing and creation-time collision handling now share one source-authority classifier. Only established lexical sources reach definition comparison; other-source, unclaimed, and unavailable sources stop mutation and remain unchanged. |
| SEC-006-H1 | §6 Commands and Mutating Operations | Remediated and verified | Hardening | Best-effort folder creation did not itself establish a valid lexical mutation destination or centralize collision/source-authority checks at the persistence boundary. | Code review; dictionary-entry-writer regression coverage for creation, collision, path, folder, source-authority, and failure cases; production build; commit `d2c7428` | Persistent lexical creation is centralized in `dictionary-entry-writer.ts`, which validates paths and folders, rechecks collision/source authority, permits homographs only for confirmed different lexical meanings, and performs the final guarded `vault.create()`. |
| SEC-006-H2 | §6 Commands and Mutating Operations | Remediation in progress | Hardening | Translation commit could replace creator-authored selected text without previewing and explicitly authorizing the exact final replacement; related review exposed fallback, ambiguity, and cross-language lexical-authority hazards. | Code review; `test:translation-commit-plan`; `test:dictionary-language-scope`; `test:inflection-language-scope`; `test:gloss-rendering`; production build | Ready-path commit now uses language-scoped lexical resolution, a fail-closed pure planner, exact replacement preview, explicit Replace authorization, stale file/text guards, and exact non-regenerated replacement. Blocked-state diagnostics are implemented; the missing-vocabulary repair/re-plan workflow and final runtime verification remain before closure. |

---

## 18. Deferred / Not Applicable Items

Record items deliberately deferred or determined not to apply, including the
reason.

| Section | Item | Status | Rationale | Revisit Trigger |
| --- | --- | --- | --- | --- |
| §4 Frontmatter and Markdown Input | Orthographic punctuation policy and language-level punctuation configuration | Deferred design review | H8 preserves the established apostrophe/hyphen behavior so Unicode remediation does not silently impose a new orthographic policy. Ordinary punctuation may eventually have conservative default lexical positions, while unusual punctuation characters, leading/trailing placement, repeated punctuation, or other language-specific behavior should be explicitly enabled by the language rather than assumed globally. | Word-token grammar, language profiles, orthographic settings, punctuation handling, or configurable lexical-character support changes. |
| §4 Frontmatter and Markdown Input | Language-aware lexical casing | Deferred design review | H8 retains the current boolean case-sensitive/case-insensitive policy and JavaScript case conversion. Some constructed or natural-language orthographies may require language-specific casing behavior, so derived-key casing should be reviewed before the current policy is treated as universally sufficient. | Language-specific casing is requested; case behavior becomes configurable; language profiles gain casing rules; or lookup expands to languages for which the current case model is insufficient. |
| Future add-on investigation | Orthography / neography visual tooling | Investigate in future | Writing-system design, orthographic modeling, and neography practices should be researched before deciding whether Workbench should provide a visual glyph/script builder. If pursued, it should be evaluated as a potential add-on rather than assumed core scope. A possible future design may use a fixed-size glyph design space with optional construction grids/guides and reusable construction tools, but no implementation is authorized by this audit note. | Dedicated orthography/neography research begins or visual writing-system tooling is proposed for implementation. |

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
