# Conlang Workbench — Development

Conlang Workbench is an Obsidian workbench for constructing, documenting, exploring, and publishing constructed languages.

The project is currently in early development.

## Branches

### `main`

The stable branch.

Changes should reach `main` only after they have been tested and are considered suitable for the current stable state of Conlang Workbench.

### `develop`

The active development branch.

New features, schema changes, experiments, refactoring, and other ongoing work are developed and tested here before being merged into `main`.

## Development Workflow

The normal workflow is:

1. Work on `develop`.
2. Make a focused change.
3. Build the plugin.
4. Run the linter.
5. Test the affected functionality in Obsidian.
6. Review the changed code for security and data-safety risks appropriate to the boundaries it touches.
7. Inspect the Git diff.
8. Commit the change.
9. Push the commit to the remote `develop` branch.
10. Merge tested, stable work into `main` when appropriate.

Security and data safety are part of normal development rather than a review reserved
for release preparation. New or modified code should be checked before it is committed
and pushed. The depth of that review should match the risk of the change, with particular
attention to trust boundaries such as creator-authored content, vault paths and file
access, frontmatter and Markdown parsing, DOM rendering, links and attributes, and
operations that create, modify, rename, move, or delete creator data.

When the safety of an operation cannot be established, prefer preserving the existing
data and stopping safely over guessing and mutating creator-authored content.

Experimental work should not be merged into `main` merely because it compiles.

## Project Principles

### Markdown remains canonical

Conlang Workbench should operate on ordinary Markdown notes and structured metadata wherever practical.

A user's language documentation must remain readable and usable without Conlang Workbench installed.

### Flat frontmatter, structured Markdown

Frontmatter should remain flat and should primarily hold concise metadata useful for identity, indexing, filtering, and simple relationships.

Complex linguistic information should normally be stored in standardized Markdown body sections rather than nested YAML.

### Language-neutral architecture

Conlang Workbench must not assume that every language has the same grammatical categories, sound system, writing system, modality, or lexical organization.

Common linguistic structures may be offered as tools or presets, but they must not become requirements merely because the plugin supports them.

### Describe rather than prescribe

**Conlang Workbench should not dictate how a constructed language works. It should provide structures capable of documenting how that language works.**

The tool may ask useful questions, offer terminology, provide validation, and suggest common analyses. It must not silently turn those conveniences into rules governing the language itself.

### Linguistic references are descriptive resources

Linguistic and conlanging references are used to reveal possibilities, terminology, documentation gaps, and known patterns.

They are not conformity tests.

An unusual but deliberate language feature is not wrong merely because it differs from a natural-language tendency or from the examples used in a reference work.

### Creator-facing and linguist-readable

Conlang Workbench should support the process of creating a constructed language while making it possible to document that language precisely enough for another person, including a linguist, to understand and reproduce its structure without relying on undocumented knowledge held by its creator.

### Human judgment remains authoritative

Validation, generation, and analysis tools should assist the conlanger rather than silently make linguistic decisions for them.

Irregularity and exceptions are legitimate properties of languages and should be documentable rather than treated automatically as errors.

### Facts and analysis may differ

The Workbench should permit the creator to document observed or established behavior even when its best linguistic analysis remains provisional or unresolved.

### Existing data should survive growth

New features should extend the existing Markdown model incrementally.

Migration should not discard information, and existing notes should not become invalid merely because richer structures are introduced later.

## Reference-Guided Design

Before a major language-model feature is considered stable, compare it against relevant conlanging and linguistic references.

The purpose is to discover missing questions and useful representational needs, not to require every language to implement every referenced feature.

Coverage should be classified where practical as:

- Supported
- Partial
- Planned
- Not needed
- Intentionally open

## Current Development Stage

The initial development stage focuses on preserving the useful dictionary and lookup foundation inherited from Made Up Words while establishing Conlang Workbench's own data model and project architecture.

Major planned areas include:

- language profiles
- configurable document schemas
- rich lexical senses
- phonetics and phonology
- phonotactics and prosody
- orthography and writing systems
- morphology and paradigms
- morphophonology
- syntax
- semantics
- pragmatics and discourse
- sociolinguistics and register
- semantic and cultural domains
- typed etymological and historical relationships
- interlinear glossed examples
- texts and corpora
- validation and completeness auditing
- dictionary and reference-grammar export

These features will be developed incrementally rather than as a single rewrite.
