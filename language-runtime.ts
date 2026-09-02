import type { App } from "obsidian";
import { Dictionary } from "./dictionary";
import { LinguisticExampleInventory } from "./linguistic-examples";
import { loadLanguageProfile } from "./language-profile";
import { MorphemeInventory } from "./morphemes";
import { PhonologyInventory } from "./phonology";
import type { LanguageMembershipMode } from "./language-membership";
import type { LanguageConfig, LanguageProfile } from "./types";

/**
 * A completely prepared linguistic runtime that has not yet been installed
 * into the live plugin.
 *
 * Every inventory here is a real feature-specific inventory instance. We keep
 * those objects intact rather than flattening them into generic arrays or maps,
 * because each inventory owns important private indexes, source records, and
 * other derived state.
 *
 * IMPORTANT FOR FUTURE MODULES:
 * New canonical linguistic inventories that participate in active-language
 * reloads should join this candidate boundary. Their fallible source loading
 * must finish while detached from the live plugin, and the completed candidate
 * should then be installed during the same synchronous commit as the existing
 * inventories. Do not progressively rebuild a live inventory during reload.
 */
export interface LanguageRuntimeCandidate {
  profiles: Map<string, LanguageProfile>;
  dictionary: Dictionary;
  morphemes: MorphemeInventory;
  linguisticExamples: LinguisticExampleInventory;
  phonology: PhonologyInventory;
  dictionaryCount: number;
}

export interface PrepareLanguageRuntimeRequest {
  app: App;
  activeLanguages: LanguageConfig[];
  caseSensitiveMatching: boolean;
  languageMembership: LanguageMembershipMode;
}

/**
 * Prepare a complete replacement runtime without mutating the currently live
 * plugin inventories.
 *
 * This function deliberately owns the asynchronous/fallible part of reload.
 * If any inventory loader throws, the caller receives that exception and can
 * simply discard this detached candidate. The previously settled live runtime
 * has not been touched.
 *
 * Language Profiles are prepared first because their stable language IDs are
 * contextual authority supplied to the feature inventories during loading.
 * The candidate profile map is used directly for that purpose; loading never
 * needs to consult or temporarily replace the live profile map.
 */
export async function prepareLanguageRuntime(
  request: PrepareLanguageRuntimeRequest,
): Promise<LanguageRuntimeCandidate> {
  const profiles = new Map<string, LanguageProfile>();

  for (const lang of request.activeLanguages) {
    const profile = loadLanguageProfile(request.app, lang);

    if (profile) {
      profiles.set(lang.name, profile);
    }
  }

  const dictionary = new Dictionary(request.app);
  const morphemes = new MorphemeInventory(request.app);
  const linguisticExamples = new LinguisticExampleInventory(request.app);
  const phonology = new PhonologyInventory(request.app);

  /*
   * Dictionary lookup keys depend on case mode at index-build time. Set the
   * mode only on the detached candidate; the live dictionary remains unchanged
   * until the caller commits the completed runtime.
   */
  dictionary.setCaseSensitive(request.caseSensitiveMatching);

  /*
   * An empty active-language set naturally produces empty candidate
   * inventories. There is no need for a special live-state clearing path:
   * committing these empty objects atomically represents the requested state.
   */
  if (request.activeLanguages.length === 0) {
    return {
      profiles,
      dictionary,
      morphemes,
      linguisticExamples,
      phonology,
      dictionaryCount: 0,
    };
  }

  const profileId = (lang: LanguageConfig): string | undefined =>
    profiles.get(lang.name)?.id;

  const dictionaryCount = await dictionary.loadFromFolders(
    request.activeLanguages.map((lang) => ({
      folder: lang.dictionaryFolder,
      language: lang.name,
      languageId: profileId(lang),
    })),
    request.languageMembership,
  );

  await morphemes.loadFromFolders(
    request.activeLanguages
      .filter((lang) => Boolean(lang.morphemeFolder?.trim()))
      .map((lang) => ({
        folder: lang.morphemeFolder!.trim(),
        language: lang.name,
        languageId: profileId(lang),
      })),
    request.languageMembership,
  );

  await linguisticExamples.loadFromFolders(
    request.activeLanguages
      .filter((lang) => Boolean(lang.exampleFolder?.trim()))
      .map((lang) => ({
        folder: lang.exampleFolder!.trim(),
        language: lang.name,
        languageId: profileId(lang),
      })),
    request.languageMembership,
  );

  await phonology.loadFromFolders(
    request.activeLanguages
      .filter((lang) => Boolean(lang.phonologyFolder?.trim()))
      .map((lang) => ({
        folder: lang.phonologyFolder!.trim(),
        language: lang.name,
        languageId: profileId(lang),
      })),
    request.languageMembership,
  );

  return {
    profiles,
    dictionary,
    morphemes,
    linguisticExamples,
    phonology,
    dictionaryCount,
  };
}
