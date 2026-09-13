# Conlang Workbench — Architecture Refactor Roadmap

## Status and Purpose

**Current architectural sequencing guidance — planning record, not implementation authority**

This roadmap records the current preferred sequence for major Conlang Workbench
architectural work following the linguistic-architecture research and the
completion of the first stable lexical-identity refactor.

It is intentionally narrower than the living deferred-design record. Detailed
architectural reasoning, open questions, linguistic requirements, and deferred
possibilities belong in the relevant design records rather than being
duplicated here.

This roadmap does not replace:

- inspection of the exact current repository before implementation;
- the living future-design record;
- the Linguistic Coverage Audit;
- the Data Safety Audit and Security Audit;
- approved phase-specific design specifications and implementation plans;
- or creator authority over linguistic data and project direction.

The sequence below is therefore guidance rather than an immutable contract.
After each major phase, the remaining order should be reassessed against the
current repository, newly exposed architectural seams, user-facing value,
maintainability, migration risk, and future leverage.

The governing data-safety principle remains:

> **Preserve first; diagnose second; mutate only with explicit intent.**

---

## Cross-Cutting Requirements

### Multimodality Is Foundational

Multimodality is not a late roadmap phase.

Earlier architectural work must avoid assuming that linguistic meaning is
necessarily represented only through linear text or speech. Canonical models
should remain capable of supporting sound, shape, color, movement, timing,
spatial relationships, texture, touch, smell, taste, and creator-defined
dimensions where relevant.

Broader multimodal user interfaces remain later work, but earlier data-model
decisions must not unnecessarily prevent them.

### Capability Does Not Imply Obligation

A future-capable architecture does not require every language to document or
use every supported linguistic distinction.

Unknown, unresolved, unanalyzed, deferred, intentionally unspecified, not
applicable, unsupported, inaccessible, and not observed states must not be
silently collapsed into one another.

### Major Phases Require Fresh Inspection

Each phase begins with inspection of the exact current repository and authority
boundaries. This roadmap does not authorize implementation from remembered or
historical architecture.

Each phase may produce a more useful next step than the order currently shown
here. When that happens, update the roadmap deliberately rather than preserving
an obsolete sequence.

---

## Current Sequence

### 1. Stable Lexical Identity and Initial Lexical-Core Seam — Completed

**Status:** Completed and published.

Phase 1 exposed creator-authored stable lexical identity on runtime dictionary
entries, added ambiguity-safe and language-scoped lexical-ID resolution, and
established a focused lexical-identity component behind the Dictionary facade.

The phase preserved legacy ID-less behavior, retained paths for source-location
authority, avoided creator-data backfill or rewriting, and failed closed when
supplied identity was unresolved or ambiguous.

This phase also established the first maintainability seam for later
Dictionary decomposition without performing a wholesale Dictionary rewrite.

Detailed design and implementation records:

- `docs/superpowers/specs/2026-09-12-stable-lexical-identity-design.md`
- `docs/superpowers/plans/2026-09-12-stable-lexical-identity.md`

### 2. Morphology / Inflection Authority — Next

Move canonical morphological and inflection authority out of application
settings toward Markdown-backed linguistic data.

The first implementation should remain deliberately bounded. Existing
inflection behavior should continue operating through a projection or consumer
boundary while canonical authority moves toward a broader morphology model.

The architecture should allow inflection rules to become one supported kind of
morphological process rather than defining morphology exclusively in terms of
the inherited affix-rule engine.

This phase should establish seams that later generation, analysis, examples,
historical change, and richer morphology can consume without requiring all
possible morphological systems to be implemented at once.

### 3. Documentary Sources / Provenance

Establish canonical documentary source records and explicit provenance
relationships.

Source/import provenance must remain distinct from creator authority,
linguistic history, and technical revision history. Source location must not
become source identity merely because Markdown notes are used to represent
sources.

The design must preserve uncertainty, conflicting documentation, interpretive
claims, and rights/distribution constraints without allowing source existence
to manufacture linguistic authority.

### 4. Proposal Staging / Generation Candidates

Establish Workbench-owned persistent proposal staging, beginning with
word-generation candidates where appropriate.

Generated output remains proposal material until the creator explicitly
accepts it. Selection, editing, deterministic generation, high confidence, or
AI involvement must not independently promote a proposal into canonical
linguistic material.

Accepted material becomes ordinary creator-authoritative material and must not
later be silently rewritten because a generator, algorithm, seed, or
configuration changes.

### 5. Cypher Authority Extraction

Move Cypher linguistic/transformation authority out of application settings
and into Markdown-backed canonical data while preserving the deterministic
Cypher engine as a consumer.

Cypher remains distinct from word generation. Lessons from the morphology
authority migration should be reused where appropriate without forcing the two
subsystems into one abstraction.

### 6. Examples to Richer Evidence / Claims / Provenance Integration

The Examples subsystem already exists. This phase is therefore **not** a task
to create Examples from scratch.

Future work should deepen examples as linguistic evidence by supporting richer
relationships among examples, claims, analyses, senses, constructions,
pragmatic/discourse observations, documentary sources, and provenance where
appropriate.

Examples may support evidence without automatically becoming proof, universal
rules, or creator-independent linguistic conclusions.

### 7. Rich Lexical Relationships / Semantics

Expand beyond the existing textual lexical-relationship compatibility model
toward richer identity-aware relationships and semantic representation.

Stable lexical identity from Phase 1 provides an important prerequisite, but
future relationships must preserve ambiguity and must not infer identity from
spelling alone.

Sense identity remains lexeme-local unless a later explicit design establishes
a different requirement.

### 8. Grammar / Constructions

Develop canonical representation for syntax, grammatical categories, and
constructions without assuming one mandatory linguistic theory, word order,
alignment system, or teaching sequence.

Documented systems should remain distinguishable from analyses and from the
examples that provide evidence for them.

### 9. Historical Linguistic Layer

Represent in-world linguistic relationships, transformations, stages, and
historical processes without conflating them with creator decision history,
technical revision history, or source/import provenance.

Similarity, inspiration, borrowing, adoption, and inheritance must remain
distinguishable where the creator has documented those distinctions.

### 10. Interoperability Adapters

Develop import/export adapters around the internal canonical model rather than
allowing an external format to become the Workbench ontology.

Import should be treated as reconciliation rather than mere parsing. External
IDs must remain distinct from Workbench IDs, ambiguity must be preserved, and
exports should be target-specific and capable of reporting information that
cannot be represented faithfully by the target format.

---

## Separate Explicit Tasks

The following are important but are not currently ordered as major phases in
the sequence above:

### Creator-Requested Portable-ID Backfill

Portable-ID backfill remains a separate explicit creator-authorized mutation.
Recognition and use of existing IDs does not grant authority to rewrite
creator notes merely to add missing IDs.

### Broader Multimodal User Interfaces

Broader multimodal editing and visualization interfaces remain future work.
Their later UI scheduling does not weaken the foundational multimodal
requirements applied to earlier data models.

### Further Dictionary Decomposition

Further Dictionary extraction should be driven by concrete responsibility
boundaries exposed by real feature work rather than cosmetic file splitting or
a predetermined universal object hierarchy.

---

## Reassessment Rule

At the completion of each major architectural phase:

1. verify the resulting repository and authority boundaries;
2. identify newly exposed coupling, migration risk, and reusable seams;
3. compare remaining phases by user-facing value, maintainability, safety, and
   future architectural leverage;
4. correct stale descriptions of functionality that already exists;
5. update this roadmap if the evidence supports a different sequence.

A completed phase-specific specification remains a historical record of the
design implemented at that time. Updating this roadmap does not rewrite that
history.

The roadmap describes **where the project currently intends to go next**.
It does not grant authority to implement the next phase without its own
inspection, design approval, safety review, tests, and implementation plan.
