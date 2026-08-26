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
6. Inspect the Git diff.
7. Commit the change.
8. Push the commit to the remote `develop` branch.
9. Merge tested, stable work into `main` when appropriate.

Experimental work should not be merged into `main` merely because it compiles.

## Project Principles

### Markdown remains canonical

Conlang Workbench should operate on ordinary Markdown notes and structured metadata wherever practical.

A user's language documentation must remain readable and usable without Conlang Workbench installed.

### Language-aware rather than one-size-fits-all

Different languages require different kinds of documentation.

Conlang Workbench should allow language profiles and lexical or grammatical schemas to determine which information is relevant instead of presenting every possible linguistic field to every language.

### Creator-facing and linguist-readable

Conlang Workbench should support the process of creating a constructed language while making it possible to document that language precisely enough for another person, including a linguist, to understand and reproduce its structure without relying on undocumented knowledge held by its creator.

### Human judgment remains authoritative

Validation, generation, and analysis tools should assist the conlanger rather than silently make linguistic decisions for them.

Irregularity and exceptions are legitimate properties of languages and should be documentable rather than treated automatically as errors.

## Current Development Stage

The initial development stage focuses on preserving the useful dictionary and lookup foundation inherited from Made Up Words while establishing Conlang Workbench's own data model and project architecture.

Major planned areas include:

- language profiles
- configurable lexical schemas
- rich lexical senses
- phonology and phonotactics
- orthography
- morphology and paradigms
- typed etymological and historical relationships
- interlinear glossed examples
- grammar documentation
- validation and completeness auditing
- dictionary and reference-grammar export

These features will be developed incrementally rather than as a single rewrite.
