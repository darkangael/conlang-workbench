---
word: ds010-compound
definition: runtime fixture for compound-part relationship safety
partOfSpeech: noun
language: Test Language
parts:
  - ds010-unique-root
  - ds010-missing-root
  - ds010-shared-root
---

# DS-010 Compound Relationship Runtime Test

This permanent test fixture exercises all three current compound-part
relationship states:

- `ds010-unique-root` resolves to exactly one entry and may be opened.
- `ds010-missing-root` has no target and must remain visible but inert.
- `ds010-shared-root` has two targets and must remain visibly ambiguous and
  inert rather than choosing whichever note loaded first.

These relationships concern the entries' current owning language. They do not
represent etymological origin, borrowing, or parent/daughter-language descent.
