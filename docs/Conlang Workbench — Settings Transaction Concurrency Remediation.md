# Conlang Workbench — Settings Transaction Concurrency Remediation

## Purpose

Record the investigation, remediation, and verification of concurrency hazards in settings-backed authority transactions discovered during the Security Audit §6 mutating-operations review.

This note preserves the original failure reproductions and transaction inventory as audit evidence, then records the common serialization architecture that was implemented and verified for SEC-006-H13.

Historical sections below describe the state of individual paths when they were first investigated. Statements such as "no production remediation has yet been applied" are retained as investigation history and are superseded by the verified remediation sections that follow.

## Origin

The investigation began with SEC-006-H12, which established that an ordinary settings change must not remain authoritative after persistence fails.

During follow-up review, overlapping ordinary-setting transactions exposed a second problem: each transaction could independently capture the live settings value as its rollback state even while that value was only provisional state installed by an earlier in-flight transaction.

A controlled regression reproduced the failure:

1. Initial authoritative value is A0.
2. Transaction T1 reads A0, writes provisional A1, and begins an asynchronous save.
3. Before T1 settles, T2 reads provisional A1, writes provisional A2, and begins its save.
4. T1 fails and restores A0.
5. T2 fails and restores the value it captured, A1.
6. Final live state is A1 even though neither requested save succeeded.

This reproduction does not depend on undocumented assumptions about Obsidian's `saveData()` snapshot or completion-order semantics. The corruption occurs entirely through the plugin's live-state capture and rollback ordering.

The first remediation serializes ordinary H12 persisted-setting transactions so a transaction does not read its previous authority until earlier transactions in that lane have settled. Broader review then found the same general asynchronous transaction shape in multiple settings-authority families.

## Governing Invariant

A settings-authority transaction must derive its rollback state only from settled authority.

Provisional state belonging to another in-flight transaction must never become rollback authority, and independently initiated settings operations must not accidentally persist or restore one another's uncommitted state.

Where serialization is required, the serialization boundary must begin before the transaction reads previous authority, constructs a candidate from live mutable state, or performs provisional mutation. Serializing only the final `saveSettings()` call is insufficient.

## Persistence Model

`ConlangPlugin.saveSettings()` persists the complete live `this.settings` object through Obsidian `saveData()` and then refreshes settings-dependent UI/runtime surfaces.

The Obsidian API declaration inspected during this audit documents `saveData(data)` as writing plugin settings data to disk, but does not document:

- when the supplied object is snapshotted or serialized;
- whether overlapping calls are internally queued;
- what completion order overlapping writes guarantee;
- whether later mutation of the supplied live object can affect an already-started write.

Therefore this remediation must not claim cross-save disk ordering behavior that has not been demonstrated independently.

The plugin-level defect reproduced above requires none of those assumptions.

## Current Serialization Boundaries

### Plugin-wide settings authority — H13

`SettingsAuthorityQueue` is the common production serialization boundary for settings-backed authority transactions.

The queue is owned once by `ConlangPlugin`. Production transaction wrappers enter it before the specialized transaction reads previous authority, constructs a candidate from mutable settings, or installs provisional state. The queue remains held through the complete logical transaction: persistence, runtime reload where required, and any rollback or compensating persistence that the specialized transaction is authorized to perform.

The queue tail recovers after both fulfillment and rejection so one unexpected transaction failure cannot permanently block later settings work.

Specialized state modules continue to own their existing H1–H12 validation, persistence, reload, rollback, filesystem, and creator-data semantics. H13 adds cross-family ordering rather than replacing those security boundaries.

### H10 linguistic-rule transactions

`LinguisticRuleStateQueue` continues to serialize cypher and inflection authority changes.

H13 places the plugin-wide queue outside that specialized queue. The required acquisition order is:

`settingsAuthorityQueue -> linguisticRuleStateQueue`

No production path acquires those queues in the reverse order.

### Ordinary persisted settings

`applyPersistedSettingState()` remains the H12 persistence primitive for settings whose runtime authority is the live settings object itself.

`ConlangPlugin.setPersistedSettingState()` now invokes that primitive from inside `SettingsAuthorityQueue`, so its first `read()` can only observe settled settings authority. The former separate ordinary-setting serialization lane is no longer the cross-family authority boundary.

### Runtime reload boundary

`reloadActiveLanguage()` remains the raw reload primitive for specialized transactions that already hold `SettingsAuthorityQueue`.

Externally initiated reloads use `reloadSettledLanguageState()`, which first acquires the common queue and then calls the raw reload. This prevents startup, manual, event-driven, and post-entry reloads from rebuilding runtime indexes from another transaction's provisional settings.

Calling `reloadSettledLanguageState()` from inside an already-queued settings transaction is intentionally forbidden because it would wait on its own transaction and deadlock.

## Verified H13 Remediation

The following settings-authority families now enter the common queue before their authority-sensitive read, snapshot, plan, candidate construction, or provisional mutation:

- ordinary persisted settings;
- primary-language selection;
- active/primary-language configuration;
- case-sensitive matching;
- cypher and inflection rule changes;
- canonical language source changes;
- Language Profile path changes;
- language-root repair;
- language rename;
- language membership policy;
- language creation;
- language removal.

Language creation preserves H5's additive filesystem boundary: a failed settings save removes only the exact unsaved `LanguageConfig`; folders already established by the creator transaction are not deleted.

Language root repair and rename preserve H7's filesystem-specific authority and rollback rules. The common queue surrounds those complete transactions rather than reducing them to serialized calls to `saveSettings()`.

Language removal acquires the common queue before reading the authoritative target name and deliberately keeps it held while destructive confirmation is open. The exact `LanguageConfig` object and approved name are revalidated before mutation. Nothing else using the common settings-authority boundary can change the meaning of the pending confirmation underneath the creator.

Language membership now uses a dedicated state transaction rather than implementing persistence/reload/rollback directly in the settings UI.

Language creation now uses a dedicated state transaction around standard-folder creation, exact-object settings registration, persistence, and the existing H5 failure boundary.

### Reload and rollback semantics preserved

H13 does not broaden rollback authority.

Where `reloadActiveLanguage()` returns `blocked`, source preflight rejected the requested runtime authority before loaded indexes were replaced. Specialized transactions that previously authorized rollback in this state continue to restore their previous settings and perform compensating persistence where required.

An arbitrary thrown reload after preflight may occur after runtime replacement has begun. Those paths continue to report reload failure without pretending that restoring settings alone can restore the previous runtime. The common queue preserves this distinction rather than simplifying all reload failures into rollback.

### Direct whole-settings persistence

`saveSettings()` remains the raw complete-settings persistence primitive used by specialized transactions while their common queue boundary is already held.

The one-time `hasSeenWelcome` startup flag also persists the complete settings object. It now uses `applyPersistedSettingState()` inside `SettingsAuthorityQueue`. Its direct `saveData(this.settings)` callback therefore cannot overlap another queued authority transaction, and persistence failure restores the previous in-memory flag.

### Verification

The final H13 verification pass exercised:

- `scripts/test-settings-authority-queue.mjs`;
- `scripts/test-persisted-setting-state.mjs`;
- `scripts/test-primary-language-state.mjs`;
- `scripts/test-case-sensitive-state.mjs`;
- `scripts/test-active-language-state.mjs`;
- `scripts/test-linguistic-rule-state.mjs`;
- `scripts/test-language-source-state.mjs`;
- `scripts/test-language-profile-state.mjs`;
- `scripts/test-language-root-repair-state.mjs`;
- `scripts/test-language-rename-state.mjs`;
- `scripts/test-language-membership-state.mjs`;
- `scripts/test-language-creation-state.mjs`;
- `scripts/test-language-removal-state.mjs`;
- `scripts/test-delete-confirmation.mjs`.

All focused regressions passed.

The production build also passed, `git diff --check` reported no whitespace errors, and inspection confirmed that Settings UI code no longer directly invokes raw `saveSettings()` or raw `reloadActiveLanguage()` authority operations.

Remaining raw `reloadActiveLanguage()` callbacks are intentionally supplied to specialized state transactions whose plugin wrappers already hold `SettingsAuthorityQueue`, plus the implementation of `reloadSettledLanguageState()` itself.

## Historical Transaction Inventory

The following inventory preserves the state and reasoning recorded while H13 was being investigated. Its pre-remediation status statements are historical and are superseded by **Verified H13 Remediation** above.

### Pre-remediation reproduced concurrency defects

#### Ordinary persisted settings — H12/H13

Relevant implementation:

- `persisted-setting-state.ts`
- `ConlangPlugin.setPersistedSettingState()`

Status:

- overlapping rollback failure reproduced;
- regression test added;
- scoped serialization remediation implemented locally;
- broader architectural review still in progress.

#### Primary-language-only state — H8/H13

Relevant implementation:

- `primary-language-state.ts`
- `ConlangPlugin.setPrimaryLanguageState()`
- `scripts/test-primary-language-state.mjs`

Transaction characteristics:

- reads previous primary language;
- installs requested primary language before persistence;
- restores the captured previous value after save failure;
- has no transaction queue.

Controlled overlapping-failure testing reproduced the same provisional rollback-authority defect independently of the ordinary persisted-setting helper:

1. settled primary begins as `Language A`;
2. transaction T1 captures A, installs provisional `Language B`, and waits on persistence;
3. transaction T2 begins before T1 settles, captures provisional B as its previous value, requests `Language A`, and waits on persistence;
4. T1 persistence fails and restores A;
5. T2 persistence fails and restores the provisional B it captured;
6. final live primary becomes `Language B` even though neither persistence request succeeded.

The regression requires the final primary to remain `Language A`. Current production code instead produces `Language B`, confirming that H13 is a transaction-pattern defect present in more than one independently implemented authority family.

No production remediation has yet been applied to the primary-language transaction.

#### Case-sensitive matching — H9/H13

Relevant implementation:

- `case-sensitive-state.ts`
- `ConlangPlugin.setCaseSensitiveMatchingState()`
- `scripts/test-case-sensitive-state.mjs`

Transaction characteristics:

- captures previous case-sensitive-matching policy;
- installs the requested policy before persistence;
- restores the captured previous policy after initial save failure;
- after successful initial persistence, performs linguistic runtime reload;
- a preflight-blocked reload restores the old policy and performs a compensating save;
- arbitrary post-preflight reload failure deliberately does not roll back.

Controlled overlapping-failure testing reproduced the provisional rollback-authority defect during H9's initial-persistence phase:

1. settled policy begins as `false`;
2. transaction T1 captures `false`, installs provisional `true`, and waits on persistence;
3. transaction T2 begins before T1 settles, captures provisional `true` as its previous value, requests `false`, and waits on persistence;
4. T1 persistence fails and restores `false`;
5. T2 persistence fails and restores the provisional `true` it captured;
6. final live policy becomes `true` even though neither persistence request succeeded.

The regression requires the final policy to remain `false` and verifies that neither failed initial persistence attempt reaches runtime reload. Current production code instead produces `true`.

This confirms that H13 also affects a transaction family whose successful path continues into runtime reload. It does **not** yet establish the behavior of overlapping transactions after successful initial persistence, during reload, or during a compensating rollback save. Those later H9 phases remain separately untested.

No production remediation has yet been applied to the case-sensitive-matching transaction.

#### Active/primary language state — H6/H13

Relevant implementation:

- `active-language-state.ts`
- `ConlangPlugin.setActiveLanguageState()`
- `scripts/test-active-language-state.mjs`

Transaction characteristics:

- snapshots active-language and primary-language state together;
- installs the requested compound state before persistence;
- restores the captured compound snapshot after initial save failure;
- reloads linguistic runtime after successful persistence;
- a preflight-blocked reload restores previous configuration and performs a compensating save;
- arbitrary post-preflight reload failure deliberately does not roll back.

Controlled overlapping-failure testing reproduced the provisional rollback-authority defect for this compound transaction:

1. settled state begins with active `Language A` and primary `Language A`;
2. transaction T1 captures that settled state, installs provisional active `Language B` / primary `Language B`, and waits on persistence;
3. transaction T2 begins before T1 settles, captures T1's provisional compound state as its previous state, installs active `Language A, Language B` / primary `Language A`, and waits on persistence;
4. T1 persistence fails and restores the original settled `Language A` / `Language A` state;
5. T2 persistence fails and restores the provisional `Language B` / `Language B` snapshot it captured;
6. final live authority becomes active `Language B` / primary `Language B` even though neither persistence request succeeded.

The regression requires the final compound state to remain the original settled `Language A` / `Language A` configuration and verifies that neither failed initial persistence attempt reaches runtime reload. Current production code instead restores the provisional `Language B` / `Language B` state.

This confirms that H13 affects compound multi-property authority transactions as well as simple property transactions. It does **not** yet establish the behavior of overlapping transactions after successful initial persistence, during runtime reload, or during a compensating rollback save.

No production remediation has yet been applied to the active/primary-language transaction.

### Pre-remediation transactions identified for concurrency review

#### Canonical language source changes — H3/H7

Relevant implementation:

- `language-source-state.ts`
- `ConlangPlugin.setLanguageSourceState()`

Transaction characteristics:

- validates before mutation;
- captures the selected source value;
- installs requested source before persistence;
- restores after initial save failure;
- active-language changes perform runtime reload;
- preflight-blocked reload restores the previous source and performs a compensating save.

Concurrency-specific reproduction remains required.

#### Language Profile path — H11

Relevant implementation:

- `language-profile-state.ts`
- `ConlangPlugin.setLanguageProfileState()`

Transaction characteristics:

- validates before mutation;
- captures previous profile path;
- installs requested profile path before persistence;
- restores after initial save failure;
- active-language changes perform runtime reload;
- preflight-blocked reload restores the previous path and performs a compensating save.

Concurrency-specific reproduction remains required.

#### Language membership policy

Relevant implementation:

- `settings.ts`

Transaction characteristics:

- currently implements persistence/reload/rollback directly in the settings UI rather than through a dedicated state module;
- captures previous membership;
- installs requested membership before persistence;
- restores after save failure;
- performs runtime reload;
- preflight-blocked reload restores previous membership and performs a compensating save.

This path should be included in the common concurrency review rather than being overlooked because it lacks an `apply...State` module.

#### Language removal — H4

Relevant implementation:

- `settings.ts`

Transaction characteristics:

- snapshots the languages array, active-language array, primary language, and related UI state;
- mutates compound configuration before persistence;
- restores configuration after save failure;
- performs runtime reload;
- preflight-blocked reload restores configuration and performs a compensating save.

Concurrency review must account for the compound snapshot and exact `LanguageConfig` identity authorization.

#### Language creation — H5

Relevant implementation:

- `language-creator.ts`
- `settings.ts`

Transaction characteristics:

- performs additive filesystem establishment before settings mutation;
- appends a new `LanguageConfig`;
- persists the complete settings object;
- save failure removes the exact unsaved object by identity;
- created folders are deliberately preserved rather than deleted.

Concurrency review must not weaken the existing additive creator-data safety boundary.

### Pre-remediation filesystem-coupled transaction review

#### Language root repair — H7

Relevant implementation:

- `language-root-repair-state.ts`
- `ConlangPlugin.repairLanguageRoot()`

Transaction characteristics:

- calculates a fresh authority plan;
- snapshots several root/source settings;
- may create folders before settings mutation;
- applies compound configuration;
- persists settings;
- reloads active runtime when necessary;
- preflight-blocked reload restores configuration and performs a compensating save;
- additive folders are deliberately never deleted during rollback.

A mutex around `saveSettings()` alone cannot make this transaction atomic. Any shared coordinator design must account for planning, filesystem establishment, configuration mutation, persistence, reload, and authorized rollback boundaries.

#### Language rename — H7

Relevant implementation:

- `language-rename-state.ts`
- `ConlangPlugin.renameLanguage()`

Transaction characteristics:

- calculates fresh rename authority;
- snapshots language identity, paths, active-language references, and primary-language references;
- physically renames the owned root before settings persistence;
- applies compound configuration;
- may perform compensating filesystem rename after a safe failure;
- reloads active runtime;
- only explicit preflight-blocked reload authorizes complete rollback.

This transaction cannot safely be treated as merely a settings write. Concurrency remediation must preserve its filesystem and runtime authority ordering.

## Pre-remediation Direct Persistence Outside `saveSettings()`

### Welcome flag

`maybeShowWelcome()` currently:

- mutates `settings.hasSeenWelcome`;
- calls `saveData(this.settings)` directly;
- discards the returned Promise;
- does not restore the flag or report persistence failure.

This is a definite separate persistence/error-handling concern.

Because `saveData()` ordering and snapshot semantics are not documented by the inspected Obsidian API declaration, this note does not yet claim that the welcome write can overwrite another transaction on disk. Its direct whole-settings persistence nevertheless places it inside the broader persistence-boundary review.

Do not route this path through another transaction helper merely for consistency until startup/migration and cross-family persistence boundaries are understood.

## Startup Normalization and Migration

`loadSettings()` merges persisted data with defaults, normalizes closed-choice settings, and runs compatibility migration.

Current review does not classify deterministic startup compatibility interpretation as the H13 concurrency defect.

Legacy active-language and structural-root inference can derive modern runtime configuration from previously persisted representation. That compatibility behavior should not be conflated with a new user-requested asynchronous settings transaction.

Migration persistence may receive a separate review if needed, but remediation must not restore malformed persisted values merely to imitate transactional rollback.

## Final Architecture

H13 uses one plugin-wide settings-authority coordinator rather than independent cross-family queues.

This decision follows from the plugin's persistence model: `saveSettings()` serializes the complete mutable settings object, so transactions affecting different properties can still observe, persist, or restore one another's provisional state if they overlap.

The common queue therefore coordinates complete logical authority transactions, not merely disk writes.

The architecture preserves the security properties established by earlier findings:

- fresh authority validation before mutation;
- exact-object identity where authorization targets a `LanguageConfig`;
- additive-only folder establishment where deletion is not authorized;
- safe distinction between preflight-blocked reload and arbitrary post-preflight failure;
- compensating persistence only where old runtime authority is proven untouched;
- creator-authored Markdown/YAML remains outside settings rollback authority;
- failed requests cannot become authoritative through a later unrelated save.

Filesystem-coupled operations remain specialized transactions inside the common ordering boundary. Runtime reloads initiated outside those transactions enter the same boundary through `reloadSettledLanguageState()`.

## Remediation Requirements — Verified

The accepted remediation:

- establishes previous/rollback authority only after conflicting earlier transactions have settled;
- prevents provisional state from becoming another transaction's rollback baseline;
- prevents failed requests from leaking into later unrelated whole-settings persistence after failure has settled;
- serializes complete logical authority transactions rather than merely their disk writes;
- keeps the common queue tail usable after rejection;
- uses a documented queue acquisition order to avoid cross-queue deadlock;
- preserves exact rollback limits after runtime replacement may have begun;
- preserves filesystem safety and creator-data boundaries;
- includes focused regression coverage for the demonstrated transaction families;
- retains explanatory production comments describing responsibility, assumptions, lock ordering, and transaction boundaries.

## Audit Status

This remediation work belongs to Security Audit §6, Commands / Mutating Operations.

SEC-006-H13 began as a reproduced overlapping ordinary-setting rollback failure. Investigation demonstrated that the underlying defect was cross-family: independently implemented settings transactions shared one mutable complete-settings persistence object and could otherwise adopt another transaction's provisional state as rollback authority.

The production remediation now uses `SettingsAuthorityQueue` as the common outer authority boundary, with specialized transaction modules retaining their existing H1–H12 semantics.

The final focused H13 regression suite and production build passed. Direct Settings UI persistence/reload authority bypasses were removed, non-transaction runtime reloads now wait for settled settings authority, and the remaining direct welcome persistence is executed inside the common queue with H12 rollback semantics.

**SEC-006-H13 status: Remediated and verified.**

Security Audit §6 may now treat H13 as resolved subject to the normal final audit-wide diff/review and commit process.

## Working Principle

> Preserve first, diagnose second, mutate only with explicit intent.

For asynchronous settings authority, that principle additionally means:

> Never treat another transaction's provisional state as settled authority.
