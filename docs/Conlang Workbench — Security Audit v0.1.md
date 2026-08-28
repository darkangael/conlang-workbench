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

---

## 1. Trust Boundaries

### Inputs Considered Untrusted

Review all forms of data that may originate outside trusted plugin code,
including:

- vault Markdown
- frontmatter
- filenames and folder names
- imported data
- pasted text
- external-format files
- plugin settings
- future integration responses

### Privileged Operations

Identify operations with greater authority than ordinary parsing or display.

### Boundary Crossings

Document where untrusted data influences:

- filesystem access
- DOM rendering
- command execution
- external links
- plugin state
- network behavior

### Assumptions

Record any places where code assumes input is trustworthy or well formed.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 2. Vault File Access

### Read Operations

Inventory code that reads vault files, metadata, folders, or cached content.

### Write Operations

Inventory code that creates, modifies, renames, or deletes vault content.

### Scope Enforcement

Determine whether operations remain inside the expected vault and configured
language folders.

### Authority Minimization

Check whether each feature uses only the vault authority it actually needs.

### Unexpected Access

Check for behavior that may read or alter unrelated notes.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 3. Path Handling and Traversal

### Path Construction

Review all paths built from:

- settings
- frontmatter
- filenames
- language profiles
- imported data

### Traversal

Check handling of:

- `..`
- absolute paths
- repeated separators
- unusual Unicode
- platform-specific separators

### Vault Boundary

Verify that path-derived operations cannot unintentionally escape intended
vault locations.

### Symlinks

Determine whether symlinks are relevant to supported workflows and whether they
can alter expected path boundaries.

### Invalid Paths

Review behavior for malformed, missing, or conflicting paths.

### Findings

None recorded yet.

### Status

**Not Reviewed**

---

## 4. Frontmatter and Markdown Input

### Parsers

Inventory all frontmatter and Markdown parsing code.

### Type Validation

Check whether parser assumptions are validated before values are used.

### Malformed Input

Test behavior with:

- missing fields
- wrong field types
- arrays where strings are expected
- objects where scalars are expected
- malformed YAML
- duplicate or unusual keys

### Tolerant Aliases

Review tolerant frontmatter aliases for ambiguity or unsafe interpretation.

### Unexpected Content

Verify that Markdown content cannot become executable behavior merely by being
loaded.

### Findings

None recorded yet.

### Status

**Not Reviewed**

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
| — | — | — | — | No findings recorded yet | — | — |

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
