---
type: phonological-unit
unit_id: test-p
symbol: "/p₂/"
category: consonant
status: proposed
language: Test Language
---

# Duplicate `/p/` Runtime Test

Permanent DS-009 runtime fixture. This note deliberately repeats the stable
`unit_id: test-p` used by `p.md`.

The Workbench must preserve both notes, diagnose both unit sources, and report
that `p-aspirated.md` has an ambiguous canonical-unit relationship. It must not
silently select either unit or rewrite any source note.
