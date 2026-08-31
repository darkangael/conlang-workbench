import assert from "node:assert/strict";
import { build } from "esbuild";

/**
 * Load the real Language Profile production module while replacing Obsidian's
 * runtime file classes with small test doubles.
 *
 * Production validates profile targets with `instanceof TFile`, so the mock
 * constructor must live inside the same esbuild bundle as language-profile.ts.
 * Otherwise the test could accidentally use a different constructor identity
 * and reject every otherwise-valid file.
 */
const obsidianMockPlugin = {
  name: "obsidian-language-profile-test",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^obsidian$/ }, () => ({
      path: "obsidian",
      namespace: "obsidian-test",
    }));

    buildApi.onLoad({ filter: /.*/, namespace: "obsidian-test" }, () => ({
      contents: `
        export class TFile {
          constructor(path) {
            this.path = path;

            const filename = path.split("/").pop() ?? "";
            const dot = filename.lastIndexOf(".");
            this.extension = dot >= 0 ? filename.slice(dot + 1) : "";
          }
        }

        export class TFolder {
          constructor(path) {
            this.path = path;
          }
        }
      `,
      loader: "js",
    }));
  },
};

const buildResult = await build({
  stdin: {
    contents: `
      export {
        loadLanguageProfile,
        validateLanguageProfilePath,
      } from "./language-profile";
      export { TFile, TFolder } from "obsidian";
    `,
    resolveDir: process.cwd(),
    loader: "js",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [obsidianMockPlugin],
});

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(buildResult.outputFiles[0].text).toString("base64");

const { loadLanguageProfile, validateLanguageProfilePath, TFile, TFolder } =
  await import(moduleUrl);

/**
 * Construct the minimum in-memory Obsidian application surface required by the
 * Language Profile loader and validator.
 *
 * `files` and `folders` establish vault identity. `frontmatter` maps file paths
 * to the metadata-cache frontmatter returned for those files. Keeping these
 * stores separate lets tests distinguish "the file exists" from "the file has
 * readable and structurally valid profile metadata."
 */
function makeApp({ files = [], folders = [], frontmatter = {} } = {}) {
  const objects = new Map();
  const metadata = new Map();

  for (const path of folders) {
    objects.set(path, new TFolder(path));
  }

  for (const path of files) {
    const file = new TFile(path);
    objects.set(path, file);

    if (Object.hasOwn(frontmatter, path)) {
      metadata.set(file, {
        frontmatter: frontmatter[path],
      });
    }
  }

  return {
    vault: {
      getAbstractFileByPath(path) {
        return objects.get(path) ?? null;
      },
    },

    metadataCache: {
      getFileCache(file) {
        return metadata.get(file) ?? null;
      },
    },
  };
}

const validFrontmatter = {
  type: "language-profile",
  language_id: "test-language",
  language: "Test Language",
  autonym: "Tesa",
  aliases: ["Test", "TL"],
  status: "draft",
  modality: ["spoken", "signed"],
  documentation_language: "English",
};

/*
 * Language Profiles are optional. Clearing profilePath is an explicit valid
 * request rather than a malformed path.
 */
{
  const app = makeApp();

  assert.deepEqual(validateLanguageProfilePath(app, undefined), {
    status: "valid",
  });
}

/*
 * H11 validates vault-relative path safety before accepting a new profile
 * authority request. Parent traversal must therefore fail closed.
 */
{
  const app = makeApp();

  const result = validateLanguageProfilePath(app, "../Outside.md");

  assert.equal(result.status, "invalid");
  assert.match(result.error, /must not contain/i);
}

/*
 * A configured path must resolve to a real file. Missing targets and folders
 * are not profile files and therefore cannot become profile authority.
 */
{
  const app = makeApp({
    folders: ["Reference/Profile Folder"],
  });

  const missing = validateLanguageProfilePath(
    app,
    "Reference/Missing Profile.md",
  );
  assert.equal(missing.status, "invalid");
  assert.match(missing.error, /does not resolve to a file/i);

  const folder = validateLanguageProfilePath(app, "Reference/Profile Folder");
  assert.equal(folder.status, "invalid");
  assert.match(folder.error, /does not resolve to a file/i);
}

/*
 * Language Profiles are Markdown notes. An existing non-Markdown file must not
 * pass merely because it occupies the requested vault path.
 */
{
  const path = "Reference/Profile.txt";
  const app = makeApp({
    files: [path],
    frontmatter: {
      [path]: validFrontmatter,
    },
  });

  const result = validateLanguageProfilePath(app, path);

  assert.equal(result.status, "invalid");
  assert.match(result.error, /not a Markdown file/i);
}

/*
 * Metadata availability is part of validation. Existing Markdown without
 * readable frontmatter cannot establish profile identity.
 */
{
  const path = "Reference/Profile.md";
  const app = makeApp({
    files: [path],
  });

  const result = validateLanguageProfilePath(app, path);

  assert.equal(result.status, "invalid");
  assert.match(result.error, /no readable frontmatter/i);
}

/*
 * The existing Language Profile format requires the profile type plus nonblank
 * language_id and language identity fields.
 */
{
  const path = "Reference/Profile.md";

  for (const frontmatter of [
    {
      ...validFrontmatter,
      type: "ordinary-note",
    },
    {
      ...validFrontmatter,
      language_id: "   ",
    },
    {
      ...validFrontmatter,
      language: "",
    },
  ]) {
    const app = makeApp({
      files: [path],
      frontmatter: {
        [path]: frontmatter,
      },
    });

    const result = validateLanguageProfilePath(app, path);

    assert.equal(result.status, "invalid");
    assert.match(result.error, /type "language-profile"/i);
  }
}

/*
 * H7 deliberately permits canonical profiles outside the language's structural
 * root. H11 must validate such an external profile without inventing a root
 * containment requirement.
 */
{
  const path = "Reference/Shared Profile.md";
  const app = makeApp({
    files: [path],
    frontmatter: {
      [path]: validFrontmatter,
    },
  });

  assert.deepEqual(validateLanguageProfilePath(app, path), { status: "valid" });
}

/*
 * Validation and runtime loading intentionally share the same frontmatter
 * interpretation. A valid profile accepted by H11 must still produce the
 * expected canonical runtime LanguageProfile object.
 */
{
  const path = "Reference/Shared Profile.md";
  const app = makeApp({
    files: [path],
    frontmatter: {
      [path]: validFrontmatter,
    },
  });

  const profile = loadLanguageProfile(app, {
    name: "Configured Display Name",
    dictionaryFolder: "Languages/Test Language/Lexicon",
    profilePath: path,
    sheets: [],
    hoverEnabled: true,
    inflections: [],
  });

  assert.deepEqual(profile, {
    id: "test-language",
    name: "Test Language",
    path,
    autonym: "Tesa",
    aliases: ["Test", "TL"],
    status: "draft",
    modality: ["spoken", "signed"],
    documentationLanguage: "English",
  });
}

/*
 * H11 must not invent a requirement that the creator-authored profile
 * `language` field equal LanguageConfig.name. The existing profile format
 * treats that field as profile data, while configuration identity remains a
 * separate authority concern.
 */
{
  const path = "Reference/Shared Profile.md";
  const app = makeApp({
    files: [path],
    frontmatter: {
      [path]: validFrontmatter,
    },
  });

  const profile = loadLanguageProfile(app, {
    name: "A Different Configured Name",
    dictionaryFolder: "Languages/Test Language/Lexicon",
    profilePath: path,
    sheets: [],
    hoverEnabled: true,
    inflections: [],
  });

  assert.equal(profile?.name, "Test Language");
  assert.equal(profile?.id, "test-language");
}

console.log("language-profile regression tests passed");
