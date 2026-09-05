import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(join(tmpdir(), "conlang-linguistic-rule-state-"));

try {
  await build({
    entryPoints: [
      "linguistic-rule-state.ts",
      "persisted-setting-state.ts",
      "settings-authority-queue.ts",
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: temp,
    outExtension: { ".js": ".mjs" },
  });

  const modulePath = join(temp, "linguistic-rule-state.mjs");

  // Fail clearly if bundling unexpectedly produced no module.
  await readFile(modulePath, "utf8");

  const {
    applyConfirmedLinguisticRuleState,
    applyLinguisticRuleState,
    cloneLinguisticRuleState,
    LinguisticRuleStateQueue,
    LinguisticRuleTargetMissingError,
  } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);

  const persistedModulePath = join(temp, "persisted-setting-state.mjs");
  await readFile(persistedModulePath, "utf8");

  const { applyPersistedSettingState } = await import(
    `${pathToFileURL(persistedModulePath).href}?v=${Date.now()}`
  );

  /*
   * The H13 cross-family regression composes H10 and an ordinary persisted
   * setting through the same plugin-wide authority queue. Bundling the
   * coordinator here lets the test exercise that production lock ordering
   * without coupling the regression to the Obsidian plugin host.
   */
  const authorityQueueModulePath = join(temp, "settings-authority-queue.mjs");
  await readFile(authorityQueueModulePath, "utf8");

  const { SettingsAuthorityQueue } = await import(
    `${pathToFileURL(authorityQueueModulePath).href}?v=${Date.now()}`
  );

  const makeState = () => ({
    sheets: [
      {
        name: "Primary",
        enabled: true,
        rules: [
          {
            input: "sh",
            output: "š",
            type: "default",
            enabled: true,
          },
        ],
      },
      {
        name: "Second",
        enabled: false,
        rules: [],
      },
    ],
    inflections: [
      {
        label: "plural",
        pattern: "s",
        position: "suffix",
        strip: "s",
        add: "",
        enabled: true,
        pos: "noun",
      },
    ],
  });

  {
    /*
     * Candidate construction must detach every mutable level. Otherwise a UI
     * edit made before the transaction could already have changed live runtime
     * behaviour and destroyed the state we intend to restore on failure.
     */
    const state = makeState();
    const candidate = cloneLinguisticRuleState(state);

    assert.notEqual(candidate.sheets, state.sheets);
    assert.notEqual(candidate.sheets[0], state.sheets[0]);
    assert.notEqual(candidate.sheets[0].rules, state.sheets[0].rules);
    assert.notEqual(candidate.sheets[0].rules[0], state.sheets[0].rules[0]);
    assert.notEqual(candidate.inflections, state.inflections);
    assert.notEqual(candidate.inflections[0], state.inflections[0]);

    candidate.sheets[0].rules[0].output = "X";
    candidate.inflections[0].pattern = "en";

    assert.equal(
      state.sheets[0].rules[0].output,
      "š",
      "editing a cypher candidate must not mutate live nested rules",
    );
    assert.equal(
      state.inflections[0].pattern,
      "s",
      "editing an inflection candidate must not mutate live rules",
    );
  }

  {
    // A successful save establishes the complete detached candidate.
    const state = makeState();
    const candidate = cloneLinguisticRuleState(state);

    candidate.sheets[0].name = "Renamed";
    candidate.sheets.push({
      name: "Third",
      enabled: true,
      rules: [],
    });
    candidate.inflections[0].label = "number";
    candidate.inflections.push({
      label: "past",
      pattern: "ed",
      position: "suffix",
      strip: "ed",
      add: "",
      enabled: true,
    });

    let saveCalls = 0;

    const result = await applyLinguisticRuleState({
      state,
      requested: candidate,
      save: async () => {
        saveCalls++;

        assert.equal(
          state.sheets,
          candidate.sheets,
          "save must observe the complete requested cypher state",
        );
        assert.equal(
          state.inflections,
          candidate.inflections,
          "save must observe the complete requested inflection state",
        );
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(saveCalls, 1);
    assert.equal(state.sheets, candidate.sheets);
    assert.equal(state.inflections, candidate.inflections);
    assert.equal(state.sheets[0].name, "Renamed");
    assert.equal(state.sheets.length, 3);
    assert.equal(state.inflections[0].label, "number");
    assert.equal(state.inflections.length, 2);
  }

  {
    /*
     * Failed persistence must restore the exact original references, not merely
     * arrays containing equivalent values. Runtime consumers may already hold
     * references to these authoritative arrays and nested objects.
     */
    const state = makeState();
    const originalSheets = state.sheets;
    const originalSheet = state.sheets[0];
    const originalRules = state.sheets[0].rules;
    const originalRule = state.sheets[0].rules[0];
    const originalInflections = state.inflections;
    const originalInflection = state.inflections[0];

    const candidate = cloneLinguisticRuleState(state);
    candidate.sheets[0].rules[0].output = "failed-change";
    candidate.inflections[0].pattern = "failed-change";

    const saveError = new Error("save failed");

    const result = await applyLinguisticRuleState({
      state,
      requested: candidate,
      save: async () => {
        assert.equal(state.sheets, candidate.sheets);
        assert.equal(state.inflections, candidate.inflections);
        throw saveError;
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(result.error, saveError);

    assert.equal(state.sheets, originalSheets);
    assert.equal(state.sheets[0], originalSheet);
    assert.equal(state.sheets[0].rules, originalRules);
    assert.equal(state.sheets[0].rules[0], originalRule);
    assert.equal(state.inflections, originalInflections);
    assert.equal(state.inflections[0], originalInflection);

    assert.equal(state.sheets[0].rules[0].output, "š");
    assert.equal(state.inflections[0].pattern, "s");
  }

  {
    // Reordering the detached candidate must leave live ordering untouched.
    const state = makeState();
    const candidate = cloneLinguisticRuleState(state);

    const movedSheet = candidate.sheets.splice(1, 1)[0];
    candidate.sheets.splice(0, 0, movedSheet);

    assert.deepEqual(
      state.sheets.map((sheet) => sheet.name),
      ["Primary", "Second"],
    );
    assert.deepEqual(
      candidate.sheets.map((sheet) => sheet.name),
      ["Second", "Primary"],
    );
  }

  {
    // Adding/deleting candidate objects must not change live array membership.
    const state = makeState();
    const candidate = cloneLinguisticRuleState(state);

    candidate.sheets.splice(0, 1);
    candidate.inflections.splice(0, 1);

    assert.equal(state.sheets.length, 2);
    assert.equal(state.inflections.length, 1);
    assert.equal(candidate.sheets.length, 1);
    assert.equal(candidate.inflections.length, 0);
  }

  {
    /*
     * Optional inflections have two meaningful shapes in persisted settings:
     * absent and explicitly empty. Cloning must not silently normalize one into
     * the other.
     */
    const absentState = {
      sheets: [],
      inflections: undefined,
    };
    const absentCandidate = cloneLinguisticRuleState(absentState);

    assert.equal(absentCandidate.inflections, undefined);

    const emptyState = {
      sheets: [],
      inflections: [],
    };
    const emptyCandidate = cloneLinguisticRuleState(emptyState);

    assert.ok(Array.isArray(emptyCandidate.inflections));
    assert.equal(emptyCandidate.inflections.length, 0);
    assert.notEqual(emptyCandidate.inflections, emptyState.inflections);
  }

  {
    // Failed persistence must also restore an originally absent inflection list.
    const state = {
      sheets: [],
      inflections: undefined,
    };
    const originalSheets = state.sheets;
    const candidate = cloneLinguisticRuleState(state);
    candidate.inflections = [];

    const result = await applyLinguisticRuleState({
      state,
      requested: candidate,
      save: async () => {
        throw new Error("save failed");
      },
    });

    assert.equal(result.status, "save-failed");
    assert.equal(state.sheets, originalSheets);
    assert.equal(state.inflections, undefined);
  }

  {
    /*
     * A rapid second edit must not construct its candidate until the first save
     * has succeeded. Otherwise it could clone stale state and later overwrite
     * the first successful change.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    let releaseFirstSave;
    const firstSaveGate = new Promise((resolve) => {
      releaseFirstSave = resolve;
    });

    const observed = [];

    const first = queue.apply({
      state,
      edit: (candidate) => {
        observed.push("edit:first");
        candidate.sheets[0].name = "First saved";
      },
      save: async () => {
        observed.push(`save:first:${state.sheets[0].name}`);
        await firstSaveGate;
      },
    });

    const second = queue.apply({
      state,
      edit: (candidate) => {
        observed.push(`edit:second:${candidate.sheets[0].name}`);
        candidate.sheets[0].rules[0].output = "second";
      },
      save: async () => {
        observed.push(
          `save:second:${state.sheets[0].name}:${state.sheets[0].rules[0].output}`,
        );
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(observed, ["edit:first", "save:first:First saved"]);

    releaseFirstSave();

    assert.deepEqual(await first, { status: "applied" });
    assert.deepEqual(await second, { status: "applied" });

    assert.equal(state.sheets[0].name, "First saved");
    assert.equal(state.sheets[0].rules[0].output, "second");
    assert.deepEqual(observed, [
      "edit:first",
      "save:first:First saved",
      "edit:second:First saved",
      "save:second:First saved:second",
    ]);
  }

  {
    /*
     * If the first queued save fails, rollback must finish before the next edit
     * is cloned. The second request therefore starts from the restored
     * last-known-good state rather than from the failed candidate.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const first = queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets[0].name = "Must roll back";
      },
      save: async () => {
        throw new Error("first save failed");
      },
    });

    const second = queue.apply({
      state,
      edit: (candidate) => {
        assert.equal(
          candidate.sheets[0].name,
          "Primary",
          "later edit must clone the state restored after earlier save failure",
        );
        candidate.sheets[0].rules[0].output = "survives";
      },
      save: async () => {},
    });

    const firstResult = await first;
    const secondResult = await second;

    assert.equal(firstResult.status, "save-failed");
    assert.deepEqual(secondResult, { status: "applied" });
    assert.equal(state.sheets[0].name, "Primary");
    assert.equal(state.sheets[0].rules[0].output, "survives");
  }

  {
    /*
     * An unexpected exception in an edit callback must reject that request but
     * must not poison the queue. Later valid edits still need a path to
     * persistence.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const broken = queue.apply({
      state,
      edit: () => {
        throw new Error("edit callback failed");
      },
      save: async () => {
        assert.fail("save must not run when candidate editing throws");
      },
    });

    await assert.rejects(broken, /edit callback failed/);

    const later = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets[0].enabled = false;
      },
      save: async () => {},
    });

    assert.deepEqual(later, { status: "applied" });
    assert.equal(state.sheets[0].enabled, false);
  }

  {
    /*
     * A successful queued edit must preserve the identity of surviving
     * authoritative objects. Rendered Settings controls may still hold these
     * references after persistence succeeds.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const originalSheets = state.sheets;
    const originalPrimary = state.sheets[0];
    const originalPrimaryRules = state.sheets[0].rules;
    const originalPrimaryRule = state.sheets[0].rules[0];
    const originalSecond = state.sheets[1];
    const originalInflections = state.inflections;
    const originalInflection = state.inflections[0];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets[0].name = "Renamed";
        candidate.sheets[0].rules[0].output = "changed";
        candidate.inflections[0].label = "number";
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.sheets, originalSheets);
    assert.equal(state.sheets[0], originalPrimary);
    assert.equal(state.sheets[0].rules, originalPrimaryRules);
    assert.equal(state.sheets[0].rules[0], originalPrimaryRule);
    assert.equal(state.sheets[1], originalSecond);
    assert.equal(state.inflections, originalInflections);
    assert.equal(state.inflections[0], originalInflection);

    assert.equal(originalPrimary.name, "Renamed");
    assert.equal(originalPrimaryRule.output, "changed");
    assert.equal(originalInflection.label, "number");
  }

  {
    /*
     * Reordering must move the original authoritative objects rather than
     * replacing them with clones. This keeps a rendered sheet reference valid
     * even though its array position changed.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const originalSheets = state.sheets;
    const originalPrimary = state.sheets[0];
    const originalSecond = state.sheets[1];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        const moved = candidate.sheets.splice(1, 1)[0];
        candidate.sheets.splice(0, 0, moved);
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.sheets, originalSheets);
    assert.equal(state.sheets[0], originalSecond);
    assert.equal(state.sheets[1], originalPrimary);
  }

  {
    /*
     * Additions become new authority while deletions disappear, but surviving
     * objects retain their identity.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const originalSheets = state.sheets;
    const originalSecond = state.sheets[1];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets.splice(0, 1);
        candidate.sheets.push({
          name: "Added",
          enabled: true,
          rules: [
            {
              input: "x",
              output: "y",
              type: "default",
              enabled: true,
            },
          ],
        });
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.sheets, originalSheets);
    assert.equal(state.sheets.length, 2);
    assert.equal(state.sheets[0], originalSecond);
    assert.equal(state.sheets[1].name, "Added");
  }

  {
    /*
     * Persistence still sees the detached candidate, not the old objects that
     * will be reconciled after success.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    const originalSheets = state.sheets;
    const originalPrimary = state.sheets[0];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets[0].name = "Persist this";
      },
      save: async () => {
        assert.notEqual(state.sheets, originalSheets);
        assert.notEqual(state.sheets[0], originalPrimary);
        assert.equal(state.sheets[0].name, "Persist this");
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.sheets, originalSheets);
    assert.equal(state.sheets[0], originalPrimary);
    assert.equal(originalPrimary.name, "Persist this");
  }

  {
    /*
     * Inflection reordering has its own reconciliation path and therefore needs
     * direct identity coverage rather than relying on the analogous sheet test.
     *
     * The outer inflection array must remain the same authoritative collection,
     * while the exact original rule objects move to their newly persisted order.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    state.inflections.push({
      label: "past",
      pattern: "ed",
      position: "suffix",
      strip: "ed",
      add: "",
      enabled: true,
    });

    const originalInflections = state.inflections;
    const originalPlural = state.inflections[0];
    const originalPast = state.inflections[1];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        const moved = candidate.inflections.splice(1, 1)[0];
        candidate.inflections.splice(0, 0, moved);
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.inflections, originalInflections);
    assert.equal(state.inflections[0], originalPast);
    assert.equal(state.inflections[1], originalPlural);
  }

  {
    /*
     * Inflection deletion and addition must preserve identity only for rules that
     * actually survive the edit. A deleted rule must disappear, while a new rule
     * with no provenance becomes new runtime authority after persistence.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    state.inflections.push({
      label: "past",
      pattern: "ed",
      position: "suffix",
      strip: "ed",
      add: "",
      enabled: true,
    });

    const originalInflections = state.inflections;
    const deletedPlural = state.inflections[0];
    const survivingPast = state.inflections[1];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.inflections.splice(0, 1);
        candidate.inflections.push({
          label: "future",
          pattern: "will-",
          position: "prefix",
          strip: "will-",
          add: "",
          enabled: true,
        });
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.inflections, originalInflections);
    assert.equal(state.inflections.length, 2);

    assert.equal(
      state.inflections[0],
      survivingPast,
      "surviving inflection rule must retain exact object identity",
    );
    assert.notEqual(
      state.inflections[1],
      deletedPlural,
      "a deleted rule must not be accidentally reused as new authority",
    );
    assert.equal(state.inflections[1].label, "future");
  }

  {
    /*
     * A preset-style complete replacement creates entirely new rule objects.
     * None of the previous rules may be resurrected through clone provenance
     * merely because the replacement occupies the same array positions.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    state.inflections.push({
      label: "past",
      pattern: "ed",
      position: "suffix",
      strip: "ed",
      add: "",
      enabled: true,
    });

    const originalInflections = state.inflections;
    const originalPlural = state.inflections[0];
    const originalPast = state.inflections[1];

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.inflections = [
          {
            label: "replacement one",
            pattern: "a",
            position: "suffix",
            strip: "a",
            add: "",
            enabled: true,
          },
          {
            label: "replacement two",
            pattern: "b",
            position: "prefix",
            strip: "b",
            add: "",
            enabled: false,
          },
        ];
      },
      save: async () => {},
    });

    assert.deepEqual(result, { status: "applied" });
    assert.equal(state.inflections, originalInflections);
    assert.equal(state.inflections.length, 2);

    assert.notEqual(state.inflections[0], originalPlural);
    assert.notEqual(state.inflections[0], originalPast);
    assert.notEqual(state.inflections[1], originalPlural);
    assert.notEqual(state.inflections[1], originalPast);

    assert.equal(state.inflections[0].label, "replacement one");
    assert.equal(state.inflections[1].label, "replacement two");
  }

  {
    /*
     * An originally absent inflection collection has no array identity to
     * preserve. After successful persistence, the newly populated collection
     * becomes the first authoritative inflection array.
     */
    const state = {
      sheets: [],
      inflections: undefined,
    };
    const queue = new LinguisticRuleStateQueue();

    const result = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.inflections = [
          {
            label: "plural",
            pattern: "s",
            position: "suffix",
            strip: "s",
            add: "",
            enabled: true,
          },
        ];
      },
      save: async () => {
        assert.ok(Array.isArray(state.inflections));
        assert.equal(state.inflections.length, 1);
        assert.equal(state.inflections[0].label, "plural");
      },
    });

    assert.deepEqual(result, { status: "applied" });
    assert.ok(Array.isArray(state.inflections));
    assert.equal(state.inflections.length, 1);
    assert.equal(state.inflections[0].label, "plural");
  }

  {
    /*
     * A stale rendered control must be able to fail closed without invoking
     * persistence and without poisoning later queued work.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    let saveCalls = 0;

    const missing = await queue.apply({
      state,
      edit: () => {
        throw new LinguisticRuleTargetMissingError();
      },
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(missing, { status: "target-missing" });
    assert.equal(saveCalls, 0);
    assert.equal(state.sheets[0].name, "Primary");

    const later = await queue.apply({
      state,
      edit: (candidate) => {
        candidate.sheets[0].name = "Later valid edit";
      },
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(later, { status: "applied" });
    assert.equal(saveCalls, 1);
    assert.equal(state.sheets[0].name, "Later valid edit");
  }

  {
    /*
     * Explicit cancellation must grant no linguistic-rule mutation or
     * persistence authority.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    let editCalls = 0;
    let saveCalls = 0;

    const result = await applyConfirmedLinguisticRuleState({
      state,
      queue,
      confirm: async () => false,
      edit: () => {
        editCalls++;
      },
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, { status: "cancelled" });
    assert.equal(editCalls, 0);
    assert.equal(saveCalls, 0);
    assert.equal(state.sheets[0].rules[0].output, "š");
  }

  {
    /*
     * A stale target discovered while constructing confirmation must fail
     * closed before either detached candidate mutation or persistence.
     */
    const state = makeState();
    const queue = new LinguisticRuleStateQueue();

    let editCalls = 0;
    let saveCalls = 0;

    const result = await applyConfirmedLinguisticRuleState({
      state,
      queue,
      confirm: async () => {
        throw new LinguisticRuleTargetMissingError();
      },
      edit: () => {
        editCalls++;
      },
      save: async () => {
        saveCalls++;
      },
    });

    assert.deepEqual(result, { status: "target-missing" });
    assert.equal(editCalls, 0);
    assert.equal(saveCalls, 0);
  }

  {
    /*
     * §19 regression: creator confirmation must run inside the common settings-
     * authority boundary.
     *
     * First let an earlier H10 transaction change a rule while preserving the
     * original rule object's identity. The confirmed operation was already
     * submitted, but its confirmation callback must wait until that earlier
     * transaction settles and must therefore observe the NEW semantic value.
     *
     * While confirmation remains open, a later unrelated settings transaction
     * must remain excluded. This proves that the meaning shown to the creator
     * cannot change underneath the pending approval.
     */
    const language = makeState();
    const settings = {
      hoverModifier: "Shift",
      language,
    };

    const authorityQueue = new SettingsAuthorityQueue();
    const linguisticQueue = new LinguisticRuleStateQueue();
    const originalRule = language.sheets[0].rules[0];

    let releaseEarlierSave;
    const earlierSaveGate = new Promise((resolve) => {
      releaseEarlierSave = resolve;
    });

    const earlier = authorityQueue.run(() =>
      linguisticQueue.apply({
        state: language,
        edit: (candidate) => {
          candidate.sheets[0].rules[0].output = "settled-before-confirm";
        },
        save: () => earlierSaveGate,
      }),
    );

    let resolveConfirmation;
    const confirmationGate = new Promise((resolve) => {
      resolveConfirmation = resolve;
    });

    let confirmationCalls = 0;
    let confirmedValue;

    const confirmedMutation = authorityQueue.run(() =>
      applyConfirmedLinguisticRuleState({
        state: language,
        queue: linguisticQueue,
        confirm: async () => {
          confirmationCalls++;
          confirmedValue = originalRule.output;
          return confirmationGate;
        },
        edit: (candidate) => {
          candidate.sheets[0].rules.splice(0, 1);
        },
        save: async () => {},
      }),
    );

    /*
     * The earlier transaction still owns the common queue, so the confirmation
     * must not even be constructed from its provisional state.
     */
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(confirmationCalls, 0);

    releaseEarlierSave();
    assert.deepEqual(await earlier, { status: "applied" });

    /*
     * Reconciliation intentionally preserved object identity while installing
     * the new settled value. The confirmation must now describe that value.
     */
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(language.sheets[0].rules[0], originalRule);
    assert.equal(confirmationCalls, 1);
    assert.equal(confirmedValue, "settled-before-confirm");

    let ordinaryWriteCalls = 0;
    const ordinary = authorityQueue.run(() =>
      applyPersistedSettingState({
        read: () => settings.hoverModifier,
        write: (value) => {
          ordinaryWriteCalls++;
          settings.hoverModifier = value;
        },
        requested: "Control",
        save: async () => {},
      }),
    );

    await Promise.resolve();
    assert.equal(
      ordinaryWriteCalls,
      0,
      "later settings authority must remain blocked while confirmation is open",
    );

    resolveConfirmation(true);

    assert.deepEqual(await confirmedMutation, { status: "applied" });
    assert.equal(language.sheets[0].rules.length, 0);

    assert.deepEqual(await ordinary, { status: "applied" });
    assert.equal(ordinaryWriteCalls, 1);
    assert.equal(settings.hoverModifier, "Control");
  }

  {
    /*
     * H13 regression: H10's specialized queue still owns linguistic-rule
     * candidate construction and reconciliation, while the plugin-wide
     * SettingsAuthorityQueue now coordinates H10 with unrelated settings
     * transaction families.
     *
     * Hold an H10 save after its detached candidate has been installed as
     * provisional live state. Then submit an ordinary persisted-setting
     * transaction through the same common authority queue.
     *
     * The ordinary transaction must remain completely excluded until H10 has
     * persisted and reconciled its candidate back into settled authoritative
     * objects. This protects whole-settings persistence from observing another
     * transaction family's provisional state.
     */
    const language = makeState();
    const originalSheets = language.sheets;
    const settings = {
      hoverModifier: "Shift",
      language,
    };

    const authorityQueue = new SettingsAuthorityQueue();
    const linguisticQueue = new LinguisticRuleStateQueue();

    let releaseLinguisticSave;
    let ordinaryWriteCalls = 0;
    let ordinarySaveCalls = 0;
    let ordinarySawProvisionalSheets = false;

    const heldLinguisticSave = new Promise((resolve) => {
      releaseLinguisticSave = resolve;
    });

    /*
     * Production lock order is plugin-wide authority first, then H10's
     * specialized queue. The outer queue prevents other settings families from
     * entering while H10 owns provisional linguistic-rule authority.
     */
    const linguistic = authorityQueue.run(() =>
      linguisticQueue.apply({
        state: language,
        edit: (candidate) => {
          candidate.sheets[0].name = "Provisional H10 edit";
        },
        save: () => heldLinguisticSave,
      }),
    );

    /*
     * SettingsAuthorityQueue and LinguisticRuleStateQueue each begin work on a
     * Promise microtask. Yield twice so H10 reaches its held save with the
     * detached candidate installed.
     */
    await Promise.resolve();
    await Promise.resolve();

    assert.notEqual(
      language.sheets,
      originalSheets,
      "H10 should have its detached candidate provisionally installed",
    );
    assert.equal(language.sheets[0].name, "Provisional H10 edit");

    const ordinary = authorityQueue.run(() =>
      applyPersistedSettingState({
        read: () => settings.hoverModifier,
        write: (value) => {
          ordinaryWriteCalls++;
          settings.hoverModifier = value;
        },
        requested: "Control",
        save: async () => {
          ordinarySaveCalls++;
          ordinarySawProvisionalSheets =
            settings.language.sheets !== originalSheets;
        },
      }),
    );

    /*
     * The ordinary request has been submitted, but H10 still owns the common
     * authority boundary. It must therefore remain completely outside its
     * authority-sensitive read/write/save transaction until H10 settles.
     */
    await Promise.resolve();

    assert.equal(
      ordinaryWriteCalls,
      0,
      "an unrelated settings transaction must not install provisional state while H10 is in flight",
    );
    assert.equal(
      ordinarySaveCalls,
      0,
      "an unrelated settings transaction must not reach persistence while H10 state is provisional",
    );

    releaseLinguisticSave();

    const linguisticResult = await linguistic;
    const ordinaryResult = await ordinary;

    assert.equal(linguisticResult.status, "applied");
    assert.equal(ordinaryResult.status, "applied");
    assert.equal(ordinaryWriteCalls, 1);
    assert.equal(ordinarySaveCalls, 1);
    assert.equal(settings.hoverModifier, "Control");
    assert.equal(
      ordinarySawProvisionalSheets,
      false,
      "the later ordinary save must begin only after H10 has reconciled its candidate into settled authority",
    );
    assert.equal(
      settings.language.sheets,
      originalSheets,
      "successful H10 reconciliation should preserve the original authoritative sheet-array identity",
    );
    assert.equal(
      settings.language.sheets[0].name,
      "Provisional H10 edit",
      "the successfully persisted H10 value should remain authoritative after reconciliation",
    );
  }

  console.log("linguistic-rule state regression tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
