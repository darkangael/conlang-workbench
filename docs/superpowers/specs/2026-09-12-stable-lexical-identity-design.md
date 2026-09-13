# Conlang Workbench — Stable Lexical Identity Design

## Status

Approved architectural design for Phase 1 of the post-research Conlang Workbench refactor.

This document defines the design boundary only. It is not implementation authority beyond the behavior and constraints explicitly approved here.

## Purpose

Phase 1 begins the larger Conlang Workbench refactor by extracting the smallest lexical responsibility that provides immediate architectural and functional value: stable lexical identity.

The Workbench already recognizes creator-authored `lexeme_id` values at the source boundary. Those IDs are retained in `WorkbenchSourceRecord.identity.linguisticID`, diagnosed for collisions, and generated for newly created lexical notes when the language's portable-ID policy enables them.

However, stable lexical identity is not currently exposed on `DictionaryEntry`, and the runtime `Dictionary` has no lexical-ID lookup or equivalence capability. Some runtime operations therefore use mutable source paths where they are actually trying to answer questions about lexical identity or ownership.

Phase 1 closes that gap without redesigning the complete dictionary subsystem.

## Architectural Principle

When Workbench needs to know where a lexical source is located, path remains authoritative.

When Workbench needs to know whether two runtime values represent the same lexeme, stable lexical identity is preferred when usable.

Legacy behavior remains available when stable lexical identity is absent.

Ambiguous, contradictory, or unresolved stable identity must not be silently replaced by a convenient legacy answer.

This preserves the broader Workbench data-safety doctrine:

> Preserve first; diagnose second; mutate only with explicit intent.

Unknown, ambiguous, and indeterminate states do not grant authority to select an arbitrary target.

## Confirmed Current Architecture

### Source identity

`workbench-id.ts` deliberately separates three identity domains:

- `workbenchID`: Workbench's source/runtime handle;
- `sourceID`: source-side identity;
- `linguisticID`: identity supplied by the language documentation.

For Obsidian files, Workbench/source identity is currently path-derived and therefore changes when a file is renamed or moved.

A creator-authored `lexeme_id` is independent of that path-derived identity.

### Lexical source parsing

`dictionary-source.ts` accepts an optional nonblank `lexeme_id`.

A valid value is retained as `WorkbenchSourceRecord.identity.linguisticID`.

Malformed or blank values produce diagnostics rather than fabricated replacement IDs.

Legacy lexical notes without `lexeme_id` remain valid.

Generated `lex-UUID` values are a Workbench generation convention only. Parsers must continue accepting arbitrary nonblank creator-authored lexical IDs.

### Runtime dictionary entries

`DictionaryEntry` currently contains lexical content and source location information, including:

- headword;
- definition and senses;
- aliases;
- declared forms;
- language scope;
- source path;
- lexical relationship data.

It does not currently expose the parsed stable lexical ID.

### Runtime indexing

`Dictionary` currently maintains indexes for lexical spelling, aliases, forms, English lookup, phrase behavior, and source Workbench IDs.

It does not maintain a stable lexical-ID index.

Other Workbench inventories already establish a useful precedent: stable linguistic-ID indexes retain multiple matches rather than assuming global uniqueness and may be scoped by language.

### File moves and renames

Ordinary source edits, deletes, and renames invalidate active canonical language inventories and trigger a settled runtime reload.

Rename handling checks both the old and new paths, so moving a source into or out of a canonical folder cannot leave runtime state stale.

A creator-authored `lexeme_id` survives such movement because it belongs to the Markdown source rather than the path-derived Workbench identity.

### Lexical `parts:` relationships

Existing `parts:` relationships are creator-authored textual references.

`resolveLexicalPart()`:

- resolves only headwords and aliases;
- excludes inflected forms;
- respects language scope;
- returns explicit `unresolved`, `unique`, or `ambiguous` cardinality;
- never selects an arbitrary first match.

Phase 1 does not replace this representation.

## Goals

Phase 1 will:

1. expose stable lexical identity directly on runtime lexical entries;
2. introduce a narrow lexical-identity responsibility behind the existing `Dictionary` façade;
3. index lexical entries by stable ID without assuming uniqueness;
4. resolve lexical IDs within language scope;
5. represent unresolved and ambiguous identity explicitly;
6. distinguish proven sameness, proven difference, and indeterminate identity;
7. use stable lexical identity in runtime operations that are genuinely asking about lexical sameness or ownership;
8. preserve legacy behavior for lexemes that do not have stable IDs;
9. retain paths for source-location operations;
10. begin the larger maintainability refactor through a real semantic seam rather than cosmetic file splitting.

## Non-Goals

Phase 1 will not:

- perform portable-ID backfill;
- rewrite existing creator-authored Markdown;
- require existing lexical notes to acquire IDs;
- require Workbench-generated UUID-shaped IDs;
- replace textual `parts:` relationships;
- redesign sense identity;
- redesign lexical semantics;
- move morphology or inflection authority;
- move Cypher authority;
- extract the complete source-record subsystem;
- create a universal relationship graph;
- create a universal `LinguisticObject` superclass;
- replace `Dictionary` with a complete lexical repository;
- perform a wholesale Dictionary rewrite;
- change paths that are correctly being used as source locations.

## Runtime Projection

`DictionaryEntry` will expose the stable lexical identity associated with the accepted lexical source:

`lexemeId?: string`

This is a runtime projection of `WorkbenchSourceRecord.identity.linguisticID`.

The projection is intentional even though the source record also retains the value. A consumer already working with a `DictionaryEntry` should not need to reverse-resolve its source record merely to determine which lexeme the entry represents.

The source record remains authoritative for source identity and source diagnostics.

## Lexical Identity Component

Phase 1 will introduce a narrowly named lexical-identity component, such as `lexical-identity.ts` or `lexical-identity-index.ts`.

Its responsibility is lexical identity only.

It should support:

- indexing entries by normalized `lexemeId`;
- retaining every matching entry rather than overwriting duplicates;
- language-scoped ID lookup;
- explicit identity resolution;
- lexical-equivalence decisions.

It must not absorb unrelated Dictionary responsibilities such as:

- ordinary word or alias lookup;
- form lookup;
- English lookup;
- sense parsing;
- phrase indexing;
- lexical relationship rendering;
- source parsing;
- Markdown writing;
- diagnostics UI;
- Obsidian file access.

`Dictionary` remains the public façade and runtime lifecycle owner for this phase. It delegates stable lexical-identity operations to the extracted component.

## Identity Resolution Semantics

Stable lexical IDs must not be treated as globally unique merely because they are intended to be stable.

Resolution occurs within the appropriate language scope and returns explicit cardinality:

- `unresolved`: no matching accepted lexical entry;
- `unique`: exactly one matching accepted lexical entry;
- `ambiguous`: multiple matching accepted lexical entries.

Duplicate creator-authored IDs remain preserved and diagnosable.

No first-match or last-match behavior is permitted.

## Lexical Equivalence Semantics

Where an operation asks whether two runtime values represent the same lexeme, the identity layer must distinguish:

- `same`;
- `different`;
- `indeterminate`.

A Boolean alone is insufficient because lack of identity evidence is not proof of difference.

### Both entries have usable stable lexical IDs

Stable identity takes precedence.

Entries can be treated as the same lexeme only when the relevant ID resolves appropriately within the same language scope.

An ambiguous ID prevents a confident same-lexeme result.

A supplied stable identity must not be silently ignored merely because path comparison would produce a more convenient answer.

### Neither entry has a usable stable lexical ID

Existing legacy identity behavior remains available.

Where current runtime ownership is established by path, Phase 1 may continue using that path relationship for these legacy entries.

### Only one entry has usable stable lexical identity

Workbench must not infer that the ID-bearing and ID-less entries are the same merely because their spellings, aliases, or other lexical content happen to match.

Where the existing operation has a legitimate legacy ownership relationship, that relationship may remain available as compatibility behavior.

Otherwise the identity result is indeterminate rather than fabricated.

## Stable Identity and Legacy Fallback

Legacy fallback applies because stable identity is absent.

Legacy fallback does not apply merely because supplied stable identity is inconvenient, duplicated, unresolved, or contradictory.

This distinction is required to prevent creator-supplied identity information from being silently bypassed.

## Runtime Consumer Boundary

Phase 1 will classify path uses by semantics rather than mechanically replacing `.path` comparisons.

### Source-location uses

Path remains correct for operations such as:

- opening a lexical note;
- navigating from the panel or highlighter;
- reading Markdown;
- reacting to vault events;
- source diagnostics;
- determining current file location.

These uses should not be converted to lexical IDs.

### Lexical-identity uses

Operations that are actually asking questions such as:

- is this the same lexeme?;
- which canonical lexical entry owns this derived representation?;
- are these results duplicates because they represent the same lexical object?;

should prefer the lexical-identity seam.

The clearest confirmed Phase 1 conversion is declared-form lemma recovery in `Dictionary.lemmaForDeclaredPhrase()`.

An ID-bearing owner should use stable identity when that identity resolves correctly.

An ID-less owner retains the current legacy path fallback.

A supplied but ambiguous or otherwise unresolvable stable identity must not be silently rescued by path.

### Other path comparisons

Other path-based comparisons discovered in `main.ts` and related consumers must be classified individually during implementation.

A path comparison should change only when inspection proves that the operation is using path as a surrogate for lexical-object identity.

If the operation is deduplicating or navigating source files, path may remain the correct key.

## `parts:` Compatibility

Phase 1 does not change creator-authored `parts:` syntax or its current meaning.

Existing textual relationships continue resolving through headwords and aliases within the owner's language scope.

Existing explicit unresolved/unique/ambiguous behavior remains intact.

Stable lexical identity may support richer relationship representation in a later phase, but that work is outside this design.

## Sense Identity Boundary

`LexicalSense.id` remains scoped to its owning lexeme.

Phase 1 must not combine lexeme identity and sense identity into one mechanism.

Sense lookup, semantic relationships, and richer sense architecture belong to later lexical work unless a minimal change is strictly required to preserve existing behavior.

## Source Record Boundary

Source records and lexical runtime entries are conceptually separate layers.

A source record answers source-oriented questions:

- what source was observed?;
- what is its Workbench/source identity?;
- what linguistic identity did the documentation provide?;
- what diagnostics occurred?;
- was the source recognized even if it could not become a valid lexical runtime object?

A lexical runtime entry represents usable accepted lexical information.

This distinction is especially important because `WorkbenchSourceRecord.value` may legitimately be `null`.

Phase 1 preserves this conceptual separation but does not physically extract source-record ownership from `Dictionary`.

That extraction should occur only when a later source/provenance feature provides a concrete reason to move the responsibility.

## Data Flow

The intended Phase 1 flow is:

    Markdown frontmatter
        ↓
    dictionary-source.ts
        ↓
    WorkbenchSourceRecord<DictionaryEntry>
        ├─ identity.workbenchID
        ├─ identity.sourceID
        └─ identity.linguisticID
                  ↓ projected as
            DictionaryEntry.lexemeId
                  ↓
          lexical identity component
                  ↓
              Dictionary façade
                  ↓
          identity-sensitive consumers

This preserves the existing source parser and Dictionary façade while introducing one well-bounded responsibility.

## Diagnostics and Error Handling

Diagnostics remain observational.

The lexical identity component must consume ambiguous or malformed creator state without gaining mutation authority.

In particular:

- duplicate stable lexical IDs remain preserved;
- duplicate IDs remain diagnosable;
- an ambiguous ID lookup returns ambiguity;
- malformed or blank IDs remain unusable;
- no identity problem authorizes rewriting creator data;
- no ambiguity authorizes arbitrary target selection;
- failure to prove identity must not be converted into false certainty.

Identity problems discovered during ordinary runtime use should rely on the existing diagnostics architecture rather than introducing automatic repair.

## Compatibility Contract

Phase 1 must preserve all of the following:

- ID-less legacy lexical notes continue loading;
- existing word lookup continues working;
- alias lookup continues working;
- declared forms continue working;
- English lookup continues working;
- phrase behavior continues working;
- source-record lookup continues working;
- textual `parts:` relationships continue working;
- existing language scoping remains intact;
- existing source diagnostics remain intact;
- source paths continue locating files;
- no existing note is rewritten merely because stable lexical identity becomes runtime-visible.

## Testing Contract

Implementation must include focused regression coverage for at least the following behaviors.

### Stable ID projection

A parsed lexical `lexeme_id` is visible as `DictionaryEntry.lexemeId`.

Respelling the lexeme does not change that stable identity.

### Stable-ID lookup

A unique stable lexical ID resolves to the intended entry within its language scope.

Identical local IDs in different languages do not incorrectly collide across language scope.

### Duplicate IDs

Two accepted lexical entries with the same stable ID in the same language remain preserved.

Resolution is ambiguous.

No arbitrary entry wins.

### Legacy entries

An ID-less lexical entry remains fully usable through existing lookup behavior.

Identity-sensitive behavior that previously relied legitimately on legacy path ownership continues working when no stable identity is present.

### Mixed identity

An ID-bearing entry and an ID-less entry are not silently declared identical merely because their visible lexical content matches.

Where identity cannot be proven, the result remains indeterminate.

### Declared-form ownership

Declared-form lemma recovery uses stable lexical identity when available and uniquely resolvable.

ID-less entries retain the current path-based compatibility behavior.

Ambiguous or otherwise unusable supplied stable identity does not silently fall back to path.

### Path behavior

Renaming or moving an ID-bearing lexical source changes its path/source identity but preserves its stable lexical identity after runtime reload.

Path-based navigation still opens the current source location.

### Existing relationships

Current textual `parts:` tests continue passing unchanged.

Unresolved and ambiguous relationships remain non-authoritative.

### Existing regressions

Relevant existing lexical regression suites must remain green, including source parsing, lexical senses, lexical normalization, lexical part relationships, dictionary entry writing, dictionary language scope, lookup behavior, and source diagnostics.

## Implementation Discipline

Implementation must continue the repository's established data-safety workflow:

- inspect exact current code and patch anchors before each edit;
- keep changes small and auditable;
- use focused tests before broad tests;
- preserve unknown creator-authored metadata;
- do not invent or backfill IDs silently;
- do not edit generated `main.js` manually;
- rebuild generated output only through the established build process when production TypeScript changes require it;
- stage exact allowlists rather than using `git add .`;
- verify protected untracked files remain outside the index;
- inspect staged diffs before committing.

## Success Criteria

Phase 1 is complete when:

1. runtime lexical entries expose stable `lexeme_id` values directly;
2. stable lexical IDs have an ambiguity-safe, language-scoped runtime lookup seam;
3. lexical equivalence can represent same, different, and indeterminate states;
4. confirmed lexical-identity consumers prefer stable identity where available;
5. legacy ID-less entries retain existing behavior;
6. path continues serving source-location responsibilities;
7. duplicate or invalid identity never produces arbitrary selection;
8. no automatic migration or creator-data rewrite is introduced;
9. existing lexical behavior remains covered by passing regression tests;
10. the first maintainability extraction is limited to lexical identity rather than expanding into an unrelated Dictionary rewrite.

## Deferred Work

The following remain later architectural phases or separate explicit tasks:

- creator-requested portable-ID backfill;
- documentary Sources/provenance extraction;
- proposal staging and generation candidates;
- Markdown-backed morphology/inflection authority;
- Cypher authority extraction;
- richer example/evidence architecture;
- richer lexical relationships and semantics;
- grammar/construction architecture;
- historical linguistic modeling;
- interoperability adapters;
- broader multimodal user interfaces;
- further Dictionary decomposition justified by later concrete feature boundaries.

Phase 1 deliberately leaves seams for these later changes without implementing them prematurely.
